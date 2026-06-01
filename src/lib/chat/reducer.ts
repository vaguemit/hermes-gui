// Accumulate streaming SseEvents into AccumulatedMessage state.
import type { SseEvent, AccumulatedMessage, AccumulatedToolCall } from './types'

export type ChatReducerAction = SseEvent

function makeEmptyAssistant(): AccumulatedMessage {
  return { role: 'assistant', content: '', toolCalls: [], isStreaming: true }
}

/**
 * Pure reducer: given current messages and a new SseEvent, return next messages.
 * Creates a new streaming assistant message when the first content arrives.
 */
export function chatReducer(
  messages: AccumulatedMessage[],
  action: ChatReducerAction,
): AccumulatedMessage[] {
  const last = messages[messages.length - 1]
  const ensureAssistant = (): AccumulatedMessage =>
    last?.role === 'assistant' ? last : makeEmptyAssistant()

  switch (action.type) {
    case 'delta': {
      const msg = ensureAssistant()
      const updated = { ...msg, content: msg.content + action.content }
      return last === msg ? [...messages.slice(0, -1), updated] : [...messages, updated]
    }

    case 'reasoning': {
      const msg = ensureAssistant()
      const updated = { ...msg, reasoning: (msg.reasoning ?? '') + action.content }
      return last === msg ? [...messages.slice(0, -1), updated] : [...messages, updated]
    }

    case 'tool_call': {
      const msg = ensureAssistant()
      const existing = msg.toolCalls.findIndex(tc => tc.id === action.id)
      let toolCalls: AccumulatedToolCall[]
      if (existing >= 0) {
        toolCalls = msg.toolCalls.map((tc, i) =>
          i === existing ? { ...tc, name: action.name || tc.name, input: tc.input + action.input } : tc
        )
      } else {
        toolCalls = [...msg.toolCalls, { id: action.id, name: action.name, input: action.input, status: 'pending' }]
      }
      const updated = { ...msg, toolCalls }
      return last === msg ? [...messages.slice(0, -1), updated] : [...messages, updated]
    }

    case 'tool_result': {
      if (!last || last.role !== 'assistant') return messages
      const toolCalls = last.toolCalls.map(tc =>
        tc.id === action.id ? { ...tc, output: action.output, status: 'done' as const } : tc
      )
      return [...messages.slice(0, -1), { ...last, toolCalls }]
    }

    case 'tool_progress': {
      if (!last || last.role !== 'assistant') return messages
      const toolCalls = last.toolCalls.map(tc =>
        tc.status === 'pending' ? { ...tc, status: 'running' as const } : tc
      )
      return [...messages.slice(0, -1), { ...last, toolCalls }]
    }

    case 'session_id': {
      if (!last || last.role !== 'assistant') return messages
      return [...messages.slice(0, -1), { ...last, sessionId: action.id }]
    }

    case 'usage': {
      if (!last || last.role !== 'assistant') return messages
      return [...messages.slice(0, -1), { ...last, usage: action.usage }]
    }

    case 'done': {
      if (!last || last.role !== 'assistant') return messages
      const toolCalls = last.toolCalls.map(tc =>
        tc.status !== 'done' ? { ...tc, status: 'done' as const } : tc
      )
      return [
        ...messages.slice(0, -1),
        { ...last, isStreaming: false, toolCalls, usage: action.usage ?? last.usage },
      ]
    }

    case 'error': {
      if (!last || last.role !== 'assistant') {
        return [...messages, { ...makeEmptyAssistant(), isStreaming: false, error: action.message }]
      }
      return [...messages.slice(0, -1), { ...last, isStreaming: false, error: action.message }]
    }

    default:
      return messages
  }
}

/** Append a user message to the accumulated message list. */
export function appendUserMessage(messages: AccumulatedMessage[], content: string): AccumulatedMessage[] {
  return [...messages, { role: 'user', content, toolCalls: [], isStreaming: false }]
}

/** Append a finalized (non-streaming) assistant message. */
export function appendAssistantMessage(messages: AccumulatedMessage[], content: string): AccumulatedMessage[] {
  return [...messages, { role: 'assistant', content, toolCalls: [], isStreaming: false }]
}

/** Returns true if any message in the list is still streaming. */
export function isAnyStreaming(messages: AccumulatedMessage[]): boolean {
  return messages.some(m => m.isStreaming)
}

/** Extract the last session ID from an accumulated message list. */
export function getLastSessionId(messages: AccumulatedMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].sessionId) return messages[i].sessionId
  }
  return undefined
}
