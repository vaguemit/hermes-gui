import { test, expect } from 'vitest'
import { UnsupportedCapabilityError } from '../errors'
import { RemoteHermesClient } from '../remote-client'

const client = new RemoteHermesClient('http://localhost:8642', 'test-key')

test('getGatewayUrl returns the configured base URL', () => {
  expect(client.getGatewayUrl()).toBe('http://localhost:8642')
})

test('getGatewayHeaders returns Authorization header when apiKey is set', () => {
  const headers = client.getGatewayHeaders()
  expect(headers['Authorization']).toBe('Bearer test-key')
})

test('getGatewayHeaders returns empty object when no apiKey', () => {
  const noKeyClient = new RemoteHermesClient('http://localhost:8642', '')
  expect(noKeyClient.getGatewayHeaders()).toEqual({})
})

test('searchSessions throws UnsupportedCapabilityError', () => {
  expect(() => client.searchSessions('query')).toThrow(UnsupportedCapabilityError)
})

test('searchSessions error has capability=searchSessions', () => {
  try {
    client.searchSessions('q')
  } catch (e) {
    expect((e as UnsupportedCapabilityError).capability).toBe('searchSessions')
  }
})

test('getSystemInfo throws UnsupportedCapabilityError', () => {
  expect(() => client.getSystemInfo()).toThrow(UnsupportedCapabilityError)
})

test('listOllamaModels throws UnsupportedCapabilityError', () => {
  expect(() => client.listOllamaModels()).toThrow(UnsupportedCapabilityError)
})

test('getModelConfig throws UnsupportedCapabilityError', () => {
  expect(() => client.getModelConfig()).toThrow(UnsupportedCapabilityError)
})

test('two RemoteHermesClient instances have independent URLs', () => {
  const r1 = new RemoteHermesClient('http://server-a.com', '')
  const r2 = new RemoteHermesClient('http://server-b.com', '')
  expect(r1.getGatewayUrl()).toBe('http://server-a.com')
  expect(r2.getGatewayUrl()).toBe('http://server-b.com')
})
