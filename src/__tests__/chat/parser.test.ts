import { parseStreamLine, isDoneMarker } from '../../lib/chat/parser'

describe('parseStreamLine', () => {
  it('returns null for empty lines', () => {
    expect(parseStreamLine('')).toBeNull()
    expect(parseStreamLine('   ')).toBeNull()
    expect(parseStreamLine('data: ')).toBeNull()
  })

  it('returns null for [DONE] sentinel', () => {
    expect(parseStreamLine('data: [DONE]')).toBeNull()
    expect(parseStreamLine('[DONE]')).toBeNull()
  })

  it('parses Hermes native delta event', () => {
    const line = 'data: {"type":"delta","content":"hello"}'
    expect(parseStreamLine(line)).toEqual({ type: 'delta', content: 'hello' })
  })

  it('parses Hermes native reasoning event', () => {
    const line = 'data: {"type":"reasoning","content":"thinking..."}'
    expect(parseStreamLine(line)).toEqual({ type: 'reasoning', content: 'thinking...' })
  })

  it('parses Hermes native tool_call event', () => {
    const line = 'data: {"type":"tool_call","id":"tc1","name":"bash","input":"ls -la"}'
    expect(parseStreamLine(line)).toEqual({ type: 'tool_call', id: 'tc1', name: 'bash', input: 'ls -la' })
  })

  it('parses Hermes native tool_result event', () => {
    const line = 'data: {"type":"tool_result","id":"tc1","output":"file.txt"}'
    expect(parseStreamLine(line)).toEqual({ type: 'tool_result', id: 'tc1', output: 'file.txt' })
  })

  it('parses session_id event', () => {
    const line = 'data: {"type":"session_id","id":"abc123"}'
    expect(parseStreamLine(line)).toEqual({ type: 'session_id', id: 'abc123' })
  })

  it('parses done event with usage', () => {
    const line = 'data: {"type":"done","usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}'
    expect(parseStreamLine(line)).toEqual({
      type: 'done',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    })
  })

  it('parses error event', () => {
    const line = 'data: {"type":"error","message":"rate limit exceeded"}'
    expect(parseStreamLine(line)).toEqual({ type: 'error', message: 'rate limit exceeded' })
  })

  it('parses OpenAI-compat delta chunk', () => {
    const line = 'data: {"choices":[{"delta":{"content":"world"},"finish_reason":null}]}'
    expect(parseStreamLine(line)).toEqual({ type: 'delta', content: 'world' })
  })

  it('parses OpenAI-compat finish_reason stop as done', () => {
    const line = 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}'
    const result = parseStreamLine(line)
    expect(result?.type).toBe('done')
  })

  it('parses tool_progress hermes custom event', () => {
    const line = 'data: {"type":"hermes.tool.progress","data":{"emoji":"🔧","label":"running bash"}}'
    const result = parseStreamLine(line)
    expect(result?.type).toBe('tool_progress')
    expect((result as { type: 'tool_progress'; tool: string }).tool).toContain('running bash')
  })

  it('returns null for malformed JSON', () => {
    expect(parseStreamLine('data: {not json}')).toBeNull()
  })
})

describe('isDoneMarker', () => {
  it('returns true for [DONE] sentinel', () => {
    expect(isDoneMarker('data: [DONE]')).toBe(true)
    expect(isDoneMarker('[DONE]')).toBe(true)
  })

  it('returns false for regular data', () => {
    expect(isDoneMarker('data: {"type":"delta"}')).toBe(false)
  })
})
