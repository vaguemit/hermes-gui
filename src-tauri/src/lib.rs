use serde::Serialize;
use std::{
    collections::HashMap,
    env,
    ffi::OsString,
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

struct GatewayState(Mutex<Option<Child>>);

#[derive(Serialize)]
struct HermesInstallStatus {
    installed: bool,
    configured: bool,
    api_healthy: bool,
    version: Option<String>,
    hermes_home: String,
    repo_path: Option<String>,
    binary_path: Option<String>,
    platform: String,
    last_error: Option<String>,
}

#[derive(Serialize)]
struct CommandResult {
    success: bool,
    code: Option<i32>,
    command: String,
    stdout: String,
    stderr: String,
}

#[derive(Serialize)]
struct ApiKeyStatus {
    has_keys: bool,
    providers: Vec<String>,
}

#[derive(Serialize)]
struct DoctorCheck {
    name: String,
    passed: bool,
    message: String,
}

#[derive(Serialize)]
struct DoctorResult {
    ok: bool,
    checks: Vec<DoctorCheck>,
    raw: String,
}

#[derive(Serialize)]
struct UpdateInfo {
    current_version: Option<String>,
    latest_version: Option<String>,
    update_available: bool,
    release_url: Option<String>,
}

fn env_path(name: &str) -> Option<PathBuf> {
    env::var_os(name).filter(|v| !v.is_empty()).map(PathBuf::from)
}

fn home_dir() -> PathBuf {
    env_path("HOME")
        .or_else(|| env_path("USERPROFILE"))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn hermes_home() -> PathBuf {
    if let Some(path) = env_path("HERMES_HOME") {
        return path;
    }

    #[cfg(windows)]
    {
        if let Some(local_app_data) = env_path("LOCALAPPDATA") {
            return local_app_data.join("hermes");
        }
    }

    home_dir().join(".hermes")
}

fn candidate_binaries(home: &Path) -> Vec<PathBuf> {
    #[cfg(windows)]
    {
        vec![
            home.join("hermes-agent")
                .join("venv")
                .join("Scripts")
                .join("hermes.exe"),
            home.join("hermes-agent").join("hermes.exe"),
            home_dir().join(".local").join("bin").join("hermes.exe"),
        ]
    }

    #[cfg(not(windows))]
    {
        vec![
            home.join("hermes-agent")
                .join("venv")
                .join("bin")
                .join("hermes"),
            home.join("hermes-agent").join("hermes"),
            home_dir().join(".local").join("bin").join("hermes"),
            PathBuf::from("/usr/local/bin/hermes"),
        ]
    }
}

fn path_extensions() -> Vec<OsString> {
    #[cfg(windows)]
    {
        env::var_os("PATHEXT")
            .map(|v| {
                env::split_paths(&v)
                    .map(|p| OsString::from(p.to_string_lossy().to_string()))
                    .collect()
            })
            .unwrap_or_else(|| {
                vec![
                    OsString::from(".exe"),
                    OsString::from(".cmd"),
                    OsString::from(".bat"),
                ]
            })
    }

    #[cfg(not(windows))]
    {
        vec![OsString::new()]
    }
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let paths = env::var_os("PATH")?;
    let extensions = path_extensions();

    for dir in env::split_paths(&paths) {
        for ext in &extensions {
            let mut candidate = dir.join(name);
            if !ext.is_empty() {
                candidate.set_extension(
                    ext.to_string_lossy()
                        .trim_start_matches('.')
                        .to_ascii_lowercase(),
                );
            }
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn hermes_binary() -> Option<PathBuf> {
    if let Some(path) = env_path("HERMES_BINARY") {
        if path.is_file() {
            return Some(path);
        }
    }

    let home = hermes_home();
    candidate_binaries(&home)
        .into_iter()
        .find(|candidate| candidate.is_file())
        .or_else(|| find_on_path("hermes"))
}

fn command_program() -> PathBuf {
    hermes_binary().unwrap_or_else(|| PathBuf::from("hermes"))
}

fn enhanced_path(home: &Path) -> OsString {
    let mut paths = Vec::new();

    #[cfg(windows)]
    {
        paths.extend([
            home.join("hermes-agent").join("venv").join("Scripts"),
            home.join("git").join("cmd"),
            home.join("git").join("bin"),
            home.join("git").join("usr").join("bin"),
            home.join("node"),
            home_dir().join(".local").join("bin"),
            home_dir().join(".cargo").join("bin"),
        ]);
    }

    #[cfg(not(windows))]
    {
        paths.extend([
            home.join("hermes-agent").join("venv").join("bin"),
            home_dir().join(".local").join("bin"),
            home_dir().join(".cargo").join("bin"),
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
        ]);
    }

    if let Some(existing) = env::var_os("PATH") {
        paths.extend(env::split_paths(&existing));
    }

    env::join_paths(paths).unwrap_or_default()
}

fn api_healthy() -> bool {
    let addr: SocketAddr = match "127.0.0.1:8642".parse() {
        Ok(addr) => addr,
        Err(_) => return false,
    };
    TcpStream::connect_timeout(&addr, Duration::from_millis(650)).is_ok()
}

fn run_command(program: PathBuf, args: &[String], timeout_secs: u64) -> Result<CommandResult, String> {
    let command_text = std::iter::once(program.to_string_lossy().to_string())
        .chain(args.iter().cloned())
        .collect::<Vec<_>>()
        .join(" ");

    let home = hermes_home();
    let mut child = Command::new(&program)
        .args(args)
        .env("HERMES_HOME", &home)
        .env("PATH", enhanced_path(&home))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("Failed to start `{}`: {}", command_text, err))?;

    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let output = child
                    .wait_with_output()
                    .map_err(|err| format!("Failed to collect output: {}", err))?;
                let code = output.status.code();
                return Ok(CommandResult {
                    success: output.status.success(),
                    code,
                    command: command_text,
                    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                });
            }
            Ok(None) if started.elapsed() > Duration::from_secs(timeout_secs) => {
                let _ = child.kill();
                let output = child
                    .wait_with_output()
                    .map_err(|err| format!("Command timed out and output could not be collected: {}", err))?;
                return Ok(CommandResult {
                    success: false,
                    code: None,
                    command: command_text,
                    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                    stderr: format!(
                        "{}\nTimed out after {} seconds.",
                        String::from_utf8_lossy(&output.stderr),
                        timeout_secs
                    ),
                });
            }
            Ok(None) => thread::sleep(Duration::from_millis(120)),
            Err(err) => return Err(format!("Failed while waiting for command: {}", err)),
        }
    }
}

// ── Existing commands ─────────────────────────────────────────────────────────

#[tauri::command]
fn hermes_install_status() -> HermesInstallStatus {
    let home = hermes_home();
    let repo = home.join("hermes-agent");
    let binary = hermes_binary();
    let configured = home.join(".env").is_file() || home.join("config.yaml").is_file();
    let mut last_error = None;

    let version = binary.as_ref().and_then(|bin| {
        match run_command(bin.clone(), &[String::from("--version")], 8) {
            Ok(result) if result.success => {
                let text = if result.stdout.trim().is_empty() {
                    result.stderr.trim()
                } else {
                    result.stdout.trim()
                };
                Some(text.to_string())
            }
            Ok(result) => {
                last_error = Some(if result.stderr.trim().is_empty() {
                    result.stdout.trim().to_string()
                } else {
                    result.stderr.trim().to_string()
                });
                None
            }
            Err(err) => {
                last_error = Some(err);
                None
            }
        }
    });

    HermesInstallStatus {
        installed: binary.is_some() || repo.is_dir(),
        configured,
        api_healthy: api_healthy(),
        version,
        hermes_home: home.to_string_lossy().to_string(),
        repo_path: repo
            .is_dir()
            .then(|| repo.to_string_lossy().to_string()),
        binary_path: binary.map(|p| p.to_string_lossy().to_string()),
        platform: env::consts::OS.to_string(),
        last_error,
    }
}

#[tauri::command]
fn hermes_run_command(args: Vec<String>, timeout_secs: Option<u64>) -> Result<CommandResult, String> {
    run_command(command_program(), &args, timeout_secs.unwrap_or(45))
}

#[tauri::command]
fn hermes_install(timeout_secs: Option<u64>) -> Result<CommandResult, String> {
    #[cfg(windows)]
    {
        let script = "Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1' -OutFile \"$env:TEMP\\hermes-install.ps1\"; & \"$env:TEMP\\hermes-install.ps1\" -SkipSetup";
        run_command(
            PathBuf::from("powershell"),
            &[
                String::from("-NoProfile"),
                String::from("-ExecutionPolicy"),
                String::from("Bypass"),
                String::from("-Command"),
                String::from(script),
            ],
            timeout_secs.unwrap_or(1800),
        )
    }

    #[cfg(not(windows))]
    {
        run_command(
            PathBuf::from("bash"),
            &[
                String::from("-lc"),
                String::from("curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup"),
            ],
            timeout_secs.unwrap_or(1800),
        )
    }
}

#[tauri::command]
fn hermes_start_gateway(state: tauri::State<GatewayState>) -> Result<CommandResult, String> {
    let mut lock = state
        .0
        .lock()
        .map_err(|_| String::from("Gateway process lock is poisoned"))?;

    if let Some(child) = lock.as_mut() {
        if child.try_wait().map_err(|err| err.to_string())?.is_none() {
            return Ok(CommandResult {
                success: true,
                code: None,
                command: String::from("hermes gateway run"),
                stdout: String::from("Gateway is already managed by this desktop app."),
                stderr: String::new(),
            });
        }
    }

    let home = hermes_home();
    let child = Command::new(command_program())
        .args(["gateway", "run"])
        .env("HERMES_HOME", &home)
        .env("PATH", enhanced_path(&home))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| format!("Failed to start gateway: {}", err))?;

    *lock = Some(child);
    Ok(CommandResult {
        success: true,
        code: None,
        command: String::from("hermes gateway run"),
        stdout: String::from("Gateway process started. Health polling will mark it connected once port 8642 is ready."),
        stderr: String::new(),
    })
}

#[tauri::command]
fn hermes_stop_gateway(state: tauri::State<GatewayState>) -> Result<CommandResult, String> {
    let mut lock = state
        .0
        .lock()
        .map_err(|_| String::from("Gateway process lock is poisoned"))?;

    if let Some(mut child) = lock.take() {
        let _ = child.kill();
        let _ = child.wait();
        return Ok(CommandResult {
            success: true,
            code: None,
            command: String::from("kill managed gateway"),
            stdout: String::from("Managed gateway process stopped."),
            stderr: String::new(),
        });
    }

    run_command(
        command_program(),
        &[String::from("gateway"), String::from("stop")],
        15,
    )
}

#[tauri::command]
fn hermes_gateway_status(state: tauri::State<GatewayState>) -> Result<bool, String> {
    let mut lock = state
        .0
        .lock()
        .map_err(|_| String::from("Gateway process lock is poisoned"))?;

    if let Some(child) = lock.as_mut() {
        if child.try_wait().map_err(|err| err.to_string())?.is_none() {
            return Ok(true);
        }
        *lock = None;
    }

    Ok(api_healthy())
}

// ── New commands ──────────────────────────────────────────────────────────────

#[tauri::command]
fn detect_api_keys() -> ApiKeyStatus {
    let env_file = hermes_home().join(".env");
    let known = [
        "OPENAI_API_KEY",
        "ANTHROPIC_API_KEY",
        "OPENROUTER_API_KEY",
        "NVIDIA_API_KEY",
        "GOOGLE_API_KEY",
        "NOUS_API_KEY",
    ];
    let content = std::fs::read_to_string(&env_file).unwrap_or_default();
    let providers: Vec<String> = known
        .iter()
        .filter(|k| {
            let prefix = format!("{}=", k);
            content
                .lines()
                .find(|l| l.starts_with(&prefix))
                .map(|l| !l[prefix.len()..].trim().trim_matches('"').is_empty())
                .unwrap_or(false)
        })
        .map(|k| k.to_string())
        .collect();
    ApiKeyStatus { has_keys: !providers.is_empty(), providers }
}

#[tauri::command]
fn read_env() -> HashMap<String, String> {
    let path = hermes_home().join(".env");
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    let mut map = HashMap::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(idx) = line.find('=') {
            let key = line[..idx].trim().to_string();
            let val = line[idx + 1..].trim().trim_matches('"').to_string();
            map.insert(key, val);
        }
    }
    map
}

#[tauri::command]
fn write_env(key: String, value: String) -> Result<(), String> {
    let path = hermes_home().join(".env");
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    let mut lines: Vec<String> = content.lines().map(String::from).collect();
    let prefix = format!("{}=", key);
    let new_line = format!("{}={}", key, value);
    let mut found = false;
    for line in &mut lines {
        if line.starts_with(&prefix) {
            *line = new_line.clone();
            found = true;
            break;
        }
    }
    if !found {
        lines.push(new_line);
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, lines.join("\n") + "\n").map_err(|e| e.to_string())
}

#[tauri::command]
fn read_config() -> Result<String, String> {
    std::fs::read_to_string(hermes_home().join("config.yaml")).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_config(content: String) -> Result<(), String> {
    let path = hermes_home().join("config.yaml");
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file(rel_path: String) -> Result<String, String> {
    std::fs::read_to_string(hermes_home().join(&rel_path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(rel_path: String, content: String) -> Result<(), String> {
    let path = hermes_home().join(&rel_path);
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn run_hermes_doctor() -> Result<DoctorResult, String> {
    let result = run_command(command_program(), &[String::from("doctor")], 30)?;
    let raw = format!("{}\n{}", result.stdout.trim(), result.stderr.trim())
        .trim()
        .to_string();
    let checks = raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| {
            let t = l.trim();
            let passed = t.starts_with('✓')
                || t.starts_with("OK")
                || t.to_lowercase().contains(": ok")
                || t.to_lowercase().contains("pass");
            DoctorCheck { name: t.to_string(), passed, message: t.to_string() }
        })
        .collect();
    Ok(DoctorResult { ok: result.success, checks, raw })
}

#[tauri::command]
fn check_update() -> Result<UpdateInfo, String> {
    let current_version = hermes_binary().and_then(|bin| {
        run_command(bin, &[String::from("--version")], 8)
            .ok()
            .filter(|r| r.success)
            .map(|r| {
                if r.stdout.trim().is_empty() {
                    r.stderr.trim().to_string()
                } else {
                    r.stdout.trim().to_string()
                }
            })
    });

    let response = ureq::get(
        "https://api.github.com/repos/NousResearch/hermes-agent/releases/latest",
    )
    .set("User-Agent", "hermes-gui/0.1.0")
    .call()
    .map_err(|e| e.to_string())?;

    let json: serde_json::Value = response.into_json().map_err(|e| e.to_string())?;
    let latest_version = json["tag_name"].as_str().map(String::from);
    let release_url = json["html_url"].as_str().map(String::from);
    let update_available = matches!(
        (&current_version, &latest_version),
        (Some(c), Some(l)) if c != l
    );
    Ok(UpdateInfo { current_version, latest_version, update_available, release_url })
}

// ── App entry point ───────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(GatewayState(Mutex::new(None)))
        .setup(|app| {
            // System tray
            let open_item = MenuItem::with_id(app, "open", "Open Hermes", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&open_item, &sep, &quit_item])?;

            TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Global shortcut Ctrl+Shift+H — toggle window visibility
            use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
            let ctrl_shift_h =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyH);
            app.global_shortcut().on_shortcut(ctrl_shift_h, |app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            })?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            hermes_install_status,
            hermes_run_command,
            hermes_install,
            hermes_start_gateway,
            hermes_stop_gateway,
            hermes_gateway_status,
            detect_api_keys,
            read_env,
            write_env,
            read_config,
            write_config,
            read_file,
            write_file,
            run_hermes_doctor,
            check_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
