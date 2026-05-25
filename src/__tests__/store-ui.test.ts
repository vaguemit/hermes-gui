import { test, expect, describe, beforeEach } from 'vitest'
import { useStore } from '../store'

beforeEach(() => {
  useStore.setState({
    paletteOpen: false,
    paletteQuery: '',
    sidebarOpen: true,
    rightPanelOpen: true,
    settingsOpen: false,
    modelSwitcherOpen: false,
  })
})

describe('paletteOpen', () => {
  test('defaults to false', () => {
    expect(useStore.getState().paletteOpen).toBe(false)
  })

  test('setPaletteOpen(true) opens the palette', () => {
    useStore.getState().setPaletteOpen(true)
    expect(useStore.getState().paletteOpen).toBe(true)
  })

  test('setPaletteOpen(false) closes the palette', () => {
    useStore.getState().setPaletteOpen(true)
    useStore.getState().setPaletteOpen(false)
    expect(useStore.getState().paletteOpen).toBe(false)
  })

  test('setPaletteOpen is idempotent — calling true twice stays true', () => {
    useStore.getState().setPaletteOpen(true)
    useStore.getState().setPaletteOpen(true)
    expect(useStore.getState().paletteOpen).toBe(true)
  })
})

describe('paletteQuery', () => {
  test('defaults to empty string', () => {
    expect(useStore.getState().paletteQuery).toBe('')
  })

  test('setPaletteQuery updates the query string', () => {
    useStore.getState().setPaletteQuery('new session')
    expect(useStore.getState().paletteQuery).toBe('new session')
  })

  test('setPaletteQuery can clear the query', () => {
    useStore.getState().setPaletteQuery('something')
    useStore.getState().setPaletteQuery('')
    expect(useStore.getState().paletteQuery).toBe('')
  })
})

describe('sidebarOpen', () => {
  test('defaults to true', () => {
    expect(useStore.getState().sidebarOpen).toBe(true)
  })

  test('setSidebarOpen(false) closes the sidebar', () => {
    useStore.getState().setSidebarOpen(false)
    expect(useStore.getState().sidebarOpen).toBe(false)
  })

  test('setSidebarOpen(true) opens the sidebar', () => {
    useStore.getState().setSidebarOpen(false)
    useStore.getState().setSidebarOpen(true)
    expect(useStore.getState().sidebarOpen).toBe(true)
  })
})

describe('rightPanelOpen', () => {
  test('defaults to true', () => {
    expect(useStore.getState().rightPanelOpen).toBe(true)
  })

  test('setRightPanelOpen(false) closes the right panel', () => {
    useStore.getState().setRightPanelOpen(false)
    expect(useStore.getState().rightPanelOpen).toBe(false)
  })

  test('setRightPanelOpen(true) opens the right panel', () => {
    useStore.getState().setRightPanelOpen(false)
    useStore.getState().setRightPanelOpen(true)
    expect(useStore.getState().rightPanelOpen).toBe(true)
  })
})

describe('settingsOpen', () => {
  test('defaults to false', () => {
    expect(useStore.getState().settingsOpen).toBe(false)
  })

  test('setSettingsOpen(true) opens settings', () => {
    useStore.getState().setSettingsOpen(true)
    expect(useStore.getState().settingsOpen).toBe(true)
  })

  test('setSettingsOpen(false) closes settings', () => {
    useStore.getState().setSettingsOpen(true)
    useStore.getState().setSettingsOpen(false)
    expect(useStore.getState().settingsOpen).toBe(false)
  })
})

describe('modelSwitcherOpen', () => {
  test('defaults to false', () => {
    expect(useStore.getState().modelSwitcherOpen).toBe(false)
  })

  test('setModelSwitcherOpen(true) opens the model switcher', () => {
    useStore.getState().setModelSwitcherOpen(true)
    expect(useStore.getState().modelSwitcherOpen).toBe(true)
  })

  test('setModelSwitcherOpen(false) closes the model switcher', () => {
    useStore.getState().setModelSwitcherOpen(true)
    useStore.getState().setModelSwitcherOpen(false)
    expect(useStore.getState().modelSwitcherOpen).toBe(false)
  })

  test('setModelSwitcherOpen is independent of paletteOpen', () => {
    useStore.getState().setModelSwitcherOpen(true)
    useStore.getState().setPaletteOpen(true)
    expect(useStore.getState().modelSwitcherOpen).toBe(true)
    expect(useStore.getState().paletteOpen).toBe(true)

    useStore.getState().setModelSwitcherOpen(false)
    expect(useStore.getState().modelSwitcherOpen).toBe(false)
    expect(useStore.getState().paletteOpen).toBe(true)
  })
})
