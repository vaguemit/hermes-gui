import { describe, it, expect } from 'vitest'

describe('HermesClient interface contract', () => {
  it('UnsupportedCapabilityError carries capability and mode', async () => {
    const { UnsupportedCapabilityError } = await import('../lib/hermes/errors')
    const err = new UnsupportedCapabilityError('testMethod', 'remote')
    expect(err.capability).toBe('testMethod')
    expect(err.mode).toBe('remote')
    expect(err).toBeInstanceOf(Error)
  })

  it('RemoteHermesClient is instantiable', async () => {
    const { RemoteHermesClient } = await import('../lib/hermes/remote-client')
    const client = new RemoteHermesClient('http://localhost:4000', 'test-key')
    expect(client.getGatewayUrl()).toBe('http://localhost:4000')
  })

  it('RemoteHermesClient getGatewayHeaders includes auth when key set', async () => {
    const { RemoteHermesClient } = await import('../lib/hermes/remote-client')
    const client = new RemoteHermesClient('http://localhost:4000', 'my-key')
    expect(client.getGatewayHeaders()['Authorization']).toBe('Bearer my-key')
  })

  it('RemoteHermesClient getGatewayHeaders empty when no key', async () => {
    const { RemoteHermesClient } = await import('../lib/hermes/remote-client')
    const client = new RemoteHermesClient('http://localhost:4000', '')
    expect(client.getGatewayHeaders()).toEqual({})
  })
})
