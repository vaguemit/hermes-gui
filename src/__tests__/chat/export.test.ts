import { describe, it, expect } from 'vitest'
import { exportToMarkdown } from '../../lib/chat/export'
import type { AccumulatedMessage } from '../../lib/chat/types'

describe('exportToMarkdown', () => {
  it('exports empty conversation', () => {
    const result = exportToMarkdown([])
    expect(typeof result).toBe('string')
  })

  it('exports user and assistant messages', () => {
    const messages: AccumulatedMessage[] = [
      { role: 'user', content: 'Hello', toolCalls: [], isStreaming: false },
      { role: 'assistant', content: 'Hi there!', toolCalls: [], isStreaming: false },
    ]
    const result = exportToMarkdown(messages)
    expect(result).toContain('**You**')
    expect(result).toContain('**Hermes**')
    expect(result).toContain('Hello')
    expect(result).toContain('Hi there!')
  })

  it('includes title when provided', () => {
    const result = exportToMarkdown([], 'My Chat')
    expect(result).toContain('# My Chat')
  })

  it('includes tool call input and output', () => {
    const messages: AccumulatedMessage[] = [
      {
        role: 'assistant',
        content: 'Done.',
        toolCalls: [{ id: 'tc1', name: 'bash', input: 'ls', output: 'file.txt', status: 'done' }],
        isStreaming: false,
      },
    ]
    const result = exportToMarkdown(messages)
    expect(result).toContain('bash')
    expect(result).toContain('file.txt')
  })

  it('includes reasoning in details block', () => {
    const messages: AccumulatedMessage[] = [
      { role: 'assistant', content: 'answer', reasoning: 'my thinking', toolCalls: [], isStreaming: false },
    ]
    const result = exportToMarkdown(messages)
    expect(result).toContain('Reasoning')
    expect(result).toContain('my thinking')
  })

  it('includes error message', () => {
    const messages: AccumulatedMessage[] = [
      { role: 'assistant', content: '', error: 'rate limit', toolCalls: [], isStreaming: false },
    ]
    const result = exportToMarkdown(messages)
    expect(result).toContain('rate limit')
  })
})
