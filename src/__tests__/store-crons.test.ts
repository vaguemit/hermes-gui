import { test, expect, describe, beforeEach } from 'vitest'
import { useStore } from '../store'
import type { CronJob } from '../store'

function makeCron(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: 'c1',
    schedule: 'Daily at 09:00',
    description: 'Test job',
    platform: 'Telegram',
    active: false,
    ...overrides,
  }
}

beforeEach(() => {
  useStore.setState({ crons: [] })
})

describe('cron store actions', () => {
  test('addCron appends a cron job', () => {
    const cron = makeCron()
    useStore.getState().addCron(cron)
    const { crons } = useStore.getState()
    expect(crons).toHaveLength(1)
    expect(crons[0].id).toBe('c1')
    expect(crons[0].description).toBe('Test job')
  })

  test('addCron preserves existing crons', () => {
    useStore.getState().addCron(makeCron({ id: 'c1', description: 'First' }))
    useStore.getState().addCron(makeCron({ id: 'c2', description: 'Second' }))
    const { crons } = useStore.getState()
    expect(crons).toHaveLength(2)
    expect(crons[0].id).toBe('c1')
    expect(crons[1].id).toBe('c2')
  })

  test('toggleCron flips active from false to true', () => {
    useStore.getState().addCron(makeCron({ id: 'c1', active: false }))
    useStore.getState().toggleCron('c1')
    expect(useStore.getState().crons[0].active).toBe(true)
  })

  test('toggleCron flips active from true to false', () => {
    useStore.getState().addCron(makeCron({ id: 'c1', active: true }))
    useStore.getState().toggleCron('c1')
    expect(useStore.getState().crons[0].active).toBe(false)
  })

  test('toggleCron only affects the targeted cron', () => {
    useStore.getState().addCron(makeCron({ id: 'c1', active: false }))
    useStore.getState().addCron(makeCron({ id: 'c2', active: false }))
    useStore.getState().toggleCron('c1')
    const { crons } = useStore.getState()
    expect(crons.find(c => c.id === 'c1')!.active).toBe(true)
    expect(crons.find(c => c.id === 'c2')!.active).toBe(false)
  })

  test('deleteCron removes by id', () => {
    useStore.getState().addCron(makeCron({ id: 'c1' }))
    useStore.getState().deleteCron('c1')
    expect(useStore.getState().crons).toHaveLength(0)
  })

  test('deleteCron only removes the targeted cron', () => {
    useStore.getState().addCron(makeCron({ id: 'c1' }))
    useStore.getState().addCron(makeCron({ id: 'c2' }))
    useStore.getState().deleteCron('c1')
    const { crons } = useStore.getState()
    expect(crons).toHaveLength(1)
    expect(crons[0].id).toBe('c2')
  })

  test('deleteCron on non-existent id is a no-op', () => {
    useStore.getState().addCron(makeCron({ id: 'c1' }))
    useStore.getState().deleteCron('does-not-exist')
    expect(useStore.getState().crons).toHaveLength(1)
  })

  test('updateCronLastRun sets lastRun field', () => {
    useStore.getState().addCron(makeCron({ id: 'c1' }))
    useStore.getState().updateCronLastRun('c1', '2026-05-23')
    const { crons } = useStore.getState()
    expect(crons[0].lastRun).toBe('2026-05-23')
  })

  test('updateCronLastRun only updates the targeted cron', () => {
    useStore.getState().addCron(makeCron({ id: 'c1' }))
    useStore.getState().addCron(makeCron({ id: 'c2' }))
    useStore.getState().updateCronLastRun('c1', '2026-05-23')
    const { crons } = useStore.getState()
    expect(crons.find(c => c.id === 'c1')!.lastRun).toBe('2026-05-23')
    expect(crons.find(c => c.id === 'c2')!.lastRun).toBeUndefined()
  })

  test('updateCronLastRun does not mutate other fields', () => {
    const cron = makeCron({ id: 'c1', schedule: 'Every Monday', platform: 'Discord', active: true })
    useStore.getState().addCron(cron)
    useStore.getState().updateCronLastRun('c1', '2026-05-23')
    const updated = useStore.getState().crons[0]
    expect(updated.schedule).toBe('Every Monday')
    expect(updated.platform).toBe('Discord')
    expect(updated.active).toBe(true)
  })

  test('addCron preserves optional mode field', () => {
    const cron = makeCron({ id: 'c1', mode: 'gateway' })
    useStore.getState().addCron(cron)
    expect(useStore.getState().crons[0].mode).toBe('gateway')
  })

  test('addCron preserves optional source field', () => {
    const cron = makeCron({ id: 'c1', source: 'hermes' })
    useStore.getState().addCron(cron)
    expect(useStore.getState().crons[0].source).toBe('hermes')
  })

  test('crons starts empty after beforeEach reset', () => {
    expect(useStore.getState().crons).toHaveLength(0)
  })
})
