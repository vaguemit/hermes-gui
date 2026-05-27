import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { HermesClient } from './client'
import type { HermesMode } from './types'
import { LocalHermesClient } from './local-client'
import { RemoteHermesClient } from './remote-client'
import { CliHermesClient } from './cli-client'
import { getBaseUrl, getAuthHeaders, setInMemoryConnectionConfig } from '../../api/hermes'
import { setSharedClient } from './shared'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export interface HermesContextValue {
  client: HermesClient
  mode: HermesMode
  setMode: (mode: HermesMode, remoteUrl?: string, apiKey?: string) => void
}

export const HermesClientContext = createContext<HermesContextValue | null>(null)

function makeClient(mode: HermesMode, remoteUrl: string, apiKey: string): HermesClient {
  if (mode === 'remote') return new RemoteHermesClient(remoteUrl, apiKey)
  if (mode === 'cli') return new CliHermesClient()
  // local — use IPC singleton in Tauri, fallback to RemoteHermesClient in browser
  if (isTauri()) return new LocalHermesClient()
  return new RemoteHermesClient(getBaseUrl(), (getAuthHeaders()['Authorization'] ?? '').replace('Bearer ', ''))
}

let _localSingleton: LocalHermesClient | null = null
function getLocalSingleton(): LocalHermesClient {
  if (!_localSingleton) _localSingleton = new LocalHermesClient()
  return _localSingleton
}

export function HermesProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<HermesMode>('local')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [apiKey, setApiKey] = useState('')

  // Load persisted mode from IPC at startup
  useEffect(() => {
    if (!isTauri()) return
    import('../../api/desktop').then(({ getConnectionConfig }) => {
      getConnectionConfig().then(cfg => {
        if (cfg.mode === 'remote' && cfg.remoteUrl) {
          import('../../api/desktop').then(({ getConnectionApiKey }) => {
            getConnectionApiKey().then(key => {
              setRemoteUrl(cfg.remoteUrl)
              setApiKey(key)
              setModeState('remote')
              setInMemoryConnectionConfig(cfg.remoteUrl, key)
            }).catch(() => {
              setRemoteUrl(cfg.remoteUrl)
              setModeState('remote')
            })
          })
        }
      }).catch(() => {})
    })
  }, [])

  const client = useMemo<HermesClient>(() => {
    const c = (mode === 'local' && isTauri()) ? getLocalSingleton() : makeClient(mode, remoteUrl, apiKey)
    setSharedClient(c)
    return c
  }, [mode, remoteUrl, apiKey])

  const setMode = useCallback((newMode: HermesMode, newRemoteUrl = '', newApiKey = '') => {
    setModeState(newMode)
    setRemoteUrl(newRemoteUrl)
    setApiKey(newApiKey)
    if (newMode === 'remote') {
      setInMemoryConnectionConfig(newRemoteUrl, newApiKey)
    } else {
      setInMemoryConnectionConfig('', '')
    }
  }, [])

  const value = useMemo<HermesContextValue>(() => ({ client, mode, setMode }), [client, mode, setMode])

  return (
    <HermesClientContext.Provider value={value}>
      {children}
    </HermesClientContext.Provider>
  )
}

export function useHermesContext(): HermesContextValue {
  const ctx = useContext(HermesClientContext)
  if (!ctx) throw new Error('useHermesContext must be used inside HermesProvider')
  return ctx
}

export function useHermesClient(): HermesClient {
  return useHermesContext().client
}

/** Convenience hook that returns the current connection mode without requiring the full context. */
export function useHermesMode(): HermesMode {
  return useHermesContext().mode
}
