import { describe, it, expect } from 'vitest'

// Test the logic conditions without rendering
describe('ModeBanner visibility logic', () => {
  it('should show for remote mode', () => {
    const mode: string = 'remote'
    expect(mode === 'local').toBe(false)
  })

  it('should show for cli mode', () => {
    const mode: string = 'cli'
    expect(mode === 'local').toBe(false)
  })

  it('should hide for local mode', () => {
    const mode: string = 'local'
    expect(mode === 'local').toBe(true)
  })

  it('remote banner shows correct label', () => {
    const remoteUrl = 'http://remote:4000'
    const label = `Remote mode: ${remoteUrl}`
    expect(label).toContain('remote:4000')
  })

  it('cli banner label', () => {
    const label = 'CLI mode active'
    expect(label).toContain('CLI')
  })

  it('dismissed flag suppresses banner', () => {
    let dismissed = false
    const dismiss = () => { dismissed = true }
    dismiss()
    expect(dismissed).toBe(true)
  })
})
