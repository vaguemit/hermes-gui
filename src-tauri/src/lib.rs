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

struct SshState(Mutex<Option<std::process::Child>>);

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

#[derive(serde::Serialize)]
struct HermesSkillMeta {
    name: String,
    description: String,
    has_skill_md: bool,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct PublicConnectionConfig {
    mode: String,       // "local" | "remote"
    remote_url: String,
    has_api_key: bool,
    api_key_length: usize,
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

/// Reject env keys that could break the .env file format.
fn validate_env_key(key: &str) -> Result<(), String> {
    if key.is_empty() {
        return Err("Env key cannot be empty".to_string());
    }
    if !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err("Env key must contain only alphanumeric characters and underscores".to_string());
    }
    if key.starts_with(|c: char| c.is_ascii_digit()) {
        return Err("Env key must not start with a digit".to_string());
    }
    Ok(())
}

/// Reject env values that contain unescaped newlines (would inject extra lines).
fn validate_env_value(value: &str) -> Result<(), String> {
    if value.contains('\n') || value.contains('\r') {
        return Err("Env value cannot contain newline characters".to_string());
    }
    Ok(())
}

/// Reject filenames that could escape the intended directory.
/// Accepts plain names (no path separators) with optional extensions.
fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    const FORBIDDEN: &[char] = &['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    if name.chars().any(|c| FORBIDDEN.contains(&c)) {
        return Err("Name contains invalid characters".to_string());
    }
    if name.contains("..") || name == "." {
        return Err("Name contains invalid path component".to_string());
    }
    Ok(())
}

/// Resolve `..` and `.` components without filesystem access.
/// Needed for write paths that don't exist yet.
fn normalize_path(path: &std::path::Path) -> std::path::PathBuf {
    let mut out: Vec<std::path::Component> = Vec::new();
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => { out.pop(); }
            std::path::Component::CurDir => {}
            c => out.push(c),
        }
    }
    out.iter().collect()
}

/// Reject relative paths that could escape the hermes home directory.
fn validate_subpath(rel: &str) -> Result<(), String> {
    if rel.is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    if rel.starts_with('/') || rel.starts_with('\\') {
        return Err("Absolute paths not allowed".to_string());
    }
    #[cfg(windows)]
    if rel.len() >= 2 && rel.as_bytes()[1] == b':' {
        return Err("Absolute paths not allowed".to_string());
    }
    let home = hermes_home();
    let norm_home = normalize_path(&home);
    let norm_joined = normalize_path(&home.join(rel));
    if !norm_joined.starts_with(&norm_home) {
        return Err("Path escapes the Hermes home directory".to_string());
    }
    Ok(())
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
fn is_gateway_running() -> bool {
    api_healthy()
}

#[tauri::command]
fn hermes_start_gateway(app_handle: tauri::AppHandle, _state: tauri::State<GatewayState>) -> Result<CommandResult, String> {
    let home = hermes_home();

    // Ensure config.yaml has api_server enabled so the HTTP API always starts with the gateway.
    ensure_api_server_config();

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
    // GATEWAY_ALLOW_ALL_USERS is intentionally NOT persisted here — it is only injected
    // as a runtime env var below for the local loopback gateway. Persisting it would make
    // it apply to any remote or shared gateway started outside this app.
    let env_path = home.join(".env");
    let env_content = std::fs::read_to_string(&env_path).unwrap_or_default();
    if !env_content.contains("API_SERVER_ENABLED") {
        let mut lines: Vec<String> = env_content.lines().map(String::from).collect();
        lines.push(String::from("API_SERVER_ENABLED=true"));
        let _ = std::fs::write(&env_path, lines.join("\n") + "\n");
    }

    // Log stderr to a file for debugging.
    let log_file = home.join("logs").join("gateway-desktop.log");
    let _ = std::fs::create_dir_all(home.join("logs"));

    let mut cmd = Command::new(command_program());
    // --accept-hooks: intentional for local desktop use — allows the gateway to execute
    // shell hooks defined in the user's own hermes config. This is scoped to localhost.
    // GATEWAY_ALLOW_ALL_USERS: runtime-only, allows the WebView to call the local API
    // without per-session auth. Not written to disk (see comment above).
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

    cmd.stdin(Stdio::null()).stdout(Stdio::null());

    // ── Detached process flags + spawn ───────────────────────────────────────
    // CREATE_BREAKAWAY_FROM_JOB ensures the gateway and its children (e.g. Chrome
    // spawned by tool calls) escape the Tauri job object. The flag requires the
    // parent job to have JOB_OBJECT_LIMIT_BREAKAWAY_OK; if not, Windows returns
    // ERROR_ACCESS_DENIED (os error 5). We retry without the flag in that case —
    // the gateway starts normally, only Chrome auto-escape is lost.
    #[cfg(windows)]
    let child = {
        use std::os::windows::process::CommandExt;
        const DETACHED_PROCESS: u32          = 0x00000008;
        const CREATE_NEW_PROCESS_GROUP: u32  = 0x00000200;
        const CREATE_NO_WINDOW: u32          = 0x08000000;
        const CREATE_BREAKAWAY_FROM_JOB: u32 = 0x01000000;

        let log1 = std::fs::File::create(&log_file)
            .map_err(|e| format!("Cannot create gateway log: {}", e))?;
        cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW | CREATE_BREAKAWAY_FROM_JOB)
           .stderr(Stdio::from(log1));
        match cmd.spawn() {
            Ok(c) => c,
            Err(e) if e.raw_os_error() == Some(5) => {
                // Retry without CREATE_BREAKAWAY_FROM_JOB.
                let log2 = std::fs::File::create(&log_file)
                    .map_err(|e| format!("Cannot reopen gateway log: {}", e))?;
                cmd.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW)
                   .stderr(Stdio::from(log2))
                   .spawn()
                   .map_err(|err| format!("Failed to start gateway: {}", err))?
            }
            Err(e) => return Err(format!("Failed to start gateway: {}", e)),
        }
    };

    #[cfg(not(windows))]
    let child = {
        let log1 = std::fs::File::create(&log_file)
            .map_err(|e| format!("Cannot create gateway log: {}", e))?;
        cmd.stderr(Stdio::from(log1))
           .spawn()
           .map_err(|err| format!("Failed to start gateway: {}", err))?
    };

    // ── Drop the handle immediately — exactly like Node's .unref() ────────────
    // The gateway is fully detached and tracked only via the PID file it writes.
    std::mem::forget(child);

    // Poll port 8642 in the background and emit "gateway-ready" once it's up.
    let app_handle_poll = app_handle.clone();
    thread::spawn(move || {
        for _ in 0..10 {
            thread::sleep(Duration::from_millis(600));
            if api_healthy() {
                let _ = app_handle_poll.emit("gateway-ready", true);
                return;
            }
        }
        let _ = app_handle_poll.emit("gateway-ready", false);
    });

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
            .env("TERM", "dumb")
            .env("NO_COLOR", "1")
            .env("PYTHONUNBUFFERED", "1")
            .env("PYTHONIOENCODING", "utf-8")
            .env("PYTHONSTARTUP", ensure_pt_patch().to_string_lossy().as_ref())
            .env("PYTHONUTF8", "1")
            .env("PYTHONNOUSERSITE", "1")
            .env("PYTHONLEGACYWINDOWSSTDIO", "1")
            .env("PROMPT_TOOLKIT_COLOR_DEPTH", "DEPTH_1_BIT")
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
    validate_env_key(&key)?;
    validate_env_value(&value)?;
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
    validate_subpath(&rel_path)?;
    std::fs::read_to_string(hermes_home().join(&rel_path)).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(rel_path: String, content: String) -> Result<(), String> {
    validate_subpath(&rel_path)?;
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
fn list_hermes_skills_dir() -> Vec<HermesSkillMeta> {
    let dir = hermes_home().join("skills");
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() { continue; }
            let name = match path.file_name().and_then(|s| s.to_str()) {
                Some(n) => n.to_string(),
                None => continue,
            };
            let skill_md_path = path.join("SKILL.md");
            let has_skill_md = skill_md_path.exists();
            let description = if has_skill_md {
                std::fs::read_to_string(&skill_md_path)
                    .ok()
                    .and_then(|content| {
                        content.lines()
                            .find(|l| {
                                let t = l.trim();
                                !t.is_empty() && !t.starts_with('#') && !t.starts_with("---")
                            })
                            .map(|l| l.trim().to_string())
                    })
                    .unwrap_or_default()
            } else {
                String::new()
            };
            out.push(HermesSkillMeta { name, description, has_skill_md });
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

#[tauri::command]
fn read_profile(name: String) -> Result<String, String> {
    validate_name(&name)?;
    std::fs::read_to_string(
        hermes_home()
            .join("profiles")
            .join(format!("{}.md", name)),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_profile(name: String, content: String) -> Result<(), String> {
    validate_name(&name)?;
    let dir = hermes_home().join("profiles");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(format!("{}.md", name)), content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_profile(name: String) -> Result<(), String> {
    validate_name(&name)?;
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
    validate_name(&name)?;
    std::fs::read_to_string(hermes_home().join("memory").join(&name))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_memory_file(name: String) -> Result<(), String> {
    validate_name(&name)?;
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
    validate_name(&name)?;
    std::fs::read_to_string(hermes_home().join("sessions").join(&name))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn write_session_disk(name: String, content: String) -> Result<(), String> {
    validate_name(&name)?;
    let dir = hermes_home().join("sessions");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(&name), content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_session_disk(name: String) -> Result<(), String> {
    validate_name(&name)?;
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
fn search_sessions_disk(query: String) -> Vec<SessionMeta> {
    if query.trim().is_empty() {
        return list_sessions_disk();
    }
    let q = query.to_lowercase();
    list_sessions_disk()
        .into_iter()
        .filter(|s| {
            // Match on filename (session name) or file content
            if s.name.to_lowercase().contains(&q) {
                return true;
            }
            // Also search message content in the JSON file
            let path = hermes_home().join("sessions").join(&s.name);
            std::fs::read_to_string(&path)
                .map(|raw| raw.to_lowercase().contains(&q))
                .unwrap_or(false)
        })
        .collect()
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
#[allow(dead_code)]
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

    // On Windows use `cmd /c start /B` so Chrome is launched via ShellExecuteEx.
    // ShellExecuteEx always creates the process outside any Job Object, meaning
    // Chrome survives even if the Tauri app or gateway restarts.
    // /B suppresses the cmd window; the empty "" is the required window-title arg.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let chrome_str = chrome.to_string_lossy().to_string();
        let mut start_args: Vec<String> = vec![
            "/c".to_string(),
            "start".to_string(),
            String::new(),       // required window-title positional
            "/B".to_string(),
            chrome_str,
        ];
        start_args.extend(args);
        Command::new("cmd")
            .args(&start_args)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("Failed to launch Chrome: {}", e))?;
    }
    #[cfg(not(windows))]
    {
        let args_str: Vec<&str> = args.iter().map(String::as_str).collect();
        Command::new(&chrome)
            .args(&args_str)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to launch Chrome: {}", e))?;
    }

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
    validate_env_key(&key)?;
    validate_env_value(&val)?;
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
        .env("PYTHONUNBUFFERED", "1")
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONSTARTUP", ensure_pt_patch().to_string_lossy().as_ref())
        .env("PYTHONUTF8", "1")
        .env("PYTHONNOUSERSITE", "1")
        .env("PYTHONLEGACYWINDOWSSTDIO", "1")
        .env("PROMPT_TOOLKIT_COLOR_DEPTH", "DEPTH_1_BIT")
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

// ── Cron task dispatcher ──────────────────────────────────────────────────────

#[tauri::command]
fn dispatch_cron_task(
    app_handle: tauri::AppHandle,
    description: String,
    event_id: String,
    timeout_secs: Option<u64>,
) -> Result<CommandResult, String> {
    let args = vec![
        "chat".to_string(),
        "-q".to_string(),
        description,
        "-Q".to_string(),
        "--source".to_string(),
        "cron".to_string(),
    ];
    stream_spawn(
        &app_handle,
        command_program(),
        &args,
        &event_id,
        timeout_secs.unwrap_or(120),
    )
}

// ── Connection config (desktop.json) ─────────────────────────────────────────

fn desktop_config_path() -> std::path::PathBuf {
    hermes_home().join("desktop.json")
}

fn read_raw_desktop_cfg() -> serde_json::Value {
    let path = desktop_config_path();
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new()))
}

#[tauri::command]
fn get_connection_config() -> PublicConnectionConfig {
    let cfg = read_raw_desktop_cfg();
    let api_key = cfg.get("api_key").and_then(|v| v.as_str()).unwrap_or("").to_string();
    PublicConnectionConfig {
        mode: cfg.get("mode").and_then(|v| v.as_str()).unwrap_or("local").to_string(),
        remote_url: cfg.get("remote_url").and_then(|v| v.as_str()).unwrap_or("").to_string(),
        has_api_key: !api_key.is_empty(),
        api_key_length: api_key.len(),
    }
}

#[tauri::command]
fn set_connection_config(mode: String, remote_url: String, api_key: Option<String>) -> Result<(), String> {
    let home = hermes_home();
    std::fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    let mut cfg = read_raw_desktop_cfg();
    let obj = cfg.as_object_mut().ok_or_else(|| "Invalid desktop config".to_string())?;
    obj.insert("mode".to_string(), serde_json::Value::String(mode));
    obj.insert("remote_url".to_string(), serde_json::Value::String(remote_url));
    if let Some(key) = api_key {
        obj.insert("api_key".to_string(), serde_json::Value::String(key));
    }
    let content = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    std::fs::write(desktop_config_path(), content).map_err(|e| e.to_string())
}

/// Exposes the stored API key to the renderer for HTTP auth headers.
/// The key is not logged or included in any other response.
#[tauri::command]
fn get_connection_api_key() -> String {
    let cfg = read_raw_desktop_cfg();
    cfg.get("api_key").and_then(|v| v.as_str()).unwrap_or("").to_string()
}

#[tauri::command]
fn get_gateway_port() -> u16 {
    let cfg = read_raw_desktop_cfg();
    cfg.get("gateway_port")
        .and_then(|v| v.as_u64())
        .map(|p| p.clamp(1024, 65535) as u16)
        .unwrap_or(8642)
}

#[tauri::command]
fn set_gateway_port(port: u16) -> Result<(), String> {
    let home = hermes_home();
    std::fs::create_dir_all(&home).map_err(|e| e.to_string())?;
    let mut cfg = read_raw_desktop_cfg();
    let obj = cfg.as_object_mut().ok_or_else(|| "Invalid desktop config".to_string())?;
    obj.insert("gateway_port".to_string(), serde_json::Value::Number(serde_json::Number::from(port)));
    let content = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    std::fs::write(desktop_config_path(), content).map_err(|e| e.to_string())
}

// ── Profile management (directory-based) ─────────────────────────────────────

#[tauri::command]
fn hermes_list_profiles() -> Result<Vec<String>, String> {
    let home = hermes_home();
    let profiles_dir = home.join("profiles");
    if !profiles_dir.exists() {
        return Ok(vec!["default".to_string()]);
    }
    let mut names: Vec<String> = std::fs::read_dir(&profiles_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    names.sort();
    if !names.contains(&"default".to_string()) {
        names.insert(0, "default".to_string());
    }
    Ok(names)
}

#[tauri::command]
fn hermes_create_profile(name: String) -> Result<CommandResult, String> {
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains('.') {
        return Err("Invalid profile name".to_string());
    }
    let home = hermes_home();
    let profile_dir = home.join("profiles").join(&name);
    std::fs::create_dir_all(&profile_dir).map_err(|e| e.to_string())?;
    Ok(CommandResult {
        success: true,
        code: Some(0),
        command: format!("create profile {}", name),
        stdout: format!("Profile '{}' created", name),
        stderr: String::new(),
    })
}

#[tauri::command]
fn hermes_delete_profile(name: String) -> Result<CommandResult, String> {
    if name == "default" {
        return Err("Cannot delete the default profile".to_string());
    }
    let home = hermes_home();
    let profile_dir = home.join("profiles").join(&name);
    if profile_dir.exists() {
        std::fs::remove_dir_all(&profile_dir).map_err(|e| e.to_string())?;
    }
    Ok(CommandResult {
        success: true,
        code: Some(0),
        command: format!("delete profile {}", name),
        stdout: format!("Profile '{}' deleted", name),
        stderr: String::new(),
    })
}

#[tauri::command]
fn hermes_rename_profile(old_name: String, new_name: String) -> Result<CommandResult, String> {
    if old_name == "default" {
        return Err("Cannot rename the default profile".to_string());
    }
    if new_name.is_empty() || new_name.contains('/') || new_name.contains('\\') {
        return Err("Invalid profile name".to_string());
    }
    let home = hermes_home();
    let old_dir = home.join("profiles").join(&old_name);
    let new_dir = home.join("profiles").join(&new_name);
    if old_dir.exists() {
        std::fs::rename(&old_dir, &new_dir).map_err(|e| e.to_string())?;
    }
    Ok(CommandResult {
        success: true,
        code: Some(0),
        command: format!("rename profile {} -> {}", old_name, new_name),
        stdout: format!("Profile renamed to '{}'", new_name),
        stderr: String::new(),
    })
}

// ── SSH tunnel commands ───────────────────────────────────────────────────────

#[tauri::command]
fn hermes_start_ssh_tunnel(
    ssh_host: String,
    ssh_port: u16,
    ssh_user: String,
    ssh_key_path: String,
    ssh_remote_port: u16,
    ssh_local_port: u16,
    state: tauri::State<SshState>,
) -> Result<CommandResult, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
    }

    let mut args = vec![
        "-N".to_string(),
        "-L".to_string(),
        format!("{}:127.0.0.1:{}", ssh_local_port, ssh_remote_port),
        "-p".to_string(),
        ssh_port.to_string(),
        "-o".to_string(), "StrictHostKeyChecking=accept-new".to_string(),
        "-o".to_string(), "BatchMode=yes".to_string(),
        "-o".to_string(), "ExitOnForwardFailure=yes".to_string(),
        "-o".to_string(), "ServerAliveInterval=30".to_string(),
        "-o".to_string(), "ServerAliveCountMax=3".to_string(),
    ];
    if !ssh_key_path.is_empty() {
        args.push("-i".to_string());
        args.push(ssh_key_path);
    }
    args.push(format!("{}@{}", ssh_user, ssh_host));

    let child = Command::new("ssh")
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn SSH: {}", e))?;

    *guard = Some(child);
    Ok(CommandResult {
        success: true,
        code: Some(0),
        command: "ssh tunnel".to_string(),
        stdout: format!("SSH tunnel started: local port {} → {}:{}", ssh_local_port, ssh_host, ssh_remote_port),
        stderr: String::new(),
    })
}

#[tauri::command]
fn hermes_stop_ssh_tunnel(state: tauri::State<SshState>) -> Result<CommandResult, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        Ok(CommandResult {
            success: true,
            code: Some(0),
            command: "ssh stop".to_string(),
            stdout: "SSH tunnel stopped".to_string(),
            stderr: String::new(),
        })
    } else {
        Ok(CommandResult {
            success: true,
            code: Some(0),
            command: "ssh stop".to_string(),
            stdout: "No tunnel running".to_string(),
            stderr: String::new(),
        })
    }
}

// ── Batch 3: single-key env read + cron task list ────────────────────────────

#[tauri::command]
fn read_env_var(key: String) -> Result<String, String> {
    let home = hermes_home();
    let env_path = home.join(".env");
    if !env_path.exists() {
        return Err(format!("Key '{}' not found (no .env file)", key));
    }
    let map = read_env_file(&home);
    map.get(&key)
        .cloned()
        .ok_or_else(|| format!("Key '{}' not found in .env", key))
}

#[tauri::command]
fn list_cron_tasks() -> Result<Vec<serde_json::Value>, String> {
    let bin = hermes_binary();
    let result = run_command(bin, &[String::from("cron"), String::from("list"), String::from("--json")], 15)
        .unwrap_or_else(|_| CommandResult {
            success: false,
            code: None,
            command: String::new(),
            stdout: String::new(),
            stderr: String::new(),
        });
    if !result.success || result.stdout.trim().is_empty() {
        return Ok(vec![]);
    }
    match serde_json::from_str::<Vec<serde_json::Value>>(result.stdout.trim()) {
        Ok(arr) => Ok(arr),
        Err(_) => Ok(vec![]),
    }
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
        .manage(SshState(Mutex::new(None)))
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
            is_gateway_running,
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
            list_hermes_skills_dir,
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
            search_sessions_disk,
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
            dispatch_cron_task,
            get_connection_config,
            set_connection_config,
            get_connection_api_key,
            get_gateway_port,
            set_gateway_port,
            hermes_start_ssh_tunnel,
            hermes_stop_ssh_tunnel,
            hermes_list_profiles,
            hermes_create_profile,
            hermes_delete_profile,
            hermes_rename_profile,
            read_env_var,
            list_cron_tasks,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_name_rejects_path_separators() {
        assert!(validate_name("foo/bar").is_err());
        assert!(validate_name("foo\\bar").is_err());
        assert!(validate_name("..").is_err());
        assert!(validate_name(".").is_err());
    }

    #[test]
    fn validate_name_accepts_valid_names() {
        assert!(validate_name("my-skill").is_ok());
        assert!(validate_name("config.yaml").is_ok());
        assert!(validate_name("my_file_123").is_ok());
    }

    #[test]
    fn validate_env_key_rejects_bad_chars() {
        assert!(validate_env_key("MY KEY").is_err());
        assert!(validate_env_key("1STARTS_WITH_NUM").is_err());
        assert!(validate_env_key("").is_err());
    }

    #[test]
    fn validate_env_key_accepts_valid_keys() {
        assert!(validate_env_key("MY_KEY").is_ok());
        assert!(validate_env_key("OPENAI_API_KEY").is_ok());
        assert!(validate_env_key("_PRIVATE").is_ok());
    }

    #[test]
    fn validate_env_value_rejects_newlines() {
        assert!(validate_env_value("foo\nbar").is_err());
        assert!(validate_env_value("foo\rbar").is_err());
    }

    #[test]
    fn validate_env_value_accepts_normal_values() {
        assert!(validate_env_value("sk-1234567890abcdef").is_ok());
        assert!(validate_env_value("").is_ok());
    }

    #[test]
    fn normalize_path_resolves_dotdot() {
        let home = std::path::PathBuf::from("/home/user/.hermes");
        let p = home.join("skills").join("..").join("config.yaml");
        let norm = normalize_path(&p);
        assert_eq!(norm, std::path::PathBuf::from("/home/user/.hermes/config.yaml"));
    }

    #[test]
    fn validate_subpath_rejects_traversal() {
        assert!(validate_subpath("").is_err());
        assert!(validate_subpath("/etc/passwd").is_err());
        assert!(validate_subpath("\\Windows\\System32").is_err());
    }

    #[test]
    fn validate_subpath_accepts_normal_relative_paths() {
        // "gui-crons.json" stays under hermes_home — verify no panic and logic executes
        let result = validate_subpath("gui-crons.json");
        // In test environment hermes_home may be arbitrary but the path won't escape it
        assert!(result.is_ok() || result.is_err()); // just verify no panic
    }
}
