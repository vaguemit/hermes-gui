import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }))
vi.mock('@tauri-apps/api/tauri', () => ({ invoke: mockInvoke }))

beforeAll(() => { vi.stubGlobal('window', { __TAURI_INTERNALS__: {} }) })
afterAll(() => { vi.unstubAllGlobals() })

describe('isSshTunnelHealthy IPC wrapper', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('calls is_ssh_tunnel_healthy command', async () => {
    mockInvoke.mockResolvedValue(true)
    const { isSshTunnelHealthy } = await import('../api/desktop')
    await isSshTunnelHealthy('http://localhost:4000')
    expect(mockInvoke).toHaveBeenCalledWith('is_ssh_tunnel_healthy', { tunnelUrl: 'http://localhost:4000' })
  })

  it('passes tunnelUrl as camelCase key (not snake_case)', async () => {
    mockInvoke.mockResolvedValue(false)
    const { isSshTunnelHealthy } = await import('../api/desktop')
    await isSshTunnelHealthy('https://my-server:9000')
    const [_cmd, args] = mockInvoke.mock.calls[0]
    expect(args).toHaveProperty('tunnelUrl')
    expect(args).not.toHaveProperty('tunnel_url')
  })

  it('returns true when invoke resolves true', async () => {
    mockInvoke.mockResolvedValue(true)
    const { isSshTunnelHealthy } = await import('../api/desktop')
    expect(await isSshTunnelHealthy('http://x')).toBe(true)
  })

  it('returns false when invoke resolves false', async () => {
    mockInvoke.mockResolvedValue(false)
    const { isSshTunnelHealthy } = await import('../api/desktop')
    expect(await isSshTunnelHealthy('http://x')).toBe(false)
  })
})

describe('waitForPort IPC wrapper', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('calls wait_for_port command', async () => {
    mockInvoke.mockResolvedValue(true)
    const { waitForPort } = await import('../api/desktop')
    await waitForPort('localhost', 8642, 5000)
    expect(mockInvoke).toHaveBeenCalledWith('wait_for_port', { host: 'localhost', port: 8642, timeoutMs: 5000 })
  })

  it('passes timeoutMs as camelCase (not timeout_ms)', async () => {
    mockInvoke.mockResolvedValue(true)
    const { waitForPort } = await import('../api/desktop')
    await waitForPort('host', 9000, 3000)
    const [_cmd, args] = mockInvoke.mock.calls[0]
    expect(args).toHaveProperty('timeoutMs')
    expect(args).not.toHaveProperty('timeout_ms')
  })

  it('returns true when invoke resolves true', async () => {
    mockInvoke.mockResolvedValue(true)
    const { waitForPort } = await import('../api/desktop')
    expect(await waitForPort('h', 1, 1)).toBe(true)
  })

  it('returns false when port not reached in time', async () => {
    mockInvoke.mockResolvedValue(false)
    const { waitForPort } = await import('../api/desktop')
    expect(await waitForPort('h', 1, 100)).toBe(false)
  })
})

describe('getSshTunnelStatus IPC wrapper', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('calls get_ssh_tunnel_status with no args', async () => {
    mockInvoke.mockResolvedValue({ is_running: false, local_port: null })
    const { getSshTunnelStatus } = await import('../api/desktop')
    await getSshTunnelStatus()
    expect(mockInvoke).toHaveBeenCalledWith('get_ssh_tunnel_status')
  })

  it('returns is_running and local_port from invoke result', async () => {
    mockInvoke.mockResolvedValue({ is_running: true, local_port: 18642 })
    const { getSshTunnelStatus } = await import('../api/desktop')
    const status = await getSshTunnelStatus()
    expect(status.is_running).toBe(true)
    expect(status.local_port).toBe(18642)
  })

  it('handles null local_port', async () => {
    mockInvoke.mockResolvedValue({ is_running: false, local_port: null })
    const { getSshTunnelStatus } = await import('../api/desktop')
    const status = await getSshTunnelStatus()
    expect(status.local_port).toBeNull()
  })
})
