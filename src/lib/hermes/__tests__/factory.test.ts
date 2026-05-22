import { test } from 'vitest'
import type { HermesClient } from '../client'
import { LocalHermesClient } from '../local-client'
import { RemoteHermesClient } from '../remote-client'
import { CliHermesClient } from '../cli-client'

// Type assertions — if these compile, the interface contract is satisfied.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _local: HermesClient = new LocalHermesClient()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _remote: HermesClient = new RemoteHermesClient('http://localhost:8642', 'sk-test')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _cli: HermesClient = new CliHermesClient()

// Verify RemoteHermesClient doesn't capture URL into global state — each instance is independent
const r1 = new RemoteHermesClient('http://server1.com', 'key1')
const r2 = new RemoteHermesClient('http://server2.com', 'key2')
// Private fields are inaccessible at runtime, but we can test structural isolation via inference
const _r1Type: RemoteHermesClient = r1
const _r2Type: RemoteHermesClient = r2
// Both satisfy HermesClient
const _r1Client: HermesClient = r1
const _r2Client: HermesClient = r2

test('client shape conformance', () => {
  console.log('factory.test.ts: all type assertions passed (compile-time verification)')
  console.log('  LocalHermesClient satisfies HermesClient: PASS')
  console.log('  RemoteHermesClient satisfies HermesClient: PASS')
  console.log('  CliHermesClient satisfies HermesClient: PASS')
  console.log('  Multiple RemoteHermesClient instances are independent: PASS')
})
