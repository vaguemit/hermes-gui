import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }))
vi.mock('@tauri-apps/api/tauri', () => ({ invoke: mockInvoke }))

describe('secrets IPC wrappers', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('getRemoteApiKey calls get_remote_api_key', async () => {
    mockInvoke.mockResolvedValue('sk-test-key')
    const { getRemoteApiKey } = await import('../api/desktop')
    const result = await getRemoteApiKey()
    expect(mockInvoke).toHaveBeenCalledWith('get_remote_api_key')
    expect(result).toBe('sk-test-key')
  })

  it('getRemoteApiKey returns null when key absent', async () => {
    mockInvoke.mockResolvedValue(null)
    const { getRemoteApiKey } = await import('../api/desktop')
    const result = await getRemoteApiKey()
    expect(result).toBeNull()
  })

  it('setRemoteApiKey passes key in camelCase args', async () => {
    mockInvoke.mockResolvedValue(undefined)
    const { setRemoteApiKey } = await import('../api/desktop')
    await setRemoteApiKey('my-api-key')
    expect(mockInvoke).toHaveBeenCalledWith('set_remote_api_key', { key: 'my-api-key' })
  })

  it('deleteRemoteApiKey calls correct command with no args', async () => {
    mockInvoke.mockResolvedValue(undefined)
    const { deleteRemoteApiKey } = await import('../api/desktop')
    await deleteRemoteApiKey()
    expect(mockInvoke).toHaveBeenCalledWith('delete_remote_api_key')
  })

  it('getRemoteApiKeyLength returns number', async () => {
    mockInvoke.mockResolvedValue(32)
    const { getRemoteApiKeyLength } = await import('../api/desktop')
    const len = await getRemoteApiKeyLength()
    expect(len).toBe(32)
    expect(mockInvoke).toHaveBeenCalledWith('get_remote_api_key_length')
  })

  it('isSshTunnelHealthy passes tunnelUrl in camelCase', async () => {
    mockInvoke.mockResolvedValue(true)
    const { isSshTunnelHealthy } = await import('../api/desktop')
    const result = await isSshTunnelHealthy('http://localhost:4000')
    expect(mockInvoke).toHaveBeenCalledWith('is_ssh_tunnel_healthy', { tunnelUrl: 'http://localhost:4000' })
    expect(result).toBe(true)
  })

  it('waitForPort passes all three args', async () => {
    mockInvoke.mockResolvedValue(true)
    const { waitForPort } = await import('../api/desktop')
    await waitForPort('localhost', 4000, 5000)
    expect(mockInvoke).toHaveBeenCalledWith('wait_for_port', { host: 'localhost', port: 4000, timeoutMs: 5000 })
  })

  it('getSshTunnelStatus calls get_ssh_tunnel_status', async () => {
    mockInvoke.mockResolvedValue({ is_running: true, local_port: 18642 })
    const { getSshTunnelStatus } = await import('../api/desktop')
    const status = await getSshTunnelStatus()
    expect(mockInvoke).toHaveBeenCalledWith('get_ssh_tunnel_status')
    expect(status.is_running).toBe(true)
    expect(status.local_port).toBe(18642)
  })
})
