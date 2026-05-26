import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../store'

beforeEach(() => {
  useStore.setState({
    paletteOpen: false,
    paletteQuery: '',
    modelSwitcherOpen: false,
  })
})

describe('command palette store', () => {
  it('paletteOpen defaults to false', () => {
    expect(useStore.getState().paletteOpen).toBe(false)
  })

  it('paletteQuery defaults to empty string', () => {
    expect(useStore.getState().paletteQuery).toBe('')
  })

  it('setPaletteOpen(true) sets paletteOpen to true', () => {
    useStore.getState().setPaletteOpen(true)
    expect(useStore.getState().paletteOpen).toBe(true)
  })

  it('setPaletteOpen(false) sets paletteOpen to false', () => {
    useStore.getState().setPaletteOpen(true)
    useStore.getState().setPaletteOpen(false)
    expect(useStore.getState().paletteOpen).toBe(false)
  })

  it('setPaletteQuery updates the query string', () => {
    useStore.getState().setPaletteQuery('new chat')
    expect(useStore.getState().paletteQuery).toBe('new chat')
  })

  it('setPaletteQuery with empty string clears the query', () => {
    useStore.getState().setPaletteQuery('something')
    useStore.getState().setPaletteQuery('')
    expect(useStore.getState().paletteQuery).toBe('')
  })

  it('setPaletteQuery with a long string stores it fully', () => {
    const query = 'a'.repeat(200)
    useStore.getState().setPaletteQuery(query)
    expect(useStore.getState().paletteQuery).toBe(query)
  })

  it('opening palette does not affect modelSwitcherOpen', () => {
    useStore.setState({ modelSwitcherOpen: false })
    useStore.getState().setPaletteOpen(true)
    expect(useStore.getState().modelSwitcherOpen).toBe(false)
  })

  it('modelSwitcherOpen toggling does not affect paletteOpen', () => {
    useStore.getState().setPaletteOpen(true)
    useStore.getState().setModelSwitcherOpen(true)
    expect(useStore.getState().paletteOpen).toBe(true)
    useStore.getState().setModelSwitcherOpen(false)
    expect(useStore.getState().paletteOpen).toBe(true)
  })

  it('paletteQuery is independent of paletteOpen state', () => {
    useStore.getState().setPaletteQuery('my query')
    useStore.getState().setPaletteOpen(false)
    // Closing palette does not wipe the query
    expect(useStore.getState().paletteQuery).toBe('my query')
  })

  it('multiple open/close cycles work correctly', () => {
    for (let i = 0; i < 5; i++) {
      useStore.getState().setPaletteOpen(true)
      expect(useStore.getState().paletteOpen).toBe(true)
      useStore.getState().setPaletteOpen(false)
      expect(useStore.getState().paletteOpen).toBe(false)
    }
  })

  it('paletteOpen and paletteQuery can be reset together via setState', () => {
    useStore.getState().setPaletteOpen(true)
    useStore.getState().setPaletteQuery('reset me')
    useStore.setState({ paletteOpen: false, paletteQuery: '' })
    expect(useStore.getState().paletteOpen).toBe(false)
    expect(useStore.getState().paletteQuery).toBe('')
  })

  it('setPaletteQuery updates only the query and does not affect paletteOpen', () => {
    useStore.getState().setPaletteOpen(true)
    useStore.getState().setPaletteQuery('hello')
    expect(useStore.getState().paletteOpen).toBe(true)
    expect(useStore.getState().paletteQuery).toBe('hello')
  })

  it('setPaletteOpen(true) twice is idempotent', () => {
    useStore.getState().setPaletteOpen(true)
    useStore.getState().setPaletteOpen(true)
    expect(useStore.getState().paletteOpen).toBe(true)
  })

  it('setPaletteOpen(false) twice is idempotent', () => {
    useStore.getState().setPaletteOpen(false)
    useStore.getState().setPaletteOpen(false)
    expect(useStore.getState().paletteOpen).toBe(false)
  })
})
