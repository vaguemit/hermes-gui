import { useCallback } from 'react'
import { useHermesClient } from '../lib/hermes'

// Thin hook that memoises frequently-used client methods.
// Components needing the full client can call useHermesClient() directly.
export function useHermes() {
  const client = useHermesClient()

  return {
    client,
    startGateway: useCallback(() => client.startGateway(), [client]),
    stopGateway: useCallback(() => client.stopGateway(), [client]),
    getHealth: useCallback(() => client.getHealth(), [client]),
    getGatewayLatency: useCallback(() => client.getGatewayLatency(), [client]),
    fetchModels: useCallback(() => client.fetchModels(), [client]),
    getInstallStatus: useCallback(() => client.getInstallStatus(), [client]),
    detectApiKeys: useCallback(() => client.detectApiKeys(), [client]),
    checkUpdate: useCallback(() => client.checkUpdate(), [client]),
    runDoctor: useCallback(() => client.runDoctor(), [client]),
    runHermesCommand: useCallback((args: string[], timeoutSecs?: number) => client.runHermesCommand(args, timeoutSecs), [client]),
    getConnectionConfig: useCallback(() => client.getConnectionConfig(), [client]),
    listSkills: useCallback(() => client.listSkills(), [client]),
    listMemoryFiles: useCallback(() => client.listMemoryFiles(), [client]),
    installHermes: useCallback((onLine: (line: string) => void) => client.installHermes(onLine), [client]),
    streamCommand: useCallback((args: string[], onLine: (line: string) => void, timeoutSecs?: number) => client.streamCommand(args, onLine, timeoutSecs), [client]),
    getGatewayPort: useCallback(() => client.getGatewayPort(), [client]),
    setGatewayPort: useCallback((port: number) => client.setGatewayPort(port), [client]),

    // Session CRUD
    listSessions: useCallback(() => client.listSessions(), [client]),
    readSession: useCallback((name: string) => client.readSession(name), [client]),
    writeSession: useCallback((name: string, content: string) => client.writeSession(name, content), [client]),
    deleteSession: useCallback((name: string) => client.deleteSession(name), [client]),
    clearAllSessions: useCallback(() => client.clearAllSessions(), [client]),

    // Profile CRUD
    listProfiles: useCallback(() => client.listProfiles(), [client]),
    readProfile: useCallback((name: string) => client.readProfile(name), [client]),
    writeProfile: useCallback((name: string, content: string) => client.writeProfile(name, content), [client]),
    deleteProfile: useCallback((name: string) => client.deleteProfile(name), [client]),

    // Config + Env
    readConfig: useCallback(() => client.readConfig(), [client]),
    writeConfig: useCallback((content: string) => client.writeConfig(content), [client]),
    readEnv: useCallback(() => client.readEnv(), [client]),
    writeEnv: useCallback((key: string, value: string) => client.writeEnv(key, value), [client]),

    // Files
    readFile: useCallback((path: string) => client.readFile(path), [client]),
    writeFile: useCallback((path: string, content: string) => client.writeFile(path, content), [client]),

    // Connection
    setConnectionConfig: useCallback((mode: 'local' | 'remote', remoteUrl: string, apiKey?: string) => client.setConnectionConfig(mode, remoteUrl, apiKey), [client]),

    // Model config
    getModelConfig: useCallback(() => client.getModelConfig(), [client]),
    setModelConfig: useCallback((provider: string, model: string, baseUrl: string) => client.setModelConfig(provider, model, baseUrl), [client]),

    // Memory
    readMemoryFile: useCallback((name: string) => client.readMemoryFile(name), [client]),
    deleteMemoryFile: useCallback((name: string) => client.deleteMemoryFile(name), [client]),

    // Cron
    listCronJobs: useCallback(() => client.listCronJobs(), [client]),

    // Raw HTTP helpers
    getGatewayUrl: useCallback(() => client.getGatewayUrl(), [client]),
    getGatewayHeaders: useCallback(() => client.getGatewayHeaders(), [client]),
  }
}
