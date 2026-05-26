import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Brain, Plus, Trash2, Edit2, Eye, EyeOff, Check, Database, Download, Search } from 'lucide-react';
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

// ─── Provider definitions ─────────────────────────────────────────────────────

type ProviderId = 'builtin' | 'mem0' | 'honcho';

interface ProviderDef {
  id: ProviderId;
  name: string;
  description: string;
  fields: Array<{ key: string; label: string; placeholder: string }>;
}

const PROVIDER_DEFS: ProviderDef[] = [
  {
    id: 'builtin',
    name: 'Built-in',
    description: 'Local file-based memory, no external service required',
    fields: [],
  },
  {
    id: 'mem0',
    name: 'Mem0',
    description: 'AI-powered memory with semantic search and personalization',
    fields: [
      { key: 'MEM0_API_KEY', label: 'API Key', placeholder: 'mem0-…' },
    ],
  },
  {
    id: 'honcho',
    name: 'Honcho',
    description: 'User-level memory for AI apps with context management',
    fields: [
      { key: 'HONCHO_API_URL', label: 'API URL', placeholder: 'https://api.honcho.dev' },
      { key: 'HONCHO_API_KEY', label: 'API Key', placeholder: 'honcho-…' },
    ],
  },
];

const EXTRA_MEMORY_PROVIDERS = [
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

// ─── File Viewer Modal ────────────────────────────────────────────────────────

interface ViewerModalProps {
  name: string;
  content: string;
  onClose: () => void;
}

function ViewerModal({ name, content, onClose }: ViewerModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="palette-overlay"
      onClick={onClose}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: '640px', maxWidth: '90vw', display: 'flex', flexDirection: 'column', gap: 0, maxHeight: '70vh' }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{name}</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>
        <div className="terminal" style={{ flex: 1, minHeight: 0, borderRadius: 0, border: 'none' }}>
          <div className="terminal-body" style={{ maxHeight: '55vh', overflowY: 'auto', padding: '12px 16px' }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: 1.65, color: 'var(--term-green)', fontFamily: 'var(--font-mono)' }}>
              {content || '(empty)'}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Entries ─────────────────────────────────────────────────────────────

interface MemoryEntry {
  name: string;
  content: string;
  size: number;
  modified: string;
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
  const [search, setSearch] = useState('');
  const [viewer, setViewer] = useState<{ name: string; content: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const files = await client.listMemoryFiles();
      const loaded = await Promise.all(
        files.map(async (f) => {
          try {
            const content = await client.readMemoryFile(f.name);
            return { name: f.name, content, size: f.size, modified: f.modified };
          } catch {
            return { name: f.name, content: '', size: f.size, modified: f.modified };
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
  const totalKb = (entries.reduce((sum, e) => sum + e.size, 0) / 1024).toFixed(1);
  const pct = Math.min(Math.round((totalChars / CAPACITY_MAX) * 100), 100);
  const capColor = pct > 90 ? 'var(--accent-red)' : pct > 70 ? 'var(--accent-amber)' : 'var(--accent-green)';

  const filteredEntries = search.trim()
    ? entries.filter(
        (e) =>
          e.name.toLowerCase().includes(search.toLowerCase()) ||
          e.content.toLowerCase().includes(search.toLowerCase())
      )
    : entries;

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

  const handleClearAll = async () => {
    if (!window.confirm(`Delete all ${entries.length} memory files? This cannot be undone.`)) return;
    try {
      await Promise.all(entries.map((e) => client.deleteMemoryFile(e.name)));
      load();
    } catch {
      // silent
    }
  };

  const handleExport = () => {
    const bundle = Object.fromEntries(entries.map((e) => [e.name, e.content]));
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hermes-memory-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleView = async (name: string, cachedContent?: string) => {
    const content = cachedContent !== undefined ? cachedContent : await client.readMemoryFile(name).catch(() => '');
    setViewer({ name, content });
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
    <>
      {viewer && (
        <ViewerModal
          name={viewer.name}
          content={viewer.content}
          onClose={() => setViewer(null)}
        />
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
        {/* Stats bar */}
        <div style={{ flexShrink: 0, background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Database size={13} style={{ color: 'var(--text-secondary)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{entries.length}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{entries.length === 1 ? 'file' : 'files'}</span>
          </div>
          <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{totalKb} KB</span> total
          </div>
          <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
          <span style={{ fontSize: 12, color: capColor }}>{pct}% capacity</span>
          <div style={{ flex: 1 }} />
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleExport}
            disabled={entries.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
          >
            <Download size={12} /> Export
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={handleClearAll}
            disabled={entries.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
          >
            <Trash2 size={12} /> Clear All
          </button>
        </div>

        {/* Capacity bar */}
        <div style={{ flexShrink: 0 }}>
          <CapacityBar chars={totalChars} max={CAPACITY_MAX} />
        </div>

        {/* Top action row */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Search */}
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memory files…"
              className="input-field"
              style={{ paddingLeft: 30, fontSize: 13 }}
            />
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAdd(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, flexShrink: 0 }}
          >
            <Plus size={13} /> Add
          </button>
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
          {filteredEntries.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13, fontStyle: 'italic', textAlign: 'center', padding: '0 24px' }}>
              {search.trim()
                ? 'No files match your search'
                : 'No memory entries yet — add one to help your agent remember things'}
            </div>
          ) : (
            filteredEntries.map((entry, idx) => (
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
                    {/* File name + meta */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{entry.name}</span>
                      <span className="badge badge-muted" style={{ fontSize: 10 }}>{(entry.size / 1024).toFixed(1)} KB</span>
                      {entry.modified && (
                        <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{new Date(entry.modified).toLocaleDateString()}</span>
                      )}
                    </div>

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

                  {editingName !== entry.name && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0, opacity: hovered === entry.name ? 1 : 0, transition: 'opacity 0.15s' }}>
                      <button
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => handleView(entry.name, entry.content)}
                        title="View"
                      >
                        <Eye size={13} style={{ color: 'var(--text-secondary)' }} />
                      </button>
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
    </>
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

// Primary provider selector (Built-in / Mem0 / Honcho)
function PrimaryProviderSelector() {
  const client = useHermesClient();
  const [activeProvider, setActiveProvider] = useState<ProviderId>('builtin');
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Determine configured status for a provider
  const isConfigured = (def: ProviderDef) => {
    if (def.fields.length === 0) return true;
    return def.fields.every((f) => Boolean(envValues[f.key]));
  };

  useEffect(() => {
    (async () => {
      try {
        const env = await client.readEnv();
        setEnvValues(env);
        // Infer active provider from env
        if (env['MEM0_API_KEY']) setActiveProvider('mem0');
        else if (env['HONCHO_API_KEY'] || env['HONCHO_API_URL']) setActiveProvider('honcho');
        else setActiveProvider('builtin');
      } catch {
        setUnavailable(true);
      }
    })();
  }, [client]);

  const handleSaveField = async (key: string, value: string) => {
    if (unavailable) return;
    try {
      await client.writeEnv(key, value);
      setSavedKey(key);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSavedKey(null), SAVED_MS);
    } catch {
      setUnavailable(true);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 8 }}>
      <div className="section-label">Memory Provider</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {PROVIDER_DEFS.map((def) => {
          const selected = activeProvider === def.id;
          const configured = isConfigured(def);
          return (
            <div
              key={def.id}
              onClick={() => setActiveProvider(def.id)}
              style={{
                background: 'var(--bg1)',
                border: `1px solid ${selected ? 'var(--accent-green)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {/* Card header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: selected ? 'var(--accent-green)' : 'var(--text-primary)' }}>
                      {def.name}
                    </span>
                    {configured && def.id !== 'builtin' && (
                      <span className="badge badge-connected" style={{ fontSize: 10 }}>configured</span>
                    )}
                    {!configured && def.fields.length > 0 && (
                      <span className="badge badge-muted" style={{ fontSize: 10 }}>not configured</span>
                    )}
                    {def.id === 'builtin' && (
                      <span className="badge badge-info" style={{ fontSize: 10 }}>default</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{def.description}</div>
                </div>
                {selected && (
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent-green-dim)', border: '1px solid var(--accent-green)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={10} style={{ color: 'var(--accent-green)' }} />
                  </div>
                )}
              </div>

              {/* Config fields — shown when selected */}
              {selected && def.fields.length > 0 && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  {unavailable && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      Not available in remote mode
                    </div>
                  )}
                  {!unavailable && def.fields.map((field) => (
                    <div key={field.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{field.label}</span>
                        {savedKey === field.key && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--accent-green)', fontWeight: 500 }}>
                            <Check size={10} /> Saved
                          </span>
                        )}
                      </div>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showFields[field.key] ? 'text' : 'password'}
                          value={envValues[field.key] ?? ''}
                          onChange={(e) => setEnvValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                          onBlur={() => handleSaveField(field.key, envValues[field.key] ?? '')}
                          placeholder={field.placeholder}
                          className="input-field"
                          style={{ paddingRight: 36, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                        />
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => setShowFields((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                          style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}
                          tabIndex={-1}
                          type="button"
                        >
                          {showFields[field.key]
                            ? <EyeOff size={12} style={{ color: 'var(--text-secondary)' }} />
                            : <Eye size={12} style={{ color: 'var(--text-secondary)' }} />
                          }
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Extra provider cards (Supermemory, RetainDB)
interface ExtraProviderCardProps {
  provider: typeof EXTRA_MEMORY_PROVIDERS[number];
}

function ExtraProviderCard({ provider }: ExtraProviderCardProps) {
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
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{provider.name}</div>
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
      <PrimaryProviderSelector />
      <div className="section-label">Additional Providers</div>
      {EXTRA_MEMORY_PROVIDERS.map((p) => (
        <ExtraProviderCard key={p.id} provider={p} />
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
          <div style={{ flex: 1 }}>
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
