import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn().mockResolvedValue(null)
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }))

const mockFetch = vi.fn()
global.fetch = mockFetch

const { RemoteHermesClient } = await import('../lib/hermes/remote-client')

describe('RemoteHermesClient — saved models', () => {
  let client: InstanceType<typeof RemoteHermesClient>

  beforeEach(() => {
    client = new RemoteHermesClient('http://remote:4000', 'key-abc')
    mockFetch.mockReset()
    mockInvoke.mockResolvedValue(null)
  })

  it('listSavedModels calls GET /api/models/saved', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [{ id: 'm1', name: 'gpt-4o' }] })
    const models = await client.listSavedModels()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/models/saved'), expect.any(Object)
    )
    expect(models).toHaveLength(1)
  })

  it('listSavedModels returns empty array on error', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))
    const models = await client.listSavedModels()
    expect(models).toEqual([])
  })

  it('addSavedModel posts to /api/models/saved', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'new', name: 'claude-3' }) })
    await client.addSavedModel({ name: 'claude-3', provider: 'anthropic', model: 'claude-3-sonnet' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/models/saved'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('removeSavedModel sends DELETE to /api/models/saved/{id}', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    await client.removeSavedModel('model-xyz')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/models/saved/model-xyz'),
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('fetchModels returns model ids from v1/models', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'gpt-4o' }, { id: 'claude-3' }] })
    })
    const models = await client.fetchModels()
    expect(models).toEqual(['gpt-4o', 'claude-3'])
  })
})
