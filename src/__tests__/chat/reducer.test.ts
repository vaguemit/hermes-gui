import { describe, it, expect } from 'vitest'
import { chatReducer, appendUserMessage, appendAssistantMessage, isAnyStreaming, getLastSessionId } from '../../lib/chat/reducer'
import type { AccumulatedMessage } from '../../lib/chat/types'

const empty: AccumulatedMessage[] = []

describe('chatReducer', () => {
  it('creates new assistant message on first delta', () => {
    const next = chatReducer(empty, { type: 'delta', content: 'hi' })
    expect(next).toHaveLength(1)
    expect(next[0].role).toBe('assistant')
    expect(next[0].content).toBe('hi')
    expect(next[0].isStreaming).toBe(true)
  })

  it('accumulates delta content', () => {
    let state = chatReducer(empty, { type: 'delta', content: 'hel' })
    state = chatReducer(state, { type: 'delta', content: 'lo' })
    expect(state[0].content).toBe('hello')
  })

  it('accumulates reasoning content separately', () => {
    let state = chatReducer(empty, { type: 'reasoning', content: 'step 1' })
    state = chatReducer(state, { type: 'reasoning', content: ' step 2' })
    expect(state[0].reasoning).toBe('step 1 step 2')
    expect(state[0].content).toBe('')
  })

  it('adds tool_call to message', () => {
    const state = chatReducer(empty, { type: 'tool_call', id: 'tc1', name: 'bash', input: 'ls' })
    expect(state[0].toolCalls).toHaveLength(1)
    expect(state[0].toolCalls[0]).toMatchObject({ id: 'tc1', name: 'bash', input: 'ls', status: 'pending' })
  })

  it('accumulates tool_call input across chunks', () => {
    let state = chatReducer(empty, { type: 'tool_call', id: 'tc1', name: 'bash', input: 'ls' })
    state = chatReducer(state, { type: 'tool_call', id: 'tc1', name: 'bash', input: ' -la' })
    expect(state[0].toolCalls[0].input).toBe('ls -la')
  })

  it('updates tool_call with tool_result', () => {
    let state = chatReducer(empty, { type: 'tool_call', id: 'tc1', name: 'bash', input: 'ls' })
    state = chatReducer(state, { type: 'tool_result', id: 'tc1', output: 'file.txt' })
    expect(state[0].toolCalls[0].output).toBe('file.txt')
    expect(state[0].toolCalls[0].status).toBe('done')
  })

  it('captures session_id', () => {
    let state = chatReducer(empty, { type: 'delta', content: 'hi' })
    state = chatReducer(state, { type: 'session_id', id: 'sess-abc' })
    expect(state[0].sessionId).toBe('sess-abc')
  })

  it('marks message done and stops streaming', () => {
    let state = chatReducer(empty, { type: 'delta', content: 'hi' })
    state = chatReducer(state, { type: 'done', usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } })
    expect(state[0].isStreaming).toBe(false)
    expect(state[0].usage).toMatchObject({ promptTokens: 5, completionTokens: 3 })
  })

  it('marks all pending tool calls done on done event', () => {
    let state = chatReducer(empty, { type: 'tool_call', id: 'tc1', name: 'bash', input: 'ls' })
    state = chatReducer(state, { type: 'done' })
    expect(state[0].toolCalls[0].status).toBe('done')
  })

  it('captures error and stops streaming', () => {
    const state = chatReducer(empty, { type: 'error', message: 'oops' })
    expect(state[0].error).toBe('oops')
    expect(state[0].isStreaming).toBe(false)
  })
})

describe('appendUserMessage', () => {
  it('adds a user message', () => {
    const state = appendUserMessage(empty, 'hello')
    expect(state).toHaveLength(1)
    expect(state[0].role).toBe('user')
    expect(state[0].content).toBe('hello')
    expect(state[0].isStreaming).toBe(false)
  })
})

describe('appendAssistantMessage', () => {
  it('adds a non-streaming assistant message', () => {
    const state = appendAssistantMessage(empty, 'response')
    expect(state[0].role).toBe('assistant')
    expect(state[0].isStreaming).toBe(false)
    expect(state[0].content).toBe('response')
  })
})

describe('isAnyStreaming', () => {
  it('returns false for empty list', () => {
    expect(isAnyStreaming([])).toBe(false)
  })

  it('returns true if any message is streaming', () => {
    const msgs: AccumulatedMessage[] = [
      { role: 'assistant', content: '', toolCalls: [], isStreaming: true },
    ]
    expect(isAnyStreaming(msgs)).toBe(true)
  })

  it('returns false if no message is streaming', () => {
    const msgs: AccumulatedMessage[] = [
      { role: 'user', content: 'hi', toolCalls: [], isStreaming: false },
      { role: 'assistant', content: 'hello', toolCalls: [], isStreaming: false },
    ]
    expect(isAnyStreaming(msgs)).toBe(false)
  })
})

describe('getLastSessionId', () => {
  it('returns undefined for empty list', () => {
    expect(getLastSessionId([])).toBeUndefined()
  })

  it('returns the last session ID', () => {
    const msgs: AccumulatedMessage[] = [
      { role: 'assistant', content: 'a', toolCalls: [], isStreaming: false, sessionId: 'sess-1' },
      { role: 'assistant', content: 'b', toolCalls: [], isStreaming: false, sessionId: 'sess-2' },
    ]
    expect(getLastSessionId(msgs)).toBe('sess-2')
  })
})
