// Shared types for the HermesClient abstraction layer.
// Field names on structs match Rust serde defaults (snake_case) to avoid mapping overhead.

export type GatewayStatus = 'unchecked' | 'connecting' | 'connected' | 'disconnected' | 'error'

export interface HealthStatus {
  healthy: boolean
  latencyMs?: number
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export type StreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'tool_call'; id: string; name: string; input: string }
  | { type: 'tool_result'; id: string; output: string }
  | { type: 'done'; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }
  | { type: 'error'; message: string }

export interface SessionMeta {
  name: string
  modified: string
  messageCount?: number
}

export interface ProfileMeta {
  name: string
  modified: string
}

export interface MemoryFileMeta {
  name: string
  size: number
  modified: string
}

export interface ModelConfig {
  provider: string
  model: string
  base_url: string
}

// Matches Rust HermesInstallStatus (snake_case from serde)
export interface HermesInstallStatus {
  installed: boolean
  configured: boolean
  api_healthy: boolean
  version: string | null
  hermes_home: string
  repo_path: string | null
  binary_path: string | null
  platform: string
  last_error: string | null
  model_configured: boolean
}

export interface CommandResult {
  success: boolean
  code: number | null
  command: string
  stdout: string
  stderr: string
}

export interface ApiKeyStatus {
  has_keys: boolean
  providers: string[]
}

export interface DoctorCheck {
  name: string
  passed: boolean
  message: string
}

export interface DoctorResult {
  ok: boolean
  checks: DoctorCheck[]
  raw: string
}

export interface UpdateInfo {
  current_version: string | null
  latest_version: string | null
  update_available: boolean
  release_url: string | null
}
