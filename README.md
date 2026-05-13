# Hermes GUI — Desktop Agent

A native desktop GUI for [Nous Research Hermes Agent](https://github.com/NousResearch/hermes-agent), built with **Tauri v2, React, TypeScript, and Tailwind CSS**.

The goal is simple: keep Hermes Agent as the engine, then expose installation, setup, command execution, gateway control, agents, sessions, skills, crons, and configuration from a better desktop UI.

---

## Current Surface

| Panel | What it does |
| --- | --- |
| Conversation | OpenAI-compatible SSE chat against the local Hermes API gateway. |
| Install | Detects Hermes, shows the active home/config/binary, runs the official installer, and launches safe diagnostics. |
| Command Center | Searchable catalog of Hermes CLI commands with a native Tauri command runner. |
| Agents | Main, one-shot, scripted, worktree, background, gateway, goal, and ACP agent modes. |
| Gateway | Starts/stops `hermes gateway run`, checks `127.0.0.1:8642`, and tracks platform connection setup. |
| Crons | Local scheduled-task UI scaffold for Hermes cron workflows. |
| Skills | Browse, create, edit, and invoke reusable Hermes skills. |
| Settings | API keys, personality, memory, workspace, and terminal backend settings scaffold. |

---

## References Checked

- [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent): official agent, installer, CLI, gateway, slash command, skills, cron, memory, ACP, MCP, and profile surfaces.
- [nesquena/hermes-webui](https://github.com/nesquena/hermes-webui): web dashboard with strong command/session parity and a three-panel operational layout.
- [fathah/hermes-desktop](https://github.com/fathah/hermes-desktop): Electron desktop implementation with native installation, runtime checks, gateway process control, sessions, profiles, skills, and config management.

---

## Architecture

```
React renderer
  |-- fetch/SSE --> http://localhost:8642/v1/chat/completions
  |-- Tauri IPC --> Rust backend
                  |-- discover/install Hermes Agent
                  |-- run hermes commands
                  |-- start/stop managed gateway process
                  |-- probe localhost:8642 health
```

The app wraps Hermes rather than reimplementing it. Chat still flows through Hermes Agent's OpenAI-compatible API server, while desktop-only tasks use Tauri commands.

---

## Development

### Prerequisites

- Node.js 18+
- Rust and Cargo (for the full Tauri desktop app)
- Hermes Agent (if you want live command/gateway integration)

### Frontend Preview

```bash
npm install
npm run dev
```

Open [http://localhost:1420](http://localhost:1420).

### Desktop App

```bash
npm run tauri dev
```

### Build

```bash
npm run build        # frontend bundle only
npm run tauri build  # native installer
```

---

## Native Commands

The Rust backend currently exposes:

| Command | What it does |
| --- | --- |
| `hermes_install_status` | Checks if `hermes` is on PATH; returns path and version. |
| `hermes_install` | Runs the official one-line installer and returns the output. |
| `hermes_run_command` | Runs any `hermes <args>` invocation and returns stdout/stderr. |
| `hermes_start_gateway` | Spawns `hermes gateway run` as a managed child process. |
| `hermes_stop_gateway` | Kills the managed gateway process. |
| `hermes_gateway_status` | Probes `GET http://127.0.0.1:8642/health` and returns status. |

These are consumed from `src/api/desktop.ts`, which falls back gracefully when the app is running in browser preview mode.

---

## How to Test

### 1 — Frontend only (no Hermes needed)

```bash
npm install
npm run dev
# open http://localhost:1420
```

Everything renders and is interactive. Gateway will show "Disconnected" since no agent is running. You can still browse all panels, create crons/skills, open the command palette (`Ctrl+K`), switch models, and use the settings modal.

### 2 — With a live Hermes gateway

If Hermes is already installed and configured:

```bash
# terminal 1 — start the Hermes API server
hermes gateway run

# terminal 2 — start the GUI
npm run dev
```

The sidebar status dot turns white (Connected). You can now send real messages in the Conversation panel and watch SSE tokens stream in.

### 3 — Full Tauri desktop app (requires Rust)

```bash
# Install Rust: https://www.rust-lang.org/learn/get-started
npm run tauri dev
```

This compiles the Rust backend and opens a native window. The Install panel will now run `hermes_install_status` for real. The Gateway panel will actually spawn `hermes gateway run` as a managed child process.

### 4 — Smoke-test checklist

| Test | Expected |
| --- | --- |
| Load app | All 8 nav items render; status shows Disconnected if no gateway |
| `Ctrl+K` | Command palette opens, fuzzy search works, `↑↓↵` navigate |
| Click model in sidebar | Model switcher modal opens, search filters providers |
| Gateway → Start Gateway | Status changes to Connecting → Connected (needs real Hermes) |
| Crons → New Cron | Form appears; adding a task shows it in the list with toggle |
| Skills → New Skill | Skill editor opens; save adds it to the card list |
| Settings → API Keys | Password fields with show/hide toggle; save button present |
| Conversation → type + send | SSE streaming renders tokens (needs live gateway) |

---

## Shipped

- [x] **Live streaming** — `hermes_stream_command` / `hermes_stream_install` Rust IPC emit each output line as a Tauri event; wizard and install panel display output in real time.
- [x] **Wizard resume** — progress saved to `{hermes_home}/gui-setup-state.json`; resumes from the correct step after accidental close.
- [x] **Settings wired** — API keys, personality, memory, workspace and auto-start all read/write real `~/.hermes` files via `read_env` / `write_env` / `read_file` / `write_file` / `read_config` / `write_config`.
- [x] **Crons wired** — loads from `hermes cron list`, creates/toggles/deletes via `hermes cron add/enable/disable/remove`.
- [x] **Skills wired** — loads from `hermes skills list`, saves skill content to `~/.hermes/skills/<name>.md`, invokes via `hermes skills run`.
- [x] **Gateway platform config** — each platform's tokens saved via `write_env`.
- [x] **Dynamic tray menu** — `update_tray_status` Rust command rebuilds tray menu with live gateway state label on every status change.
- [x] **Session export** — Markdown export of the active conversation with timestamps and tool-call blocks.
- [x] **Auto-start toggle** — Settings → Workspace → "Launch on login" wired to `tauri-plugin-autostart`.
- [x] **Update checker** — on launch, checks GitHub releases API and shows a banner with one-click update.

## Roadmap

- [ ] Add sessions/profiles/memory panels backed by `~/.hermes` (multi-profile `--profile` flag).
- [ ] Add a PTY-backed terminal view for fully interactive commands like `hermes setup model`.
- [ ] Package signed installers with auto-update via Tauri updater plugin.

---

## License

MIT
