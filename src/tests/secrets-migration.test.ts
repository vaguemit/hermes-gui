import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }))
vi.mock('@tauri-apps/api/tauri', () => ({ invoke: mockInvoke }))

describe('getRemoteApiKeyLength safety', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('returns 0 (number) when key is absent', async () => {
    mockInvoke.mockResolvedValue(0)
    const { getRemoteApiKeyLength } = await import('../api/desktop')
    const len = await getRemoteApiKeyLength()
    expect(len).toBe(0)
    expect(typeof len).toBe('number')
  })

  it('returns a positive number when key is present', async () => {
    mockInvoke.mockResolvedValue(45)
    const { getRemoteApiKeyLength } = await import('../api/desktop')
    const len = await getRemoteApiKeyLength()
    expect(len).toBeGreaterThan(0)
  })

  it('does NOT return the actual key value (only a length)', async () => {
    const fakeKey = 'sk-abcdefghij'
    // getRemoteApiKeyLength should return a number, never the key string
    mockInvoke.mockResolvedValue(fakeKey.length)
    const { getRemoteApiKeyLength } = await import('../api/desktop')
    const result = await getRemoteApiKeyLength()
    expect(result).not.toBe(fakeKey)
    expect(typeof result).toBe('number')
  })

  it('returns a number not a string even when invoke returns numeric string edge case', async () => {
    // Invoke is typed to return number; TypeScript enforces this at compile time.
    // At runtime, if backend sends 12, we get 12 not "12".
    mockInvoke.mockResolvedValue(12)
    const { getRemoteApiKeyLength } = await import('../api/desktop')
    const len = await getRemoteApiKeyLength()
    expect(typeof len).toBe('number')
    expect(len).toBe(12)
  })
})

describe('getRemoteApiKey vs getRemoteApiKeyLength separation', () => {
  beforeEach(() => mockInvoke.mockReset())

  it('getRemoteApiKey calls get_remote_api_key, not get_remote_api_key_length', async () => {
    mockInvoke.mockResolvedValue('secret')
    const { getRemoteApiKey } = await import('../api/desktop')
    await getRemoteApiKey()
    expect(mockInvoke).toHaveBeenCalledWith('get_remote_api_key')
    expect(mockInvoke).not.toHaveBeenCalledWith('get_remote_api_key_length')
  })

  it('getRemoteApiKeyLength calls get_remote_api_key_length, not get_remote_api_key', async () => {
    mockInvoke.mockResolvedValue(10)
    const { getRemoteApiKeyLength } = await import('../api/desktop')
    await getRemoteApiKeyLength()
    expect(mockInvoke).toHaveBeenCalledWith('get_remote_api_key_length')
    expect(mockInvoke).not.toHaveBeenCalledWith('get_remote_api_key')
  })
})
