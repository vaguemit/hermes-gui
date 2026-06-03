# Hermes GUI — Master Implementation Plan

Last updated: 2026-05-27
Reference: https://github.com/fathah/hermes-desktop (MIT)
Status legend: Done | Partial | Not started | Issue flagged

---

## Current State (as of today)

| Phase | Status | Notes |
|---|---|---|
| Phase 0 — Repo protection & inventory | DONE | .gitignore fixed, full inventory produced |
| Phase 1 — Rust build & safety | DONE | list_cron_tasks fixed, path hardening, 234 TS tests, 13 Rust tests |
| Phase 2 — HermesClient layer | PARTIAL | Abstraction exists, factory partially mode-aware |
| Phase 3 — Setup wizard | PARTIAL | WelcomePanel (5 steps) exists, not wired to real Hermes install flow |
| Phase 4 — Real sessions | NOT STARTED | Currently JSON files, no SQLite, no real session ID tracking |
| Phase 5 — Real profiles | PARTIAL | Directory CRUD works, active_profile file not read |
| Phase 6 — Real cron | PARTIAL | list works, create/pause/resume/trigger missing |
| Phase 7 — Skills/tools/memory/models | PARTIAL | UI exists, backends mostly stubbed |
| Phase 8 — Chat parity | PARTIAL | SSE works, session-id header not tracked |
| Phase 9 — Remote/SSH/secrets | PARTIAL | Remote chat works, API key in localStorage |
| Phase 10 — Diagnostics/CI/release | NOT STARTED | Basic health check only |
| Phase 11 — Office panel | NOT STARTED | Code fetched from Desktop repo, ready to port |
| Phase 12 — Messaging integrations | NOT STARTED | 16 platform gateways, not in original plan |

---

## Issues With The Prompt Pack

These are gaps or misalignments between the prompts and what we found in the actual Desktop repo.

### Issue 1 — Soul editor is missing from all phases

Desktop has a dedicated Soul screen for editing SOUL.md — the agent's persona file. It is listed
in their sidebar as a first-class panel alongside Memory. None of the 10 phase prompts mention it.

Fix: Add to Phase 7 task list:
- read_soul / write_soul / reset_soul Rust commands (Desktop has these in index.ts:844-1045)
- SoulPanel component: read/edit SOUL.md textarea, reset to default button

---

### Issue 2 — Messaging gateway integrations (16 platforms) are missing

Desktop supports Telegram, Discord, Slack, WhatsApp, Signal, Matrix, Email, SMS, iMessage and
more — 16 total, shown prominently on hermesagents.cc. The prompt pack mentions "gateway" only
in the context of the local Hermes API server.

Fix: Add Phase 12 — Messaging Integrations after Office (Phase 11).

---

### Issue 3 — Phase 3 is partially done

The WelcomePanel (5-step onboarding) already exists at src/components/WelcomePanel.tsx.
A new agent will re-examine it and may duplicate or overwrite working code.

Fix: Phase 3 prompt must start with: "Audit existing WelcomePanel — identify what is stub vs
real, then extend gaps only."

---

### Issue 4 — Phase 4 assumes state.db exists without verifying

Desktop reads from ~/.hermes/state.db but this file is created by the Hermes CLI itself,
not by Desktop. We do not know if the user's installed Hermes CLI version creates this DB.

This is a blocker. Before writing any Phase 4 code:
1. Run: hermes chat -q "hi" -Q --source desktop
2. Check if ~/.hermes/state.db exists
3. Run: sqlite3 ~/.hermes/state.db ".tables" to confirm schema matches Desktop's sessions/messages/messages_fts schema
4. If schema differs, adjust the rusqlite queries

---

### Issue 5 — Phase 6 cron: hermes cron list --json may not work on all versions

We already call hermes cron list --json. But older Hermes versions may not support --json.
Desktop falls back to reading jobs.json directly.

Fix: Phase 6 must implement the same fallback:
1. Try: hermes cron list --json -> parse
2. On failure: read ~/.hermes/profiles/{active}/cron/jobs.json via Rust read_file
3. Normalize both through a port of Desktop's normalizeJob() function

---

### Issue 6 — Phase 9 OS keychain may not be practical

"Use OS keychain/secure Rust storage if feasible" is aspirational. On Windows this requires
DPAPI integration, on Linux libsecret. The tauri-plugin-stronghold setup is non-trivial.

Practical minimum for Phase 9: move API key from localStorage to tauri-plugin-store
(encrypted-at-rest, simpler). Full keychain is a stretch goal.

---

### Issue 7 — Office panel depends on npm being available at runtime

Claw3D is a Next.js app. Starting it requires npm run dev. Desktop's claw3d.ts has a
findNpm() function that searches nvm, volta, fnm, and system PATH before giving up.
We must port this npm discovery to Rust, or the panel silently fails on systems with
non-standard Node.js installations.

Also: Desktop stores Claw3D settings at ~/.openclaw/claw3d/settings.json.
We should use ~/.hermes/office/ instead to stay inside Hermes home.

Claw3D iframe vs webview difference: Desktop uses Electron's <webview> tag which supports
executeJavaScript for injecting localStorage flags. Our <iframe> cannot do this.
The onboarding flag injection must be done via URL query param instead:
http://localhost:3000?onboarding=completed

---

### Issue 8 — Phase 2 should use parallel agents, not one code agent

Phase 2 touches: client.ts, local-client.ts, remote-client.ts, provider.tsx, plus several panels.
One serial code agent is slow. These files are independent and can run in parallel worktrees.

---

## Detailed Phase-By-Phase Plan

---

### Phase 2 — Real HermesClient Layer

Goal: One factory, one interface, no panel owns transport logic.

Steps:

1. Audit src/lib/hermes/client.ts
   - List every method in the HermesClient interface
   - Cross-reference with Desktop's preload API (src/preload/index.d.ts in Desktop)
   - Add missing methods as UnsupportedCapabilityError stubs

2. Fix factory src/lib/hermes/index.ts
   - getHermesClient() reads connection mode from Tauri store
   - Returns LocalHermesClient when mode = local or in Tauri context
   - Returns RemoteHermesClient when mode = remote or ssh
   - Never mixes base URLs between modes

3. LocalHermesClient (src/lib/hermes/local-client.ts)
   - All methods delegate to invoke() calls only, never to fetch()
   - No direct localStorage reads for config

4. RemoteHermesClient (src/lib/hermes/remote-client.ts)
   - Chat, health: already implemented
   - Sessions, profiles, cron, skills, memory: throw UnsupportedCapabilityError with clear message
   - Auth header injected from secure store, not localStorage

5. Panel cleanup
   - ConversationPanel, SessionsPanel, CronPanel: replace direct invoke() or fetch() calls
     with client.method() calls
   - Each panel gets client from useHermesClient() hook, never imports desktop.ts directly

6. Tests to add
   - getHermesClient() returns local client in local mode
   - getHermesClient() returns remote client in remote mode
   - Remote client chat does not call invoke()
   - Local client does not use remote URL

Files: client.ts, index.ts, local-client.ts, remote-client.ts, up to 3 panel files
Commit: one commit per file

---

### Phase 3 — Setup Wizard

Goal: Fresh user reaches first successful chat without terminal.

Steps:

1. Audit existing WelcomePanel
   - Read src/components/WelcomePanel.tsx in full
   - Identify which of the 5 steps call real Rust commands vs show stub UI
   - Only extend what is missing

2. Add hermes_check_dependencies() Rust command
   Returns:
     python: Option<String>      (version string or None)
     uv: Option<String>
     git: Option<String>
     hermes: Option<String>
     hermes_home_exists: bool
     config_yaml_exists: bool
     default_model_set: bool
     api_key_present: bool       (bool only, never the key value)
     gateway_port_free: bool

3. Wire install step to hermes_stream_install() (already exists)

4. Wire provider/model/API key steps to:
   - write_env(key, value) for API keys
   - write_config_yaml for model/provider settings
   Both already exist as Rust commands

5. Wire gateway start + test chat:
   - Call hermes_start_gateway()
   - Then fire hermes_chat_stream() with message "Hello, are you ready?"
   - Show response inline in wizard

6. Rerun from SettingsModal
   - Add "Rerun Setup" button in Settings -> Diagnostics tab
   - Sets wizardCompleted = false in Tauri store

Files: WelcomePanel.tsx, lib.rs (new command), SettingsModal.tsx
Commit: one commit per file

---

### Phase 4 — Real Sessions

Goal: Sessions come from real Hermes, not GUI JSON files.

PRE-WORK (must do before writing code):
  Run in terminal: hermes chat -q "hello" -Q --source desktop
  Check: ls ~/.hermes/state.db
  If exists: sqlite3 ~/.hermes/state.db ".tables"
  Expected tables: sessions, messages, messages_fts
  If missing or different schema: adjust implementation accordingly

Steps:

1. Add rusqlite to src-tauri/Cargo.toml
     rusqlite = { version = "0.31", features = ["bundled"] }

2. Rust: open_state_db()
   - Opens ~/.hermes/state.db in read-only mode (SQLITE_OPEN_READONLY)
   - Returns clear error if DB not found ("Hermes has not been used yet -- no sessions")

3. Port Desktop's SQL queries from sessions.ts:

   list_sessions (from sessions.ts lines 129-172):
     SELECT s.id, s.source, s.started_at, s.ended_at, s.message_count, s.model, s.title,
       (SELECT content FROM messages WHERE session_id = s.id ORDER BY timestamp DESC LIMIT 1) as preview
     FROM sessions s ORDER BY started_at DESC LIMIT ? OFFSET ?

   get_session_messages (from sessions.ts lines 241-275):
     SELECT id, role, content, timestamp FROM messages
     WHERE session_id = ? AND role IN ('user', 'assistant') ORDER BY timestamp ASC

   search_sessions FTS5 (from sessions.ts lines 174-239):
     SELECT s.id, s.title, snippet(messages_fts, 0, '<b>', '</b>', '...', 20) as preview
     FROM messages_fts JOIN sessions s ON messages_fts.session_id = s.id
     WHERE messages_fts MATCH ? ORDER BY rank LIMIT ?
     (Sanitize query: wrap words in double-quotes, add * suffix -- copy Desktop sanitization)

   delete_session (from sessions.ts lines 277-292):
     DELETE FROM sessions WHERE id = ?
     DELETE FROM messages WHERE session_id = ?

4. New Rust commands: list_sessions_real, get_session_messages_real,
   search_sessions_real, delete_session_real

5. Stop autosave
   - Remove the useEffect debounced JSON write in App.tsx
   - Remove write_session_disk call on message array change

6. Track real session ID in chat
   - In hermes_chat_stream Rust command: read x-hermes-session-id response header
   - Emit it back to frontend as Tauri event "hermes-session-id-received"
   - Frontend stores it in activeSessionId, sends it in next request as session_id field

7. Legacy migration
   - Keep list_sessions_disk as fallback labeled "Legacy (local)" in SessionsPanel
   - Do not delete old JSON files
   - Add migration UI note: "These are local-only sessions. Real Hermes sessions appear above."

8. Tests (use in-memory SQLite DB):
   - list with empty DB returns []
   - list returns rows in DESC order by started_at
   - search sanitizes FTS query (no injection)
   - delete removes from both tables
   - malformed content column does not crash

Files: Cargo.toml, lib.rs, SessionsPanel.tsx, App.tsx, local-client.ts
Commit: one commit per file

---

### Phase 5 — Real Profiles

Goal: Profile switching affects the whole app and reflects in real Hermes.

Steps:

1. Read active_profile file
   Rust: get_active_profile() reads ~/.hermes/active_profile (plain text)
   Returns "default" if file missing

2. Set active profile
   Prefer: hermes profile use {name} CLI command
   Fallback: write name to ~/.hermes/active_profile directly

3. Full ProfileInfo struct (port from Desktop profiles.ts):
     name: String
     path: String
     is_default: bool
     is_active: bool
     model: String
     provider: String
     has_env: bool
     has_soul: bool
     skill_count: usize
     gateway_running: bool

4. list_profiles_full() Rust command
   Port Desktop's listProfiles() which reads in parallel:
   - config.yaml for model/provider
   - .env existence for has_env
   - SOUL.md existence for has_soul
   - skills/ directory walk for skill_count
   - gateway.pid for gateway_running (read PID, check if process alive)

5. Active profile badge in Sidebar
   - Show active profile name under the nav icons
   - Click navigates to ProfilesPanel

6. Profile affects chat
   - hermes_chat_stream passes --profile {activeProfile} when not "default"

7. Profile affects cron
   - list_cron_tasks reads from ~/.hermes/profiles/{active}/cron/jobs.json when active != default

Files: lib.rs, ProfilesPanel.tsx, Sidebar.tsx, store.ts, local-client.ts
Commit: one commit per file

---

### Phase 6 — Real Cron

Goal: GUI jobs appear in hermes cron list. CLI jobs appear in GUI.

Steps:

1. Port normalizeJob() from Desktop's cronjobs.ts (lines 31-62)
   Copy the logic into src/lib/hermes/cron.ts:
   - state: "paused" | "completed" | enabled flag -> "active" | "paused" | "completed"
   - defaults: deliver=["local"], skills=[], repeat=null
   - normalize next_run_at, last_run_at to null if missing

2. Data source with fallback:
   a. Try hermes cron list --json -> parse array -> normalize each
   b. On failure: Rust reads ~/.hermes/profiles/{active}/cron/jobs.json -> parse -> normalize
   Both paths go through normalizeJob()

3. New Rust commands:
   hermes_cron_create(schedule, prompt, name?, deliver?) -> hermes cron create {schedule} -- {prompt}
   hermes_cron_delete(job_id) -> hermes cron remove {job_id}
   hermes_cron_pause(job_id) -> hermes cron pause {job_id}
   hermes_cron_resume(job_id) -> hermes cron resume {job_id}
   hermes_cron_trigger(job_id) -> hermes cron run {job_id} (if CLI supports it)

4. Remote mode (in RemoteHermesClient):
   list   -> GET  /api/jobs?include_disabled=true
   create -> POST /api/jobs { name, schedule, prompt, deliver }
   delete -> DELETE /api/jobs/{id}
   pause  -> POST /api/jobs/{id}/pause
   resume -> POST /api/jobs/{id}/resume
   trigger -> POST /api/jobs/{id}/run

5. CronPanel UI updates:
   - Add pause/resume toggle per job row
   - Add "Run Now" button per job row
   - Show last_run_at and next_run_at
   - Remove GUI-local setInterval scheduler (it fires locally, not via Hermes)

6. Tests:
   - normalizeJob handles state = "paused", state = "completed", enabled = false
   - CLI command string built correctly for create with special chars in prompt
   - jobs.json fallback parses correctly

Files: lib.rs, CronPanel.tsx, local-client.ts, remote-client.ts, new src/lib/hermes/cron.ts
Commit: one commit per file

---

### Phase 7 — Skills, Tools, Memory, Models, Soul

Goal: All panels show real Hermes state after restart.

Steps:

1. Soul editor (new SoulPanel or tab in MemoryPanel):
   Rust read_soul(): read ~/.hermes/profiles/{active}/SOUL.md or default path
   Rust write_soul(content): validate path, write atomically (write temp then rename)
   Rust reset_soul(): delete SOUL.md to let Hermes regenerate default on next run
   UI: full-height textarea, Save button, Reset to Default button, character count

2. Skills — replace hardcoded marketplace:
   a. Check if hermes skill list --available --json works
   b. If yes: use it for marketplace
   c. If no: fetch from https://github.com/fathah/hermes-desktop skills list as fallback
   hermes_skill_install(name): hermes skill install {name} with streamed progress events
   hermes_skill_uninstall(name): hermes skill delete {name}
   hermes_skill_view(name): read SKILL.md from skills/{name}/SKILL.md

3. Tools — real toolset management:
   Port Desktop's get-toolsets / set-toolset-enabled pattern from index.ts:906-960
   Read toolset config from config.yaml tools: block
   Mark dangerous tools (shell_exec, file_write, browser_control) with warning badge

4. Memory — structured entries:
   Port Desktop's read-memory / add-memory-entry / update-memory-entry / remove-memory-entry
   Verify actual memory format: read ~/.hermes/memory.md after real session
   If markdown list: parse entries by line, write back with line manipulation
   If per-file: keep existing file-based approach

5. Models — real discovery:
   list_models_real(): read saved models from config.yaml models: block or ~/.hermes/models.json
   Detect available providers from .env (which API key vars are set and non-empty)
   Ollama detection: try GET http://localhost:11434/api/tags, parse model names

Files: lib.rs, MemoryPanel.tsx, SkillsPanel.tsx, ToolsPanel.tsx, ModelsPanel.tsx, new SoulPanel.tsx
Commit: one commit per file

---

### Phase 8 — Chat Parity

Goal: Same conversation works across GUI, Desktop, and CLI.

Steps:

1. Track x-hermes-session-id response header:
   In hermes_chat_stream Rust command: after receiving first chunk, extract response header
   Emit as Tauri event "hermes-session-id-received" { session_id: String }
   Frontend: listen for event, store in activeSessionId
   On next message: include session_id in request body

2. Port SSE event types from Desktop's sse-parser.ts:

   hermes.tool.progress (custom event type):
     { event: "hermes.tool.progress", data: { emoji, tool, label, description } }
     -> emit onToolProgress callback
     -> render as tool progress card in ConversationPanel (emoji + tool name + description)

   reasoning (for thinking models like Claude 3.7):
     delta with reasoning field -> emit onReasoning
     -> render as collapsible "Thinking..." block in ConversationPanel

   usage:
     { usage: { prompt_tokens, completion_tokens, total_tokens, cost } }
     -> update token bar in header

3. Tool call rendering improvements:
   - Tool progress cards with emoji badge and status (running / done / error)
   - Tool input/output collapsible (Desktop shows these)
   - Dangerous tool warning (shell execution etc)

4. Add retry button:
   - "Retry" button on last assistant message (only when not streaming)
   - Re-sends the last user message as new turn (does not delete old response)

5. Export: /export slash command -> generate markdown of conversation -> trigger file download

6. Port parser tests from Desktop:
   - tests/sse-parser.test.ts patterns: [DONE] handling, usage parsing, tool progress regex
   - tests/hermes-api.test.ts: session_id forwarding in request body

Files: lib.rs, ConversationPanel.tsx, remote-client.ts, local-client.ts, new test files
Commit: one commit per file

---

### Phase 9 — Remote, SSH, Secrets

Goal: Remote mode is app-wide. Secrets not in localStorage.

Steps:

1. Move API key from localStorage:
   Add tauri-plugin-store to Cargo.toml and package.json
   Store remote API key in plugin-store (encrypted at rest)
   get_connection_api_key Rust command reads from store
   Frontend never gets the raw key — only gets apiKeyLength for masking display
   (Full OS keychain is stretch goal after plugin-store works)

2. Mode banner:
   Persistent bar at top of app (below title bar, above sidebar) when not in local mode
   "Remote mode: {remoteUrl}" in amber
   "SSH tunnel: {sshHost}" in blue
   Click to open connection settings

3. RemoteHermesClient full implementation:
   Sessions: GET /api/sessions, GET /api/sessions/{id}/messages, DELETE /api/sessions/{id}
   Cron: mirrors Phase 6 /api/jobs endpoints
   Models: GET /api/models or parse remote config
   Config: GET /api/config/{key}, PUT /api/config/{key}
   All unsupported endpoints throw typed UnsupportedCapabilityError

4. SSH tunnel improvements:
   Port Desktop's waitForPort pattern to Rust: poll port until bound or timeout
   Auto-reconnect: watch tunnel process, restart with exponential backoff on exit
   is_ssh_tunnel_healthy() Rust command: GET /health on tunnel URL

5. Tests:
   - API key not present in localStorage after setting via new flow
   - Remote client does not call invoke() for chat
   - Auth header is Bearer {key} in remote requests
   - UnsupportedCapabilityError thrown for sessions in remote mode

Files: Cargo.toml, lib.rs, remote-client.ts, App.tsx (mode banner), store.ts, test files
Commit: one commit per file

---

### Phase 10 — Diagnostics, CI, Release

Goal: CI exists. Debug report safe to share. Users can self-diagnose.

Steps:

1. DiagnosticsPanel (new panel in sidebar, last position before Settings):
   Runs hermes_check_dependencies() from Phase 3
   Each check shown as pass (green) / warn (amber) / fail (red) with icon
   Checks: Python version, uv, git, Hermes binary, Hermes home, config.yaml,
           default model, API key present (bool only), gateway PID/port, active profile,
           sessions readable, cron jobs readable, platform config
   "Copy Debug Report" button: redacted JSON (mask all key values, show only "set"/"not set")

2. LogsPanel (new panel or tab in DiagnosticsPanel):
   Gateway stdout/stderr captured in Arc<Mutex<VecDeque<String>>> in OfficeState or new LogState
   get_gateway_logs() Rust command returns last 500 lines
   Auto-refresh every 2s when panel is visible
   Filter input to search log lines

3. PTY cleanup on app exit:
   Register on_window_event in main.rs
   On CloseRequested: iterate PtyState map, kill all active PTYs

4. npm scripts in package.json:
   "typecheck": "tsc --noEmit"
   "test": "vitest run --passWithNoTests"

5. GitHub Actions .github/workflows/ci.yml:
   on: [push, pull_request]
   jobs:
     frontend:
       runs-on: ubuntu-latest
       steps: checkout, node setup, npm ci, npm run typecheck, npm test
     rust:
       runs-on: ubuntu-latest
       steps: checkout, rust toolchain, cargo test (in src-tauri/)

6. RELEASE.md checklist:
   - npm run typecheck passes
   - npm test passes
   - cargo test passes
   - No hermes-desktop-main in git log
   - Version bumped in tauri.conf.json and Cargo.toml
   - tauri build runs clean

Files: lib.rs, new DiagnosticsPanel.tsx, new LogsPanel.tsx, main.rs, package.json,
       .github/workflows/ci.yml, RELEASE.md
Commit: one commit per file

---

### Phase 11 — Office Panel (Claw3D)

Goal: Office panel matches Desktop's, with Tauri-native lifecycle management.
Source fetched from: https://github.com/fathah/hermes-desktop (MIT)

Steps:

1. New Rust state struct in lib.rs:
   struct OfficeState {
     dev_process: Mutex<Option<Child>>,
     adapter_process: Mutex<Option<Child>>,
     logs: Mutex<VecDeque<String>>,     // ring buffer, max 1000 lines
     port: Mutex<u16>,
     ws_url: Mutex<String>,
   }
   Add to Tauri manage() in main.rs

2. Settings persistence: ~/.hermes/office-settings.json
   { "port": 3000, "wsUrl": "ws://localhost:18789" }
   Read on startup, write on change

3. npm resolution in Rust (port of Desktop's findNpm()):
   fn find_npm() -> Option<PathBuf>:
     Check ~/.nvm/versions/node/*/bin/npm (glob)
     Check ~/.volta/bin/npm
     Check ~/.fnm/*/bin/npm
     Fall back: which npm (Unix) / where npm (Windows)
     Returns None if not found

4. Rust commands (all in lib.rs):
   claw3d_status() -> Claw3dStatus { installed, running, port, port_in_use, ws_url, error, remote_url }
   claw3d_setup(app_handle) -> Result<CommandResult> -- git clone + npm install, emit progress events
   claw3d_start_all(profile?) -> Result<CommandResult>
   claw3d_stop_all() -> Result<()>
   claw3d_start_dev() -> Result<CommandResult>
   claw3d_stop_dev() -> Result<()>
   claw3d_start_adapter() -> Result<CommandResult>
   claw3d_stop_adapter() -> Result<()>
   claw3d_get_logs() -> String
   claw3d_get_port() -> u16
   claw3d_set_port(port: u16) -> Result<()>
   claw3d_get_ws_url() -> String
   claw3d_set_ws_url(url: String) -> Result<()>

5. Office.tsx port from Desktop's Office.tsx (fetched, ready):
   window.hermesAPI.claw3dStatus()       -> invoke('claw3d_status')
   window.hermesAPI.claw3dSetup()        -> invoke('claw3d_setup')
   window.hermesAPI.onClaw3dSetupProgress(cb) -> listen('claw3d-setup-progress', cb) from @tauri-apps/api
   window.hermesAPI.claw3dStartAll(p)    -> invoke('claw3d_start_all', { profile: p })
   window.hermesAPI.claw3dStopAll()      -> invoke('claw3d_stop_all')
   window.hermesAPI.claw3dSetPort(n)     -> invoke('claw3d_set_port', { port: n })
   window.hermesAPI.claw3dSetWsUrl(url)  -> invoke('claw3d_set_ws_url', { url })
   window.hermesAPI.claw3dGetLogs()      -> invoke('claw3d_get_logs')
   window.hermesAPI.openExternal(url)    -> open(url) from @tauri-apps/plugin-shell
   <webview src={url} />                 -> <iframe src={url} style="width:100%;height:100%;border:none" />
   useI18n() / t("office.xxx")           -> hardcoded English strings (no i18n yet)

6. Onboarding flag: Desktop injects via webview.executeJavaScript (not available with iframe)
   Fix: append ?hermes_onboarding=1 to the URL
   Claw3D must check this query param (or we skip onboarding suppression for now)

7. CSP update in tauri.conf.json:
   Add "http://localhost:3000" to frame-src in Content-Security-Policy

8. Sidebar nav: add Office between Gateway and Settings

9. Cleanup on app exit:
   In main.rs on_window_event handler: call claw3d_stop_all() on CloseRequested

Files: lib.rs, main.rs, new src/components/OfficePanel.tsx, tauri.conf.json, Sidebar.tsx
Commit: one commit per file

---

### Phase 12 — Messaging Integrations

Goal: Show and manage 16 platform gateways that Hermes supports.

Steps:

1. Verify real Hermes platform config format:
   Run: hermes platform list (if command exists)
   Or read ~/.hermes/config.yaml for platforms: section
   Understand the schema before building UI

2. Rust commands:
   list_platforms() -> Vec<PlatformStatus> { name, enabled, configured, error }
   set_platform_enabled(platform: String, enabled: bool) -> Result<()>
   get_platform_config(platform: String) -> Result<HashMap<String, String>>
   set_platform_config_value(platform: String, key: String, value: String) -> Result<()>

3. PlatformsPanel UI:
   Grid of platform cards: name, icon, status badge (active/inactive/not configured)
   Toggle switch for enable/disable
   "Setup" button that opens platform-specific config form (API tokens, webhook URLs)
   Status indicator showing if platform is currently connected

4. Priority platforms to wire up first:
   Telegram, Discord, Slack, WhatsApp, Signal
   (These are shown on hermesagents.cc homepage)

Files: lib.rs, PlatformsPanel.tsx (likely already exists, needs real backend), Sidebar.tsx
Commit: one commit per file

---

## Token Efficiency Policy

For any feature that exists in Hermes Desktop:
1. Fetch the raw source from GitHub first (WebFetch raw.githubusercontent.com URL)
2. Port it directly: swap Electron APIs for Tauri equivalents
3. Do NOT run research agents to re-read what we can fetch directly

This saves 3-4x tokens vs the research-then-reimplement cycle.

Known files to fetch when needed:
- sessions.ts     -> Phase 4 SQLite queries
- profiles.ts     -> Phase 5 ProfileInfo and listProfiles
- cronjobs.ts     -> Phase 6 normalizeJob and API paths
- hermes.ts       -> Phase 8 SSE parsing and session ID header
- sse-parser.ts   -> Phase 8 event type handling
- ssh-tunnel.ts   -> Phase 9 tunnel health check pattern
- config.ts       -> Phase 1 remaining: YAML path navigation (port to Rust)
- yaml-path.ts    -> Phase 1 remaining: dotted YAML key resolution (port to Rust)

---

## Alignment With Desktop Repo — Verdict

The 10-phase prompt pack is well-structured and mostly correct. Sequencing is right:
safety -> client -> wizard -> sessions -> profiles -> cron -> capabilities -> chat -> remote -> diagnostics

Fully aligned:
- Phase 1 safety matches Desktop's security.ts and env-validation.test.ts patterns
- Phase 4 SQLite matches Desktop's sessions.ts exactly (same SQL, same FTS5 approach)
- Phase 6 cron file contract matches Desktop's cronjobs.ts jobs.json path and normalizeJob
- Phase 8 SSE events match Desktop's sse-parser.ts event types
- Phase 9 secret handling matches Desktop's connection-config-security.test.ts intent

Gaps patched in this plan:
1. Soul editor added to Phase 7
2. Phase 12 added for messaging integrations
3. Phase 3 notes to audit existing WelcomePanel first
4. Phase 4 has pre-work step to verify state.db schema before any code
5. Phase 6 has jobs.json fallback
6. Phase 9 uses tauri-plugin-store as practical minimum (not full keychain)
7. Phase 11 documents the webview->iframe difference and onboarding flag workaround
