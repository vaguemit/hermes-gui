import { test } from 'vitest'
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

  // These should NOT throw (they go over HTTP or are synchronous helpers)
  // We don't actually call network methods to avoid network dependency
  assert(typeof client.getHealth === 'function', 'getHealth is defined')
  assert(typeof client.streamChat === 'function', 'streamChat is defined')
  assert(typeof client.fetchModels === 'function', 'fetchModels is defined')
  assert(typeof client.getGatewayLatency === 'function', 'getGatewayLatency is defined')
  assert(typeof client.getGatewayUrl === 'function', 'getGatewayUrl is defined')
  assert(typeof client.getGatewayHeaders === 'function', 'getGatewayHeaders is defined')
  assert(client.getGatewayUrl() === 'http://localhost:8642', 'getGatewayUrl returns baseUrl')
  assert(typeof client.getGatewayHeaders() === 'object', 'getGatewayHeaders returns object')

  // These are IPC-only — must throw UnsupportedCapabilityError
  const ipcOnlyMethods: Array<{ name: string; call: () => Promise<unknown> }> = [
    { name: 'getInstallStatus', call: () => client.getInstallStatus() },
    { name: 'startGateway', call: () => client.startGateway() },
    { name: 'stopGateway', call: () => client.stopGateway() },
    { name: 'getSystemInfo', call: () => client.getSystemInfo() },
    { name: 'listSessions', call: () => client.listSessions() },
    { name: 'searchSessions', call: () => client.searchSessions('test') },
    { name: 'readSession', call: () => client.readSession('test') },
    { name: 'writeSession', call: () => client.writeSession('test', '{}') },
    { name: 'deleteSession', call: () => client.deleteSession('test') },
    { name: 'clearAllSessions', call: () => client.clearAllSessions() },
    { name: 'listProfiles', call: () => client.listProfiles() },
    { name: 'listProfileNames', call: () => client.listProfileNames() },
    { name: 'createProfile', call: () => client.createProfile('test') },
    { name: 'renameProfile', call: () => client.renameProfile('a', 'b') },
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
    { name: 'createCronJob', call: () => client.createCronJob({ description: 'x', schedule: '* * * * *', enabled: true }) },
    { name: 'updateCronJob', call: () => client.updateCronJob('id1', { enabled: false }) },
    { name: 'deleteCronJob', call: () => client.deleteCronJob('id1') },
    { name: 'enableCronJob', call: () => client.enableCronJob('id1') },
    { name: 'disableCronJob', call: () => client.disableCronJob('id1') },
    { name: 'listOllamaModels', call: () => client.listOllamaModels() },
    { name: 'getConnectionConfig', call: () => client.getConnectionConfig() },
    { name: 'setConnectionConfig', call: () => client.setConnectionConfig('local', '') },
    { name: 'streamCommand', call: () => client.streamCommand(['status'], () => {}) },
    { name: 'installHermes', call: () => client.installHermes(() => {}) },
    { name: 'getGatewayPort', call: () => client.getGatewayPort() },
    { name: 'setGatewayPort', call: () => client.setGatewayPort(8642) },
  ]

  for (const m of ipcOnlyMethods) {
    await assertUnsupported(m.call, m.name)
  }

  console.log('  All remote-isolation tests passed.')
}

test('RemoteHermesClient IPC isolation', async () => { await run() })
