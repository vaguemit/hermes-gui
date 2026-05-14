import React, { useState, useEffect, useCallback } from 'react';
import { History, RefreshCw, Trash2, Play, MessageSquare } from 'lucide-react';
import { listSessionsDisk, deleteSessionDisk } from '../api/desktop';
import { useStore } from '../store';
import type { SessionMeta } from '../api/desktop';

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
  const { setHermesSessionId, setActiveSection, addMessage } = useStore();
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

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

  const handleDelete = async (session: SessionMeta) => {
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

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 800 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
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

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Loading sessions…
          </div>
        )}

        {/* Empty state */}
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
            No sessions found. Start a conversation to create one.
          </div>
        )}

        {/* Session list */}
        {!loading && sessions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sessions.map((session) => (
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
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {formatDate(session.modified)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      className="btn btn-sm"
                      onClick={() => handleResume(session)}
                      title="Resume session"
                      style={{
                        background: 'var(--accent-green-dim)',
                        border: '1px solid rgba(34,197,94,0.3)',
                        borderRadius: 6,
                        padding: '4px 10px',
                        cursor: 'pointer',
                        color: 'var(--accent-green)',
                        fontSize: 12,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                      }}
                    >
                      <Play size={11} /> Resume
                    </button>
                    <button
                      onClick={() => handleDelete(session)}
                      disabled={deleting[session.name]}
                      title="Delete session"
                      style={{
                        background: 'none',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        padding: 5,
                        cursor: deleting[session.name] ? 'wait' : 'pointer',
                        color: 'var(--text-secondary)',
                        opacity: deleting[session.name] ? 0.5 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'color 0.15s, border-color 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        if (deleting[session.name]) return;
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
