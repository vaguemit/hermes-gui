// Export an accumulated conversation to Markdown text.
import type { AccumulatedMessage } from './types'

function formatRole(role: 'user' | 'assistant'): string {
  return role === 'user' ? '**You**' : '**Hermes**'
}

function formatToolCall(id: string, name: string, input: string, output?: string): string {
  let block = `\`\`\`tool-call\nname: ${name}\nid: ${id}\ninput: ${input}\n\`\`\``
  if (output !== undefined) {
    block += `\n\`\`\`tool-result\n${output}\n\`\`\``
  }
  return block
}

/** Serialize an accumulated conversation to a JSON string. */
export function exportToJson(messages: AccumulatedMessage[], title?: string): string {
  return JSON.stringify(
    { title: title ?? 'Exported conversation', exportedAt: new Date().toISOString(), messages },
    null,
    2,
  )
}

/** Render an accumulated conversation to a Markdown string. */
export function exportToMarkdown(messages: AccumulatedMessage[], title?: string): string {
  const lines: string[] = []

  if (title) {
    lines.push(`# ${title}`, '')
  }

  const timestamp = new Date().toLocaleString()
  lines.push(`*Exported ${timestamp}*`, '')

  for (const msg of messages) {
    lines.push(`### ${formatRole(msg.role)}`, '')

    if (msg.reasoning) {
      lines.push('<details><summary>Reasoning</summary>', '', msg.reasoning, '', '</details>', '')
    }

    if (msg.content) {
      lines.push(msg.content, '')
    }

    for (const tc of msg.toolCalls) {
      lines.push(formatToolCall(tc.id, tc.name, tc.input, tc.output), '')
    }

    if (msg.error) {
      lines.push(`> **Error:** ${msg.error}`, '')
    }

    lines.push('---', '')
  }

  return lines.join('\n')
}
