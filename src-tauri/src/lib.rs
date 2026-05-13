use portable_pty::MasterPty;
use serde::Serialize;
use std::{
    collections::HashMap,
    env,
    ffi::OsString,
    io::{BufRead, BufReader},
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
    Emitter, Manager,
};

struct GatewayState(Mutex<Option<Child>>);

struct PtyEntry {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn std::io::Write + Send>,
}
struct PtyState(Mutex<HashMap<String, PtyEntry>>);

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
    model_configured: bool,
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
struct ModelConfig {
    provider: String,
    model: String,
    base_url: String,
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

#[derive(Serialize)]
struct SystemInfo {
    ram_gb: u64,
    cpu_count: u32,
}

#[derive(Serialize)]
struct ProfileMeta {
    name: String,
    modified: String,
}

#[derive(Serialize)]
struct MemoryFileMeta {
    name: String,
    size: u64,
    modified: String,
}

#[derive(Serialize)]
struct SessionMeta {
    name: String,
    modified: String,
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

fn read_env_file(home: &Path) -> HashMap<String, String> {
    let mut envs = HashMap::new();
    if let Ok(file) = std::fs::File::open(home.join(".env")) {
        let reader = BufReader::new(file);
        for line in reader.lines().flatten() {
            let trimmed = line.trim();
            if trimmed.starts_with('#') || trimmed.is_empty() {
                continue;
            }
            if let Some((k, v)) = trimmed.split_once('=') {
                let key = k.trim().to_string();
                let mut val = v.trim();
                if (val.starts_with('"') && val.ends_with('"')) || (val.starts_with('\'') && val.ends_with('\'')) {
                    val = &val[1..val.len() - 1];
                }
                envs.insert(key, val.to_string());
            }
        }
    }
    envs
}

fn parse_model_config(content: &str) -> ModelConfig {
    let provider = content.lines()
        .find_map(|l| {
            let t = l.trim();
            t.strip_prefix("provider:").map(|v| v.trim().trim_matches('"').trim_matches('\'').to_string())
        })
        .unwrap_or_else(|| "auto".to_string());
    let model = content.lines()
        .find_map(|l| {
            let t = l.trim();
            t.strip_prefix("default:").map(|v| v.trim().trim_matches('"').trim_matches('\'').to_string())
        })
        .unwrap_or_default();
    let base_url = content.lines()
        .find_map(|l| {
            let t = l.trim();
            t.strip_prefix("base_url:").map(|v| v.trim().trim_matches('"').trim_matches('\'').to_string())
        })
        .unwrap_or_default();
    ModelConfig { provider, model, base_url }
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

    let config_yaml = home.join("config.yaml");
    let model_configured = if config_yaml.is_file() {
        let content = std::fs::read_to_string(&config_yaml).unwrap_or_default();
        let mc = parse_model_config(&content);
        !mc.model.is_empty()
    } else {
        false
    };

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
        model_configured,
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
    let mut cmd = Command::new(command_program());
    cmd.args(["gateway", "run"])
        .env("HERMES_HOME", &home)
        .env("PATH", enhanced_path(&home))
        .env("API_SERVER_ENABLED", "true");

    for (k, v) in read_env_file(&home) {
        cmd.env(k, v);
    }

    let child = cmd
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

// ── Streaming helpers ─────────────────────────────────────────────────────────

fn stream_spawn(
    app_handle: &tauri::AppHandle,
    program: PathBuf,
    args: &[String],
    event_id: &str,
    timeout_secs: u64,
) -> Result<CommandResult, String> {
    use std::sync::mpsc;

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
        .map_err(|e| format!("Failed to start `{}`: {}", command_text, e))?;

    let (tx, rx) = mpsc::channel::<String>();

    if let Some(stdout) = child.stdout.take() {
        let tx2 = tx.clone();
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines().flatten() {
                let _ = tx2.send(line);
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let tx2 = tx.clone();
        thread::spawn(move || {
            for line in BufReader::new(stderr).lines().flatten() {
                let _ = tx2.send(line);
            }
        });
    }
    drop(tx);

    let timeout = Duration::from_secs(timeout_secs);
    let started = Instant::now();
    let mut accumulated = String::new();
    let mut timed_out = false;
    let app = app_handle.clone();
    let eid = event_id.to_string();

    loop {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(line) => {
                let _ = app.emit(&eid, &line);
                if !accumulated.is_empty() { accumulated.push('\n'); }
                accumulated.push_str(&line);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if started.elapsed() > timeout {
                    let _ = child.kill();
                    timed_out = true;
                    break;
                }
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }

    let exit_status = child.wait().map_err(|e| e.to_string())?;
    let _ = app.emit(&eid, "__DONE__");

    Ok(CommandResult {
        success: !timed_out && exit_status.success(),
        code: exit_status.code(),
        command: command_text,
        stdout: accumulated,
        stderr: if timed_out { "Timed out".to_string() } else { String::new() },
    })
}

#[tauri::command]
fn hermes_stream_command(
    app_handle: tauri::AppHandle,
    args: Vec<String>,
    event_id: String,
    timeout_secs: Option<u64>,
) -> Result<CommandResult, String> {
    stream_spawn(&app_handle, command_program(), &args, &event_id, timeout_secs.unwrap_or(1800))
}

#[tauri::command]
fn hermes_stream_install(
    app_handle: tauri::AppHandle,
    event_id: String,
) -> Result<CommandResult, String> {
    #[cfg(windows)]
    let (program, args) = {
        let script = "Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1' -OutFile \"$env:TEMP\\hermes-install.ps1\"; & \"$env:TEMP\\hermes-install.ps1\" -SkipSetup";
        (PathBuf::from("powershell"), vec![
            String::from("-NoProfile"),
            String::from("-ExecutionPolicy"),
            String::from("Bypass"),
            String::from("-Command"),
            String::from(script),
        ])
    };
    #[cfg(not(windows))]
    let (program, args) = (
        PathBuf::from("bash"),
        vec![
            String::from("-lc"),
            String::from("curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- --skip-setup"),
        ],
    );
    stream_spawn(&app_handle, program, &args, &event_id, 1800)
}

#[tauri::command]
fn update_tray_status(app_handle: tauri::AppHandle, status: String) -> Result<(), String> {
    let label = match status.as_str() {
        "connected"    => "Gateway: Running ●",
        "connecting"   => "Gateway: Starting ◌",
        "error"        => "Gateway: Error ✕",
        _              => "Gateway: Stopped ○",
    };
    if let Some(tray) = app_handle.tray_by_id("main-tray") {
        let open   = tauri::menu::MenuItem::with_id(&app_handle, "open",      "Open Hermes", true,  None::<&str>).map_err(|e| e.to_string())?;
        let stat   = tauri::menu::MenuItem::with_id(&app_handle, "gw-status", label,         false, None::<&str>).map_err(|e| e.to_string())?;
        let sep    = tauri::menu::PredefinedMenuItem::separator(&app_handle).map_err(|e| e.to_string())?;
        let quit   = tauri::menu::MenuItem::with_id(&app_handle, "quit",      "Quit",        true,  None::<&str>).map_err(|e| e.to_string())?;
        let menu   = tauri::menu::Menu::with_items(&app_handle, &[&open, &stat, &sep, &quit]).map_err(|e| e.to_string())?;
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    Ok(())
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
fn get_model_config() -> ModelConfig {
    let content = std::fs::read_to_string(hermes_home().join("config.yaml")).unwrap_or_default();
    parse_model_config(&content)
}

#[tauri::command]
fn set_model_config(provider: String, model: String, base_url: String) -> Result<(), String> {
    let path = hermes_home().join("config.yaml");
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }

    let existing = std::fs::read_to_string(&path).unwrap_or_default();

    // If config has no provider field yet, write a fresh minimal config
    if !existing.lines().any(|l| l.trim().starts_with("provider:")) {
        let content = format!(
            "model:\n  provider: \"{}\"\n  default: \"{}\"\n  base_url: \"{}\"\nsmart_model_routing:\n  enabled: false\nstreaming: true\n",
            provider, model, base_url
        );
        return std::fs::write(&path, content).map_err(|e| e.to_string());
    }

    // Patch existing config in-place
    let mut lines: Vec<String> = existing.lines().map(String::from).collect();
    let mut provider_done = false;
    let mut model_done = false;
    let mut base_url_done = false;

    for line in &mut lines {
        let trimmed = line.trim();
        let indent: String = line.chars().take_while(|c| c.is_whitespace()).collect();
        if !provider_done && trimmed.starts_with("provider:") {
            *line = format!("{}provider: \"{}\"", indent, provider);
            provider_done = true;
        } else if !model_done && trimmed.starts_with("default:") {
            *line = format!("{}default: \"{}\"", indent, model);
            model_done = true;
        } else if !base_url_done && trimmed.starts_with("base_url:") {
            *line = format!("{}base_url: \"{}\"", indent, base_url);
            base_url_done = true;
        }
    }

    // If base_url wasn't found and we have one, insert after the provider line
    if !base_url_done && !base_url.is_empty() {
        if let Some(pos) = lines.iter().position(|l| l.trim().starts_with("provider:")) {
            let indent: String = lines[pos].chars().take_while(|c| c.is_whitespace()).collect();
            lines.insert(pos + 1, format!("{}base_url: \"{}\"", indent, base_url));
        }
    }

    std::fs::write(&path, lines.join("\n") + "\n").map_err(|e| e.to_string())
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

// ── New IPC commands ─────────────────────────────────────────────────────────

#[tauri::command]
fn get_system_info() -> SystemInfo {
    use sysinfo::System;
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();
    let ram_gb = sys.total_memory() / 1_073_741_824;
    let cpu_count = sys.cpus().len() as u32;
    SystemInfo { ram_gb, cpu_count }
}

#[tauri::command]
fn ollama_list_models() -> Vec<String> {
    let result = run_command(PathBuf::from("ollama"), &[String::from("list")], 10)
        .unwrap_or_else(|_| CommandResult {
            success: false,
            code: None,
            command: String::new(),
            stdout: String::new(),
            stderr: String::new(),
        });
    result
        .stdout
        .lines()
        .skip(1) // skip header
        .filter_map(|l| l.split_whitespace().next().map(String::from))
        .filter(|s| !s.is_empty())
        .collect()
}

#[tauri::command]
fn ollama_pull_stream(
    app_handle: tauri::AppHandle,
    model: String,
    event_id: String,
) -> Result<CommandResult, String> {
    stream_spawn(
        &app_handle,
        PathBuf::from("ollama"),
        &[String::from("pull"), model],
        &event_id,
        1800,
    )
}

#[tauri::command]
fn list_profiles() -> Vec<ProfileMeta> {
    let dir = hermes_home().join("profiles");
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("md") {
                let name = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                let modified = entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .map(|t| {
                        t.duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs()
                            .to_string()
                    })
                    .unwrap_or_default();
                out.push(ProfileMeta { name, modified });
            }
        }
    }
    out
}

#[tauri::command]
fn read_profile(name: String) -> Result<String, String> {
    std::fs::read_to_string(
        hermes_home()
            .join("profiles")
            .join(format!("{}.md", name)),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_profile(name: String, content: String) -> Result<(), String> {
    let dir = hermes_home().join("profiles");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("{}.md", name)), content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_profile(name: String) -> Result<(), String> {
    std::fs::remove_file(
        hermes_home()
            .join("profiles")
            .join(format!("{}.md", name)),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_memory_files() -> Vec<MemoryFileMeta> {
    let dir = hermes_home().join("memory");
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let meta = entry.metadata().ok();
            let name = entry.file_name().to_string_lossy().to_string();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified = meta
                .and_then(|m| m.modified().ok())
                .map(|t| {
                    t.duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs()
                        .to_string()
                })
                .unwrap_or_default();
            out.push(MemoryFileMeta { name, size, modified });
        }
    }
    out
}

#[tauri::command]
fn read_memory_file(name: String) -> Result<String, String> {
    std::fs::read_to_string(hermes_home().join("memory").join(&name))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_memory_file(name: String) -> Result<(), String> {
    std::fs::remove_file(hermes_home().join("memory").join(&name))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_sessions_disk() -> Vec<SessionMeta> {
    let dir = hermes_home().join("sessions");
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("json") {
                let name = path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                let modified = entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .map(|t| {
                        t.duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs()
                            .to_string()
                    })
                    .unwrap_or_default();
                out.push(SessionMeta { name, modified });
            }
        }
    }
    out
}

#[tauri::command]
fn read_session_disk(name: String) -> Result<String, String> {
    std::fs::read_to_string(hermes_home().join("sessions").join(&name))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_session_disk(name: String, content: String) -> Result<(), String> {
    let dir = hermes_home().join("sessions");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(&name), content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_session_disk(name: String) -> Result<(), String> {
    std::fs::remove_file(hermes_home().join("sessions").join(&name))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn pty_spawn(
    app_handle: tauri::AppHandle,
    program: String,
    args: Vec<String>,
    rows: u16,
    cols: u16,
    event_id: String,
    pty_state: tauri::State<PtyState>,
) -> Result<String, String> {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(&program);
    for arg in &args {
        cmd.arg(arg);
    }
    let home = hermes_home();
    cmd.env("HERMES_HOME", &home);
    cmd.env("PATH", enhanced_path(&home));

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let pty_id = uuid::Uuid::new_v4().to_string();

    // Stream PTY output via events
    let app = app_handle.clone();
    let eid = event_id.clone();
    thread::spawn(move || {
        let mut buf = BufReader::new(reader);
        let mut line = String::new();
        loop {
            line.clear();
            match buf.read_line(&mut line) {
                Ok(0) => {
                    let _ = app.emit(&eid, "__DONE__");
                    break;
                }
                Ok(_) => {
                    let _ = app.emit(
                        &eid,
                        line.trim_end_matches('\n')
                            .trim_end_matches('\r')
                            .to_string(),
                    );
                }
                Err(_) => {
                    let _ = app.emit(&eid, "__DONE__");
                    break;
                }
            }
        }
    });

    let entry = PtyEntry {
        master: pair.master,
        writer,
    };
    pty_state
        .0
        .lock()
        .map_err(|_| "PTY lock poisoned".to_string())?
        .insert(pty_id.clone(), entry);

    Ok(pty_id)
}

#[tauri::command]
fn pty_write(
    pty_id: String,
    data: String,
    pty_state: tauri::State<PtyState>,
) -> Result<(), String> {
    use std::io::Write;
    let mut lock = pty_state
        .0
        .lock()
        .map_err(|_| "PTY lock poisoned".to_string())?;
    if let Some(entry) = lock.get_mut(&pty_id) {
        entry
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())
    } else {
        Err(format!("PTY {} not found", pty_id))
    }
}

#[tauri::command]
fn pty_resize(
    pty_id: String,
    rows: u16,
    cols: u16,
    pty_state: tauri::State<PtyState>,
) -> Result<(), String> {
    use portable_pty::PtySize;
    let mut lock = pty_state
        .0
        .lock()
        .map_err(|_| "PTY lock poisoned".to_string())?;
    if let Some(entry) = lock.get_mut(&pty_id) {
        entry
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    } else {
        Err(format!("PTY {} not found", pty_id))
    }
}

#[tauri::command]
fn pty_kill(pty_id: String, pty_state: tauri::State<PtyState>) -> Result<(), String> {
    let mut lock = pty_state
        .0
        .lock()
        .map_err(|_| "PTY lock poisoned".to_string())?;
    lock.remove(&pty_id);
    Ok(())
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
        .manage(PtyState(Mutex::new(HashMap::new())))
        .setup(|app| {
            // System tray
            let open_item = MenuItem::with_id(app, "open", "Open Hermes", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&open_item, &sep, &quit_item])?;

            TrayIconBuilder::with_id("main-tray")
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
            hermes_stream_command,
            hermes_stream_install,
            update_tray_status,
            detect_api_keys,
            read_env,
            write_env,
            read_config,
            write_config,
            read_file,
            write_file,
            run_hermes_doctor,
            get_model_config,
            set_model_config,
            check_update,
            get_system_info,
            ollama_list_models,
            ollama_pull_stream,
            list_profiles,
            read_profile,
            write_profile,
            delete_profile,
            list_memory_files,
            read_memory_file,
            delete_memory_file,
            list_sessions_disk,
            read_session_disk,
            write_session_disk,
            delete_session_disk,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
