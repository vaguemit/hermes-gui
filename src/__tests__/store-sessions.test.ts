import { test, expect, describe, beforeEach } from 'vitest'
import { useStore } from '../store'
import type { Message, CronJob } from '../store'

// Helper to build a minimal Message
function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    role: 'user',
    type: 'prose',
    content: 'Hello world',
    timestamp: 1000,
    ...overrides,
  }
}

beforeEach(() => {
  useStore.setState({
    sessions: [
      { id: 'test-session-1', title: 'Test', timestamp: 1000, messages: [] },
    ],
    activeSessionId: 'test-session-1',
    hermesSessionId: null,
    toasts: [],
    crons: [],
  })
})

describe('session store actions', () => {
  test('addSession creates a new session and makes it active', () => {
    useStore.getState().addSession()
    const { sessions, activeSessionId } = useStore.getState()
    // Should now have 2 sessions
    expect(sessions).toHaveLength(2)
    // New session is first (prepended)
    expect(sessions[0].title).toBe('New Conversation')
    expect(sessions[0].messages).toHaveLength(0)
    // Active session points to the new one
    expect(activeSessionId).toBe(sessions[0].id)
    // Old session still present
    expect(sessions[1].id).toBe('test-session-1')
  })

  test('deleteSession removes the session', () => {
    // Add a second session first so we don't end up with 0
    useStore.getState().addSession()
    const { sessions: withTwo } = useStore.getState()
    const newId = withTwo[0].id

    useStore.getState().deleteSession(newId)
    const { sessions } = useStore.getState()
    expect(sessions).toHaveLength(1)
    expect(sessions.find((s) => s.id === newId)).toBeUndefined()
  })

  test('deleteSession on active session switches active to next remaining', () => {
    // Add a second session (it becomes active)
    useStore.getState().addSession()
    const newId = useStore.getState().activeSessionId!

    // Delete the active session
    useStore.getState().deleteSession(newId)
    const { activeSessionId, sessions } = useStore.getState()

    // Active switches to the only remaining session
    expect(sessions).toHaveLength(1)
    expect(activeSessionId).toBe('test-session-1')
  })

  test('renameSession updates the title', () => {
    useStore.getState().renameSession('test-session-1', 'Renamed Title')
    const { sessions } = useStore.getState()
    expect(sessions[0].title).toBe('Renamed Title')
  })

  test('clearActiveSession clears messages and hermesSessionId', () => {
    // Seed a message
    useStore.getState().addMessage(makeMsg())
    // Set a hermesSessionId
    useStore.getState().setHermesSessionId('hms-abc')
    expect(useStore.getState().hermesSessionId).toBe('hms-abc')

    useStore.getState().clearActiveSession()
    const { sessions, hermesSessionId } = useStore.getState()
    const active = sessions.find((s) => s.id === 'test-session-1')!
    expect(active.messages).toHaveLength(0)
    expect(hermesSessionId).toBeNull()
  })

  test('addMessage adds to active session', () => {
    const msg = makeMsg({ id: 'msg-a', content: 'Hi', role: 'user' })
    useStore.getState().addMessage(msg)
    const { sessions } = useStore.getState()
    const active = sessions.find((s) => s.id === 'test-session-1')!
    expect(active.messages).toHaveLength(1)
    expect(active.messages[0].id).toBe('msg-a')
  })

  test('addMessage sets session title from first user message', () => {
    const msg = makeMsg({ id: 'msg-b', content: 'What is the weather today?', role: 'user' })
    useStore.getState().addMessage(msg)
    const { sessions } = useStore.getState()
    const active = sessions.find((s) => s.id === 'test-session-1')!
    expect(active.title).toBe('What is the weather today?')
  })

  test('addMessage does not overwrite title when session already has messages', () => {
    useStore.getState().addMessage(makeMsg({ id: 'msg-1', content: 'First message', role: 'user' }))
    useStore.getState().addMessage(makeMsg({ id: 'msg-2', content: 'Second message', role: 'user' }))
    const { sessions } = useStore.getState()
    const active = sessions.find((s) => s.id === 'test-session-1')!
    // Title stays from first message
    expect(active.title).toBe('First message')
    expect(active.messages).toHaveLength(2)
  })

  test('updateLastMessage patches the last message', () => {
    useStore.getState().addMessage(makeMsg({ id: 'msg-c', content: 'Streaming...', isStreaming: true }))
    useStore.getState().updateLastMessage({ content: 'Done', isStreaming: false })
    const { sessions } = useStore.getState()
    const active = sessions.find((s) => s.id === 'test-session-1')!
    const last = active.messages[active.messages.length - 1]
    expect(last.content).toBe('Done')
    expect(last.isStreaming).toBe(false)
  })

  test('updateLastMessage is a no-op when session has no messages', () => {
    // No messages in the session — should not throw
    expect(() => {
      useStore.getState().updateLastMessage({ content: 'oops' })
    }).not.toThrow()
    const { sessions } = useStore.getState()
    const active = sessions.find((s) => s.id === 'test-session-1')!
    expect(active.messages).toHaveLength(0)
  })

  test('setActiveSection changes nav', () => {
    useStore.getState().setActiveSection('gateway')
    expect(useStore.getState().activeSection).toBe('gateway')

    useStore.getState().setActiveSection('chat')
    expect(useStore.getState().activeSection).toBe('chat')
  })

  test('addToast adds a toast with the right message and type', () => {
    useStore.getState().addToast('Hello toast', 'success')
    const { toasts } = useStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('Hello toast')
    expect(toasts[0].type).toBe('success')
    expect(typeof toasts[0].id).toBe('string')
    expect(toasts[0].id.length).toBeGreaterThan(0)
  })

  test('removeToast removes only the targeted toast', () => {
    useStore.getState().addToast('Toast A', 'info')
    useStore.getState().addToast('Toast B', 'error')
    const idA = useStore.getState().toasts[0].id
    useStore.getState().removeToast(idA)
    const { toasts } = useStore.getState()
    expect(toasts).toHaveLength(1)
    expect(toasts[0].message).toBe('Toast B')
  })

  test('toggleCron flips active flag', () => {
    const cron: CronJob = {
      id: 'cron-1',
      schedule: 'Every hour',
      description: 'Test cron',
      platform: 'Telegram',
      active: false,
    }
    useStore.setState({ crons: [cron] })

    useStore.getState().toggleCron('cron-1')
    expect(useStore.getState().crons[0].active).toBe(true)

    useStore.getState().toggleCron('cron-1')
    expect(useStore.getState().crons[0].active).toBe(false)
  })

  test('setTokenUsage updates tokensUsed and contextWindow', () => {
    useStore.getState().setTokenUsage(42000, 128000)
    const { tokensUsed, contextWindow } = useStore.getState()
    expect(tokensUsed).toBe(42000)
    expect(contextWindow).toBe(128000)
  })
})
