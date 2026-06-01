import { describe, it, expect } from 'vitest'
import type { StreamEvent } from '../../lib/hermes/types'
import { chatReducer } from '../../lib/chat/reducer'
import type { AccumulatedMessage } from '../../lib/chat/types'

// End-to-end simulation: feed a sequence of StreamEvents through the reducer
// and verify the final accumulated state matches expected output.

function runStream(events: StreamEvent[]): AccumulatedMessage[] {
  let state: AccumulatedMessage[] = []
  for (const ev of events) {
    // Map StreamEvent → SseEvent-compatible action for chatReducer
    state = chatReducer(state, ev as unknown as Parameters<typeof chatReducer>[1])
  }
  return state
}

describe('stream event sequence', () => {
  it('simple text response', () => {
    const events: StreamEvent[] = [
      { type: 'delta', content: 'Hello ' },
      { type: 'delta', content: 'world' },
      { type: 'done' },
    ]
    const result = runStream(events)
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('Hello world')
    expect(result[0].isStreaming).toBe(false)
  })

  it('response with tool call and result', () => {
    const events: StreamEvent[] = [
      { type: 'tool_call', id: 'tc1', name: 'bash', input: 'ls -la' },
      { type: 'tool_result', id: 'tc1', output: 'file.txt\nfoo.py' },
      { type: 'delta', content: 'Found 2 files.' },
      { type: 'done' },
    ]
    const result = runStream(events)
    expect(result[0].toolCalls).toHaveLength(1)
    expect(result[0].toolCalls[0].output).toBe('file.txt\nfoo.py')
    expect(result[0].toolCalls[0].status).toBe('done')
    expect(result[0].content).toBe('Found 2 files.')
  })

  it('response with reasoning block', () => {
    const events: StreamEvent[] = [
      { type: 'reasoning', content: 'Let me think...' },
      { type: 'delta', content: 'The answer is 42.' },
      { type: 'done' },
    ]
    const result = runStream(events)
    expect(result[0].reasoning).toBe('Let me think...')
    expect(result[0].content).toBe('The answer is 42.')
  })

  it('captures session_id', () => {
    const events: StreamEvent[] = [
      { type: 'delta', content: 'Hi' },
      { type: 'session_id', id: 'sess-xyz' },
      { type: 'done' },
    ]
    const result = runStream(events)
    expect(result[0].sessionId).toBe('sess-xyz')
  })

  it('error mid-stream stops streaming', () => {
    const events: StreamEvent[] = [
      { type: 'delta', content: 'Partial ' },
      { type: 'error', message: 'connection lost' },
    ]
    const result = runStream(events)
    expect(result[0].error).toBe('connection lost')
    expect(result[0].isStreaming).toBe(false)
  })

  it('done with usage info', () => {
    const events: StreamEvent[] = [
      { type: 'delta', content: 'ok' },
      { type: 'done', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
    ]
    const result = runStream(events)
    expect(result[0].usage).toMatchObject({ promptTokens: 10, completionTokens: 5, totalTokens: 15 })
  })
})
