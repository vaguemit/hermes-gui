import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { RemoteHermesClient } = await import('../lib/hermes/remote-client')

describe('RemoteHermesClient — auth header', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockInvoke.mockReset()
  })

  it('uses constructor apiKey when IPC returns null', async () => {
    mockInvoke.mockResolvedValue(null) // no stored key
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
    const client = new RemoteHermesClient('http://remote:4000', 'ctor-key')
    await client.listSessions()
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers.Authorization).toBe('Bearer ctor-key')
  })

  it('prefers IPC stored key over constructor key', async () => {
    mockInvoke.mockResolvedValue('stored-key-xyz') // IPC returns a key
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
    const client = new RemoteHermesClient('http://remote:4000', 'ctor-key')
    await client.listSessions()
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers.Authorization).toBe('Bearer stored-key-xyz')
  })

  it('throws when both constructor key empty and IPC returns null', async () => {
    mockInvoke.mockResolvedValue(null)
    const client = new RemoteHermesClient('http://remote:4000', '')
    await expect(client.listSessions()).rejects.toThrow(/API key/)
  })

  it('throws when both constructor key empty and IPC returns empty string', async () => {
    mockInvoke.mockResolvedValue('')
    const client = new RemoteHermesClient('http://remote:4000', '')
    await expect(client.listSessions()).rejects.toThrow(/API key/)
  })

  it('includes Content-Type in auth headers', async () => {
    mockInvoke.mockResolvedValue(null)
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
    const client = new RemoteHermesClient('http://remote:4000', 'key-123')
    await client.listSessions()
    const [, opts] = mockFetch.mock.calls[0]
    expect(opts.headers['Content-Type']).toBe('application/json')
  })
})
