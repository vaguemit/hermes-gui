import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn().mockResolvedValue(null)
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { RemoteHermesClient } = await import('../lib/hermes/remote-client')

describe('RemoteHermesClient — sessions', () => {
  let client: InstanceType<typeof RemoteHermesClient>

  beforeEach(() => {
    client = new RemoteHermesClient('http://remote:4000', 'test-key-123')
    mockFetch.mockReset()
    mockInvoke.mockResolvedValue(null)
  })

  it('listSessions calls GET /api/sessions with auth header', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
    await client.listSessions()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sessions'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-key-123' }) })
    )
  })

  it('listSessions passes limit and offset as query params', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
    await client.listSessions(10, 20)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=10&offset=20'), expect.any(Object)
    )
  })

  it('listSessions handles sessions wrapper object', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ sessions: [{ id: 'a' }] }) })
    const result = await client.listSessions()
    expect(result).toEqual([{ id: 'a' }])
  })

  it('listSessions throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403 })
    await expect(client.listSessions()).rejects.toThrow('403')
  })

  it('searchSessions encodes query in URL', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
    await client.searchSessions('hello world')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('q=hello%20world'), expect.any(Object)
    )
  })

  it('deleteSession uses DELETE method', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    await client.deleteSession('sess-abc')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('sess-abc'),
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('readSessionDb fetches messages for session', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [{ role: 'user', content: 'hi' }] })
    const msgs = await client.readSessionDb('sess-xyz')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/sessions/sess-xyz/messages'), expect.any(Object)
    )
    expect(msgs).toHaveLength(1)
  })

  it('throws when no API key set', async () => {
    const noKey = new RemoteHermesClient('http://remote:4000', '')
    await expect(noKey.listSessions()).rejects.toThrow()
  })
})
