import React, { useState } from 'react'

interface Props {
  role: 'user' | 'assistant'
  content: string
  onRetry?: () => void
  onCopy?: () => void
  isStreaming?: boolean
}

export function MessageActions({ role, content, onRetry, onCopy, isStreaming }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (onCopy) { onCopy(); return }
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* ignore */ }
  }

  return (
    <div
      className="message-actions"
      style={{ display: 'flex', gap: '4px', opacity: 0, transition: 'opacity 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
    >
      <button
        onClick={handleCopy}
        title="Copy"
        disabled={isStreaming}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#86efac' : '#6b7280', fontSize: '0.8em', padding: '2px 5px', borderRadius: '3px' }}
      >
        {copied ? '✓' : '⎘'}
      </button>
      {role === 'user' && onRetry && (
        <button
          onClick={onRetry}
          title="Retry"
          disabled={isStreaming}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.8em', padding: '2px 5px', borderRadius: '3px' }}
        >
          ↺
        </button>
      )}
    </div>
  )
}
