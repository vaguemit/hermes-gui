import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn().mockResolvedValue(null)
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }))

const mockFetch = vi.fn()
global.fetch = mockFetch

const { RemoteHermesClient } = await import('../lib/hermes/remote-client')

describe('RemoteHermesClient — env/config', () => {
  let client: InstanceType<typeof RemoteHermesClient>

  beforeEach(() => {
    client = new RemoteHermesClient('http://remote:4000', 'key-abc')
    mockFetch.mockReset()
    mockInvoke.mockResolvedValue(null)
  })

  it('readEnv calls GET /api/env', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ OPENAI_API_KEY: 'sk-x' }) })
    const result = await client.readEnv()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/env'), expect.any(Object)
    )
    expect(result).toEqual({ OPENAI_API_KEY: 'sk-x' })
  })

  it('readEnv returns empty object on error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const result = await client.readEnv()
    expect(result).toEqual({})
  })

  it('writeEnv calls PUT /api/env/{key}', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    await client.writeEnv('OPENAI_API_KEY', 'sk-new')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/env/OPENAI_API_KEY'),
      expect.objectContaining({ method: 'PUT' })
    )
    const call = mockFetch.mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.value).toBe('sk-new')
  })

  it('writeEnv URL-encodes the key', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    await client.writeEnv('MY KEY', 'val')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('MY%20KEY'), expect.any(Object)
    )
  })

  it('getActiveProfile returns default on error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const profile = await client.getActiveProfile()
    expect(profile).toBe('default')
  })

  it('listProfiles returns empty array on error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const profiles = await client.listProfiles()
    expect(profiles).toEqual([])
  })
})
