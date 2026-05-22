import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Brain, Plus, Trash2, Edit2, Eye, EyeOff, Check } from 'lucide-react';
import { useHermesClient } from '../lib/hermes';

// ─── Constants ───────────────────────────────────────────────────────────────

const CAPACITY_MAX = 50000;
const PROFILE_MAX = 10000;
const SAVED_MS = 2000;
const PREVIEW_LEN = 120;

const TABS = [
  { id: 'entries', label: 'Entries' },
  { id: 'profile', label: 'User Profile' },
  { id: 'providers', label: 'Providers' },
] as const;
type TabId = typeof TABS[number]['id'];

const MEMORY_PROVIDERS = [
  { id: 'mem0', name: 'Mem0', description: 'AI-powered memory with semantic search', url: 'https://mem0.ai', envKey: 'MEM0_API_KEY' },
  { id: 'honcho', name: 'Honcho', description: 'User-level memory for AI apps', url: 'https://honcho.dev', envKey: 'HONCHO_API_KEY' },
  { id: 'supermemory', name: 'Supermemory', description: 'Universal memory layer', url: 'https://supermemory.ai', envKey: 'SUPERMEMORY_API_KEY' },
  { id: 'retaindb', name: 'RetainDB', description: 'Persistent memory database', url: 'https://retaindb.com', envKey: 'RETAINDB_API_KEY' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function CapacityBar({ chars, max }: { chars: number; max: number }) {
  const pct = Math.min((chars / max) * 100, 100);
  const color =
    pct > 90 ? 'var(--accent-red)' : pct > 70 ? 'var(--accent-amber)' : 'var(--accent-green)';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.3s, background 0.3s' }} />
      </div>
    </div>
  );
}

// ─── Tab: Entries ─────────────────────────────────────────────────────────────

interface MemoryEntry {
  name: string;
  content: string;
}

function EntriesTab() {
  const client = useHermesClient();
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [hovered, setHovered] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const files = await client.listMemoryFiles();
      const loaded = await Promise.all(
        files.map(async (f) => {
          try {
            const content = await client.readMemoryFile(f.name);
            return { name: f.name, content };
          } catch {
            return { name: f.name, content: '' };
          }
        })
      );
      setEntries(loaded);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { load(); }, [load]);

  const totalChars = entries.reduce((sum, e) => sum + e.content.length, 0);
  const pct = Math.min(Math.round((totalChars / CAPACITY_MAX) * 100), 100);
  const capColor = pct > 90 ? 'var(--accent-red)' : pct > 70 ? 'var(--accent-amber)' : 'var(--accent-green)';

  const handleAdd = async () => {
    if (!newContent.trim()) return;
    try {
      await client.writeFile(`memory/${Date.now()}.md`, newContent.trim());
      setNewContent('');
      setShowAdd(false);
      load();
    } catch {
      // silent in browser mode
    }
  };

  const handleDelete = async (name: string) => {
    if (!window.confirm('Delete this memory entry?')) return;
    try {
      await client.deleteMemoryFile(name);
      load();
    } catch {
      // silent
    }
  };

  const startEdit = (entry: MemoryEntry) => {
    setEditingName(entry.name);
    setEditContent(entry.content);
  };

  const saveEdit = async (name: string) => {
    try {
      await client.writeFile(`memory/${name}`, editContent);
      setEditingName(null);
      load();
    } catch {
      // silent
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      {/* Stats row */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'} · {totalChars.toLocaleString()} characters · <span style={{ color: capColor }}>{pct}% capacity</span>
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAdd(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
          >
            <Plus size={13} /> Add
          </button>
        </div>
        <CapacityBar chars={totalChars} max={CAPACITY_MAX} />
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ flexShrink: 0, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            autoFocus
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Add a memory entry..."
            rows={4}
            style={{ width: '100%', background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-active)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{newContent.length} characters</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowAdd(false); setNewContent(''); }}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleAdd} disabled={!newContent.trim()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Entry list */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
        {entries.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13, fontStyle: 'italic', textAlign: 'center', padding: '0 24px' }}>
            No memory entries yet — add one to help your agent remember things
          </div>
        ) : (
          entries.map((entry, idx) => (
            <div
              key={entry.name}
              onMouseEnter={() => setHovered(entry.name)}
              onMouseLeave={() => setHovered(null)}
              style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 12px', position: 'relative', transition: 'border-color 0.15s', borderColor: hovered === entry.name ? 'var(--border-hover)' : 'var(--border)' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span style={{ flexShrink: 0, width: 20, height: 20, background: 'var(--bg3)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                  {idx + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingName === entry.name ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <textarea
                        autoFocus
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={4}
                        style={{ width: '100%', background: 'var(--bg0)', border: '1px solid var(--border-active)', borderRadius: 'var(--radius-sm)', padding: 8, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                      />
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingName(null)}>Cancel</button>
                        <button className="btn btn-primary btn-sm" onClick={() => saveEdit(entry.name)}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', lineHeight: 1.6, wordBreak: 'break-word' }}>
                      {entry.content.length > PREVIEW_LEN
                        ? entry.content.slice(0, PREVIEW_LEN) + '…'
                        : entry.content}
                    </span>
                  )}
                </div>
                {editingName !== entry.name && hovered === entry.name && (
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => startEdit(entry)}
                      title="Edit"
                    >
                      <Edit2 size={13} style={{ color: 'var(--text-secondary)' }} />
                    </button>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      onClick={() => handleDelete(entry.name)}
                      title="Delete"
                    >
                      <Trash2 size={13} style={{ color: 'var(--accent-red)' }} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── Tab: User Profile ────────────────────────────────────────────────────────

function ProfileTab() {
  const client = useHermesClient();
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    client.readFile('user-profile.md').then(setContent).catch(() => setContent(''));
  }, [client]);

  const handleBlur = async () => {
    try {
      await client.writeFile('user-profile.md', content);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), SAVED_MS);
    } catch {
      // silent
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onBlur={handleBlur}
        placeholder="Tell your agent about yourself — your preferences, background, and working style..."
        style={{ flex: 1, minHeight: 300, background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.65, resize: 'none', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-active)'; }}
      />
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {content.length.toLocaleString()} / {PROFILE_MAX.toLocaleString()} characters
        </span>
        {saved && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent-green)', fontWeight: 500 }}>
            <Check size={12} /> Saved
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Providers ───────────────────────────────────────────────────────────

interface ProviderCardProps {
  provider: typeof MEMORY_PROVIDERS[number];
}

function ProviderCard({ provider }: ProviderCardProps) {
  const client = useHermesClient();
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const env = await client.readEnv();
        setValue(env[provider.envKey] ?? '');
      } catch {
        setUnavailable(true);
      }
    })();
  }, [client, provider.envKey]);

  const handleBlur = async () => {
    if (unavailable) return;
    try {
      await client.writeEnv(provider.envKey, value);
      setSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaved(false), SAVED_MS);
    } catch {
      setUnavailable(true);
    }
  };

  return (
    <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{provider.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{provider.description}</div>
        </div>
        <a
          href={provider.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 11, color: 'var(--accent-blue)', whiteSpace: 'nowrap', textDecoration: 'none', flexShrink: 0, marginTop: 2 }}
        >
          {provider.url.replace('https://', '')} ↗
        </a>
      </div>
      {unavailable ? (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          Not available in remote mode
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ position: 'relative' }}>
            <input
              type={show ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={handleBlur}
              placeholder={`${provider.envKey}…`}
              className="input-field"
              style={{ paddingRight: 36, fontFamily: 'var(--font-mono)', fontSize: 13 }}
            />
            <button
              className="btn btn-ghost btn-icon btn-sm"
              onClick={() => setShow((s) => !s)}
              style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}
              tabIndex={-1}
            >
              {show ? <EyeOff size={13} style={{ color: 'var(--text-secondary)' }} /> : <Eye size={13} style={{ color: 'var(--text-secondary)' }} />}
            </button>
          </div>
          {saved && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent-green)', fontWeight: 500 }}>
              <Check size={12} /> Saved
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ProvidersTab() {
  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
      {MEMORY_PROVIDERS.map((p) => (
        <ProviderCard key={p.id} provider={p} />
      ))}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function MemoryPanel() {
  const [activeTab, setActiveTab] = useState<TabId>('entries');

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg0)' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, background: 'var(--bg3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Brain size={18} style={{ color: 'var(--accent-green)' }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Memory</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>Entries, user profile, and memory providers</div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-btn${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 24px 20px', minHeight: 0 }}>
        {activeTab === 'entries' && <EntriesTab />}
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'providers' && <ProvidersTab />}
      </div>
    </div>
  );
}
