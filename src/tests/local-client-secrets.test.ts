import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UnsupportedCapabilityError } from '../lib/hermes/errors'

// Mock the entire desktop API so LocalHermesClient doesn't hit real Tauri
const mockGetRemoteApiKey = vi.fn()
const mockSetRemoteApiKey = vi.fn()
const mockDeleteRemoteApiKey = vi.fn()
const mockGetRemoteApiKeyLength = vi.fn()
const mockIsSshTunnelHealthy = vi.fn()
const mockWaitForPort = vi.fn()
const mockGetSshTunnelStatus = vi.fn()

vi.mock('../api/desktop', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/desktop')>()
  return {
    ...original,
    getRemoteApiKey: mockGetRemoteApiKey,
    setRemoteApiKey: mockSetRemoteApiKey,
    deleteRemoteApiKey: mockDeleteRemoteApiKey,
    getRemoteApiKeyLength: mockGetRemoteApiKeyLength,
    isSshTunnelHealthy: mockIsSshTunnelHealthy,
    waitForPort: mockWaitForPort,
    getSshTunnelStatus: mockGetSshTunnelStatus,
  }
})

// Mock hermes health check imports
vi.mock('../api/hermes', () => ({
  checkHealth: vi.fn().mockResolvedValue(true),
  checkGatewayHealth: vi.fn().mockResolvedValue({ healthy: false }),
  fetchModels: vi.fn().mockResolvedValue([]),
  setInMemoryGatewayPort: vi.fn(),
  getBaseUrl: vi.fn().mockReturnValue('http://127.0.0.1:8642'),
  getAuthHeaders: vi.fn().mockReturnValue({}),
}))

vi.mock('../store', () => ({
  useStore: { getState: vi.fn().mockReturnValue({ activeProfile: 'default' }) },
}))

describe('LocalHermesClient secret management', () => {
  beforeEach(() => {
    mockGetRemoteApiKey.mockReset()
    mockSetRemoteApiKey.mockReset()
    mockDeleteRemoteApiKey.mockReset()
    mockGetRemoteApiKeyLength.mockReset()
    mockIsSshTunnelHealthy.mockReset()
    mockWaitForPort.mockReset()
    mockGetSshTunnelStatus.mockReset()
  })

  it('getRemoteApiKey delegates to IPC wrapper and returns value', async () => {
    mockGetRemoteApiKey.mockResolvedValue('sk-secret-key')
    const { LocalHermesClient } = await import('../lib/hermes/local-client')
    const client = new LocalHermesClient()
    const result = await client.getRemoteApiKey()
    expect(mockGetRemoteApiKey).toHaveBeenCalledTimes(1)
    expect(result).toBe('sk-secret-key')
  })

  it('getRemoteApiKey returns null when no key stored', async () => {
    mockGetRemoteApiKey.mockResolvedValue(null)
    const { LocalHermesClient } = await import('../lib/hermes/local-client')
    const client = new LocalHermesClient()
    const result = await client.getRemoteApiKey()
    expect(result).toBeNull()
  })

  it('setRemoteApiKey delegates to IPC wrapper', async () => {
    mockSetRemoteApiKey.mockResolvedValue(undefined)
    const { LocalHermesClient } = await import('../lib/hermes/local-client')
    const client = new LocalHermesClient()
    await client.setRemoteApiKey('new-key')
    expect(mockSetRemoteApiKey).toHaveBeenCalledWith('new-key')
  })

  it('deleteRemoteApiKey delegates to IPC wrapper', async () => {
    mockDeleteRemoteApiKey.mockResolvedValue(undefined)
    const { LocalHermesClient } = await import('../lib/hermes/local-client')
    const client = new LocalHermesClient()
    await client.deleteRemoteApiKey()
    expect(mockDeleteRemoteApiKey).toHaveBeenCalledTimes(1)
  })

  it('getRemoteApiKeyLength returns the numeric length', async () => {
    mockGetRemoteApiKeyLength.mockResolvedValue(42)
    const { LocalHermesClient } = await import('../lib/hermes/local-client')
    const client = new LocalHermesClient()
    const len = await client.getRemoteApiKeyLength()
    expect(len).toBe(42)
    expect(typeof len).toBe('number')
  })

  it('isSshTunnelHealthy delegates url to IPC wrapper', async () => {
    mockIsSshTunnelHealthy.mockResolvedValue(true)
    const { LocalHermesClient } = await import('../lib/hermes/local-client')
    const client = new LocalHermesClient()
    const result = await client.isSshTunnelHealthy('http://remote:8642')
    expect(mockIsSshTunnelHealthy).toHaveBeenCalledWith('http://remote:8642')
    expect(result).toBe(true)
  })

  it('waitForPort delegates all args to IPC wrapper', async () => {
    mockWaitForPort.mockResolvedValue(true)
    const { LocalHermesClient } = await import('../lib/hermes/local-client')
    const client = new LocalHermesClient()
    await client.waitForPort('host.example', 9000, 3000)
    expect(mockWaitForPort).toHaveBeenCalledWith('host.example', 9000, 3000)
  })

  it('getSshTunnelStatus delegates to IPC wrapper', async () => {
    mockGetSshTunnelStatus.mockResolvedValue({ is_running: false, local_port: null })
    const { LocalHermesClient } = await import('../lib/hermes/local-client')
    const client = new LocalHermesClient()
    const status = await client.getSshTunnelStatus()
    expect(status.is_running).toBe(false)
    expect(status.local_port).toBeNull()
  })
})

describe('CliHermesClient secret management', () => {
  it('getRemoteApiKey throws UnsupportedCapabilityError', async () => {
    const { CliHermesClient } = await import('../lib/hermes/cli-client')
    const client = new CliHermesClient()
    await expect(client.getRemoteApiKey()).rejects.toBeInstanceOf(UnsupportedCapabilityError)
  })

  it('setRemoteApiKey throws UnsupportedCapabilityError', async () => {
    const { CliHermesClient } = await import('../lib/hermes/cli-client')
    const client = new CliHermesClient()
    await expect(client.setRemoteApiKey('key')).rejects.toBeInstanceOf(UnsupportedCapabilityError)
  })

  it('deleteRemoteApiKey throws UnsupportedCapabilityError', async () => {
    const { CliHermesClient } = await import('../lib/hermes/cli-client')
    const client = new CliHermesClient()
    await expect(client.deleteRemoteApiKey()).rejects.toBeInstanceOf(UnsupportedCapabilityError)
  })

  it('getRemoteApiKeyLength returns 0 (not unsupported)', async () => {
    const { CliHermesClient } = await import('../lib/hermes/cli-client')
    const client = new CliHermesClient()
    const len = await client.getRemoteApiKeyLength()
    expect(len).toBe(0)
    expect(typeof len).toBe('number')
  })

  it('getSshTunnelStatus returns is_running=false and local_port=null', async () => {
    const { CliHermesClient } = await import('../lib/hermes/cli-client')
    const client = new CliHermesClient()
    const status = await client.getSshTunnelStatus()
    expect(status.is_running).toBe(false)
    expect(status.local_port).toBeNull()
  })
})
