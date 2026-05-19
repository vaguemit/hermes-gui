import React, { useState, useEffect, useCallback } from 'react';
import { History, RefreshCw, Trash2, Play, MessageSquare, Search } from 'lucide-react';
import { listSessionsDisk, deleteSessionDisk, readSessionDisk } from '../api/desktop';
import { useStore } from '../store';
import type { SessionMeta } from '../api/desktop';
import type { Session, Message } from '../store';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const generateId = () => Math.random().toString(36).slice(2);

export default function SessionsPanel() {
  const { setHermesSessionId, setActiveSection, addMessage, sessions: storeSessions, activeSessionId } = useStore();
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});
  const [loading2, setLoading2] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState('');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listSessionsDisk();
      const sorted = [...list].sort(
        (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
      );
      setSessions(sorted);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleResume = (session: SessionMeta) => {
    setHermesSessionId(session.name);
    setActiveSection('chat');
    addMessage({
      id: generateId(),
      role: 'system',
      type: 'system',
      content: `Resumed session \`${session.name}\``,
      timestamp: Date.now(),
    });
  };

  const handleLoad = async (session: SessionMeta) => {
    setLoading2((prev) => ({ ...prev, [session.name]: true }));
    try {
      const raw = await readSessionDisk(session.name);
      if (!raw || !raw.trim()) {
        handleResume(session);
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        handleResume(session);
        return;
      }

      const newId = generateId();
      let messages: Message[] = [];

      if (Array.isArray(parsed)) {
        messages = (parsed as Array<{ role?: string; content?: string; type?: string; timestamp?: number; id?: string }>).map((m, i) => ({
          id: m.id ?? `${newId}-${i}`,
          role: (m.role as Message['role']) ?? 'user',
          type: (m.type as Message['type']) ?? 'prose',
          content: typeof m.content === 'string' ? m.content : '',
          timestamp: m.timestamp ?? Date.now(),
        }));
      } else if (parsed && typeof parsed === 'object' && 'messages' in parsed) {
        const obj = parsed as { messages?: unknown };
        if (Array.isArray(obj.messages)) {
          messages = (obj.messages as Array<{ role?: string; content?: string; type?: string; timestamp?: number; id?: string }>).map((m, i) => ({
            id: m.id ?? `${newId}-${i}`,
            role: (m.role as Message['role']) ?? 'user',
            type: (m.type as Message['type']) ?? 'prose',
            content: typeof m.content === 'string' ? m.content : '',
            timestamp: m.timestamp ?? Date.now(),
          }));
        }
      }

      const firstUser = messages.find((m) => m.role === 'user');
      const title = firstUser ? firstUser.content.slice(0, 60) : session.name;

      const newSession: Session = {
        id: newId,
        title,
        timestamp: new Date(session.modified).getTime() || Date.now(),
        messages,
      };

      const existingSessions = useStore.getState().sessions;
      useStore.setState({
        sessions: [newSession, ...existingSessions],
        activeSessionId: newId,
      });
      setHermesSessionId(session.name);
      setActiveSection('chat');
    } finally {
      setLoading2((prev) => {
        const next = { ...prev };
        delete next[session.name];
        return next;
      });
    }
  };

  const handleDelete = async (session: SessionMeta) => {
    if (!window.confirm('Delete this session?')) return;
    setDeleting((prev) => ({ ...prev, [session.name]: true }));
    try {
      await deleteSessionDisk(session.name);
      setSessions((prev) => prev.filter((s) => s.name !== session.name));
    } finally {
      setDeleting((prev) => {
        const next = { ...prev };
        delete next[session.name];
        return next;
      });
    }
  };

  const filtered = search.trim()
    ? sessions.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()))
    : sessions;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 800 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <History size={20} style={{ color: 'var(--accent-green)' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Session History</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Browse and resume past Hermes sessions from disk
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={fetchSessions}
            disabled={loading}
            title="Refresh"
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
          >
            <RefreshCw size={13} style={{ opacity: loading ? 0.5 : 1 }} />
            Refresh
          </button>
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
            placeholder="Filter sessions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 30, fontSize: 13 }}
          />
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Loading sessions…
          </div>
        )}

        {/* Empty state — no sessions at all */}
        {!loading && sessions.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 0',
              color: 'var(--text-secondary)',
              fontSize: 13,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <MessageSquare size={32} style={{ color: 'var(--text-tertiary)' }} />
            <div>No sessions found.</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Start a conversation in the Chat panel to create one.
            </div>
          </div>
        )}

        {/* Empty state — search returned nothing */}
        {!loading && sessions.length > 0 && filtered.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 0',
              color: 'var(--text-secondary)',
              fontSize: 13,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Search size={24} style={{ color: 'var(--text-tertiary)' }} />
            No sessions match &ldquo;{search}&rdquo;
          </div>
        )}

        {/* Session list */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((session) => {
              const isLoading = loading2[session.name];
              const isDeleting = deleting[session.name];
              return (
                <div
                  key={session.name}
                  style={{
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    padding: '13px 16px',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-hover)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Icon */}
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: 'var(--bg4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <History size={14} style={{ color: 'var(--text-secondary)' }} />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={session.name}
                      >
                        {session.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3 }}>
                        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                          {formatDate(session.modified)}
                        </span>
                        {session.messageCount !== undefined && (
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--text-tertiary)',
                              fontFamily: 'var(--font-mono)',
                              background: 'var(--bg4)',
                              borderRadius: 4,
                              padding: '1px 6px',
                            }}
                          >
                            {session.messageCount} msg{session.messageCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        className="btn btn-sm"
                        onClick={() => handleLoad(session)}
                        disabled={isLoading || isDeleting}
                        title="Load session into chat"
                        style={{
                          background: 'var(--accent-green-dim)',
                          border: '1px solid rgba(34,197,94,0.3)',
                          borderRadius: 6,
                          padding: '4px 10px',
                          cursor: isLoading ? 'wait' : 'pointer',
                          color: 'var(--accent-green)',
                          fontSize: 12,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          opacity: isLoading ? 0.6 : 1,
                        }}
                      >
                        <Play size={11} />
                        {isLoading ? 'Loading…' : 'Load'}
                      </button>
                      <button
                        onClick={() => handleDelete(session)}
                        disabled={isDeleting || isLoading}
                        title="Delete session"
                        style={{
                          background: 'none',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          padding: 5,
                          cursor: isDeleting ? 'wait' : 'pointer',
                          color: 'var(--text-secondary)',
                          opacity: isDeleting || isLoading ? 0.5 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'color 0.15s, border-color 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (isDeleting || isLoading) return;
                          (e.currentTarget as HTMLElement).style.color = 'var(--accent-red)';
                          (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-red)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
