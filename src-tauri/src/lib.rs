use portable_pty::MasterPty;
use serde::Serialize;
use std::{
    collections::HashMap,
    env,
    ffi::OsString,
    io::{BufRead, BufReader},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

// GatewayState is kept as a Tauri managed-state marker.
// The gateway itself is detached — we track it only via the PID file.
struct GatewayState;

struct PtyEntry {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn std::io::Write + Send>,
}
struct PtyState(Mutex<HashMap<String, PtyEntry>>);

struct HermesChatState(Mutex<HashMap<String, std::process::ChildStdin>>);

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
    message_count: Option<usize>,
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

fn ensure_pt_patch() -> std::path::PathBuf {
    let patch_path = hermes_home().join(".pt_patch.py");
    let content = r#"
import os, sys
try:
    import prompt_toolkit.output.defaults as _ptd
    _orig_create = _ptd.create_output
    def _safe_create_output(stdout=None, color_depth=None):
        try:
            return _orig_create(stdout=stdout, color_depth=color_depth)
        except Exception:
            from prompt_toolkit.output.plain_text import PlainTextOutput
            return PlainTextOutput(stdout or sys.stdout)
    _ptd.create_output = _safe_create_output
except Exception:
    pass
"#;
    if !patch_path.exists() {
        let _ = std::fs::write(&patch_path, content);
    }
    patch_path
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

/// Ensure the api_server platform is enabled by using hermes config set,
/// which handles YAML serialization correctly without risking corruption.
fn ensure_api_server_config() {
    // Use the hermes CLI — it is the only safe way to write config.yaml.
    // These are idempotent: safe to run every time we start the gateway.
    let prog = command_program();
    let _ = run_command(
        prog.clone(),
        &["config".into(), "set".into(), "platforms.api_server.enabled".into(), "true".into()],
        10,
    );
    let _ = run_command(
        prog.clone(),
        &["config".into(), "set".into(), "platforms.api_server.host".into(), "127.0.0.1".into()],
        10,
    );
    let _ = run_command(
        prog,
        &["config".into(), "set".into(), "platforms.api_server.port".into(), "8642".into()],
        10,
    );
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
    let mut cmd = Command::new(&program);
    cmd.args(args)
        .env("HERMES_HOME", &home)
        .env("PATH", enhanced_path(&home))
        .env("PLAYWRIGHT_HEADLESS", "false")
        .env("PLAYWRIGHT_BROWSERS_PATH", "0")
        .env("HEADLESS", "false")
        .env("TERM", "dumb")
        .env("NO_COLOR", "1")
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONSTARTUP", ensure_pt_patch().to_string_lossy().as_ref())
        .env("PYTHONUTF8", "1")
        .env("PYTHONNOUSERSITE", "1")
        .env("PYTHONLEGACYWINDOWSSTDIO", "1")
        .env("PROMPT_TOOLKIT_COLOR_DEPTH", "DEPTH_1_BIT")
        .env("COLUMNS", "220")
        .env("LINES", "50")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = cmd
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
fn hermes_start_gateway(_state: tauri::State<GatewayState>) -> Result<CommandResult, String> {
    let home = hermes_home();

    // If the PID-file process is still alive, don't start another.
    if is_gateway_pid_alive(&home) {
        return Ok(CommandResult {
            success: true,
            code: None,
            command: String::from("hermes gateway run"),
            stdout: String::from("Gateway is already running."),
            stderr: String::new(),
        });
    }

    // Also accept a gateway we didn't launch ourselves (external / previous session).
    if api_healthy() {
        return Ok(CommandResult {
            success: true,
            code: None,
            command: String::from("hermes gateway run"),
            stdout: String::from("Existing gateway is already healthy — adopted."),
            stderr: String::new(),
        });
    }

    // At this point the gateway is truly dead — clean up any stale PID file.
    kill_existing_gateway(&home);

    // Write API_SERVER_ENABLED to .env so it persists even when launched outside this app.
    let env_path = home.join(".env");
    let env_content = std::fs::read_to_string(&env_path).unwrap_or_default();
    if !env_content.contains("API_SERVER_ENABLED") {
        let mut lines: Vec<String> = env_content.lines().map(String::from).collect();
        lines.push(String::from("API_SERVER_ENABLED=true"));
        lines.push(String::from("GATEWAY_ALLOW_ALL_USERS=true"));
        let _ = std::fs::write(&env_path, lines.join("\n") + "\n");
    }

    // Log stderr to a file for debugging.
    let log_file = home.join("logs").join("gateway-desktop.log");
    let _ = std::fs::create_dir_all(home.join("logs"));
    let stderr_file = std::fs::File::create(&log_file)
        .map_err(|e| format!("Cannot create gateway log: {}", e))?;

    let mut cmd = Command::new(command_program());
    cmd.args(["gateway", "run", "--accept-hooks"])
        .env("HERMES_HOME", &home)
        .env("PATH", enhanced_path(&home))
        .env("API_SERVER_ENABLED", "true")
        .env("GATEWAY_ALLOW_ALL_USERS", "true")
        .env("TERM", "dumb")
        .env("NO_COLOR", "1")
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONSTARTUP", ensure_pt_patch().to_string_lossy().as_ref())
        .env("PYTHONUTF8", "1")
        .env("PYTHONNOUSERSITE", "1")
        .env("PYTHONLEGACYWINDOWSSTDIO", "1")
        .env("PROMPT_TOOLKIT_COLOR_DEPTH", "DEPTH_1_BIT")
        .env("COLUMNS", "220")
        .env("LINES", "50");

    for (k, v) in read_env_file(&home) {
        cmd.env(k, v);
    }

    // ── Detached process flags ────────────────────────────────────────────────
    // Windows: DETACHED_PROCESS (0x08) + CREATE_NO_WINDOW (0x08000000) +
    //          CREATE_NEW_PROCESS_GROUP (0x200)
    // This exactly mirrors Node.js `spawn({ detached: true })` + `.unref()`.
    // The gateway process is fully independent of the Tauri process and will
    // NOT be killed when the app restarts or hot-reloads.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32       = 0x00000008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;
        const CREATE_NO_WINDOW: u32       = 0x08000000;
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
    }

    let child = cmd
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::from(stderr_file))
        .spawn()
        .map_err(|err| format!("Failed to start gateway: {}", err))?;

    // ── Drop the handle immediately — exactly like Node's .unref() ────────────
    // We do NOT store the Child. The gateway is now fully detached and lives
    // independently. We track it only through the PID file it writes itself.
    std::mem::forget(child);

    Ok(CommandResult {
        success: true,
        code: None,
        command: String::from("hermes gateway run"),
        stdout: String::from("Gateway starting… health polling will detect it once port 8642 is ready."),
        stderr: String::new(),
    })
}

/// Parse PID from gateway.pid file (supports both plain integer and JSON `{"pid": N, ...}` format).
fn read_gateway_pid(home: &Path) -> Option<u32> {
    let pid_file = home.join("gateway.pid");
    if !pid_file.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&pid_file).ok()?;
    let trimmed = content.trim();
    if trimmed.starts_with('{') {
        // JSON format: {"pid": 1234, ...}
        // Find `"pid":` then grab the first run of digits after the colon.
        let after_key = trimmed.split("\"pid\"").nth(1)?;
        let digits: String = after_key
            .trim_start_matches(|c: char| c == ':' || c == ' ')
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        digits.parse().ok()
    } else {
        trimmed.parse().ok()
    }
}

/// Check if the gateway process from the PID file is actually alive.
/// This is a lightweight OS-level probe — no TCP/HTTP involved.
/// Mirrors Node.js `process.kill(pid, 0)` (signal 0 = probe only).
fn is_gateway_pid_alive(home: &Path) -> bool {
    let Some(pid) = read_gateway_pid(home) else { return false; };

    #[cfg(windows)]
    {
        // On Windows, OpenProcess with PROCESS_QUERY_LIMITED_INFORMATION (0x1000)
        // is the equivalent of signal(0) — returns a handle if the process exists.
        use std::os::windows::io::RawHandle;
        extern "system" {
            fn OpenProcess(dwDesiredAccess: u32, bInheritHandle: i32, dwProcessId: u32) -> RawHandle;
            fn CloseHandle(hObject: RawHandle) -> i32;
        }
        const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
        let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if handle.is_null() {
            return false;
        }
        unsafe { CloseHandle(handle) };
        true
    }

    #[cfg(not(windows))]
    {
        // UNIX: signal 0 probes process existence without sending a real signal.
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
}

/// Kill any existing gateway process via PID file, then remove the PID file.
fn kill_existing_gateway(home: &Path) {
    if let Some(pid) = read_gateway_pid(home) {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let _ = Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
        #[cfg(not(windows))]
        {
            unsafe { libc::kill(pid as i32, libc::SIGTERM); }
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    let _ = std::fs::remove_file(home.join("gateway.pid"));
}

#[tauri::command]
fn hermes_stop_gateway(_state: tauri::State<GatewayState>) -> Result<CommandResult, String> {
    let home = hermes_home();
    kill_existing_gateway(&home);
    Ok(CommandResult {
        success: true,
        code: None,
        command: String::from("gateway stop"),
        stdout: String::from("Gateway stopped."),
        stderr: String::new(),
    })
}

#[tauri::command]
fn hermes_gateway_status(_state: tauri::State<GatewayState>) -> Result<bool, String> {
    let home = hermes_home();
    // Check PID-file liveness first (fast, no network) — mirrors reference app's
    // `isGatewayRunning()` which uses `process.kill(pid, 0)`.
    if is_gateway_pid_alive(&home) {
        return Ok(true);
    }
    // Fallback: HTTP health (catches gateways not tracked by a PID file).
    Ok(api_healthy())
}

// ── Chat proxy (Rust→HTTP→WebView events) ─────────────────────────────────────
// The Tauri WebView cannot fetch() http://localhost:8642 due to origin restrictions.
// We proxy the SSE stream through Rust (no such restrictions) and emit events back.


#[tauri::command]
fn chat_stream(
    app_handle: tauri::AppHandle,
    event_id: String,
    messages: Vec<serde_json::Value>,
    model: String,
) -> Result<(), String> {
    let eid = event_id.clone();
    thread::spawn(move || {
        let url = "http://127.0.0.1:8642/v1/chat/completions";
        let body = serde_json::json!({
            "model": model,
            "messages": messages,
            "stream": true,
        });

        let emit_error = |msg: String| {
            let _ = app_handle.emit(&format!("chat-error-{}", eid), msg);
        };

        let response = match ureq::post(url)
            .set("Content-Type", "application/json")
            .send_string(&body.to_string())
        {
            Ok(r) => r,
            Err(ureq::Error::Status(code, resp)) => {
                let body = resp.into_string().unwrap_or_default();
                // Try to extract error message from JSON
                let msg = serde_json::from_str::<serde_json::Value>(&body)
                    .ok()
                    .and_then(|v| v["error"]["message"].as_str().map(String::from))
                    .unwrap_or_else(|| format!("HTTP {}: {}", code, body.chars().take(200).collect::<String>()));
                emit_error(msg);
                return;
            }
            Err(e) => {
                emit_error(format!("Failed to connect to gateway: {}", e));
                return;
            }
        };

        let reader = BufReader::new(response.into_reader());
        let mut current_event_type = String::new();

        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };

            // Blank line = end of SSE block; reset event type
            if line.is_empty() {
                current_event_type.clear();
                continue;
            }

            // Capture named event type
            if let Some(et) = line.strip_prefix("event: ") {
                current_event_type = et.trim().to_string();
                continue;
            }

            // Only process data: lines
            if let Some(data) = line.strip_prefix("data: ") {
                if current_event_type == "hermes.tool.progress" {
                    if let Ok(payload) = serde_json::from_str::<serde_json::Value>(data) {
                        let emoji = payload["emoji"].as_str().unwrap_or("🔧");
                        let label = payload["label"].as_str()
                            .or_else(|| payload["tool"].as_str())
                            .unwrap_or("tool");
                        let _ = app_handle.emit(
                            &format!("tool-progress-{}", eid),
                            format!("{} {}", emoji, label),
                        );
                    }
                } else {
                    if data == "[DONE]" {
                        let _ = app_handle.emit(&format!("chat-done-{}", eid), "");
                        return;
                    }
                    if let Ok(chunk) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(err_msg) = chunk["error"]["message"].as_str() {
                            emit_error(err_msg.to_string());
                            return;
                        }
                        if let Some(content) = chunk["choices"][0]["delta"]["content"].as_str() {
                            let _ = app_handle.emit(&format!("chat-chunk-{}", eid), content);
                        }
                        // Detect tool invocation (emit once when tool name first appears)
                        if let Some(tool_calls) = chunk["choices"][0]["delta"]["tool_calls"].as_array() {
                            if let Some(tc) = tool_calls.first() {
                                if let Some(name) = tc["function"]["name"].as_str() {
                                    if !name.is_empty() {
                                        let _ = app_handle.emit(&format!("tool-call-{}", eid), name.to_string());
                                    }
                                }
                            }
                        }
                        // finish_reason "tool_calls" → gateway is executing the tool; stream will resume
                        if chunk["choices"][0]["finish_reason"].as_str() == Some("tool_calls") {
                            // Don't emit done yet — gateway will continue streaming after tool execution
                            // Just set agent state to running_tool via a dedicated event
                            let _ = app_handle.emit(&format!("tool-call-{}", eid), "__executing__");
                        }
                        if chunk["choices"][0]["finish_reason"].as_str() == Some("stop") {
                            let _ = app_handle.emit(&format!("chat-done-{}", eid), "");
                            return;
                        }
                    }
                }
            }
        }
        // Stream ended without [DONE] — emit done anyway
        let _ = app_handle.emit(&format!("chat-done-{}", eid), "");
    });
    Ok(())
}

#[tauri::command]
fn hermes_chat_stream(
    app_handle: tauri::AppHandle,
    event_id: String,
    message: String,
    session_id: Option<String>,
) -> Result<(), String> {
    let home = hermes_home();
    let binary = hermes_binary().ok_or_else(|| "hermes binary not found".to_string())?;
    let eid = event_id;

    thread::spawn(move || {
        let mut args = vec![
            "chat".to_string(),
            "-q".to_string(),
            message,
            "-Q".to_string(),
            "--source".to_string(),
            "desktop".to_string(),
        ];
        if let Some(sid) = session_id {
            if !sid.is_empty() {
                args.push("--resume".to_string());
                args.push(sid);
            }
        }

        let mut dot_env = read_env_file(&home);
        dot_env.insert("PLAYWRIGHT_HEADLESS".to_string(), "false".to_string());
        dot_env.insert("PLAYWRIGHT_BROWSERS_PATH".to_string(), "0".to_string());
        dot_env.insert("HEADLESS".to_string(), "false".to_string());
        let mut cmd = Command::new(&binary);
        cmd.args(&args)
            .env("HERMES_HOME", &home)
            .env("PATH", enhanced_path(&home))
            .envs(&dot_env)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let mut child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let _ = app_handle.emit(&format!("chat-error-{}", eid),
                    format!("Failed to start hermes CLI: {}", e));
                return;
            }
        };

        let stdout = match child.stdout.take() {
            Some(s) => s,
            None => {
                let _ = app_handle.emit(&format!("chat-error-{}", eid), "No stdout");
                return;
            }
        };

        let reader = BufReader::new(stdout);
        let mut has_output = false;

        for line in reader.lines() {
            let raw = match line {
                Ok(l) => l,
                Err(_) => break,
            };
            let cleaned = strip_ansi(&raw);

            // Extract and forward session_id line without displaying it
            if let Some(idx) = cleaned.find("session_id:") {
                let rest = cleaned[idx + "session_id:".len()..].trim();
                if let Some(sid) = rest.split_whitespace().next() {
                    let _ = app_handle.emit(&format!("chat-session-{}", eid), sid.to_string());
                }
                continue;
            }

            if is_cli_noise(&cleaned) {
                continue;
            }

            let trimmed = cleaned.trim_end_matches('\r');
            if !trimmed.trim().is_empty() {
                has_output = true;
                let _ = app_handle.emit(&format!("chat-chunk-{}", eid), format!("{}\n", trimmed));
            }
        }

        // Read any stderr for error reporting
        let stderr_text = child.stderr.take()
            .map(|s| {
                BufReader::new(s).lines()
                    .filter_map(|l| l.ok())
                    .map(|l| strip_ansi(&l))
                    .filter(|l| {
                        let t = l.trim();
                        !t.is_empty()
                            && !t.contains("UserWarning")
                            && !t.contains("FutureWarning")
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            })
            .unwrap_or_default();

        let exit_status = child.wait().ok();
        let success = exit_status.map(|s| s.success()).unwrap_or(false);

        if has_output || success {
            let _ = app_handle.emit(&format!("chat-done-{}", eid), "");
        } else {
            let detail = stderr_text.trim().to_string();
            let msg = if detail.is_empty() {
                format!("hermes CLI exited with no output (code: {:?})",
                    exit_status.and_then(|s| s.code()))
            } else {
                detail
            };
            let _ = app_handle.emit(&format!("chat-error-{}", eid), msg);
        }
    });

    Ok(())
}

// ── ANSI / CLI-noise helpers ──────────────────────────────────────────────────

fn strip_ansi(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(&next) = chars.peek() {
                    chars.next();
                    if next.is_ascii_alphabetic() { break; }
                }
            }
        } else {
            result.push(c);
        }
    }
    result
}

fn is_cli_noise(s: &str) -> bool {
    let trimmed = s.trim();
    if trimmed.is_empty() { return false; }
    let first = trimmed.chars().next().unwrap_or(' ');
    // Box-drawing characters used in TUI borders
    if matches!(first, '╭'|'╰'|'│'|'╮'|'╯'|'─'|'┌'|'┐'|'└'|'┘'|'┤'|'├'|'┬'|'┴'|'┼') {
        return true;
    }
    // Hermes header line: ⚕ Hermes ...
    if trimmed.starts_with('⚕') && trimmed.contains("Hermes") {
        return true;
    }
    false
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
    let mut cmd = Command::new(&program);
    cmd.args(args)
        .env("HERMES_HOME", &home)
        .env("PATH", enhanced_path(&home))
        .env("PLAYWRIGHT_HEADLESS", "false")
        .env("PLAYWRIGHT_BROWSERS_PATH", "0")
        .env("HEADLESS", "false")
        .env("TERM", "dumb")
        .env("NO_COLOR", "1")
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONSTARTUP", ensure_pt_patch().to_string_lossy().as_ref())
        .env("PYTHONUTF8", "1")
        .env("PYTHONNOUSERSITE", "1")
        .env("PYTHONLEGACYWINDOWSSTDIO", "1")
        .env("PROMPT_TOOLKIT_COLOR_DEPTH", "DEPTH_1_BIT")
        .env("COLUMNS", "220")
        .env("LINES", "50")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = cmd
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
        // Write a wrapper .ps1 to %TEMP% and run with -File.
        // Critical: Windows PowerShell 5.1 reads BOM-less files using the
        // legacy ANSI codepage, which mangles the non-ASCII characters (✓, →, —)
        // in install.ps1 and produces parse errors. The wrapper downloads the
        // script as raw bytes, re-saves with a UTF-8 BOM so PS 5.1 reads it
        // correctly. This matches the reference Electron app (issue #149).
        let wrapper = std::env::temp_dir().join("hermes-install-wrapper.ps1");
        let home = hermes_home();
        let hermes_home_str = home.to_string_lossy().replace('\'', "''");
        let content = format!(
"$ErrorActionPreference = 'Stop'\r
try {{ [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 }} catch {{}}\r
$url = 'https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1'\r
$installer = Join-Path $env:TEMP (\"hermes-install-script-\" + [guid]::NewGuid().ToString() + \".ps1\")\r
$resp = Invoke-WebRequest -Uri $url -UseBasicParsing\r
$text = if ($resp.Content -is [byte[]]) {{ [System.Text.Encoding]::UTF8.GetString($resp.Content) }} else {{ [string]$resp.Content }}\r
if ($text.Length -gt 0 -and $text[0] -eq [char]0xFEFF) {{ $text = $text.Substring(1) }}\r
[System.IO.File]::WriteAllText($installer, $text, (New-Object System.Text.UTF8Encoding $true))\r
& $installer -SkipSetup -HermesHome '{}'\r
$exit = $LASTEXITCODE\r
Remove-Item -Force -ErrorAction SilentlyContinue $installer\r
exit $exit\r
", hermes_home_str);
        std::fs::write(&wrapper, content)
            .map_err(|e| format!("Failed to write installer wrapper: {}", e))?;
        (PathBuf::from("powershell"), vec![
            String::from("-ExecutionPolicy"),
            String::from("Bypass"),
            String::from("-NoProfile"),
            String::from("-NonInteractive"),
            String::from("-File"),
            wrapper.to_string_lossy().to_string(),
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
    sys.refresh_all();
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
                let message_count = std::fs::read_to_string(&path)
                    .ok()
                    .and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok())
                    .and_then(|v| {
                        if let Some(arr) = v.as_array() {
                            Some(arr.len())
                        } else if let Some(arr) = v.get("messages").and_then(|m| m.as_array()) {
                            Some(arr.len())
                        } else {
                            None
                        }
                    });
                out.push(SessionMeta { name, modified, message_count });
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
fn clear_all_sessions_disk() -> Result<usize, String> {
    let dir = hermes_home().join("sessions");
    if !dir.exists() {
        return Ok(0);
    }
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut count = 0usize;
    for entry in entries.flatten() {
        if std::fs::remove_file(entry.path()).is_ok() {
            count += 1;
        }
    }
    Ok(count)
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

#[derive(serde::Serialize)]
struct PtyStartResult {
    pty_id: String,
    event_id: String,
}

#[tauri::command]
fn hermes_pty_start(
    app_handle: tauri::AppHandle,
    pty_state: tauri::State<PtyState>,
) -> Result<PtyStartResult, String> {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};

    let binary = hermes_binary().unwrap_or_else(|| std::path::PathBuf::from("hermes"));
    let home = hermes_home();
    let event_id = uuid::Uuid::new_v4().to_string();

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows: 24, cols: 80, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(&binary);
    cmd.env("HERMES_HOME", &home);
    cmd.env("PATH", enhanced_path(&home));

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let pty_id = uuid::Uuid::new_v4().to_string();

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

    let entry = PtyEntry { master: pair.master, writer };
    pty_state
        .0
        .lock()
        .map_err(|_| "PTY lock poisoned".to_string())?
        .insert(pty_id.clone(), entry);

    Ok(PtyStartResult { pty_id, event_id })
}

#[tauri::command]
fn hermes_pty_write(
    pty_id: String,
    input: String,
    pty_state: tauri::State<PtyState>,
) -> Result<(), String> {
    use std::io::Write;
    let mut lock = pty_state
        .0
        .lock()
        .map_err(|_| "PTY lock poisoned".to_string())?;
    if let Some(entry) = lock.get_mut(&pty_id) {
        let line = format!("{}\n", input);
        entry.writer.write_all(line.as_bytes()).map_err(|e| e.to_string())
    } else {
        Err(format!("PTY {} not found", pty_id))
    }
}

#[tauri::command]
fn hermes_pty_stop(
    pty_id: String,
    pty_state: tauri::State<PtyState>,
) -> Result<(), String> {
    let mut lock = pty_state
        .0
        .lock()
        .map_err(|_| "PTY lock poisoned".to_string())?;
    lock.remove(&pty_id);
    Ok(())
}

// ── Chrome launcher ──────────────────────────────────────────────────────────

/// Poll http://127.0.0.1:9222/json/version via TCP until CDP is responding or timeout.
fn wait_for_cdp(timeout_ms: u64) -> bool {
    let addr: SocketAddr = match "127.0.0.1:9222".parse() {
        Ok(a) => a,
        Err(_) => return false,
    };
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    while Instant::now() < deadline {
        if TcpStream::connect_timeout(&addr, Duration::from_millis(200)).is_ok() {
            return true;
        }
        thread::sleep(Duration::from_millis(500));
    }
    false
}

#[tauri::command]
fn launch_chrome(url: Option<String>) -> Result<String, String> {
    let local_app_data = env_path("LOCALAPPDATA");

    // Build ordered candidate list per spec
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(ref base) = local_app_data {
        candidates.push(base.join("Google").join("Chrome").join("Application").join("chrome.exe"));
    }
    candidates.push(PathBuf::from(r"C:\Program Files\Google\Chrome\Application\chrome.exe"));
    candidates.push(PathBuf::from(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"));

    let profile_dir = hermes_home().join("chrome-profile");
    let profile_arg = format!("--user-data-dir={}", profile_dir.to_string_lossy());

    let mut chrome_path: Option<PathBuf> = candidates.into_iter().find(|p| p.exists());

    // Fallback: `where chrome` on Windows
    if chrome_path.is_none() {
        if let Ok(out) = Command::new("where").arg("chrome").output() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            if let Some(line) = stdout.lines().next() {
                let p = PathBuf::from(line.trim());
                if p.exists() {
                    chrome_path = Some(p);
                }
            }
        }
    }

    let chrome = chrome_path.ok_or_else(|| {
        "Chrome not found. Install Google Chrome and try again.".to_string()
    })?;

    let mut args: Vec<String> = vec![
        String::from("--remote-debugging-port=9222"),
        String::from("--no-first-run"),
        String::from("--no-default-browser-check"),
        profile_arg,
    ];
    if let Some(ref page_url) = url {
        if !page_url.is_empty() {
            args.push(page_url.clone());
        }
    }

    let args_str: Vec<&str> = args.iter().map(String::as_str).collect();

    Command::new(&chrome)
        .args(&args_str)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to launch Chrome: {}", e))?;

    Ok(String::from("http://127.0.0.1:9222"))
}

#[tauri::command]
fn get_chrome_cdp_status() -> bool {
    let addr: SocketAddr = match "127.0.0.1:9222".parse() {
        Ok(a) => a,
        Err(_) => return false,
    };
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

#[tauri::command]
fn write_env_var(key: String, val: String) -> Result<(), String> {
    let path = hermes_home().join(".env");
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    let mut lines: Vec<String> = content.lines().map(String::from).collect();
    let prefix = format!("{}=", key);
    let new_line = format!("{}={}", key, val);
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

// ── Hermes interactive chat (stdin/stdout pipes) ───────────────────────────────

#[tauri::command]
fn start_hermes_pty_chat(
    app_handle: tauri::AppHandle,
    chat_state: tauri::State<HermesChatState>,
    event_id: String,
) -> Result<String, String> {
    let home = hermes_home();
    let binary = hermes_binary().ok_or_else(|| "hermes binary not found".to_string())?;
    let pty_id = format!("hermes-chat-{}", event_id);

    let mut cmd = Command::new(&binary);
    cmd.arg("chat")
        .env("HERMES_HOME", &home)
        .env("PATH", enhanced_path(&home))
        .env("NO_COLOR", "1")
        .env("TERM", "dumb")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start hermes chat: {}", e))?;

    let stdin = child.stdin.take()
        .ok_or_else(|| "Failed to open stdin".to_string())?;
    let stdout = child.stdout.take()
        .ok_or_else(|| "Failed to open stdout".to_string())?;

    {
        let mut map = chat_state.0.lock().map_err(|_| "Chat state lock poisoned".to_string())?;
        map.insert(pty_id.clone(), stdin);
    }

    let eid = event_id.clone();
    let ah = app_handle.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let raw = match line {
                Ok(l) => l,
                Err(_) => break,
            };
            let cleaned = strip_ansi(&raw);
            let trimmed = cleaned.trim_end_matches('\r').to_string();
            if !trimmed.trim().is_empty() && !is_cli_noise(&trimmed) {
                let _ = ah.emit(&format!("pty-chat-{}", eid), trimmed);
            }
        }
        // Process ended or stdout closed
        let _ = ah.emit(&format!("pty-chat-done-{}", eid), "");
        // Let child reap itself (we moved it into this thread scope implicitly via stdout)
        let _ = child.wait();
    });

    Ok(pty_id)
}

#[tauri::command]
fn send_hermes_pty_message(
    pty_id: String,
    message: String,
    chat_state: tauri::State<HermesChatState>,
) -> Result<(), String> {
    use std::io::Write;
    let mut map = chat_state.0.lock().map_err(|_| "Chat state lock poisoned".to_string())?;
    if let Some(stdin) = map.get_mut(&pty_id) {
        stdin.write_all(format!("{}\n", message).as_bytes()).map_err(|e| e.to_string())
    } else {
        Err(format!("Chat session {} not found", pty_id))
    }
}

// ── New commands (batch 2) ────────────────────────────────────────────────────

#[tauri::command]
fn read_env_vars() -> Result<HashMap<String, String>, String> {
    let home = hermes_home();
    // If .env missing, return empty map (not error)
    if !home.join(".env").exists() {
        return Ok(HashMap::new());
    }
    Ok(read_env_file(&home))
}

#[tauri::command]
fn read_config_yaml() -> Result<String, String> {
    let path = hermes_home().join("config.yaml");
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_config_yaml(content: String) -> Result<(), String> {
    let path = hermes_home().join("config.yaml");
    if let Some(p) = path.parent() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn hermes_doctor_raw() -> Result<String, String> {
    let result = run_command(command_program(), &[String::from("doctor")], 30)?;
    let combined = format!("{}\n{}", result.stdout.trim(), result.stderr.trim())
        .trim()
        .to_string();
    Ok(strip_ansi(&combined))
}

#[tauri::command]
fn check_hermes_update() -> Result<String, String> {
    let bin = command_program();
    // Try --version first
    let ver_result = run_command(bin.clone(), &[String::from("--version")], 10)?;
    let version_str = if ver_result.success {
        let out = if ver_result.stdout.trim().is_empty() {
            ver_result.stderr.trim().to_string()
        } else {
            ver_result.stdout.trim().to_string()
        };
        strip_ansi(&out)
    } else {
        String::new()
    };

    if !version_str.is_empty() {
        return Ok(version_str);
    }

    // Fallback: try update --check
    let check_result = run_command(bin, &[String::from("update"), String::from("--check")], 10)?;
    let out = if check_result.stdout.trim().is_empty() {
        check_result.stderr.trim().to_string()
    } else {
        check_result.stdout.trim().to_string()
    };
    Ok(strip_ansi(&out))
}

#[tauri::command]
fn list_hermes_tools() -> Result<Vec<String>, String> {
    // Try `hermes tools list` first, fall back to `hermes tools`
    let bin = command_program();
    let result = run_command(
        bin.clone(),
        &[String::from("tools"), String::from("list")],
        10,
    )
    .unwrap_or_else(|_| CommandResult {
        success: false,
        code: None,
        command: String::new(),
        stdout: String::new(),
        stderr: String::new(),
    });

    let output = if result.success && !result.stdout.trim().is_empty() {
        result.stdout
    } else {
        // Fallback: `hermes tools`
        run_command(bin, &[String::from("tools")], 10)
            .map(|r| r.stdout)
            .unwrap_or_default()
    };

    let tools: Vec<String> = output
        .lines()
        .map(|l| strip_ansi(l.trim()))
        .filter(|l| !l.is_empty())
        .collect();

    Ok(tools)
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
        .manage(GatewayState)
        .manage(PtyState(Mutex::new(HashMap::new())))
        .manage(HermesChatState(Mutex::new(HashMap::new())))
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
            chat_stream,
            hermes_chat_stream,
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
            clear_all_sessions_disk,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            hermes_pty_start,
            hermes_pty_write,
            hermes_pty_stop,
            launch_chrome,
            get_chrome_cdp_status,
            write_env_var,
            start_hermes_pty_chat,
            send_hermes_pty_message,
            read_env_vars,
            read_config_yaml,
            write_config_yaml,
            hermes_doctor_raw,
            check_hermes_update,
            list_hermes_tools,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
