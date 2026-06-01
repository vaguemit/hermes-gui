import React from 'react'
import { filterCommands } from '../../lib/chat/slash-commands'
import type { SlashCommandDef } from '../../lib/chat/slash-commands'

interface Props {
  prefix: string
  onSelect: (command: SlashCommandDef) => void
  onClose: () => void
}

const categoryColor: Record<string, string> = {
  chat: '#60a5fa',
  agent: '#a78bfa',
  tools: '#34d399',
  info: '#fbbf24',
  navigation: '#f472b6',
}

export function SlashCommandMenu({ prefix, onSelect, onClose }: Props) {
  const commands = filterCommands(prefix)
  if (!commands.length) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        background: '#1e1e2e',
        border: '1px solid #374151',
        borderRadius: '8px',
        marginBottom: '4px',
        maxHeight: '240px',
        overflowY: 'auto',
        zIndex: 50,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.4)',
      }}
    >
      {commands.map(cmd => (
        <button
          key={cmd.name}
          onClick={() => { onSelect(cmd); onClose() }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            width: '100%',
            padding: '8px 12px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textAlign: 'left',
            borderBottom: '1px solid #2d2d3d',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#2d2d3d')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <span style={{ fontFamily: 'monospace', fontWeight: 600, color: categoryColor[cmd.category] ?? '#e2e8f0', minWidth: '100px' }}>
            {cmd.name}
            {cmd.args && <span style={{ color: '#9ca3af', fontWeight: 400 }}> {cmd.args}</span>}
          </span>
          <span style={{ color: '#9ca3af', fontSize: '0.85em', flex: 1 }}>{cmd.description}</span>
          {cmd.local && (
            <span style={{ color: '#6b7280', fontSize: '0.75em', background: '#374151', padding: '1px 5px', borderRadius: '3px' }}>local</span>
          )}
        </button>
      ))}
    </div>
  )
}
