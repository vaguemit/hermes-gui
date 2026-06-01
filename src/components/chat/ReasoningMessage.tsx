import React, { useState } from 'react'

interface Props {
  content: string
  defaultOpen?: boolean
}

export function ReasoningMessage({ content, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="reasoning-message" style={{ margin: '4px 0', padding: '6px 10px', borderLeft: '3px solid #f59e0b', background: 'rgba(245,158,11,0.07)', borderRadius: '4px', fontSize: '0.85em' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fbbf24', fontWeight: 500, fontSize: '0.85em', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>Reasoning</span>
      </button>
      {open && (
        <div style={{ marginTop: '6px', color: '#d1d5db', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {content}
        </div>
      )}
    </div>
  )
}
