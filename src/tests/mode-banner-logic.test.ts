import { describe, it, expect } from 'vitest'

describe('ModeBanner display logic', () => {
  function shouldShowBanner(mode: string): boolean {
    return mode !== 'local'
  }

  function getBannerClass(mode: string): string {
    return `mode-banner--${mode}`
  }

  function getBannerLabel(mode: string, remoteUrl: string): string {
    return mode === 'remote'
      ? `Remote mode: ${remoteUrl || 'not configured'}`
      : `CLI mode active`
  }

  it('shows banner for remote mode', () => {
    expect(shouldShowBanner('remote')).toBe(true)
  })

  it('shows banner for cli mode', () => {
    expect(shouldShowBanner('cli')).toBe(true)
  })

  it('hides banner for local mode', () => {
    expect(shouldShowBanner('local')).toBe(false)
  })

  it('remote label includes URL', () => {
    const label = getBannerLabel('remote', 'http://server.com')
    expect(label).toContain('server.com')
  })

  it('cli label says CLI mode', () => {
    const label = getBannerLabel('cli', '')
    expect(label).toContain('CLI')
  })

  it('remote CSS class is mode-banner--remote', () => {
    expect(getBannerClass('remote')).toBe('mode-banner--remote')
  })

  it('cli CSS class is mode-banner--cli', () => {
    expect(getBannerClass('cli')).toBe('mode-banner--cli')
  })
})
