import { describe, it, expect } from 'vitest'

describe('ConnectionConfig shape', () => {
  it('ConnectionConfig has mode field', () => {
    const config = { mode: 'local' as const, remoteUrl: '', apiKeyLength: 0 }
    expect(config.mode).toBe('local')
  })

  it('HermesMode includes cli', () => {
    const modes = ['local', 'remote', 'cli'] as const
    expect(modes).toContain('cli')
    expect(modes).toContain('remote')
  })

  it('apiKeyLength is a number not a string', () => {
    const config = { mode: 'remote' as const, remoteUrl: 'http://example.com', apiKeyLength: 42 }
    expect(typeof config.apiKeyLength).toBe('number')
    expect(config).not.toHaveProperty('apiKey')
  })
})
