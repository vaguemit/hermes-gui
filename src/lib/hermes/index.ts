import { createContext, useContext } from 'react'
import type { HermesClient } from './client'
import { LocalHermesClient } from './local-client'

// Single shared instance — avoids re-constructing on every render.
// Phase 7 replaces this with a mode-aware factory that reads from the Zustand store.
const _defaultClient: HermesClient = new LocalHermesClient()

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
