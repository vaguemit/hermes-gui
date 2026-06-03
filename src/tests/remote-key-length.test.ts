import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }))
vi.mock('@tauri-apps/api/tauri', () => ({ invoke: mockInvoke }))

describe('getRemoteApiKeyLength export and command name', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('getRemoteApiKeyLength is exported from desktop.ts', async () => {
    const desktop = await import('../api/desktop')
    expect(typeof desktop.getRemoteApiKeyLength).toBe('function')
  })

  it('invokes exactly the command name get_remote_api_key_length', async () => {
    mockInvoke.mockResolvedValue(0)
    const { getRemoteApiKeyLength } = await import('../api/desktop')
    await getRemoteApiKeyLength()
    const commandName = mockInvoke.mock.calls[0][0]
    expect(commandName).toBe('get_remote_api_key_length')
  })

  it('command name is snake_case matching Rust convention', async () => {
    mockInvoke.mockResolvedValue(0)
    const { getRemoteApiKeyLength } = await import('../api/desktop')
    await getRemoteApiKeyLength()
    const commandName: string = mockInvoke.mock.calls[0][0]
    expect(commandName).toMatch(/^[a-z][a-z0-9_]+$/)
  })

  it('getRemoteApiKeyLength takes no arguments', async () => {
    mockInvoke.mockResolvedValue(5)
    const { getRemoteApiKeyLength } = await import('../api/desktop')
    await getRemoteApiKeyLength()
    // Called with only one arg (command name), no second arg
    expect(mockInvoke.mock.calls[0]).toHaveLength(1)
  })

  it('returns the numeric value from invoke unchanged', async () => {
    mockInvoke.mockResolvedValue(99)
    const { getRemoteApiKeyLength } = await import('../api/desktop')
    const len = await getRemoteApiKeyLength()
    expect(len).toBe(99)
  })
})

describe('SshTunnelStatus interface shape', () => {
  it('SshTunnelStatus type is exported from desktop.ts', async () => {
    // Type-level check: if the import works, the export exists
    type _check = import('../api/desktop').SshTunnelStatus
    // Runtime check: the module exports compile without error
    const desktop = await import('../api/desktop')
    expect(desktop).toBeDefined()
  })

  it('getSshTunnelStatus is exported from desktop.ts', async () => {
    const desktop = await import('../api/desktop')
    expect(typeof desktop.getSshTunnelStatus).toBe('function')
  })
})
