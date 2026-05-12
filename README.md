# 🪽 Hermes GUI — Desktop Agent

A native desktop GUI for [Hermes Agent](https://github.com/NousResearch/hermes) built with **Tauri v2 + React 18 + TypeScript + Tailwind CSS v4**.

> No browser, no SSH tunnel, no terminal required. Every Hermes feature exposed as a UI action.

![Hermes GUI Screenshot](docs/screenshot.png)

---

## Features

| Panel | What it does |
|---|---|
| **💬 Conversation** | SSE streaming chat, live tool call cards, reasoning trace blocks, stop button, token usage bar |
| **⌘K Command Palette** | All 17 slash commands searchable — `/model`, `/compress`, `/retry`, `/skills`, and more |
| **📡 Gateway** | Start/stop `hermes gateway run`, platform connection cards (Telegram, Discord, Slack, WhatsApp, Signal, Email), live process log |
| **⏰ Crons** | Scheduled task management with natural-language schedule input |
| **⚡ Skills** | Browse, create, edit, and invoke Hermes skills with an inline markdown editor |
| **⚙️ Settings** | API keys (masked), personality editor, memory viewer, workspace + terminal backend config |

---

## Architecture

```
React UI (renderer)
    │
    ├──── fetch() SSE ──────▶ http://localhost:8642/v1/chat/completions
    │                              (Hermes OpenAI-compatible API)
    │
    └──── Tauri IPC ────────▶ Rust backend
                                  └── spawn/kill hermes gateway run
                                  └── read/write ~/.hermes/config.yaml
```

The frontend communicates with Hermes via the **built-in OpenAI-compatible API server** at `http://localhost:8642` — no fragile stdout parsing.

---

## Getting Started

### Prerequisites

- [Node.js 18+](https://nodejs.org/)
- [Rust + Cargo](https://www.rust-lang.org/learn/get-started) (for the full desktop app)
- [Hermes Agent](https://github.com/NousResearch/hermes) installed and on PATH

### Development (frontend only)

```bash
git clone https://github.com/vaguemit/hermes-gui.git
cd hermes-gui
npm install
npm run dev
# → http://localhost:1420
```

### Full Desktop App

```bash
npm run tauri dev
```

### Production Build

```bash
npm run build        # frontend bundle only
npm run tauri build  # native installer (.dmg / .deb / .AppImage / .exe)
```

---

## Tech Stack

| Layer | Choice |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 18 + TypeScript |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) |
| State | Zustand |
| Agent API | `fetch()` → `http://localhost:8642` (OpenAI SSE format) |
| Icons | lucide-react |
| Fonts | Inter + JetBrains Mono (Google Fonts) |

---

## How It Connects to Hermes

1. On app launch, check `GET http://localhost:8642/health`
2. If healthy → show "Connected" and proceed
3. If not → offer "Start Gateway" button which spawns `hermes gateway run` as a managed child process
4. All chat goes via `POST /v1/chat/completions` with SSE streaming
5. Tool call events are parsed from `delta.tool_calls` in the stream and rendered as live cards

---

## Project Structure

```
hermes-gui/
├── src/
│   ├── api/hermes.ts          # API client (SSE streaming, health check, model list)
│   ├── components/
│   │   ├── ConversationPanel.tsx
│   │   ├── Sidebar.tsx
│   │   ├── ToolsPanel.tsx
│   │   ├── CommandPalette.tsx
│   │   ├── ModelSwitcher.tsx
│   │   ├── GatewayPanel.tsx
│   │   ├── CronPanel.tsx
│   │   ├── SkillsPanel.tsx
│   │   └── SettingsModal.tsx
│   ├── utils/parser.tsx       # Markdown renderer, message type detection
│   ├── store.ts               # Zustand store
│   ├── App.tsx                # Root layout
│   └── index.css              # Design system (CSS variables)
└── src-tauri/                 # Tauri Rust backend
```

---

## Roadmap

### Milestone 1 ✅ (done)
- [x] Tauri project scaffolded
- [x] React frontend with SSE streaming
- [x] Tool call cards parsed from stream
- [x] Full conversation UI with stop button

### Milestone 2 ✅ (done)
- [x] Command palette (all slash commands)
- [x] Model switcher (grouped by provider)
- [x] Session list in sidebar

### Milestone 3 ✅ (done)
- [x] Settings panel (API keys, personality, memory, workspace)
- [x] Tool toggles panel

### Milestone 4 ✅ (done)
- [x] Gateway panel (start/stop + status + platform cards)
- [x] Cron scheduler
- [x] Skills browser + editor

### Milestone 5 — In Progress
- [ ] Rust backend: spawn `hermes gateway run` via Tauri shell plugin
- [ ] Real config R/W (`~/.hermes/config.yaml`, `.env`)
- [ ] Session persistence (read `~/.hermes/sessions/`)
- [ ] App packaging + auto-update

---

## Contributing

PRs welcome. The codebase is intentionally thin — it wraps Hermes, never reimplements it.

---

## License

MIT
