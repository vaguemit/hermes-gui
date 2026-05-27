import type { HermesClient } from './client'

// Shared client reference kept in sync by HermesProvider.
// Lives in a separate module to avoid circular imports between index.ts and provider.tsx.
let _sharedClient: HermesClient | null = null

export function setSharedClient(client: HermesClient): void {
  _sharedClient = client
}

export function getSharedClient(): HermesClient | null {
  return _sharedClient
}
