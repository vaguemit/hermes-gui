import { test, expect, describe } from 'vitest'
import { detectMessageType, formatTimestamp } from '../utils/parser'

describe('detectMessageType', () => {
  test('returns prose for plain text', () => {
    expect(detectMessageType('Hello, how are you?')).toBe('prose')
  })

  test('returns prose for empty string', () => {
    expect(detectMessageType('')).toBe('prose')
  })

  test('returns tool_call for [tool: ...] prefix (case-insensitive)', () => {
    expect(detectMessageType('[tool: bash]')).toBe('tool_call')
    expect(detectMessageType('[TOOL: read_file]')).toBe('tool_call')
  })

  test('returns tool_call for "Tool:" prefix', () => {
    expect(detectMessageType('Tool: read_file {"path": "/tmp/x"}')).toBe('tool_call')
  })

  test('returns tool_output for "Tool output:" prefix', () => {
    expect(detectMessageType('Tool output: {"result": 42}')).toBe('tool_output')
  })

  test('returns error for content containing ERROR keyword', () => {
    expect(detectMessageType('Process failed with ERROR code 1')).toBe('error')
  })

  test('returns error for "Error:" prefix (case-insensitive)', () => {
    expect(detectMessageType('Error: cannot find module')).toBe('error')
  })

  test('returns reasoning for <think> tag', () => {
    expect(detectMessageType('<think>Let me reason through this</think>')).toBe('reasoning')
  })

  test('returns reasoning for "Thinking:" prefix (case-insensitive)', () => {
    expect(detectMessageType('Thinking: this might work')).toBe('reasoning')
  })

  test('returns info for [INFO] prefix (case-insensitive)', () => {
    expect(detectMessageType('[INFO] server started')).toBe('info')
    expect(detectMessageType('[info] all good')).toBe('info')
  })

  test('returns info for [SYSTEM] prefix', () => {
    expect(detectMessageType('[SYSTEM] gateway connected')).toBe('info')
  })

  test('plain text with code block markers is still prose (no [tool:] prefix)', () => {
    expect(detectMessageType('```python\nprint("hello")\n```')).toBe('prose')
  })
})

describe('formatTimestamp', () => {
  test('returns "just now" for timestamps less than 60 seconds ago', () => {
    const ts = Date.now() - 5000
    expect(formatTimestamp(ts)).toBe('just now')
  })

  test('returns minutes ago for timestamps 1-59 minutes ago', () => {
    const ts = Date.now() - 5 * 60 * 1000
    const result = formatTimestamp(ts)
    expect(result).toMatch(/^\d+m ago$/)
    expect(result).toBe('5m ago')
  })

  test('returns hours ago for timestamps 1-23 hours ago', () => {
    const ts = Date.now() - 3 * 3600 * 1000
    const result = formatTimestamp(ts)
    expect(result).toMatch(/^\d+h ago$/)
    expect(result).toBe('3h ago')
  })

  test('returns a locale date string for timestamps older than 24 hours', () => {
    const ts = Date.now() - 2 * 86400 * 1000
    const result = formatTimestamp(ts)
    // Should be a non-empty date string, not one of the relative formats
    expect(result).toBeTruthy()
    expect(result).not.toMatch(/ago$/)
    expect(result).not.toBe('just now')
  })

  test('returns a non-empty string for any valid timestamp', () => {
    const timestamps = [
      Date.now(),
      Date.now() - 1000,
      Date.now() - 10 * 60 * 1000,
      Date.now() - 2 * 3600 * 1000,
      new Date('2024-01-01').getTime(),
    ]
    for (const ts of timestamps) {
      const result = formatTimestamp(ts)
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    }
  })
})
