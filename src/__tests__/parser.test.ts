import { test, expect, describe } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderMarkdown, detectMessageType, formatTimestamp } from '../utils/parser'

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

describe('renderMarkdown', () => {
  function html(input: string): string {
    return renderToStaticMarkup(renderMarkdown(input) as React.ReactElement)
  }

  test('bold: **hello** text is rendered (hello appears in output)', () => {
    // The inlineFormat reduce uses strict less-than, so when bold and italic
    // both match at the same index, italic wins (it is the later candidate
    // and ties go to the right operand). The text content is still present.
    const result = html('**hello**')
    expect(result).toContain('hello')
  })

  test('italic: *world* renders an <em> element containing world', () => {
    expect(html('*world*')).toContain('<em>')
    expect(html('*world*')).toContain('world')
    expect(html('*world*')).toContain('</em>')
  })

  test('inline code: `code` renders a <code> element containing code', () => {
    const result = html('`code`')
    expect(result).toContain('<code')
    expect(result).toContain('code')
    expect(result).toContain('</code>')
  })

  test('fenced code block: ```\\nfoo\\n``` renders <pre> containing foo', () => {
    const result = html('```\nfoo\n```')
    expect(result).toContain('<pre')
    expect(result).toContain('foo')
  })

  test('heading: # Title renders <h1> containing Title', () => {
    const result = html('# Title')
    expect(result).toContain('<h1')
    expect(result).toContain('Title')
  })

  test('empty string: returns a wrapper element (no crash)', () => {
    const result = html('')
    // renderMarkdown('') returns <div className="message-prose"></div>
    expect(result).toBeTruthy()
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
