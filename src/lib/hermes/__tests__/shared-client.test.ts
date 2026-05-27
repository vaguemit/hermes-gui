import { test, expect, beforeEach } from 'vitest'
import { setSharedClient, getSharedClient } from '../shared'
import { RemoteHermesClient } from '../remote-client'

beforeEach(() => {
  // Reset shared ref between tests by pointing it at a known value then clearing
  setSharedClient(null as unknown as import('../client').HermesClient)
})

test('getSharedClient returns null before any client is set', () => {
  expect(getSharedClient()).toBeNull()
})

test('setSharedClient stores and getSharedClient retrieves the same instance', () => {
  const client = new RemoteHermesClient('http://localhost:8642', '')
  setSharedClient(client)
  expect(getSharedClient()).toBe(client)
})

test('setSharedClient replaces the previous instance', () => {
  const c1 = new RemoteHermesClient('http://server1.com', 'key1')
  const c2 = new RemoteHermesClient('http://server2.com', 'key2')
  setSharedClient(c1)
  setSharedClient(c2)
  expect(getSharedClient()).toBe(c2)
  expect(getSharedClient()).not.toBe(c1)
})

test('getGatewayUrl reflects the client set via setSharedClient', () => {
  const client = new RemoteHermesClient('http://custom.example.com:9000', 'tok')
  setSharedClient(client)
  expect(getSharedClient()!.getGatewayUrl()).toBe('http://custom.example.com:9000')
})
