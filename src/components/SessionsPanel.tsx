import React, { useState, useEffect, useCallback } from 'react';
import { History, Trash2, Search, Plus, X } from 'lucide-react';
import { useStore } from '../store';
import { useHermesClient } from '../lib/hermes';
import type { SessionMeta } from '../lib/hermes';

type DisplaySession = SessionMeta & {
  title?: string;
  source?: string;
  model?: string;
  isDbSession?: boolean;
};

function groupSessions(sessions: DisplaySession[]): Record<string, DisplaySession[]> {
  const now = Date.now();
  const DAY = 86400000;
  const groups: Record<string, DisplaySession[]> = { Today: [], Yesterday: [], 'This Week': [], Earlier: [] };
  for (const s of sessions) {
    const ts = Number(s.modified) * 1000;
    const age = now - ts;
    if (age < DAY) groups['Today'].push(s);
    else if (age < 2 * DAY) groups['Yesterday'].push(s);
    else if (age < 7 * DAY) groups['This Week'].push(s);
    else groups['Earlier'].push(s);
  }
  return groups;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--accent-amber-dim)', color: 'var(--accent-amber)', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

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

  const [sessions, setSessions] = useState<DisplaySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [hoveredName, setHoveredName] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const [dbSessions, jsonSessions] = await Promise.all([
        client.listSessionsDb().catch(() => []),
        client.listSessions().catch(() => []),
      ]);

      const dbAsMeta: DisplaySession[] = dbSessions.map(s => ({
        name: s.id,
        modified: String(s.started_at),  // Unix seconds — relativeTime() handles the conversion
        messageCount: s.message_count,
        title: s.title ?? undefined,
        source: s.source,
        model: s.model,
        isDbSession: true,
      }));

      const dbIds = new Set(dbSessions.map(s => s.id));
      const jsonOnly: DisplaySession[] = jsonSessions
        .filter(s => !dbIds.has(s.name))
        .map(s => ({ ...s, isDbSession: false }));

      const merged = [...dbAsMeta, ...jsonOnly];
      merged.sort((a, b) => Number(b.modified) - Number(a.modified));
      setSessions(merged);
    } catch {
      // leave sessions empty
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const filtered = sessions.filter(s => {
    if (!debouncedQuery) return true;
    const q = debouncedQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.title ?? '').toLowerCase().includes(q);
  });

  const handleRowClick = (s: DisplaySession) => {
    if (s.isDbSession) {
      // state.db session: resume by setting hermesSessionId so next message continues this session
      setHermesSessionId(s.name);
      setActiveSection('chat');
    } else {
      const match = storeSessions.find(ss => ss.title === s.name || ss.id === s.name);
      if (match) {
        setActiveSession(match.id);
      }
      setHermesSessionId(s.name);
      setActiveSection('chat');
    }
  };

  const handleDelete = async (s: DisplaySession) => {
    if (!window.confirm(`Delete session "${s.title ?? s.name}"? This cannot be undone.`)) return;
    setDeleting(prev => ({ ...prev, [s.name]: true }));
    try {
      if (s.isDbSession) {
        await client.deleteSessionDb(s.name);
      } else {
        await client.deleteSession(s.name);
      }
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
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32, color: 'var(--text-tertiary)', fontSize: 13 }}>
            Loading sessions...
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
              No sessions match &ldquo;{debouncedQuery}&rdquo;
            </div>
          </div>
        )}

        {/* Session list — grouped by date */}
        {!loading && filtered.length > 0 && (
          <div>
            {Object.entries(groupSessions(filtered)).map(([group, items]) =>
              items.length > 0 && (
                <div key={group}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', padding: '10px 0 4px' }}>
                    {group}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map(s => {
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
                              {highlightMatch(s.title ?? s.name, debouncedQuery)}
                            </div>
                            {(s.source || s.model) && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                {s.source && s.source !== 'desktop' && (
                                  <span style={{
                                    fontSize: 10,
                                    fontFamily: 'var(--font-mono)',
                                    color: 'var(--accent-blue)',
                                    background: 'rgba(59,158,255,0.1)',
                                    border: '1px solid rgba(59,158,255,0.2)',
                                    borderRadius: 3,
                                    padding: '1px 5px',
                                    textTransform: 'uppercase',
                                  }}>
                                    {s.source}
                                  </span>
                                )}
                                {s.model && (
                                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                                    {s.model}
                                  </span>
                                )}
                              </div>
                            )}
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
                </div>
              )
            )}
          </div>
        )}

      </div>
    </div>
  );
}
