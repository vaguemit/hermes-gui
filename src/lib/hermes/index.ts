import { LocalHermesClient } from './local-client'
import { RemoteHermesClient } from './remote-client'
import { getBaseUrl, getAuthHeaders } from '../../api/hermes'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

let _localClient: LocalHermesClient | null = null

/** Imperative accessor — prefer useHermesClient() inside React components. */
export function getHermesClient() {
  if (isTauri()) {
    if (!_localClient) _localClient = new LocalHermesClient()
    return _localClient
  }
  const url = getBaseUrl()
  const authHeader = getAuthHeaders()['Authorization'] ?? ''
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  return new RemoteHermesClient(url, apiKey)
}

// Re-export primary surfaces so components only need one import path
export { HermesProvider, HermesClientContext, useHermesClient, useHermesContext } from './provider'
export type { HermesContextValue } from './provider'
export type { HermesClient } from './client'
export * from './types'
export { UnsupportedCapabilityError } from './errors'
