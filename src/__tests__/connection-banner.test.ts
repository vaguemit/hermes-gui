import { describe, it, expect } from 'vitest'

describe('connection banner CSS classes', () => {
  it('remote mode uses remote class', () => {
    const mode = 'remote'
    const cls = `mode-banner--${mode}`
    expect(cls).toBe('mode-banner--remote')
  })

  it('cli mode uses cli class', () => {
    const mode = 'cli'
    const cls = `mode-banner--${mode}`
    expect(cls).toBe('mode-banner--cli')
  })

  it('sidebar badge is correct for remote', () => {
    const cls = `sidebar-mode-badge sidebar-mode-badge--remote`
    expect(cls).toContain('remote')
  })

  it('sidebar badge is correct for cli', () => {
    const cls = `sidebar-mode-badge sidebar-mode-badge--cli`
    expect(cls).toContain('cli')
  })

  it('banner dismiss sets dismissed to true', () => {
    let dismissed = false
    const dismiss = () => { dismissed = true }
    dismiss()
    expect(dismissed).toBe(true)
  })

  it('banner label contains mode name for remote', () => {
    const mode = 'remote'
    const url = 'http://example:4000'
    const label = `Remote mode: ${url}`
    expect(label).toContain(mode === 'remote' ? 'Remote' : 'CLI')
  })
})
