// Parse raw SSE data lines from the Hermes gateway into typed SseEvent objects.
import type { SseEvent, UsageInfo } from './types'

/**
 * Parse a single SSE `data: ...` line into a typed SseEvent.
 * Returns null for lines that should be skipped (empty, [DONE] sentinel handled by caller).
 */
export function parseStreamLine(line: string): SseEvent | null {
  const trimmed = line.startsWith('data: ') ? line.slice(6).trim() : line.trim()
  if (!trimmed || trimmed === '[DONE]') return null

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }

  // Hermes custom events (non-OpenAI format)
  const eventType = parsed['type'] as string | undefined
  if (eventType === 'hermes.tool.progress') {
    const data = parsed['data'] as Record<string, string> | undefined
    const label = data?.label || data?.tool || ''
    const emoji = data?.emoji || ''
    return { type: 'tool_progress', tool: emoji ? `${emoji} ${label}` : label }
  }

  // Hermes native event stream format
  if (eventType === 'delta' && typeof parsed['content'] === 'string') {
    return { type: 'delta', content: parsed['content'] }
  }
  if (eventType === 'reasoning' && typeof parsed['content'] === 'string') {
    return { type: 'reasoning', content: parsed['content'] }
  }
  if (eventType === 'tool_call') {
    return {
      type: 'tool_call',
      id: String(parsed['id'] ?? ''),
      name: String(parsed['name'] ?? ''),
      input: String(parsed['input'] ?? ''),
    }
  }
  if (eventType === 'tool_result') {
    return {
      type: 'tool_result',
      id: String(parsed['id'] ?? ''),
      output: String(parsed['output'] ?? ''),
    }
  }
  if (eventType === 'session_id' && typeof parsed['id'] === 'string') {
    return { type: 'session_id', id: parsed['id'] }
  }
  if (eventType === 'done') {
    const u = parsed['usage'] as Record<string, number> | undefined
    return {
      type: 'done',
      usage: u ? { promptTokens: u['prompt_tokens'] ?? 0, completionTokens: u['completion_tokens'] ?? 0, totalTokens: u['total_tokens'] ?? 0 } : undefined,
    }
  }
  if (eventType === 'error' && typeof parsed['message'] === 'string') {
    return { type: 'error', message: parsed['message'] }
  }

  // OpenAI-compatible streaming format (choices array)
  const choices = parsed['choices'] as Array<Record<string, unknown>> | undefined
  if (choices?.length) {
    const choice = choices[0]
    const delta = choice['delta'] as Record<string, unknown> | undefined
    if (delta?.['content'] && typeof delta['content'] === 'string') {
      return { type: 'delta', content: delta['content'] }
    }
    const finishReason = choice['finish_reason'] as string | undefined
    if (finishReason === 'stop' || finishReason === 'tool_calls') {
      const u = parsed['usage'] as Record<string, number> | undefined
      const usage: UsageInfo | undefined = u
        ? { promptTokens: u['prompt_tokens'] ?? 0, completionTokens: u['completion_tokens'] ?? 0, totalTokens: u['total_tokens'] ?? 0 }
        : undefined
      return { type: 'done', usage }
    }
  }

  // Standalone usage chunk (stream_options: include_usage)
  if (parsed['usage'] && !choices) {
    const u = parsed['usage'] as Record<string, number>
    return {
      type: 'usage',
      usage: { promptTokens: u['prompt_tokens'] ?? 0, completionTokens: u['completion_tokens'] ?? 0, totalTokens: u['total_tokens'] ?? 0 },
    }
  }

  if (parsed['error']) {
    const err = parsed['error'] as Record<string, string> | string
    const msg = typeof err === 'string' ? err : err['message'] || JSON.stringify(err)
    return { type: 'error', message: msg }
  }

  return null
}

/** Returns true if the line signals end-of-stream ([DONE] sentinel). */
export function isDoneMarker(line: string): boolean {
  const trimmed = line.startsWith('data: ') ? line.slice(6).trim() : line.trim()
  return trimmed === '[DONE]'
}

/** Extract content from legacy `<think>...</think>` tags in a message string. */
export function extractThinkBlocks(content: string): { reasoning: string; prose: string } {
  const thinkRe = /<think>([\s\S]*?)<\/think>/gi
  let reasoning = ''
  const prose = content.replace(thinkRe, (_, inner: string) => {
    reasoning += (reasoning ? '\n' : '') + inner.trim()
    return ''
  }).trim()
  return { reasoning, prose }
}

/** Returns true if content contains any `<think>` blocks. */
export function hasThinkBlocks(content: string): boolean {
  return /<think>/i.test(content)
}
