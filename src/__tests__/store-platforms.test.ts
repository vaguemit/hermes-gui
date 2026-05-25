import { test, expect, describe, beforeEach } from 'vitest'
import { useStore } from '../store'
import type { Platform } from '../store'

const INITIAL_PLATFORMS: Pick<Platform, 'name' | 'icon'>[] = [
  { name: 'Telegram', icon: 'TG' },
  { name: 'Discord', icon: 'DC' },
  { name: 'Slack', icon: 'SL' },
  { name: 'WhatsApp', icon: 'WA' },
  { name: 'Signal', icon: 'SG' },
  { name: 'Email', icon: 'EM' },
  { name: 'Webhook', icon: 'WH' },
  { name: 'Matrix', icon: 'MX' },
  { name: 'Mattermost', icon: 'MM' },
]

beforeEach(() => {
  useStore.setState({
    platforms: INITIAL_PLATFORMS.map((p) => ({ ...p, status: 'disconnected' })),
  })
})

describe('platforms initial state', () => {
  test('platforms is a non-empty array', () => {
    const { platforms } = useStore.getState()
    expect(Array.isArray(platforms)).toBe(true)
    expect(platforms.length).toBeGreaterThan(0)
  })

  test('platforms contains exactly 9 entries', () => {
    const { platforms } = useStore.getState()
    expect(platforms).toHaveLength(9)
  })

  test('each platform has name, status, and icon fields', () => {
    const { platforms } = useStore.getState()
    for (const p of platforms) {
      expect(typeof p.name).toBe('string')
      expect(p.name.length).toBeGreaterThan(0)
      expect(['connected', 'disconnected', 'error']).toContain(p.status)
      expect(typeof p.icon).toBe('string')
      expect(p.icon.length).toBeGreaterThan(0)
    }
  })

  test('all expected platform names are present', () => {
    const { platforms } = useStore.getState()
    const names = platforms.map((p) => p.name)
    expect(names).toContain('Telegram')
    expect(names).toContain('Discord')
    expect(names).toContain('Slack')
    expect(names).toContain('WhatsApp')
    expect(names).toContain('Signal')
    expect(names).toContain('Email')
    expect(names).toContain('Webhook')
    expect(names).toContain('Matrix')
    expect(names).toContain('Mattermost')
  })

  test('all platforms start with disconnected status', () => {
    const { platforms } = useStore.getState()
    for (const p of platforms) {
      expect(p.status).toBe('disconnected')
    }
  })

  test('platform icons match expected abbreviations', () => {
    const { platforms } = useStore.getState()
    const iconMap: Record<string, string> = {
      Telegram: 'TG',
      Discord: 'DC',
      Slack: 'SL',
      WhatsApp: 'WA',
      Signal: 'SG',
      Email: 'EM',
      Webhook: 'WH',
      Matrix: 'MX',
      Mattermost: 'MM',
    }
    for (const p of platforms) {
      expect(p.icon).toBe(iconMap[p.name])
    }
  })
})

describe('setPlatformStatus', () => {
  test('sets a single platform to connected', () => {
    useStore.getState().setPlatformStatus('Telegram', 'connected')
    const { platforms } = useStore.getState()
    const tg = platforms.find((p) => p.name === 'Telegram')!
    expect(tg.status).toBe('connected')
  })

  test('does not affect other platforms when one is updated', () => {
    useStore.getState().setPlatformStatus('Slack', 'connected')
    const { platforms } = useStore.getState()
    const others = platforms.filter((p) => p.name !== 'Slack')
    for (const p of others) {
      expect(p.status).toBe('disconnected')
    }
  })

  test('sets a platform to error status', () => {
    useStore.getState().setPlatformStatus('Discord', 'error')
    const discord = useStore.getState().platforms.find((p) => p.name === 'Discord')!
    expect(discord.status).toBe('error')
  })

  test('can update status back to disconnected', () => {
    useStore.getState().setPlatformStatus('WhatsApp', 'connected')
    useStore.getState().setPlatformStatus('WhatsApp', 'disconnected')
    const wa = useStore.getState().platforms.find((p) => p.name === 'WhatsApp')!
    expect(wa.status).toBe('disconnected')
  })

  test('updating a non-existent platform name leaves all platforms unchanged', () => {
    useStore.getState().setPlatformStatus('NonExistent', 'connected')
    const { platforms } = useStore.getState()
    for (const p of platforms) {
      expect(p.status).toBe('disconnected')
    }
  })

  test('can update multiple platforms independently', () => {
    useStore.getState().setPlatformStatus('Telegram', 'connected')
    useStore.getState().setPlatformStatus('Discord', 'error')
    useStore.getState().setPlatformStatus('Email', 'connected')
    const { platforms } = useStore.getState()
    expect(platforms.find((p) => p.name === 'Telegram')!.status).toBe('connected')
    expect(platforms.find((p) => p.name === 'Discord')!.status).toBe('error')
    expect(platforms.find((p) => p.name === 'Email')!.status).toBe('connected')
    expect(platforms.find((p) => p.name === 'Slack')!.status).toBe('disconnected')
  })
})
