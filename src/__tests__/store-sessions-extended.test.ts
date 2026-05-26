import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../store'
import type { Message, ToolCall } from '../store'

function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    role: 'user',
    type: 'prose',
    content: 'Hello world',
    timestamp: Date.now(),
    ...overrides,
  }
}

function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'tc-1',
    name: 'read_file',
    input: '{"path": "/tmp/test.txt"}',
    status: 'pending',
    timestamp: Date.now(),
    ...overrides,
  }
}

beforeEach(() => {
  useStore.setState({
    sessions: [
      { id: 'sess-1', title: 'New Conversation', timestamp: 1000, messages: [] },
    ],
    activeSessionId: 'sess-1',
    hermesSessionId: null,
    toasts: [],
    crons: [],
  })
})

// ---------------------------------------------------------------------------
// 1. Title truncation
// ---------------------------------------------------------------------------
describe('session title truncation', () => {
  it('truncates a long first user message to 60 characters', () => {
    const longContent = 'A'.repeat(80)
    useStore.getState().addMessage(makeMsg({ id: 'm1', content: longContent, role: 'user' }))
    const session = useStore.getState().sessions.find((s) => s.id === 'sess-1')!
    expect(session.title).toHaveLength(60)
    expect(session.title).toBe('A'.repeat(60))
  })

  it('uses the full content when the first user message is under 60 chars', () => {
    const shortContent = 'Short message'
    useStore.getState().addMessage(makeMsg({ id: 'm1', content: shortContent, role: 'user' }))
    const session = useStore.getState().sessions.find((s) => s.id === 'sess-1')!
    expect(session.title).toBe('Short message')
  })

  it('uses exactly 60 chars when content is exactly 60 chars', () => {
    const exact = 'B'.repeat(60)
    useStore.getState().addMessage(makeMsg({ id: 'm1', content: exact, role: 'user' }))
    const session = useStore.getState().sessions.find((s) => s.id === 'sess-1')!
    expect(session.title).toBe(exact)
  })

  it('does not set title from a non-user (assistant) message', () => {
    useStore.getState().addMessage(
      makeMsg({ id: 'm1', content: 'I am the assistant', role: 'assistant', type: 'prose' })
    )
    const session = useStore.getState().sessions.find((s) => s.id === 'sess-1')!
    // Title stays at default because no user message was added
    expect(session.title).toBe('New Conversation')
  })

  it('keeps the default title when no messages have been added', () => {
    const session = useStore.getState().sessions.find((s) => s.id === 'sess-1')!
    expect(session.title).toBe('New Conversation')
  })
})

// ---------------------------------------------------------------------------
// 2. updateLastMessage
// ---------------------------------------------------------------------------
describe('updateLastMessage', () => {
  it('patches streaming content incrementally', () => {
    useStore.getState().addMessage(
      makeMsg({ id: 'm1', content: 'Hello', isStreaming: true, role: 'assistant', type: 'prose' })
    )
    useStore.getState().updateLastMessage({ content: 'Hello world' })
    const msgs = useStore.getState().sessions.find((s) => s.id === 'sess-1')!.messages
    expect(msgs[0].content).toBe('Hello world')
  })

  it('sets isStreaming to false when streaming completes', () => {
    useStore.getState().addMessage(
      makeMsg({ id: 'm1', content: '', isStreaming: true, role: 'assistant', type: 'prose' })
    )
    useStore.getState().updateLastMessage({ isStreaming: false, content: 'Final answer' })
    const last = useStore.getState().sessions.find((s) => s.id === 'sess-1')!.messages[0]
    expect(last.isStreaming).toBe(false)
    expect(last.content).toBe('Final answer')
  })

  it('patches toolCalls array onto the last message', () => {
    useStore.getState().addMessage(
      makeMsg({ id: 'm1', content: '', role: 'assistant', type: 'prose' })
    )
    const tc = makeToolCall({ id: 'tc-a', name: 'search', status: 'running' })
    useStore.getState().updateLastMessage({ toolCalls: [tc] })
    const last = useStore.getState().sessions.find((s) => s.id === 'sess-1')!.messages[0]
    expect(last.toolCalls).toHaveLength(1)
    expect(last.toolCalls![0].id).toBe('tc-a')
  })

  it('only patches the last message, not earlier ones', () => {
    useStore.getState().addMessage(makeMsg({ id: 'm1', content: 'First', role: 'user' }))
    useStore.getState().addMessage(
      makeMsg({ id: 'm2', content: 'Second', role: 'assistant', type: 'prose' })
    )
    useStore.getState().updateLastMessage({ content: 'Patched' })
    const msgs = useStore.getState().sessions.find((s) => s.id === 'sess-1')!.messages
    expect(msgs[0].content).toBe('First')
    expect(msgs[1].content).toBe('Patched')
  })
})

// ---------------------------------------------------------------------------
// 3. updateToolCall
// ---------------------------------------------------------------------------
describe('updateToolCall', () => {
  it('updates a tool call status to done inside the matching message', () => {
    const tc = makeToolCall({ id: 'tc-1', status: 'running' })
    useStore.getState().addMessage(
      makeMsg({ id: 'm1', role: 'assistant', type: 'tool_call', content: '', toolCalls: [tc] })
    )
    useStore.getState().updateToolCall('sess-1', 'tc-1', { status: 'done', output: 'file contents' })
    const msgs = useStore.getState().sessions.find((s) => s.id === 'sess-1')!.messages
    const updated = msgs[0].toolCalls!.find((t) => t.id === 'tc-1')!
    expect(updated.status).toBe('done')
    expect(updated.output).toBe('file contents')
  })

  it('leaves other tool calls in the same message untouched', () => {
    const tc1 = makeToolCall({ id: 'tc-1', status: 'running' })
    const tc2 = makeToolCall({ id: 'tc-2', status: 'pending', name: 'write_file' })
    useStore.getState().addMessage(
      makeMsg({ id: 'm1', role: 'assistant', type: 'tool_call', content: '', toolCalls: [tc1, tc2] })
    )
    useStore.getState().updateToolCall('sess-1', 'tc-1', { status: 'done' })
    const toolCalls = useStore.getState().sessions.find((s) => s.id === 'sess-1')!.messages[0].toolCalls!
    expect(toolCalls.find((t) => t.id === 'tc-2')!.status).toBe('pending')
  })

  it('is a no-op for a non-existent session id', () => {
    const tc = makeToolCall({ id: 'tc-1', status: 'running' })
    useStore.getState().addMessage(
      makeMsg({ id: 'm1', role: 'assistant', type: 'tool_call', content: '', toolCalls: [tc] })
    )
    useStore.getState().updateToolCall('wrong-session', 'tc-1', { status: 'done' })
    const updated = useStore.getState().sessions.find((s) => s.id === 'sess-1')!.messages[0].toolCalls![0]
    // Status must remain unchanged
    expect(updated.status).toBe('running')
  })

  it('is a no-op for a non-existent tool call id', () => {
    const tc = makeToolCall({ id: 'tc-1', status: 'running' })
    useStore.getState().addMessage(
      makeMsg({ id: 'm1', role: 'assistant', type: 'tool_call', content: '', toolCalls: [tc] })
    )
    useStore.getState().updateToolCall('sess-1', 'tc-NOPE', { status: 'done' })
    const updated = useStore.getState().sessions.find((s) => s.id === 'sess-1')!.messages[0].toolCalls![0]
    expect(updated.status).toBe('running')
  })
})

// ---------------------------------------------------------------------------
// 4. clearActiveSession
// ---------------------------------------------------------------------------
describe('clearActiveSession', () => {
  it('removes all messages from the active session', () => {
    useStore.getState().addMessage(makeMsg({ id: 'm1', content: 'Msg 1', role: 'user' }))
    useStore.getState().addMessage(makeMsg({ id: 'm2', content: 'Msg 2', role: 'user' }))
    useStore.getState().clearActiveSession()
    const session = useStore.getState().sessions.find((s) => s.id === 'sess-1')!
    expect(session.messages).toHaveLength(0)
  })

  it('preserves the session id after clearing', () => {
    useStore.getState().addMessage(makeMsg({ id: 'm1', content: 'Hello', role: 'user' }))
    useStore.getState().clearActiveSession()
    const { sessions } = useStore.getState()
    expect(sessions.find((s) => s.id === 'sess-1')).toBeDefined()
  })

  it('resets hermesSessionId to null', () => {
    useStore.getState().setHermesSessionId('hms-xyz')
    useStore.getState().clearActiveSession()
    expect(useStore.getState().hermesSessionId).toBeNull()
  })

  it('does not affect other sessions when clearing the active one', () => {
    // Add a second session with a message
    useStore.setState((state) => ({
      sessions: [
        ...state.sessions,
        { id: 'sess-2', title: 'Other', timestamp: 2000, messages: [makeMsg({ id: 'o1', content: 'Other msg' })] },
      ],
    }))
    useStore.getState().clearActiveSession()
    const other = useStore.getState().sessions.find((s) => s.id === 'sess-2')!
    expect(other.messages).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 5. Multiple sessions — switching and adding messages to each
// ---------------------------------------------------------------------------
describe('multiple sessions', () => {
  it('switching activeSessionId routes addMessage to the correct session', () => {
    // Add a second session manually
    useStore.setState((state) => ({
      sessions: [
        ...state.sessions,
        { id: 'sess-2', title: 'Second', timestamp: 2000, messages: [] },
      ],
    }))

    // Add to sess-1
    useStore.getState().setActiveSession('sess-1')
    useStore.getState().addMessage(makeMsg({ id: 'a1', content: 'To sess-1', role: 'user' }))

    // Switch and add to sess-2
    useStore.getState().setActiveSession('sess-2')
    useStore.getState().addMessage(makeMsg({ id: 'b1', content: 'To sess-2', role: 'user' }))

    const { sessions } = useStore.getState()
    expect(sessions.find((s) => s.id === 'sess-1')!.messages).toHaveLength(1)
    expect(sessions.find((s) => s.id === 'sess-2')!.messages).toHaveLength(1)
    expect(sessions.find((s) => s.id === 'sess-1')!.messages[0].content).toBe('To sess-1')
    expect(sessions.find((s) => s.id === 'sess-2')!.messages[0].content).toBe('To sess-2')
  })

  it('setActiveSession updates activeSessionId', () => {
    useStore.setState((state) => ({
      sessions: [
        ...state.sessions,
        { id: 'sess-2', title: 'Second', timestamp: 2000, messages: [] },
      ],
    }))
    useStore.getState().setActiveSession('sess-2')
    expect(useStore.getState().activeSessionId).toBe('sess-2')
  })
})

// ---------------------------------------------------------------------------
// 6. addMessage with all MessageType variants
// ---------------------------------------------------------------------------
describe('addMessage MessageType variants', () => {
  const types: Array<Message['type']> = [
    'prose', 'tool_call', 'tool_output', 'error', 'info', 'reasoning', 'system',
  ]

  types.forEach((type) => {
    it(`accepts type="${type}" without error`, () => {
      const msg = makeMsg({ id: `msg-${type}`, type, role: 'assistant', content: `${type} content` })
      expect(() => useStore.getState().addMessage(msg)).not.toThrow()
      const msgs = useStore.getState().sessions.find((s) => s.id === 'sess-1')!.messages
      expect(msgs).toHaveLength(1)
      expect(msgs[0].type).toBe(type)
    })
  })
})
