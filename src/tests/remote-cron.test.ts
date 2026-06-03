import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockInvoke = vi.fn().mockResolvedValue(null)
vi.mock('@tauri-apps/api/core', () => ({ invoke: mockInvoke }))

const mockFetch = vi.fn()
global.fetch = mockFetch

const { RemoteHermesClient } = await import('../lib/hermes/remote-client')

describe('RemoteHermesClient — cron jobs', () => {
  let client: InstanceType<typeof RemoteHermesClient>

  beforeEach(() => {
    client = new RemoteHermesClient('http://remote:4000', 'key-abc')
    mockFetch.mockReset()
    mockInvoke.mockResolvedValue(null)
  })

  it('listCronJobs calls GET /api/jobs with include_disabled', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
    await client.listCronJobs()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/jobs?include_disabled=true'), expect.any(Object)
    )
  })

  it('listCronJobs includes auth header', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
    await client.listCronJobs()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer key-abc' }) })
    )
  })

  it('createCronJob posts job data to /api/jobs', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ id: 'j1' }) })
    await client.createCronJob({ name: 'test', schedule: '0 9 * * *', prompt: 'run task', enabled: true })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/jobs'),
      expect.objectContaining({ method: 'POST' })
    )
    const call = mockFetch.mock.calls[0]
    const body = JSON.parse(call[1].body)
    expect(body.schedule).toBe('0 9 * * *')
    expect(body.prompt).toBe('run task')
  })

  it('deleteCronJob uses DELETE on /api/jobs/{id}', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    await client.deleteCronJob('job-123')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/jobs/job-123'),
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('enableCronJob calls /api/jobs/{id}/resume', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    await client.enableCronJob('job-123')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/jobs/job-123/resume'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('disableCronJob calls /api/jobs/{id}/pause', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    await client.disableCronJob('job-123')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/jobs/job-123/pause'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('runCronJob calls /api/jobs/{id}/run', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    const result = await client.runCronJob('job-123')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/jobs/job-123/run'),
      expect.objectContaining({ method: 'POST' })
    )
    expect(result.success).toBe(true)
  })
})
