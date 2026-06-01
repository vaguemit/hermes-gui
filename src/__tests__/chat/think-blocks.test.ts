import { describe, it, expect } from 'vitest'
import { extractThinkBlocks, hasThinkBlocks } from '../../lib/chat/parser'

describe('extractThinkBlocks', () => {
  it('returns empty reasoning and original prose when no think tags', () => {
    const { reasoning, prose } = extractThinkBlocks('Hello world')
    expect(reasoning).toBe('')
    expect(prose).toBe('Hello world')
  })

  it('extracts a single think block', () => {
    const input = '<think>I need to think about this.</think>\nHere is my answer.'
    const { reasoning, prose } = extractThinkBlocks(input)
    expect(reasoning).toBe('I need to think about this.')
    expect(prose).toBe('Here is my answer.')
  })

  it('extracts multiple think blocks and concatenates them', () => {
    const input = '<think>First thought.</think> middle <think>Second thought.</think> end'
    const { reasoning, prose } = extractThinkBlocks(input)
    expect(reasoning).toContain('First thought.')
    expect(reasoning).toContain('Second thought.')
    expect(prose).toContain('middle')
    expect(prose).toContain('end')
    expect(prose).not.toContain('think')
  })

  it('handles case-insensitive think tags', () => {
    const { reasoning } = extractThinkBlocks('<THINK>uppercase</THINK>answer')
    expect(reasoning).toBe('uppercase')
  })

  it('handles multiline think blocks', () => {
    const input = '<think>\nLine 1\nLine 2\n</think>Response'
    const { reasoning, prose } = extractThinkBlocks(input)
    expect(reasoning).toContain('Line 1')
    expect(reasoning).toContain('Line 2')
    expect(prose).toBe('Response')
  })
})

describe('hasThinkBlocks', () => {
  it('returns true when think tag present', () => {
    expect(hasThinkBlocks('<think>thinking</think>answer')).toBe(true)
  })

  it('returns false for plain text', () => {
    expect(hasThinkBlocks('Hello world')).toBe(false)
  })
})
