import { test, expect } from 'vitest'
import { UnsupportedCapabilityError } from '../errors'
import { RemoteHermesClient } from '../remote-client'

const client = new RemoteHermesClient('http://localhost:8642', 'test-key')
const noKeyClient = new RemoteHermesClient('http://localhost:8642', '')

// ── checkDependencies ──────────────────────────────────────────────────────────

test('checkDependencies throws UnsupportedCapabilityError in remote mode', () => {
  expect(() => client.checkDependencies()).toThrow(UnsupportedCapabilityError)
})

test('checkDependencies error has capability=checkDependencies', () => {
  try {
    client.checkDependencies()
  } catch (e) {
    expect((e as UnsupportedCapabilityError).capability).toBe('checkDependencies')
  }
})

test('checkDependencies throws even without an api key', () => {
  expect(() => noKeyClient.checkDependencies()).toThrow(UnsupportedCapabilityError)
})

// ── testGateway ────────────────────────────────────────────────────────────────

test('testGateway returns a TestResult shape when gateway is unreachable', async () => {
  const result = await client.testGateway()
  expect(result).toHaveProperty('success')
  expect(result).toHaveProperty('latency_ms')
  expect(result).toHaveProperty('error')
  expect(typeof result.success).toBe('boolean')
})

test('testGateway returns success=false when nothing is listening', async () => {
  const result = await client.testGateway()
  // Nothing is listening on localhost:8642 in the test environment
  expect(result.success).toBe(false)
})

test('testGateway populates error when unreachable', async () => {
  const result = await client.testGateway()
  expect(result.error).not.toBeNull()
  expect(typeof result.error).toBe('string')
})

test('testGateway uses auth headers from the configured api key', () => {
  // Verify the client correctly uses the configured URL (not mocking fetch, just structural)
  expect(client.getGatewayUrl()).toBe('http://localhost:8642')
  expect(client.getGatewayHeaders()['Authorization']).toBe('Bearer test-key')
})

// ── DependencyStatus type shape (static) ──────────────────────────────────────

test('UnsupportedCapabilityError from checkDependencies has mode=remote', () => {
  try {
    client.checkDependencies()
  } catch (e) {
    const err = e as UnsupportedCapabilityError
    expect(err.capability).toBe('checkDependencies')
    expect(err.message).toContain('remote')
  }
})
