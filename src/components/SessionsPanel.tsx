import React, { useState, useEffect, useCallback } from 'react';
import { History, Trash2, Search, Plus, X } from 'lucide-react';
import { useStore } from '../store';
import { useHermesClient } from '../lib/hermes';
import type { SessionMeta } from '../lib/hermes';

function relativeTime(modified: string): string {
  const ts = Number(modified);
  const base = isNaN(ts) ? new Date(modified).getTime() : ts * (modified.length <= 13 ? 1000 : 1);
  if (isNaN(base) || base === 0) return modified;
  const diff = Math.floor((Date.now() - base) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `${m} min${m !== 1 ? 's' : ''} ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `${h} hour${h !== 1 ? 's' : ''} ago`;
  }
  const d = Math.floor(diff / 86400);
  return `${d} day${d !== 1 ? 's' : ''} ago`;
}

export default function SessionsPanel() {
  const client = useHermesClient();
  const { sessions: storeSessions, setActiveSession, setActiveSection, setHermesSessionId, addSession } = useStore();

  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const loadSessions = useCallback(() => {
    setLoading(true);
    client.listSessions()
      .then(list => {
        setSessions(list.sort((a, b) => Number(b.modified) - Number(a.modified)));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [client]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const filtered = sessions.filter(s =>
    s.name.toLowerCase().includes(query.toLowerCase())
  );

  const handleRowClick = (s: SessionMeta) => {
    const match = storeSessions.find(ss => ss.title === s.name || ss.id === s.name);
    if (match) {
      setActiveSession(match.id);
    }
    setHermesSessionId(s.name);
    setActiveSection('chat');
  };

  const handleDelete = async (s: SessionMeta) => {
    if (!window.confirm(`Delete session "${s.name}"? This cannot be undone.`)) return;
    setDeleting(prev => ({ ...prev, [s.name]: true }));
    try {
      await client.deleteSession(s.name);
      setSessions(prev => prev.filter(x => x.name !== s.name));
    } finally {
      setDeleting(prev => {
        const next = { ...prev };
        delete next[s.name];
        return next;
      });
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Delete all sessions? This cannot be undone.')) return;
    await client.clearAllSessions();
    setSessions([]);
  };

  const handleNewSession = () => {
    addSession();
    setActiveSection('chat');
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 800 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <History size={20} style={{ color: 'var(--accent-green)' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Sessions</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Browse and resume past Hermes sessions
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleNewSession}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              <Plus size={13} />
              New Session
            </button>
            <button
              className="btn btn-danger btn-sm"
              onClick={handleClearAll}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              <X size={13} />
              Clear All
            </button>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search
            size={13}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary)',
              pointerEvents: 'none',
            }}
          />
          <input
            className="input-field"
            placeholder="Search sessions…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ paddingLeft: 30, fontSize: 13 }}
          />
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Loading sessions…
          </div>
        )}

        {/* Empty — no sessions at all */}
        {!loading && sessions.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '56px 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
          }}>
            <History size={32} style={{ color: 'var(--text-tertiary)' }} />
            <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              No sessions yet — start a chat to create one
            </div>
          </div>
        )}

        {/* Empty — search no results */}
        {!loading && sessions.length > 0 && filtered.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: '40px 0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}>
            <Search size={24} style={{ color: 'var(--text-tertiary)' }} />
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              No sessions match &ldquo;{query}&rdquo;
            </div>
          </div>
        )}

        {/* Session list */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filtered.map(s => {
              const isHovered = hoveredName === s.name;
              const isDeleting = deleting[s.name];
              return (
                <div
                  key={s.name}
                  onClick={() => !isDeleting && handleRowClick(s)}
                  onMouseEnter={() => setHoveredName(s.name)}
                  onMouseLeave={() => setHoveredName(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    background: isHovered ? 'var(--bg2)' : 'var(--bg1)',
                    cursor: isDeleting ? 'default' : 'pointer',
                    transition: 'background 0.12s, border-color 0.12s',
                    borderColor: isHovered ? 'var(--border-hover)' : 'var(--border)',
                    opacity: isDeleting ? 0.5 : 1,
                  }}
                >
                  {/* Icon */}
                  <div style={{
                    width: 30,
                    height: 30,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <History size={13} style={{ color: 'var(--text-secondary)' }} />
                  </div>

                  {/* Name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }} title={s.name}>
                      {s.name}
                    </div>
                  </div>

                  {/* Message count badge */}
                  {s.messageCount !== undefined && (
                    <span style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-secondary)',
                      background: 'var(--bg4)',
                      borderRadius: 4,
                      padding: '2px 7px',
                      flexShrink: 0,
                    }}>
                      {s.messageCount} msg{s.messageCount !== 1 ? 's' : ''}
                    </span>
                  )}

                  {/* Timestamp */}
                  <span style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    flexShrink: 0,
                    minWidth: 80,
                    textAlign: 'right',
                  }}>
                    {relativeTime(s.modified)}
                  </span>

                  {/* Delete button — visible on hover */}
                  <button
                    className="btn btn-icon btn-sm"
                    onClick={e => { e.stopPropagation(); handleDelete(s); }}
                    disabled={isDeleting}
                    title="Delete session"
                    style={{
                      flexShrink: 0,
                      opacity: isHovered ? 1 : 0,
                      transition: 'opacity 0.12s, color 0.12s',
                      color: 'var(--text-secondary)',
                      background: 'none',
                      border: 'none',
                      cursor: isDeleting ? 'wait' : 'pointer',
                      padding: 4,
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-red)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
