import React from 'react'
import { Square } from 'lucide-react'

interface Props {
  onStop: () => void
  visible: boolean
}

export function StopButton({ onStop, visible }: Props) {
  if (!visible) return null
  return (
    <button
      onClick={onStop}
      title="Stop generation (Escape)"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: '6px',
        padding: '4px 10px',
        color: '#ef4444',
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: 500,
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
    >
      <Square size={11} />
      Stop
    </button>
  )
}
