import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../store'
import type { NavSection } from '../store'

beforeEach(() => {
  useStore.setState({
    activeSection: 'dashboard',
    rightPanelOpen: true,
    sidebarOpen: true,
    activeSessionId: 'session-x',
    gatewayStatus: 'unchecked',
  })
})

describe('navigation store', () => {
  it('activeSection default value is dashboard', () => {
    expect(useStore.getState().activeSection).toBe('dashboard')
  })

  it('setActiveSection to chat', () => {
    useStore.getState().setActiveSection('chat')
    expect(useStore.getState().activeSection).toBe('chat')
  })

  it('setActiveSection to install', () => {
    useStore.getState().setActiveSection('install')
    expect(useStore.getState().activeSection).toBe('install')
  })

  it('setActiveSection to commands', () => {
    useStore.getState().setActiveSection('commands')
    expect(useStore.getState().activeSection).toBe('commands')
  })

  it('setActiveSection to agents', () => {
    useStore.getState().setActiveSection('agents')
    expect(useStore.getState().activeSection).toBe('agents')
  })

  it('setActiveSection to gateway', () => {
    useStore.getState().setActiveSection('gateway')
    expect(useStore.getState().activeSection).toBe('gateway')
  })

  it('setActiveSection to crons', () => {
    useStore.getState().setActiveSection('crons')
    expect(useStore.getState().activeSection).toBe('crons')
  })

  it('setActiveSection to skills', () => {
    useStore.getState().setActiveSection('skills')
    expect(useStore.getState().activeSection).toBe('skills')
  })

  it('setActiveSection to settings', () => {
    useStore.getState().setActiveSection('settings')
    expect(useStore.getState().activeSection).toBe('settings')
  })

  it('rightPanelOpen default value is true', () => {
    expect(useStore.getState().rightPanelOpen).toBe(true)
  })

  it('setRightPanelOpen to false', () => {
    useStore.getState().setRightPanelOpen(false)
    expect(useStore.getState().rightPanelOpen).toBe(false)
  })

  it('setRightPanelOpen to true', () => {
    useStore.setState({ rightPanelOpen: false })
    useStore.getState().setRightPanelOpen(true)
    expect(useStore.getState().rightPanelOpen).toBe(true)
  })

  it('sidebarOpen default value is true', () => {
    expect(useStore.getState().sidebarOpen).toBe(true)
  })

  it('setSidebarOpen to false', () => {
    useStore.getState().setSidebarOpen(false)
    expect(useStore.getState().sidebarOpen).toBe(false)
  })

  it('setSidebarOpen toggle false then true', () => {
    useStore.getState().setSidebarOpen(false)
    expect(useStore.getState().sidebarOpen).toBe(false)
    useStore.getState().setSidebarOpen(true)
    expect(useStore.getState().sidebarOpen).toBe(true)
  })

  it('navigation does not reset activeSessionId', () => {
    useStore.getState().setActiveSection('gateway')
    expect(useStore.getState().activeSessionId).toBe('session-x')
  })

  it('navigation does not reset gatewayStatus', () => {
    useStore.getState().setActiveSection('install')
    expect(useStore.getState().gatewayStatus).toBe('unchecked')
  })

  it('multiple navigation steps in sequence', () => {
    const steps: NavSection[] = ['chat', 'install', 'gateway', 'skills', 'crons']
    for (const section of steps) {
      useStore.getState().setActiveSection(section)
      expect(useStore.getState().activeSection).toBe(section)
    }
    expect(useStore.getState().activeSection).toBe('crons')
  })
})
