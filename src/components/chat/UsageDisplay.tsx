import React from 'react'
import type { UsageInfo } from '../../lib/chat/types'

interface Props {
  usage: UsageInfo
}

export function UsageDisplay({ usage }: Props) {
  return (
    <div style={{ display: 'flex', gap: '12px', fontSize: '0.75em', color: '#6b7280', padding: '4px 0' }}>
      <span title="Input tokens">↑ {usage.promptTokens.toLocaleString()}</span>
      <span title="Output tokens">↓ {usage.completionTokens.toLocaleString()}</span>
      <span title="Total tokens">Σ {usage.totalTokens.toLocaleString()}</span>
    </div>
  )
}
