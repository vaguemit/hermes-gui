import React, { useEffect, useRef, useState } from 'react';
import { useHermesClient } from '../lib/hermes';
import { useStore } from '../store';
import type { ProfileMeta } from '../lib/hermes';

export default function ProfileChip() {
  const client = useHermesClient();
  const { activeProfile, setActiveProfile } = useStore();
  const [profiles, setProfiles] = useState<ProfileMeta[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    client.listProfiles().then(list => {
      if (list.length > 0) setProfiles(list);
    }).catch(() => {});
  }, [client]);

  useEffect(() => {
    if (!open) return;
    function onOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [open]);

  const initials = activeProfile.slice(0, 2).toUpperCase();
  const displayList = profiles.length > 0 ? profiles : [{ name: 'default', modified: '' }];

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="profile-chip"
        onClick={() => setOpen(prev => !prev)}
        title={`Active profile: ${activeProfile}`}
      >
        <span className="profile-avatar">{initials}</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeProfile}
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)',
          left: 0,
          minWidth: 140,
          background: 'var(--bg3)',
          border: '1px solid var(--border-active)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          zIndex: 200,
        }}>
          {displayList.map(p => (
            <button
              key={p.name}
              onClick={() => { setActiveProfile(p.name); setOpen(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '8px 12px',
                background: p.name === activeProfile ? 'var(--bg4)' : 'none',
                border: 'none',
                cursor: 'pointer',
                color: p.name === activeProfile ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 12.5,
                textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { if (p.name !== activeProfile) (e.currentTarget as HTMLElement).style.background = 'var(--bg2)'; }}
              onMouseLeave={e => { if (p.name !== activeProfile) (e.currentTarget as HTMLElement).style.background = 'none'; }}
            >
              <span className="profile-avatar" style={{ fontSize: 10, width: 20, height: 20 }}>
                {p.name.slice(0, 2).toUpperCase()}
              </span>
              {p.name}
              {p.name === activeProfile && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent-green)' }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
