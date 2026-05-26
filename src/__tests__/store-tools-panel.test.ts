import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../store'
import type { ToolCall } from '../store'

function makeTc(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    id: 'tc-1',
    name: 'read_file',
    input: '{"path": "/tmp/test.txt"}',
    output: '',
    status: 'pending',
    timestamp: 1000,
    ...overrides,
  }
}

beforeEach(() => {
  useStore.setState({ activeToolCalls: [] })
})

describe('active tool calls store', () => {
  it('activeToolCalls default is empty array', () => {
    expect(useStore.getState().activeToolCalls).toHaveLength(0)
  })

  it('addToolCall adds a tool call with id, name, status=pending, input, output=""', () => {
    const tc = makeTc({ id: 'tc-1', name: 'read_file', status: 'pending', input: '{"path": "/tmp/a"}', output: '' })
    useStore.getState().addToolCall(tc)
    const { activeToolCalls } = useStore.getState()
    expect(activeToolCalls).toHaveLength(1)
    expect(activeToolCalls[0].id).toBe('tc-1')
    expect(activeToolCalls[0].name).toBe('read_file')
    expect(activeToolCalls[0].status).toBe('pending')
    expect(activeToolCalls[0].input).toBe('{"path": "/tmp/a"}')
    expect(activeToolCalls[0].output).toBe('')
  })

  it('addToolCall with multiple tool calls accumulates correctly', () => {
    useStore.getState().addToolCall(makeTc({ id: 'tc-1', name: 'read_file' }))
    useStore.getState().addToolCall(makeTc({ id: 'tc-2', name: 'write_file' }))
    useStore.getState().addToolCall(makeTc({ id: 'tc-3', name: 'list_dir' }))
    const { activeToolCalls } = useStore.getState()
    expect(activeToolCalls).toHaveLength(3)
    expect(activeToolCalls[0].id).toBe('tc-1')
    expect(activeToolCalls[1].id).toBe('tc-2')
    expect(activeToolCalls[2].id).toBe('tc-3')
  })

  it('updateToolCallGlobal updates status to running on matched id', () => {
    useStore.getState().addToolCall(makeTc({ id: 'tc-1', status: 'pending' }))
    useStore.getState().updateToolCallGlobal('tc-1', { status: 'running' })
    const { activeToolCalls } = useStore.getState()
    expect(activeToolCalls[0].status).toBe('running')
  })

  it('updateToolCallGlobal updates output on matched id', () => {
    useStore.getState().addToolCall(makeTc({ id: 'tc-1', output: '' }))
    useStore.getState().updateToolCallGlobal('tc-1', { output: 'file contents here' })
    const { activeToolCalls } = useStore.getState()
    expect(activeToolCalls[0].output).toBe('file contents here')
  })

  it('updateToolCallGlobal with unknown id is a no-op (array length unchanged)', () => {
    useStore.getState().addToolCall(makeTc({ id: 'tc-1' }))
    useStore.getState().addToolCall(makeTc({ id: 'tc-2' }))
    useStore.getState().updateToolCallGlobal('does-not-exist', { status: 'done' })
    const { activeToolCalls } = useStore.getState()
    expect(activeToolCalls).toHaveLength(2)
    expect(activeToolCalls[0].status).toBe('pending')
    expect(activeToolCalls[1].status).toBe('pending')
  })

  it('clearToolCalls empties the activeToolCalls array', () => {
    useStore.getState().addToolCall(makeTc({ id: 'tc-1' }))
    useStore.getState().addToolCall(makeTc({ id: 'tc-2' }))
    useStore.getState().clearToolCalls()
    expect(useStore.getState().activeToolCalls).toHaveLength(0)
  })

  it('tool call status transitions: pending -> running -> done', () => {
    useStore.getState().addToolCall(makeTc({ id: 'tc-1', status: 'pending' }))
    expect(useStore.getState().activeToolCalls[0].status).toBe('pending')

    useStore.getState().updateToolCallGlobal('tc-1', { status: 'running' })
    expect(useStore.getState().activeToolCalls[0].status).toBe('running')

    useStore.getState().updateToolCallGlobal('tc-1', { status: 'done', output: 'result' })
    const tc = useStore.getState().activeToolCalls[0]
    expect(tc.status).toBe('done')
    expect(tc.output).toBe('result')
  })

  it('tool call with status=error stores correctly', () => {
    const tc = makeTc({ id: 'tc-err', status: 'error', output: 'timeout' })
    useStore.getState().addToolCall(tc)
    const stored = useStore.getState().activeToolCalls[0]
    expect(stored.status).toBe('error')
    expect(stored.output).toBe('timeout')
  })

  it('after clearToolCalls, addToolCall works again (not frozen)', () => {
    useStore.getState().addToolCall(makeTc({ id: 'tc-1' }))
    useStore.getState().clearToolCalls()
    expect(useStore.getState().activeToolCalls).toHaveLength(0)

    useStore.getState().addToolCall(makeTc({ id: 'tc-2', name: 'search' }))
    const { activeToolCalls } = useStore.getState()
    expect(activeToolCalls).toHaveLength(1)
    expect(activeToolCalls[0].id).toBe('tc-2')
  })
})
