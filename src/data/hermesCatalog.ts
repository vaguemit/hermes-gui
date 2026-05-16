export interface SlashCommand {
  cmd: string;
  desc: string;
  category: 'Session' | 'Config' | 'Tools' | 'Skills' | 'Gateway' | 'Info' | 'Exit';
}

export interface CliCommand {
  id: string;
  title: string;
  command: string;
  args: string[];
  description: string;
  category: 'Setup' | 'Chat' | 'Gateway' | 'Automation' | 'Memory' | 'Tools' | 'Admin' | 'Developer';
  safeToRun: boolean;
}

export interface AgentMode {
  id: string;
  title: string;
  command: string;
  description: string;
  tags: string[];
  args: string[];
  needsPrompt?: boolean;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { cmd: '/new', desc: 'Start a new session', category: 'Session' },
  { cmd: '/reset', desc: 'Reset conversation history', category: 'Session' },
  { cmd: '/clear', desc: 'Clear the screen and start fresh', category: 'Session' },
  { cmd: '/history', desc: 'Show conversation history', category: 'Session' },
  { cmd: '/save', desc: 'Save the current conversation', category: 'Session' },
  { cmd: '/retry', desc: 'Retry the last message', category: 'Session' },
  { cmd: '/undo', desc: 'Remove the last exchange', category: 'Session' },
  { cmd: '/title', desc: 'Set the current session title', category: 'Session' },
  { cmd: '/compress', desc: 'Compress context with an optional focus topic', category: 'Session' },
  { cmd: '/rollback', desc: 'List or restore filesystem checkpoints', category: 'Session' },
  { cmd: '/snapshot', desc: 'Create, restore, or prune config snapshots', category: 'Session' },
  { cmd: '/stop', desc: 'Interrupt running work and background processes', category: 'Session' },
  { cmd: '/queue', desc: 'Queue a prompt for the next turn', category: 'Session' },
  { cmd: '/steer', desc: 'Nudge a running turn after the next tool call', category: 'Session' },
  { cmd: '/goal', desc: 'Set or manage a persistent goal', category: 'Session' },
  { cmd: '/resume', desc: 'Resume a previous session', category: 'Session' },
  { cmd: '/sessions', desc: 'Browse previous sessions', category: 'Session' },
  { cmd: '/agents', desc: 'Show active agents and tasks', category: 'Session' },
  { cmd: '/background', desc: 'Run a prompt in a background session', category: 'Session' },
  { cmd: '/branch', desc: 'Fork the current session', category: 'Session' },
  { cmd: '/handoff', desc: 'Move the session to a messaging platform', category: 'Gateway' },
  { cmd: '/config', desc: 'Show current configuration', category: 'Config' },
  { cmd: '/model', desc: 'Switch among configured models', category: 'Config' },
  { cmd: '/personality', desc: 'Set a personality overlay', category: 'Config' },
  { cmd: '/verbose', desc: 'Cycle tool progress display', category: 'Config' },
  { cmd: '/fast', desc: 'Toggle fast mode', category: 'Config' },
  { cmd: '/reasoning', desc: 'Set reasoning effort or visibility', category: 'Config' },
  { cmd: '/skin', desc: 'Show or change the display skin', category: 'Config' },
  { cmd: '/statusbar', desc: 'Toggle the context status bar', category: 'Config' },
  { cmd: '/voice', desc: 'Control voice mode and playback', category: 'Config' },
  { cmd: '/yolo', desc: 'Toggle approval bypass mode', category: 'Config' },
  { cmd: '/footer', desc: 'Toggle gateway runtime footer', category: 'Config' },
  { cmd: '/busy', desc: 'Choose queue, steer, or interrupt behavior', category: 'Config' },
  { cmd: '/tools', desc: 'List, enable, or disable tools', category: 'Tools' },
  { cmd: '/toolsets', desc: 'List available toolsets', category: 'Tools' },
  { cmd: '/browser', desc: 'Launch Chrome at a URL (no arg → claude.ai), or pass a natural-language task to open the right site and send the instruction to the agent automatically', category: 'Tools' },
  { cmd: '/skills', desc: 'Search, install, inspect, or manage skills', category: 'Skills' },
  { cmd: '/cron', desc: 'Manage scheduled tasks', category: 'Tools' },
  { cmd: '/curator', desc: 'Manage background skill maintenance', category: 'Skills' },
  { cmd: '/kanban', desc: 'Drive the multi-profile task board', category: 'Tools' },
  { cmd: '/reload-mcp', desc: 'Reload MCP servers from config', category: 'Tools' },
  { cmd: '/reload-skills', desc: 'Re-scan installed skills', category: 'Skills' },
  { cmd: '/reload', desc: 'Reload environment variables', category: 'Config' },
  { cmd: '/plugins', desc: 'List installed plugins and status', category: 'Tools' },
  { cmd: '/help', desc: 'Show help', category: 'Info' },
  { cmd: '/usage', desc: 'Show tokens, cost, and quota', category: 'Info' },
  { cmd: '/insights', desc: 'Show usage analytics', category: 'Info' },
  { cmd: '/platforms', desc: 'Show messaging platform status', category: 'Gateway' },
  { cmd: '/paste', desc: 'Attach a clipboard image', category: 'Info' },
  { cmd: '/copy', desc: 'Copy an assistant response', category: 'Info' },
  { cmd: '/image', desc: 'Attach a local image path', category: 'Info' },
  { cmd: '/debug', desc: 'Upload a debug report', category: 'Info' },
  { cmd: '/profile', desc: 'Show active profile and home', category: 'Info' },
  { cmd: '/quit', desc: 'Exit the CLI', category: 'Exit' },
  { cmd: '/web', desc: 'Search the web', category: 'Tools' },
  { cmd: '/browse', desc: 'Navigate the browser to a URL', category: 'Tools' },
  { cmd: '/shell', desc: 'Run a shell command', category: 'Tools' },
  { cmd: '/file', desc: 'Read or write files', category: 'Tools' },
  { cmd: '/code', desc: 'Write or execute code', category: 'Tools' },
  { cmd: '/btw', desc: 'Ask a side question without affecting context', category: 'Info' },
  { cmd: '/approve', desc: 'Approve a pending agent action', category: 'Session' },
  { cmd: '/deny', desc: 'Deny a pending agent action', category: 'Session' },
  { cmd: '/status', desc: 'Show current agent status', category: 'Info' },
  { cmd: '/compact', desc: 'Compact and summarize the conversation', category: 'Session' },
  { cmd: '/memory', desc: 'Show agent memory', category: 'Info' },
  { cmd: '/persona', desc: 'Show current persona', category: 'Config' },
];

export const CLI_COMMANDS: CliCommand[] = [
  { id: 'version', title: 'Version', command: 'hermes version', args: ['version'], description: 'Show installed Hermes version details.', category: 'Admin', safeToRun: true },
  { id: 'status', title: 'Status', command: 'hermes status', args: ['status'], description: 'Show agent, auth, and platform status.', category: 'Admin', safeToRun: true },
  { id: 'doctor', title: 'Doctor', command: 'hermes doctor', args: ['doctor'], description: 'Diagnose config, dependencies, and runtime issues.', category: 'Admin', safeToRun: true },
  { id: 'dump', title: 'Support Dump', command: 'hermes dump', args: ['dump'], description: 'Create a copy-pasteable setup summary.', category: 'Admin', safeToRun: true },
  { id: 'update-check', title: 'Update Check', command: 'hermes update --check', args: ['update', '--check'], description: 'Check upstream changes without applying them.', category: 'Admin', safeToRun: true },
  { id: 'setup', title: 'Setup Wizard', command: 'hermes setup', args: ['setup'], description: 'Configure models, gateway, tools, terminal, and agent behavior.', category: 'Setup', safeToRun: false },
  { id: 'setup-model', title: 'Model Setup', command: 'hermes setup model', args: ['setup', 'model'], description: 'Add providers, run OAuth, enter keys, and choose a model.', category: 'Setup', safeToRun: false },
  { id: 'setup-terminal', title: 'Terminal Setup', command: 'hermes setup terminal', args: ['setup', 'terminal'], description: 'Pick local, Docker, SSH, Modal, Daytona, or other backends.', category: 'Setup', safeToRun: false },
  { id: 'setup-gateway', title: 'Gateway Setup', command: 'hermes setup gateway', args: ['setup', 'gateway'], description: 'Configure Telegram, Discord, Slack, Signal, email, and more.', category: 'Setup', safeToRun: false },
  { id: 'setup-tools', title: 'Tools Setup', command: 'hermes setup tools', args: ['setup', 'tools'], description: 'Choose which tools are available to the agent.', category: 'Setup', safeToRun: false },
  { id: 'chat', title: 'Chat', command: 'hermes chat', args: ['chat'], description: 'Start the interactive agent CLI.', category: 'Chat', safeToRun: false },
  { id: 'one-shot', title: 'One-shot Chat', command: 'hermes chat -q "..."', args: ['chat', '-q'], description: 'Run one prompt and return the answer.', category: 'Chat', safeToRun: false },
  { id: 'pure-output', title: 'Scripted Output', command: 'hermes -z "..."', args: ['-z'], description: 'Prompt in, final text out. Good for scripts.', category: 'Chat', safeToRun: false },
  { id: 'gateway-run', title: 'Gateway Foreground', command: 'hermes gateway run', args: ['gateway', 'run'], description: 'Run the messaging gateway in the foreground.', category: 'Gateway', safeToRun: false },
  { id: 'gateway-start', title: 'Gateway Start', command: 'hermes gateway start', args: ['gateway', 'start'], description: 'Start the installed gateway service.', category: 'Gateway', safeToRun: true },
  { id: 'gateway-stop', title: 'Gateway Stop', command: 'hermes gateway stop', args: ['gateway', 'stop'], description: 'Stop the gateway service.', category: 'Gateway', safeToRun: true },
  { id: 'gateway-status', title: 'Gateway Status', command: 'hermes gateway status', args: ['gateway', 'status'], description: 'Inspect gateway service status.', category: 'Gateway', safeToRun: true },
  { id: 'gateway-install', title: 'Install Gateway Service', command: 'hermes gateway install', args: ['gateway', 'install'], description: 'Install systemd or launchd service where supported.', category: 'Gateway', safeToRun: false },
  { id: 'cron', title: 'Cron', command: 'hermes cron', args: ['cron'], description: 'Inspect and tick scheduled tasks.', category: 'Automation', safeToRun: true },
  { id: 'kanban', title: 'Kanban', command: 'hermes kanban', args: ['kanban'], description: 'Manage multi-profile boards and tasks.', category: 'Automation', safeToRun: true },
  { id: 'webhook', title: 'Webhooks', command: 'hermes webhook', args: ['webhook'], description: 'Manage event-driven activation routes.', category: 'Automation', safeToRun: true },
  { id: 'skills', title: 'Skills', command: 'hermes skills', args: ['skills'], description: 'Browse, install, publish, audit, and configure skills.', category: 'Memory', safeToRun: true },
  { id: 'curator', title: 'Curator', command: 'hermes curator status', args: ['curator', 'status'], description: 'Check background skill maintenance.', category: 'Memory', safeToRun: true },
  { id: 'memory', title: 'Memory Provider', command: 'hermes memory', args: ['memory'], description: 'Configure external memory providers.', category: 'Memory', safeToRun: true },
  { id: 'sessions', title: 'Sessions', command: 'hermes sessions', args: ['sessions'], description: 'Browse, export, prune, rename, and delete sessions.', category: 'Memory', safeToRun: true },
  { id: 'insights', title: 'Insights', command: 'hermes insights', args: ['insights'], description: 'Show token, cost, and activity analytics.', category: 'Memory', safeToRun: true },
  { id: 'tools', title: 'Tools', command: 'hermes tools', args: ['tools'], description: 'Configure enabled tools per platform.', category: 'Tools', safeToRun: false },
  { id: 'mcp', title: 'MCP', command: 'hermes mcp', args: ['mcp'], description: 'Manage MCP servers and MCP server mode.', category: 'Tools', safeToRun: true },
  { id: 'plugins', title: 'Plugins', command: 'hermes plugins', args: ['plugins'], description: 'Install, enable, disable, or remove plugins.', category: 'Tools', safeToRun: true },
  { id: 'computer-use', title: 'Computer Use', command: 'hermes computer-use', args: ['computer-use'], description: 'Install or check the macOS CUA backend.', category: 'Tools', safeToRun: true },
  { id: 'auth', title: 'Auth', command: 'hermes auth list', args: ['auth', 'list'], description: 'List configured credentials and auth providers.', category: 'Admin', safeToRun: true },
  { id: 'config', title: 'Config', command: 'hermes config', args: ['config'], description: 'Show, edit, migrate, and query configuration.', category: 'Admin', safeToRun: true },
  { id: 'logs', title: 'Logs', command: 'hermes logs', args: ['logs'], description: 'View, tail, and filter Hermes logs.', category: 'Admin', safeToRun: true },
  { id: 'backup', title: 'Backup', command: 'hermes backup', args: ['backup'], description: 'Back up Hermes home to a zip file.', category: 'Admin', safeToRun: false },
  { id: 'checkpoints', title: 'Checkpoints', command: 'hermes checkpoints', args: ['checkpoints'], description: 'Inspect, prune, or clear filesystem checkpoints.', category: 'Admin', safeToRun: true },
  { id: 'claw-migrate', title: 'OpenClaw Migration', command: 'hermes claw migrate --dry-run', args: ['claw', 'migrate', '--dry-run'], description: 'Preview importing OpenClaw settings and memory.', category: 'Admin', safeToRun: true },
  { id: 'acp', title: 'ACP Server', command: 'hermes acp', args: ['acp'], description: 'Run Hermes as an Agent Client Protocol server.', category: 'Developer', safeToRun: false },
  { id: 'completion', title: 'Shell Completion', command: 'hermes completion bash', args: ['completion', 'bash'], description: 'Print shell completion scripts.', category: 'Developer', safeToRun: true },
];

export const AGENT_MODES: AgentMode[] = [
  {
    id: 'main',
    title: 'Main Agent',
    command: 'hermes chat',
    description: 'Interactive terminal session with slash autocomplete, tool output, memory, and skills.',
    tags: ['interactive', 'memory', 'tools'],
    args: ['chat'],
  },
  {
    id: 'oneshot',
    title: 'One-shot Agent',
    command: 'hermes chat -q "<prompt>"',
    description: 'Run one task from the desktop runner and capture the response.',
    tags: ['quick task', 'captured output'],
    args: ['chat', '-q'],
    needsPrompt: true,
  },
  {
    id: 'scripted',
    title: 'Scripted Agent',
    command: 'hermes -z "<prompt>"',
    description: 'Clean final-answer-only mode for automations and scripts.',
    tags: ['automation', 'stdout only'],
    args: ['-z'],
    needsPrompt: true,
  },
  {
    id: 'worktree',
    title: 'Worktree Agent',
    command: 'hermes chat --worktree -q "<prompt>"',
    description: 'Start a task in an isolated git worktree for parallel development.',
    tags: ['parallel', 'code'],
    args: ['chat', '--worktree', '-q'],
    needsPrompt: true,
  },
  {
    id: 'gateway',
    title: 'Messaging Gateway',
    command: 'hermes gateway run',
    description: 'Keep the same agent reachable from Telegram, Discord, Slack, WhatsApp, Signal, email, and webhooks.',
    tags: ['always-on', 'platforms'],
    args: ['gateway', 'run'],
  },
  {
    id: 'background',
    title: 'Background Task',
    command: '/background <prompt>',
    description: 'Launch a parallel session from chat without blocking the current conversation.',
    tags: ['slash command', 'parallel'],
    args: [],
    needsPrompt: true,
  },
  {
    id: 'goal',
    title: 'Persistent Goal',
    command: '/goal <text>',
    description: 'Ask Hermes to keep advancing a standing goal across turns until it is complete or paused.',
    tags: ['autonomous loop', 'slash command'],
    args: [],
    needsPrompt: true,
  },
  {
    id: 'acp',
    title: 'Editor Agent',
    command: 'hermes acp',
    description: 'Expose Hermes over ACP for editor and client integrations.',
    tags: ['server', 'integration'],
    args: ['acp'],
  },
];
