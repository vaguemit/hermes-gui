// Verifies that RemoteHermesClient throws UnsupportedCapabilityError (not generic Error)
// for all IPC-only methods.
// Run via: npx tsx src/lib/hermes/__tests__/remote-isolation.test.ts
import { RemoteHermesClient } from '../remote-client'
import { UnsupportedCapabilityError } from '../errors'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
  console.log(`  PASS: ${msg}`)
}

async function assertUnsupported(fn: () => Promise<unknown>, methodName: string) {
  try {
    await fn()
    throw new Error(`FAIL: ${methodName} should have thrown`)
  } catch (e) {
    assert(e instanceof UnsupportedCapabilityError, `${methodName} throws UnsupportedCapabilityError`)
    assert((e as UnsupportedCapabilityError).capability === methodName, `${methodName} error.capability is set`)
    assert((e as UnsupportedCapabilityError).mode === 'remote', `${methodName} error.mode === 'remote'`)
  }
}

async function run() {
  console.log('remote-isolation.test.ts')
  const client = new RemoteHermesClient('http://localhost:8642', '')

  // These should NOT throw (they go over HTTP)
  // We don't actually call them to avoid network dependency, just verify they're defined
  assert(typeof client.getHealth === 'function', 'getHealth is defined')
  assert(typeof client.streamChat === 'function', 'streamChat is defined')
  assert(typeof client.fetchModels === 'function', 'fetchModels is defined')
  assert(typeof client.getGatewayLatency === 'function', 'getGatewayLatency is defined')

  // These are IPC-only — must throw UnsupportedCapabilityError
  const ipcOnlyMethods: Array<{ name: string; call: () => Promise<unknown> }> = [
    { name: 'getInstallStatus', call: () => client.getInstallStatus() },
    { name: 'startGateway', call: () => client.startGateway() },
    { name: 'stopGateway', call: () => client.stopGateway() },
    { name: 'listSessions', call: () => client.listSessions() },
    { name: 'readSession', call: () => client.readSession('test') },
    { name: 'writeSession', call: () => client.writeSession('test', '{}') },
    { name: 'deleteSession', call: () => client.deleteSession('test') },
    { name: 'clearAllSessions', call: () => client.clearAllSessions() },
    { name: 'listProfiles', call: () => client.listProfiles() },
    { name: 'readFile', call: () => client.readFile('test.txt') },
    { name: 'writeFile', call: () => client.writeFile('test.txt', '') },
    { name: 'readConfig', call: () => client.readConfig() },
    { name: 'writeConfig', call: () => client.writeConfig('') },
    { name: 'readEnv', call: () => client.readEnv() },
    { name: 'writeEnv', call: () => client.writeEnv('K', 'V') },
    { name: 'detectApiKeys', call: () => client.detectApiKeys() },
    { name: 'runDoctor', call: () => client.runDoctor() },
    { name: 'checkUpdate', call: () => client.checkUpdate() },
    { name: 'runHermesCommand', call: () => client.runHermesCommand(['status']) },
    { name: 'listMemoryFiles', call: () => client.listMemoryFiles() },
    { name: 'readMemoryFile', call: () => client.readMemoryFile('test') },
    { name: 'deleteMemoryFile', call: () => client.deleteMemoryFile('test') },
    { name: 'listSkills', call: () => client.listSkills() },
    { name: 'listCronJobs', call: () => client.listCronJobs() },
    { name: 'getConnectionConfig', call: () => client.getConnectionConfig() },
    { name: 'setConnectionConfig', call: () => client.setConnectionConfig('local', '') },
    { name: 'streamCommand', call: () => client.streamCommand(['status'], () => {}) },
    { name: 'installHermes', call: () => client.installHermes(() => {}) },
  ]

  for (const m of ipcOnlyMethods) {
    await assertUnsupported(m.call, m.name)
  }

  console.log('  All remote-isolation tests passed.')
}

run().catch(e => { console.error(e.message) })
