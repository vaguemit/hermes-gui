import { test, expect, vi, beforeEach } from 'vitest'
import { UnsupportedCapabilityError } from '../errors'
import { RemoteHermesClient } from '../remote-client'
import type { CronJobMeta } from '../types'

// ── RemoteHermesClient cron stubs ─────────────────────────────────────────────

test('RemoteHermesClient.createCronJob throws UnsupportedCapabilityError', async () => {
  const client = new RemoteHermesClient('http://localhost:8642', '')
  await expect(
    client.createCronJob({ description: 'test', schedule: '* * * * *', enabled: true })
  ).rejects.toBeInstanceOf(UnsupportedCapabilityError)
})

test('RemoteHermesClient.updateCronJob throws UnsupportedCapabilityError', async () => {
  const client = new RemoteHermesClient('http://localhost:8642', '')
  await expect(client.updateCronJob('id', { enabled: false })).rejects.toBeInstanceOf(UnsupportedCapabilityError)
})

test('RemoteHermesClient.deleteCronJob throws UnsupportedCapabilityError', async () => {
  const client = new RemoteHermesClient('http://localhost:8642', '')
  await expect(client.deleteCronJob('id')).rejects.toBeInstanceOf(UnsupportedCapabilityError)
})

test('RemoteHermesClient.enableCronJob throws UnsupportedCapabilityError', async () => {
  const client = new RemoteHermesClient('http://localhost:8642', '')
  await expect(client.enableCronJob('id')).rejects.toBeInstanceOf(UnsupportedCapabilityError)
})

test('RemoteHermesClient.disableCronJob throws UnsupportedCapabilityError', async () => {
  const client = new RemoteHermesClient('http://localhost:8642', '')
  await expect(client.disableCronJob('id')).rejects.toBeInstanceOf(UnsupportedCapabilityError)
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

test('UnsupportedCapabilityError has capability and mode set to remote', async () => {
  const client = new RemoteHermesClient('http://localhost:8642', '')
  try {
    await client.createCronJob({ description: 'x', schedule: '* * * * *', enabled: true })
    throw new Error('should not reach')
  } catch (e) {
    expect(e).toBeInstanceOf(UnsupportedCapabilityError)
    const err = e as UnsupportedCapabilityError
    expect(err.capability).toBe('createCronJob')
    expect(err.mode).toBe('remote')
  }
})
