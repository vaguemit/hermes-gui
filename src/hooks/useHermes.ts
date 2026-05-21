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
  }
}
