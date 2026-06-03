import { test, expect } from 'vitest'
import { UnsupportedCapabilityError } from '../errors'
import { RemoteHermesClient } from '../remote-client'

const client = new RemoteHermesClient('http://localhost:8642', '')

test('RemoteHermesClient.listProfileNames returns a Promise', () => {
  const p = client.listProfileNames()
  p.catch(() => {})
  expect(p).toBeInstanceOf(Promise)
})

test('RemoteHermesClient.createProfile throws UnsupportedCapabilityError', () => {
  expect(() => client.createProfile('work')).toThrow(UnsupportedCapabilityError)
})

test('RemoteHermesClient.renameProfile throws UnsupportedCapabilityError', () => {
  expect(() => client.renameProfile('old', 'new')).toThrow(UnsupportedCapabilityError)
})

test('RemoteHermesClient.deleteProfile throws UnsupportedCapabilityError', () => {
  expect(() => client.deleteProfile('work')).toThrow(UnsupportedCapabilityError)
})

test('createProfile UnsupportedCapabilityError carries correct capability name', () => {
  try {
    client.createProfile('test')
  } catch (e) {
    expect(e).toBeInstanceOf(UnsupportedCapabilityError)
    expect((e as UnsupportedCapabilityError).capability).toBe('createProfile')
    expect((e as UnsupportedCapabilityError).mode).toBe('remote')
  }
})

test('renameProfile UnsupportedCapabilityError carries correct capability name', () => {
  try {
    client.renameProfile('a', 'b')
  } catch (e) {
    expect(e).toBeInstanceOf(UnsupportedCapabilityError)
    expect((e as UnsupportedCapabilityError).capability).toBe('renameProfile')
  }
})
