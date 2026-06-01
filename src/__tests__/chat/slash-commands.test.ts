import { parseSlashCommand, filterCommands, isLocalCommand, SLASH_COMMANDS } from '../../lib/chat/slash-commands'

describe('parseSlashCommand', () => {
  it('returns null for non-slash input', () => {
    expect(parseSlashCommand('hello')).toBeNull()
    expect(parseSlashCommand('')).toBeNull()
  })

  it('parses bare command with no args', () => {
    expect(parseSlashCommand('/new')).toEqual({ command: '/new', args: '' })
  })

  it('parses command with args', () => {
    expect(parseSlashCommand('/shell ls -la')).toEqual({ command: '/shell', args: 'ls -la' })
  })

  it('is case-insensitive for command name', () => {
    const result = parseSlashCommand('/NEW')
    expect(result?.command).toBe('/new')
  })

  it('trims whitespace', () => {
    expect(parseSlashCommand('  /compact  ')).toEqual({ command: '/compact', args: '' })
  })
})

describe('filterCommands', () => {
  it('returns all commands for / prefix', () => {
    const all = filterCommands('/')
    expect(all.length).toBe(SLASH_COMMANDS.length)
  })

  it('filters by prefix', () => {
    const results = filterCommands('/c')
    expect(results.every(c => c.name.startsWith('/c'))).toBe(true)
    expect(results.length).toBeGreaterThan(0)
  })

  it('returns empty for no match', () => {
    expect(filterCommands('/zzz')).toHaveLength(0)
  })

  it('is case-insensitive', () => {
    const upper = filterCommands('/NEW')
    const lower = filterCommands('/new')
    expect(upper).toHaveLength(lower.length)
  })
})

describe('isLocalCommand', () => {
  it('returns true for local commands', () => {
    expect(isLocalCommand('/new')).toBe(true)
    expect(isLocalCommand('/clear')).toBe(true)
    expect(isLocalCommand('/help')).toBe(true)
    expect(isLocalCommand('/export')).toBe(true)
  })

  it('returns false for backend commands', () => {
    expect(isLocalCommand('/compact')).toBe(false)
    expect(isLocalCommand('/shell ls')).toBe(false)
  })

  it('returns false for non-slash input', () => {
    expect(isLocalCommand('hello')).toBe(false)
  })
})

describe('SLASH_COMMANDS', () => {
  it('all commands start with /', () => {
    expect(SLASH_COMMANDS.every(c => c.name.startsWith('/'))).toBe(true)
  })

  it('each command has name, description, category, and local flag', () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(typeof cmd.name).toBe('string')
      expect(typeof cmd.description).toBe('string')
      expect(typeof cmd.local).toBe('boolean')
    }
  })
})
