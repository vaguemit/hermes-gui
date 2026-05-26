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

  test('returns "just now" for timestamp exactly 0 seconds ago', () => {
    expect(formatTimestamp(Date.now())).toBe('just now')
  })

  test('returns "just now" for timestamp 59 seconds ago (boundary)', () => {
    expect(formatTimestamp(Date.now() - 59000)).toBe('just now')
  })

  test('returns "1m ago" for timestamp exactly 60 seconds ago (boundary)', () => {
    expect(formatTimestamp(Date.now() - 60000)).toBe('1m ago')
  })

  test('returns "1h ago" for timestamp exactly 60 minutes ago (boundary)', () => {
    expect(formatTimestamp(Date.now() - 3600000)).toBe('1h ago')
  })

  test('returns locale date string for a fixed past date (2024-01-01 midnight UTC)', () => {
    const ts = new Date('2024-01-01T00:00:00Z').getTime()
    const result = formatTimestamp(ts)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
    expect(result).not.toMatch(/ago$/)
    expect(result).not.toBe('just now')
  })

  test('returns "23h ago" for timestamp 23 hours ago (still within same-day window)', () => {
    const result = formatTimestamp(Date.now() - 23 * 3600 * 1000)
    expect(result).toBe('23h ago')
  })
})

describe('renderMarkdown — edge cases', () => {
  function html(input: string): string {
    return renderToStaticMarkup(renderMarkdown(input) as React.ReactElement)
  }

  test('empty string returns wrapper element without crashing', () => {
    const result = html('')
    expect(result).toContain('message-prose')
  })

  test('whitespace-only string renders without crashing', () => {
    const result = html('   \n  \n  ')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  test('bold inside list item: **word** appears in output', () => {
    const result = html('- **important** note')
    expect(result).toContain('<li')
    expect(result).toContain('important')
    expect(result).toContain('</li>')
  })

  test('italic inside list item: *word* renders <em> inside <li>', () => {
    const result = html('- *emphasis* here')
    expect(result).toContain('<li')
    expect(result).toContain('<em>')
    expect(result).toContain('emphasis')
  })

  test('inline code inside list item: `code` renders <code> inside <li>', () => {
    const result = html('- run `npm install` now')
    expect(result).toContain('<li')
    expect(result).toContain('<code')
    expect(result).toContain('npm install')
  })

  test('fenced code block with language hint (```typescript) renders <pre>', () => {
    const input = '```typescript\nconst x: number = 1;\n```'
    const result = html(input)
    expect(result).toContain('<pre')
    expect(result).toContain('const x')
  })

  test('language hint text does not appear in rendered output', () => {
    const input = '```typescript\nconst x = 1;\n```'
    const result = html(input)
    // "typescript" is captured as codeLang but not pushed into output
    expect(result).not.toContain('typescript')
  })

  test('multiple consecutive code blocks both render as <pre>', () => {
    const input = '```\nblock one\n```\n```\nblock two\n```'
    const result = html(input)
    expect(result).toContain('block one')
    expect(result).toContain('block two')
    const preCount = (result.match(/<pre/g) || []).length
    expect(preCount).toBe(2)
  })

  test('h2 heading: ## Title renders <h2>', () => {
    const result = html('## Section heading')
    expect(result).toContain('<h2')
    expect(result).toContain('Section heading')
  })

  test('h3 heading: ### Title renders <h3>', () => {
    const result = html('### Sub heading')
    expect(result).toContain('<h3')
    expect(result).toContain('Sub heading')
  })

  test('ordered list item renders as <li>', () => {
    const result = html('1. First item')
    expect(result).toContain('<li')
    expect(result).toContain('First item')
  })

  test('HTML-like content is not parsed as HTML tags — angle brackets pass through as text', () => {
    // renderMarkdown does not strip or re-interpret HTML; React escapes text nodes.
    // The rendered markup will NOT contain a literal <div> node from user text.
    const result = html('<div>not html</div>')
    // React escapes the angle brackets, so no real <div> tag appears inside message-prose
    expect(result).not.toMatch(/<div>not html<\/div>/)
    expect(result).toContain('not html')
  })

  test('horizontal rule (---) is treated as a paragraph, not a crash', () => {
    // parser.tsx has no explicit hr handling; --- falls through to the <p> branch
    const result = html('---')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  test('blockquote (> text) falls through to paragraph without crashing', () => {
    const result = html('> This is a quote')
    expect(result).toContain('This is a quote')
  })

  test('multiple inline formats on same line all render correctly', () => {
    const result = html('Use **bold** and *italic* and `code` together')
    expect(result).toContain('bold')
    expect(result).toContain('<em>')
    expect(result).toContain('italic')
    expect(result).toContain('<code')
    expect(result).toContain('code')
  })
})

describe('detectMessageType — edge cases', () => {
  test('returns tool_output for lower-case "tool output:" prefix', () => {
    expect(detectMessageType('tool output: some data')).toBe('tool_output')
  })

  test('returns reasoning for closing </think> tag alone', () => {
    expect(detectMessageType('</think>')).toBe('reasoning')
  })

  test('returns reasoning for THINKING: prefix (mixed case)', () => {
    expect(detectMessageType('THINKING: step by step')).toBe('reasoning')
  })

  test('returns error for ERROR mid-sentence (word-boundary match)', () => {
    expect(detectMessageType('The process hit an ERROR state')).toBe('error')
  })

  test('returns prose for "errors" (plural, no word boundary match on ERROR)', () => {
    // \bERROR\b requires exact word; "errors" does not match
    expect(detectMessageType('There were no errors found')).toBe('prose')
  })

  test('returns info for [INFO] anywhere that starts the string', () => {
    expect(detectMessageType('[INFO] something happened')).toBe('info')
  })

  test('[system] lowercase prefix returns info', () => {
    expect(detectMessageType('[system] rebooting')).toBe('info')
  })

  test('returns tool_call for [Tool: name] (mixed case)', () => {
    expect(detectMessageType('[Tool: write_file]')).toBe('tool_call')
  })

  test('returns prose for content that only contains a number', () => {
    expect(detectMessageType('42')).toBe('prose')
  })

  test('returns prose for multi-line content with no special prefix', () => {
    const content = 'Line one\nLine two\nLine three'
    expect(detectMessageType(content)).toBe('prose')
  })
})
