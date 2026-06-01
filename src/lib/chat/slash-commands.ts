// Slash command definitions and parser for the Hermes chat input.

export type SlashCommandCategory = 'chat' | 'agent' | 'tools' | 'info' | 'navigation'

export interface SlashCommandDef {
  name: string
  description: string
  category: SlashCommandCategory
  /** If true, handled locally without sending to the agent. */
  local: boolean
  /** Arguments hint shown in autocomplete. */
  args?: string
}

export const SLASH_COMMANDS: SlashCommandDef[] = [
  // Chat management
  { name: '/new', description: 'Start a new conversation', category: 'chat', local: true },
  { name: '/clear', description: 'Clear the current conversation', category: 'chat', local: true },
  { name: '/undo', description: 'Remove the last exchange', category: 'chat', local: true },
  { name: '/retry', description: 'Retry the last message', category: 'chat', local: true },
  { name: '/export', description: 'Export conversation as Markdown', category: 'chat', local: true },
  // Agent commands (sent to backend)
  { name: '/compact', description: 'Compact and summarize the conversation', category: 'agent', local: false },
  { name: '/compress', description: 'Compress with optional focus topic', category: 'agent', local: false, args: '[topic]' },
  { name: '/reset', description: 'Reset conversation context', category: 'agent', local: false },
  // Tool commands
  { name: '/shell', description: 'Run a shell command', category: 'tools', local: false, args: '<command>' },
  { name: '/browser', description: 'Open a URL in the browser tool', category: 'tools', local: false, args: '<url>' },
  // Info commands (local)
  { name: '/version', description: 'Show Hermes version', category: 'info', local: true },
  { name: '/usage', description: 'Show token usage for this session', category: 'info', local: true },
  { name: '/help', description: 'List available commands', category: 'info', local: true },
  { name: '/status', description: 'Show gateway connection status', category: 'info', local: true },
  // Navigation
  { name: '/model', description: 'Switch to model settings', category: 'navigation', local: true },
  { name: '/skills', description: 'Switch to skills panel', category: 'navigation', local: true },
  { name: '/tools', description: 'Switch to tools panel', category: 'navigation', local: true },
  { name: '/memory', description: 'Switch to memory panel', category: 'navigation', local: true },
  { name: '/providers', description: 'Switch to providers panel', category: 'navigation', local: true },
  { name: '/agents', description: 'Switch to agents panel', category: 'navigation', local: true },
  { name: '/gateway', description: 'Switch to gateway settings', category: 'navigation', local: true },
  { name: '/terminal', description: 'Switch to terminal panel', category: 'navigation', local: true },
  // Agent mode commands (sent to backend)
  { name: '/fast', description: 'Toggle fast mode for priority processing', category: 'agent', local: false },
  { name: '/goal', description: 'Set or show the current agent goal', category: 'agent', local: false, args: '[goal text]' },
  { name: '/debug', description: 'Show agent debug information', category: 'agent', local: false },
  { name: '/soul', description: 'Show or set agent persona/soul', category: 'agent', local: false },
  { name: '/kanban', description: 'Show active tasks on the kanban board', category: 'agent', local: false },
]

/** Parse the command name from a slash-prefixed input string. */
export function parseSlashCommand(input: string): { command: string; args: string } | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) return null
  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) return { command: trimmed.toLowerCase(), args: '' }
  return { command: trimmed.slice(0, spaceIdx).toLowerCase(), args: trimmed.slice(spaceIdx + 1).trim() }
}

/** Return commands matching the given prefix for autocomplete. */
export function filterCommands(prefix: string): SlashCommandDef[] {
  const lower = prefix.toLowerCase()
  return SLASH_COMMANDS.filter(cmd => cmd.name.startsWith(lower))
}

/** Returns true if the input is a local-only command that should not be sent to the agent. */
export function isLocalCommand(input: string): boolean {
  const parsed = parseSlashCommand(input)
  if (!parsed) return false
  const def = SLASH_COMMANDS.find(c => c.name === parsed.command)
  return def?.local ?? false
}
