import { createContext, useContext } from 'react'
import type { HermesClient } from './client'
import { LocalHermesClient } from './local-client'
import { RemoteHermesClient } from './remote-client'

function createDefaultClient(): HermesClient {
  // In Tauri, always use LocalHermesClient (IPC + streamChat via getBaseUrl() for remote)
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    return new LocalHermesClient()
  }
  // In browser/web mode, use RemoteHermesClient with whatever URL is configured
  const url = localStorage.getItem('hermes_remote_url') || 'http://127.0.0.1:8642'
  const key = localStorage.getItem('hermes_remote_api_key') || ''
  return new RemoteHermesClient(url, key)
}

const _defaultClient: HermesClient = createDefaultClient()

export function getHermesClient(): HermesClient {
  return _defaultClient
}

export const HermesClientContext = createContext<HermesClient>(_defaultClient)

export function useHermesClient(): HermesClient {
  return useContext(HermesClientContext)
}

// Re-export so components only need one import
export type { HermesClient } from './client'
export * from './types'
