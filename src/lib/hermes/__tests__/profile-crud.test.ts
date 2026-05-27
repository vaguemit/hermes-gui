import { test, expect } from 'vitest'
import { UnsupportedCapabilityError } from '../errors'
import { RemoteHermesClient } from '../remote-client'

const client = new RemoteHermesClient('http://localhost:8642', '')

test('RemoteHermesClient.listProfileNames throws UnsupportedCapabilityError', async () => {
  await expect(client.listProfileNames()).rejects.toBeInstanceOf(UnsupportedCapabilityError)
})

test('RemoteHermesClient.createProfile throws UnsupportedCapabilityError', async () => {
  await expect(client.createProfile('work')).rejects.toBeInstanceOf(UnsupportedCapabilityError)
})

test('RemoteHermesClient.renameProfile throws UnsupportedCapabilityError', async () => {
  await expect(client.renameProfile('old', 'new')).rejects.toBeInstanceOf(UnsupportedCapabilityError)
})

test('RemoteHermesClient.deleteProfile throws UnsupportedCapabilityError', async () => {
  await expect(client.deleteProfile('work')).rejects.toBeInstanceOf(UnsupportedCapabilityError)
})

test('createProfile UnsupportedCapabilityError carries correct capability name', async () => {
  try {
    await client.createProfile('test')
  } catch (e) {
    expect(e).toBeInstanceOf(UnsupportedCapabilityError)
    expect((e as UnsupportedCapabilityError).capability).toBe('createProfile')
    expect((e as UnsupportedCapabilityError).mode).toBe('remote')
  }
})

test('renameProfile UnsupportedCapabilityError carries correct capability name', async () => {
  try {
    await client.renameProfile('a', 'b')
  } catch (e) {
    expect(e).toBeInstanceOf(UnsupportedCapabilityError)
    expect((e as UnsupportedCapabilityError).capability).toBe('renameProfile')
  }
})
