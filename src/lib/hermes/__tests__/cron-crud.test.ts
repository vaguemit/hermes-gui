import { test, expect } from 'vitest'
import { UnsupportedCapabilityError } from '../errors'
import { RemoteHermesClient } from '../remote-client'
import type { CronJobMeta } from '../types'

const client = new RemoteHermesClient('http://localhost:8642', '')

// ── RemoteHermesClient cron stubs ─────────────────────────────────────────────

test('RemoteHermesClient.createCronJob returns a Promise', () => {
  const p = client.createCronJob({ description: 'test', schedule: '* * * * *', enabled: true })
  p.catch(() => {})
  expect(p).toBeInstanceOf(Promise)
})

test('RemoteHermesClient.updateCronJob throws UnsupportedCapabilityError', () => {
  expect(() => client.updateCronJob('id', { enabled: false })).toThrow(UnsupportedCapabilityError)
})

test('RemoteHermesClient.deleteCronJob returns a Promise', () => {
  const p = client.deleteCronJob('id')
  p.catch(() => {})
  expect(p).toBeInstanceOf(Promise)
})

test('RemoteHermesClient.enableCronJob returns a Promise', () => {
  const p = client.enableCronJob('id')
  p.catch(() => {})
  expect(p).toBeInstanceOf(Promise)
})

test('RemoteHermesClient.disableCronJob returns a Promise', () => {
  const p = client.disableCronJob('id')
  p.catch(() => {})
  expect(p).toBeInstanceOf(Promise)
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

// ── updateCronJob still throws; createCronJob is now async ───────────────────

test('createCronJob is async and updateCronJob still throws UnsupportedCapabilityError', () => {
  const p = client.createCronJob({ description: 'x', schedule: '* * * * *', enabled: true })
  p.catch(() => {})
  expect(p).toBeInstanceOf(Promise)
  expect(() => client.updateCronJob('id', { enabled: false })).toThrow(UnsupportedCapabilityError)
  const err = (() => {
    try { client.updateCronJob('id', {}); return null } catch (e) { return e }
  })() as UnsupportedCapabilityError
  expect(err.capability).toBe('updateCronJob')
  expect(err.mode).toBe('remote')
})
