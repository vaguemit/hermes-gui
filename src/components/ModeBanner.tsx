import React, { useState } from 'react'
import { useHermesMode } from '../lib/hermes'
import { getBaseUrl } from '../api/hermes'

interface ModeBannerProps {
  onOpenSettings: () => void
}

export function ModeBanner({ onOpenSettings }: ModeBannerProps) {
  const mode = useHermesMode()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || mode === 'local') return null

  const isRemote = mode === 'remote'
  const bannerClass = `mode-banner mode-banner--${mode}`
  const label = isRemote
    ? `Remote mode: ${getBaseUrl()}`
    : `CLI mode active`
  const icon = isRemote ? '⚡' : '💻'

  return (
    <div className={bannerClass} role="status" aria-label={label}>
      <button className="mode-banner__content" onClick={onOpenSettings} title="Open connection settings">
        <span className="mode-banner__icon">{icon}</span>
        <span className="mode-banner__label">{label}</span>
        <span className="mode-banner__hint">Click to configure</span>
      </button>
      <button
        className="mode-banner__dismiss"
        onClick={() => setDismissed(true)}
        title="Dismiss"
        aria-label="Dismiss banner"
      >
        ✕
      </button>
    </div>
  )
}
