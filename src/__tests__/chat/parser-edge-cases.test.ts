import { describe, it, expect } from 'vitest'
import { parseStreamLine } from '../../lib/chat/parser'

// Edge cases and robustness tests for the SSE stream parser.

describe('parseStreamLine edge cases', () => {
  it('handles data prefix without content', () => {
    expect(parseStreamLine('data:')).toBeNull()
    expect(parseStreamLine('data:   ')).toBeNull()
  })

  it('handles raw JSON without data prefix', () => {
    const result = parseStreamLine('{"type":"delta","content":"direct"}')
    expect(result).toEqual({ type: 'delta', content: 'direct' })
  })

  it('ignores unknown event types gracefully', () => {
    const result = parseStreamLine('data: {"type":"unknown_future_event","data":{}}')
    expect(result).toBeNull()
  })

  it('handles empty string input', () => {
    expect(parseStreamLine('')).toBeNull()
  })

  it('handles unicode content in delta', () => {
    const result = parseStreamLine('data: {"type":"delta","content":"こんにちは 🌸"}')
    expect(result).toEqual({ type: 'delta', content: 'こんにちは 🌸' })
  })

  it('handles done event without usage', () => {
    const result = parseStreamLine('data: {"type":"done"}')
    expect(result).toEqual({ type: 'done', usage: undefined })
  })

  it('handles error event with message', () => {
    const result = parseStreamLine('data: {"type":"error","message":"token limit reached"}')
    expect(result).toEqual({ type: 'error', message: 'token limit reached' })
  })

  it('handles top-level error field in chunk', () => {
    const result = parseStreamLine('data: {"error":{"message":"invalid key"}}')
    expect(result?.type).toBe('error')
    expect((result as { type: 'error'; message: string }).message).toContain('invalid key')
  })
})
