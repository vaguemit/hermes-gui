import { test, expect } from 'vitest'
import { UnsupportedCapabilityError } from '../errors'
import { RemoteHermesClient } from '../remote-client'
import type { CronJobMeta } from '../types'

const client = new RemoteHermesClient('http://localhost:8642', '')

// ── RemoteHermesClient cron stubs ─────────────────────────────────────────────

test('RemoteHermesClient.createCronJob throws UnsupportedCapabilityError', () => {
  expect(() =>
    client.createCronJob({ description: 'test', schedule: '* * * * *', enabled: true })
  ).toThrow(UnsupportedCapabilityError)
})

test('RemoteHermesClient.updateCronJob throws UnsupportedCapabilityError', () => {
  expect(() => client.updateCronJob('id', { enabled: false })).toThrow(UnsupportedCapabilityError)
})

test('RemoteHermesClient.deleteCronJob throws UnsupportedCapabilityError', () => {
  expect(() => client.deleteCronJob('id')).toThrow(UnsupportedCapabilityError)
})

test('RemoteHermesClient.enableCronJob throws UnsupportedCapabilityError', () => {
  expect(() => client.enableCronJob('id')).toThrow(UnsupportedCapabilityError)
})

test('RemoteHermesClient.disableCronJob throws UnsupportedCapabilityError', () => {
  expect(() => client.disableCronJob('id')).toThrow(UnsupportedCapabilityError)
})

// ── CronJobMeta interface shape ───────────────────────────────────────────────

test('CronJobMeta type has required fields', () => {
  const job: CronJobMeta = {
    id: 'cron-123',
    description: 'daily briefing',
    schedule: '0 9 * * *',
    enabled: true,
    lastRun: '2026-05-27T09:00:00Z',
  }
  expect(job.id).toBe('cron-123')
  expect(job.enabled).toBe(true)
  expect(job.lastRun).toBeDefined()
})

test('CronJobMeta lastRun is optional', () => {
  const job: CronJobMeta = {
    id: 'cron-456',
    description: 'weekly',
    schedule: '0 9 * * 1',
    enabled: false,
  }
  expect(job.lastRun).toBeUndefined()
})

// ── UnsupportedCapabilityError carries correct metadata ───────────────────────

test('createCronJob error has capability and mode set', () => {
  try {
    client.createCronJob({ description: 'x', schedule: '* * * * *', enabled: true })
    throw new Error('should not reach')
  } catch (e) {
    expect(e).toBeInstanceOf(UnsupportedCapabilityError)
    const err = e as UnsupportedCapabilityError
    expect(err.capability).toBe('createCronJob')
    expect(err.mode).toBe('remote')
  }
})
