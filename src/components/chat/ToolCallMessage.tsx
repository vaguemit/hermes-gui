import React, { useState } from 'react'
import type { AccumulatedToolCall } from '../../lib/chat/types'

interface Props {
  toolCall: AccumulatedToolCall
}

const statusIcon: Record<string, string> = {
  pending: '⏳',
  running: '⚙️',
  done: '✅',
  error: '❌',
}

export function ToolCallMessage({ toolCall }: Props) {
  const [inputOpen, setInputOpen] = useState(false)
  const [outputOpen, setOutputOpen] = useState(false)

  const prettyJson = (raw: string) => {
    try { return JSON.stringify(JSON.parse(raw), null, 2) } catch { return raw }
  }

  return (
    <div className="tool-call-message" style={{ margin: '4px 0', padding: '6px 10px', borderLeft: '3px solid #6366f1', background: 'rgba(99,102,241,0.08)', borderRadius: '4px', fontSize: '0.85em' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span>{statusIcon[toolCall.status] ?? '⏳'}</span>
        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{toolCall.name}</span>
        <span style={{ color: '#9ca3af', fontSize: '0.8em' }}>({toolCall.id})</span>
      </div>

      {toolCall.input && (
        <div style={{ marginTop: '4px' }}>
          <button
            onClick={() => setInputOpen(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a5b4fc', fontSize: '0.8em', padding: 0 }}
          >
            {inputOpen ? '▾' : '▸'} Input
          </button>
          {inputOpen && (
            <pre style={{ margin: '4px 0 0', padding: '6px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px', overflow: 'auto', maxHeight: '200px', fontSize: '0.85em' }}>
              {prettyJson(toolCall.input)}
            </pre>
          )}
        </div>
      )}

      {toolCall.output !== undefined && (
        <div style={{ marginTop: '4px' }}>
          <button
            onClick={() => setOutputOpen(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#86efac', fontSize: '0.8em', padding: 0 }}
          >
            {outputOpen ? '▾' : '▸'} Output
          </button>
          {outputOpen && (
            <pre style={{ margin: '4px 0 0', padding: '6px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px', overflow: 'auto', maxHeight: '200px', fontSize: '0.85em' }}>
              {prettyJson(toolCall.output)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
