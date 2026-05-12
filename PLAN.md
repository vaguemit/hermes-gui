# Hermes GUI — Implementation Plan (Final)

## Architecture

```
React UI
  ├── fetch/SSE ──────► http://127.0.0.1:8642/v1/chat/completions
  └── Tauri IPC ──────► Rust backend
                          ├── detect_hermes         → installed? version? binary path?
                          ├── detect_api_keys        → any keys in .env?
                          ├── install_hermes         → run platform one-liner, stream output
                          ├── read_config / write_config
                          ├── read_env / write_env
                          ├── read_file / write_file
                          ├── run_hermes_command     → hermes <args>, stream output
                          ├── run_hermes_doctor      → hermes doctor, structured output
                          ├── start_gateway          → spawn with full binary path
                          ├── stop_gateway           → kill managed process
                          ├── gateway_health         → GET 127.0.0.1:8642/health
                          └── check_update           → GitHub releases API
```

---

## Config Path Resolution

```rust
fn hermes_home() -> PathBuf {
    // 1. Check HERMES_HOME env var (installer sets this on Windows)
    if let Ok(h) = std::env::var("HERMES_HOME") {
        return PathBuf::from(h);
    }
    // 2. Platform default
    if cfg!(target_os = "windows") {
        // %LOCALAPPDATA%\hermes
        PathBuf::from(std::env::var("LOCALAPPDATA").unwrap()).join("hermes")
    } else {
        // ~/.hermes
        dirs::home_dir().unwrap().join(".hermes")
    }
}
```

| Platform | Path |
|---|---|
| Windows native | `C:\Users\<user>\AppData\Local\hermes\` |
| Linux / macOS / WSL2 | `/home/<user>/.hermes/` |

Every `read_config`, `write_env`, `read_file`, `start_gateway` call uses `hermes_home()`.

---

## Binary Path Resolution

The installer puts the binary at a known location but **does not update PATH for the current running process**. The Rust backend resolves the full path:

```rust
fn hermes_binary() -> Option<PathBuf> {
    // 1. Already on PATH (user installed before launching app)
    if let Ok(p) = which::which("hermes") { return Some(p); }
    // 2. Known install location
    let home = hermes_home();
    if cfg!(target_os = "windows") {
        let p = home.join("hermes-agent").join("venv").join("Scripts").join("hermes.exe");
        if p.exists() { return Some(p); }
    } else {
        let p = home.join("hermes-agent").join("venv").join("bin").join("hermes");
        if p.exists() { return Some(p); }
    }
    None
}
```

`start_gateway`, `run_hermes_command`, `run_hermes_doctor` all use this — never bare `hermes`.

---

## Tauri IPC Commands (14 total)

### Detection (2)

| Command | Returns |
|---|---|
| `detect_hermes` | `{ installed, version?, binary_path?, home_path }` |
| `detect_api_keys` | `{ has_keys, providers: ["OPENROUTER_API_KEY", ...] }` |

### Installation (1)

| Command | What it does |
|---|---|
| `install_hermes` | Detect OS → run the correct one-liner → stream output line by line via events |

```
Windows  →  powershell -ExecutionPolicy Bypass -Command "irm https://.../install.ps1 | iex"
Unix     →  bash -c "curl -fsSL https://.../install.sh | bash"
```

### Configuration (6)

| Command | What it does |
|---|---|
| `read_config` | Read `{hermes_home}/config.yaml` → JSON |
| `write_config(key, value)` | Atomic write to config.yaml |
| `read_env` | Read `{hermes_home}/.env` → key-value pairs |
| `write_env(key, value)` | Atomic write/update key in .env |
| `read_file(rel_path)` | Read file relative to hermes_home |
| `write_file(rel_path, content)` | Atomic write relative to hermes_home |

### Execution (2)

| Command | What it does |
|---|---|
| `run_hermes_command(args)` | `{hermes_binary} <args>`, stream stdout/stderr |
| `run_hermes_doctor` | `{hermes_binary} doctor`, return structured output |

### Gateway (3)

| Command | What it does |
|---|---|
| `start_gateway` | Spawn `{hermes_binary} gateway run` as managed child, stream logs |
| `stop_gateway` | Kill managed gateway process |
| `gateway_health` | `GET http://127.0.0.1:8642/health` |

---

## New Desktop Features

### 1. System Tray

**Plugin:** `tauri-plugin-tray` (built-in to Tauri v2)

| Tray state | Icon color | Meaning |
|---|---|---|
| Green dot | `dot-green` | Gateway running, healthy |
| Amber dot | `dot-amber` | Starting up / reconnecting |
| Red dot | `dot-red` | Gateway crashed or unreachable |
| Dim dot | `dot-dim` | Gateway not started |

**Right-click menu:**
```
Open Hermes GUI
─────────────
Gateway: Running ●
Restart Gateway
─────────────
Quit
```

Non-technical users need this — otherwise closing the window looks like the app is gone.

### 2. Global Hotkey — Ctrl+Shift+H

**Plugin:** `tauri-plugin-global-shortcut`

Opens/focuses the chat window from anywhere, even when minimized to tray. The single biggest desktop UX differentiator.

### 3. Auto-Start on Login

**Plugin:** `tauri-plugin-autostart`

Gateway starts at boot. User's bot is always online. Toggle in Settings.

### 4. Gateway Auto-Restart

Poll `gateway_health` every 30 seconds. If it returns non-200:
1. Increment failure counter
2. On 3 consecutive failures → auto-respawn via `start_gateway`
3. Show toast notification: "Gateway restarted automatically"
4. Reset counter on success

### 5. Session Export

One-click export of the current conversation:

- **Markdown** — messages with timestamps, tool calls as fenced blocks, reasoning as blockquotes
- **PDF** — via Rust crate (`printpdf`) or simply `write_file` the .md and let the user open it

Button in the conversation header: `Export ↗`

### 6. Update Checker

On launch, hit `https://api.github.com/repos/NousResearch/hermes-agent/releases/latest`.

Compare `tag_name` against `detect_hermes().version`. If newer:
- Show banner in header: `Update available: v2.2.0 → v2.3.0`
- One-click runs `run_hermes_command(["update"])`

Also check for app updates via Tauri's built-in updater for the GUI itself.

### 7. Multi-Profile Support

Hermes supports `hermes --profile alice`. Each profile has isolated:
- API keys (`.env`)
- Model selection (`config.yaml`)
- Memory / SOUL.md
- Sessions

**UI:** Profile chip in the header bar (from design system):
```
[DE ▾ default]  [AL alice]
```

All IPC commands accept an optional `profile` parameter. The Rust backend adds `--profile <name>` to every `hermes` invocation when a non-default profile is active.

### 8. Onboarding Resume

Persist wizard progress to disk at `{hermes_home}/gui-setup-state.json`:

```json
{
  "step": 3,
  "provider": "openrouter",
  "install_completed": true,
  "api_key_saved": false,
  "timestamp": "2026-05-13T03:40:00Z"
}
```

If the user closes mid-install, next launch reads this and resumes from the correct step.

---

## Setup Wizard Flow

### Step 1 — Environment Check

```
┌─────────────────────────────────────────────────┐
│  ENVIRONMENT CHECK                               │
│                                                   │
│  ● Hermes Agent — not installed                  │
│  ● API Key — not configured                      │
│                                                   │
│  [Install Hermes]       [I already have it]       │
└─────────────────────────────────────────────────┘
```

Two lines. The installer handles Python/Git/uv/Node internally.

### Step 2 — Install (streams output)

```
┌─────────────────────────────────────────────────┐
│  INSTALLING HERMES AGENT                         │
│                                                   │
│  ┌─ install log ──────────────────────────────┐  │
│  │ → Checking for uv package manager…         │  │
│  │ ✓ uv 0.7.12 found                          │  │
│  │ → Installing Python 3.11 via uv…           │  │
│  │ ✓ Python 3.11.12 ready                     │  │
│  │ → git clone hermes-agent… 67%               │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  This takes 2–5 minutes. Don't close the app.    │
└─────────────────────────────────────────────────┘
```

### Step 3 — Provider Selection (2-column grid)

### Step 4 — API Key (monospace input, signup link)

### Step 5 — Model Selection

### Done → main app, gateway auto-starts

---

## Design System

| Token | Value |
|---|---|
| `--bg0` | `#080808` — window base |
| `--bg1` | `#0f0f0f` — sidebar, cards |
| `--bg2` | `#161616` — hover, elevated |
| `--bg3` | `#1e1e1e` — active nav, dropdowns |
| `--bg4` | `#262626` — badges, icons |
| `--border` | `rgba(255,255,255,0.07)` |
| `--text-primary` | `#f0f0f0` |
| `--text-secondary` | `#888` |
| `--text-tertiary` | `#444` |
| `--accent-green` | `#22c55e` — running, success |
| `--accent-amber` | `#f59e0b` — in-progress, warning |
| `--accent-red` | `#ef4444` — error, danger |
| Font sans | Outfit |
| Font mono | Geist Mono |
| Primary button | White `#f0f0f0` on `#080808` |
| No shadows | Borders only |

---

## Build Plan

### Phase 1 — Install Rust ✅ Done
```
rustc 1.95.0 (59807616e 2026-04-14)
cargo 1.95.0 (f2d3ce0bd 2026-03-21)
```

### Phase 2 — Rust backend (14 IPC commands)
### Phase 3 — Setup wizard component
### Phase 4 — Wire all panels to real backend
### Phase 5 — System tray + global hotkey + auto-start
### Phase 6 — Build .exe

```powershell
npm run tauri build
# → src-tauri/target/release/hermes-gui.exe
# → src-tauri/target/release/bundle/msi/hermes-gui_0.1.0_x64.msi
```
