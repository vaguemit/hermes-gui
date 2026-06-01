// Typed representations of Hermes gateway SSE stream events and accumulated chat state.

export type SseEventType =
  | 'delta'
  | 'reasoning'
  | 'tool_call'
  | 'tool_result'
  | 'tool_progress'
  | 'session_id'
  | 'usage'
  | 'done'
  | 'error'

export interface UsageInfo {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export type SseEvent =
  | { type: 'delta'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'tool_call'; id: string; name: string; input: string }
  | { type: 'tool_result'; id: string; output: string }
  | { type: 'tool_progress'; tool: string }
  | { type: 'session_id'; id: string }
  | { type: 'usage'; usage: UsageInfo }
  | { type: 'done'; usage?: UsageInfo }
  | { type: 'error'; message: string }

export type ToolCallStatus = 'pending' | 'running' | 'done' | 'error'

export interface AccumulatedToolCall {
  id: string
  name: string
  input: string
  output?: string
  status: ToolCallStatus
}

export interface AccumulatedMessage {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  toolCalls: AccumulatedToolCall[]
  isStreaming: boolean
  sessionId?: string
  usage?: UsageInfo
  error?: string
  timestamp?: number
}

export interface ConversationMeta {
  title?: string
  sessionId?: string
  startedAt: number
  messageCount: number
}
