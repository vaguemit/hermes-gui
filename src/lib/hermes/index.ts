import { createContext, useContext } from 'react'
import type { HermesClient } from './client'
import { LocalHermesClient } from './local-client'
import { RemoteHermesClient } from './remote-client'
import { getBaseUrl, getAuthHeaders } from '../../api/hermes'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

let _localClient: LocalHermesClient | null = null

export function getHermesClient(): HermesClient {
  if (isTauri()) {
    if (!_localClient) _localClient = new LocalHermesClient()
    return _localClient
  }
  // Browser mode: always read current in-memory config (populated by App.tsx at startup)
  const url = getBaseUrl()
  const authHeader = getAuthHeaders()['Authorization'] ?? ''
  const apiKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  return new RemoteHermesClient(url, apiKey)
}

export const HermesClientContext = createContext<HermesClient>(getHermesClient())

export function useHermesClient(): HermesClient {
  return useContext(HermesClientContext)
}

// Re-export so components only need one import
export type { HermesClient } from './client'
export * from './types'
