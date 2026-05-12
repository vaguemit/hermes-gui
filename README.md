# Hermes GUI - Desktop Agent

A native desktop GUI for [Nous Research Hermes Agent](https://github.com/NousResearch/hermes-agent), built with Tauri v2, React, TypeScript, and Tailwind CSS.

The goal is simple: keep Hermes Agent as the engine, then expose installation, setup, command execution, gateway control, agents, sessions, skills, crons, and configuration from a better desktop UI.

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

## References Checked

- [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent): official agent, installer, CLI, gateway, slash command, skills, cron, memory, ACP, MCP, and profile surfaces.
- [nesquena/hermes-webui](https://github.com/nesquena/hermes-webui): web dashboard with strong command/session parity and a three-panel operational layout.
- [fathah/hermes-desktop](https://github.com/fathah/hermes-desktop): Electron desktop implementation with native installation, runtime checks, gateway process control, sessions, profiles, skills, and config management.

## Architecture

```text
React renderer
  |-- fetch/SSE --> http://localhost:8642/v1/chat/completions
  |-- Tauri IPC --> Rust backend
                  |-- discover/install Hermes Agent
                  |-- run hermes commands
                  |-- start/stop managed gateway process
                  |-- probe localhost:8642 health
```

The app wraps Hermes rather than reimplementing it. Chat still flows through Hermes Agent's OpenAI-compatible API server, while desktop-only tasks use Tauri commands.

## Development

### Prerequisites

- Node.js 18+
- Rust and Cargo for the full Tauri desktop app
- Hermes Agent if you want live command/gateway integration

### Frontend Preview

```bash
npm install
npm run dev
```

Open http://localhost:1420.

### Desktop App

```bash
npm run tauri dev
```

### Build

```bash
npm run build
npm run tauri build
```

## Native Commands

The Rust backend currently exposes:

- `hermes_install_status`
- `hermes_install`
- `hermes_run_command`
- `hermes_start_gateway`
- `hermes_stop_gateway`
- `hermes_gateway_status`

These are consumed from `src/api/desktop.ts`, which falls back gracefully when the app is running in browser preview mode.

## Roadmap

- Stream installer and command output live instead of returning only at process exit.
- Persist real platform config to Hermes config/env files.
- Replace local cron/skills mock data with Hermes-backed reads and writes.
- Add sessions/profiles/memory panels backed by `~/.hermes`.
- Add a PTY-backed terminal view for fully interactive commands like `hermes setup model`.
- Package signed installers with auto-update.

## License

MIT
