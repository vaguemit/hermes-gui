import React, { useState, useEffect } from 'react';
import { useStore, Skill } from '../store';
import {
  Wand2, Plus, Edit2, Trash2, Download, Globe,
  CheckCircle, XCircle, Loader2, Play, Copy, Check,
  CopyPlus, Package, X, Save,
} from 'lucide-react';
import { useHermesClient } from '../lib/hermes';

const generateId = () => Math.random().toString(36).slice(2);

const NAME_RE = /^[a-zA-Z0-9-]+$/;

const SOURCE_BADGE: Record<string, string> = {
  builtin: 'badge-info',
  user: 'badge-connected',
  imported: 'badge-beta',
};

// ── Static marketplace entries ───────────────────────────────────────
interface MarketplaceSkill {
  name: string;
  description: string;
}

const MARKETPLACE_SKILLS: MarketplaceSkill[] = [
  { name: 'graphify',        description: 'Any input to knowledge graph — clustered communities and BFS/DFS query tools' },
  { name: 'web-researcher',  description: 'Search the web, fetch pages, and synthesize research reports' },
  { name: 'code-reviewer',   description: 'Review diffs for correctness bugs, style, and security issues' },
  { name: 'summarizer',      description: 'Summarize any document, URL, or pasted text into concise bullet points' },
  { name: 'translator',      description: 'Translate text between any two languages with context preservation' },
  { name: 'data-analyst',    description: 'Load CSV/JSON data, run statistical analysis, and produce charts' },
  { name: 'image-describer', description: 'Describe images in detail — objects, layout, text, and scene context' },
  { name: 'shell-assistant', description: 'Convert natural language requests into safe shell commands' },
];

export default function SkillsPanel() {
  const client = useHermesClient();
  const { skills, addSkill, updateSkill, deleteSkill, setActiveSection } = useStore();

  const [tab, setTab] = useState<'installed' | 'browse'>('installed');

  // ── Form state ───────────────────────────────────────────────────────
  const [editSkill, setEditSkill] = useState<Skill | null>(null);
  const [newSkill, setNewSkill] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', content: '' });
  const [nameError, setNameError] = useState('');
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState('');

  // ── Misc UI state ────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [invokedId, setInvokedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Marketplace state ────────────────────────────────────────────────
  const [marketBusy, setMarketBusy] = useState<string | null>(null);
  const [marketDone, setMarketDone] = useState<Set<string>>(new Set());
  const [marketError, setMarketError] = useState<Record<string, string>>({});
  const [browseQuery, setBrowseQuery] = useState('');

  // ── Mount: sync from disk ─────────────────────────────────────────────
  useEffect(() => {
    client.listSkills().then((diskSkills) => {
      if (diskSkills.length === 0) return;
      const existingNames = new Set(useStore.getState().skills.map((s) => s.name));
      diskSkills.forEach((ds) => {
        if (!existingNames.has(ds.name)) {
          addSkill({
            id: generateId(),
            name: ds.name,
            description: ds.description,
            content: '',
            source: 'imported',
          });
        }
      });
    }).catch(() => {});
  }, [client, addSkill]);

  // ── Helpers: form ────────────────────────────────────────────────────
  const validateName = (val: string): string => {
    if (!val.trim()) return 'Name is required';
    if (!NAME_RE.test(val.trim())) return 'Letters, numbers, and hyphens only';
    return '';
  };

  const openNew = () => {
    setForm({ name: '', description: '', content: '# Skill\n\nDescribe what this skill does and how Hermes should execute it.\n' });
    setNameError('');
    setFormError('');
    setNewSkill(true);
    setEditSkill(null);
  };

  const openEdit = async (s: Skill) => {
    setFormError('');
    setNameError('');
    setEditSkill(s);
    setNewSkill(false);
    // Load content from disk if available
    let content = s.content;
    try {
      const raw = await client.getSkillDetail(s.name);
      if (raw) content = raw;
    } catch {
      // fall back to store content
    }
    setForm({ name: s.name, description: s.description, content });
  };

  const cancelEdit = () => {
    setEditSkill(null);
    setNewSkill(false);
    setForm({ name: '', description: '', content: '' });
    setNameError('');
    setFormError('');
  };

  const handleSave = async () => {
    const err = validateName(form.name);
    if (err) { setNameError(err); return; }
    setFormBusy(true);
    setFormError('');
    try {
      const name = form.name.trim();
      if (newSkill) {
        // Create via CLI then write SKILL.md
        const result = await client.runHermesCommand(['skill', 'create', name]);
        if (!result.success) {
          // Non-fatal — CLI may not support this command, still write file
        }
        await client.writeFile(`skills/${name}/SKILL.md`, form.content);
        addSkill({ id: generateId(), name, description: form.description, content: form.content, source: 'user' });
        // Refresh disk list to pick up the new entry
        client.listSkills().catch(() => {});
      } else if (editSkill) {
        await client.writeFile(`skills/${name}/SKILL.md`, form.content);
        updateSkill(editSkill.id, { name, description: form.description, content: form.content });
      }
      cancelEdit();
    } catch (e) {
      setFormError(String(e));
    } finally {
      setFormBusy(false);
    }
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSave(); }
    if (e.key === 'Escape') cancelEdit();
  };

  // ── Delete (two-step) ────────────────────────────────────────────────
  const handleDeleteClick = (s: Skill) => {
    if (confirmDeleteId === s.id) {
      // Second click — proceed
      setDeletingId(s.id);
      setConfirmDeleteId(null);
      client.runHermesCommand(['skill', 'delete', s.name])
        .catch(() => {})
        .finally(() => {
          deleteSkill(s.id);
          setDeletingId(null);
          if (editSkill?.id === s.id) cancelEdit();
        });
    } else {
      setConfirmDeleteId(s.id);
      // Auto-cancel confirm after 3s
      setTimeout(() => setConfirmDeleteId((prev) => prev === s.id ? null : prev), 3000);
    }
  };

  // ── Invoke ───────────────────────────────────────────────────────────
  const handleInvoke = (s: Skill) => {
    if (!s.content.trim()) return;
    setActiveSection('chat');
    setTimeout(() => {
      const inputEl = document.getElementById('chat-input') as HTMLTextAreaElement | null;
      if (!inputEl) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(inputEl, s.content);
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
      inputEl.focus();
    }, 80);
    setInvokedId(s.id);
    setTimeout(() => setInvokedId((prev) => prev === s.id ? null : prev), 1200);
  };

  const handleCopy = (s: Skill) => {
    navigator.clipboard.writeText(s.content).then(() => {
      setCopiedId(s.id);
      setTimeout(() => setCopiedId((prev) => prev === s.id ? null : prev), 1500);
    }).catch(() => {});
  };

  const handleDuplicate = (s: Skill) => {
    addSkill({ id: generateId(), name: `${s.name}-copy`, description: s.description, content: s.content, source: 'user' });
  };

  // ── Marketplace install ──────────────────────────────────────────────
  const handleMarketInstall = async (name: string) => {
    if (marketBusy || marketDone.has(name)) return;
    setMarketBusy(name);
    setMarketError((prev) => { const n = { ...prev }; delete n[name]; return n; });
    try {
      const result = await client.runHermesCommand(['skill', 'install', name]);
      if (result.success) {
        setMarketDone((prev) => new Set(prev).add(name));
        // Add to store if not already present
        if (!useStore.getState().skills.find((s) => s.name === name)) {
          const entry = MARKETPLACE_SKILLS.find((m) => m.name === name);
          addSkill({ id: generateId(), name, description: entry?.description ?? '', content: '', source: 'imported' });
        }
      } else {
        setMarketError((prev) => ({ ...prev, [name]: result.stderr || 'Install failed' }));
      }
    } catch (e) {
      setMarketError((prev) => ({ ...prev, [name]: String(e) }));
    } finally {
      setMarketBusy(null);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────
  const isEditing = editSkill !== null || newSkill;

  const filteredSkills = query.trim()
    ? skills.filter((s) =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.description.toLowerCase().includes(query.toLowerCase())
      )
    : skills;

  const groups: Array<{ label: string; key: string; items: Skill[] }> = [
    { label: 'User', key: 'user', items: filteredSkills.filter((s) => s.source === 'user') },
    { label: 'Imported', key: 'imported', items: filteredSkills.filter((s) => s.source === 'imported') },
    { label: 'Builtin', key: 'builtin', items: filteredSkills.filter((s) => s.source === 'builtin') },
  ].filter((g) => g.items.length > 0);

  const filteredMarket = browseQuery.trim()
    ? MARKETPLACE_SKILLS.filter((m) =>
        m.name.toLowerCase().includes(browseQuery.toLowerCase()) ||
        m.description.toLowerCase().includes(browseQuery.toLowerCase())
      )
    : MARKETPLACE_SKILLS;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 860 }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Wand2 size={20} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Skills</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Reusable instruction sets — invoke to pre-fill chat</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {tab === 'installed' && (
              <button
                className="btn btn-primary btn-sm"
                onClick={openNew}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus size={13} /> New Skill
              </button>
            )}
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
          <button
            className={`tab-btn${tab === 'installed' ? ' active' : ''}`}
            onClick={() => setTab('installed')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Package size={13} />
            Installed
            <span className="badge badge-muted" style={{ fontSize: 10, marginLeft: 2 }}>{skills.length}</span>
          </button>
          <button
            className={`tab-btn${tab === 'browse' ? ' active' : ''}`}
            onClick={() => setTab('browse')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Globe size={13} />
            Marketplace
            <span className="badge badge-muted" style={{ fontSize: 10, marginLeft: 2 }}>{MARKETPLACE_SKILLS.length}</span>
          </button>
        </div>

        {/* ══════════════════════════════════════════
            INSTALLED TAB
        ══════════════════════════════════════════ */}
        {tab === 'installed' && (
          <>
            {skills.length > 3 && (
              <input
                className="input-field"
                placeholder="Filter skills..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ marginBottom: 12, fontSize: 13 }}
              />
            )}

            <div style={{ display: 'grid', gridTemplateColumns: isEditing ? '1fr 1fr' : '1fr', gap: 16 }}>

              {/* Skill list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {skills.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                    No skills yet. Click <strong>New Skill</strong> to create one.
                  </div>
                )}
                {filteredSkills.length === 0 && skills.length > 0 && (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                    No skills match &ldquo;{query}&rdquo;
                  </div>
                )}

                {groups.map((group, gi) => (
                  <div key={group.key}>
                    {groups.length > 1 && (
                      <div className="section-label" style={{ marginBottom: 8, marginTop: gi > 0 ? 12 : 0 }}>
                        {group.label}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {group.items.map((s) => {
                        const isConfirming = confirmDeleteId === s.id;
                        const isDeleting = deletingId === s.id;
                        return (
                          <div
                            key={s.id}
                            style={{
                              background: editSkill?.id === s.id ? 'var(--accent-green-dim)' : 'var(--bg2)',
                              border: `1px solid ${editSkill?.id === s.id ? 'var(--accent-green)' : invokedId === s.id ? 'var(--accent-amber)' : isConfirming ? 'var(--accent-red)' : 'var(--border)'}`,
                              borderRadius: 10,
                              padding: '13px 16px',
                              transition: 'border-color 0.2s, background 0.2s',
                              opacity: isDeleting ? 0.5 : 1,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13.5, color: 'var(--accent-green)' }}>
                                    /{s.name}
                                  </span>
                                  <span className={`badge ${SOURCE_BADGE[s.source] ?? 'badge-muted'}`}>{s.source}</span>
                                </div>
                                {s.description && (
                                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {s.description}
                                  </div>
                                )}
                              </div>

                              <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                                {/* Invoke */}
                                <button
                                  onClick={() => handleInvoke(s)}
                                  title="Load into chat input"
                                  className="btn btn-sm"
                                  style={{
                                    background: invokedId === s.id ? 'var(--accent-amber-dim)' : 'var(--accent-green-dim)',
                                    border: `1px solid ${invokedId === s.id ? 'rgba(245,158,11,0.4)' : 'rgba(34,197,94,0.3)'}`,
                                    color: invokedId === s.id ? 'var(--accent-amber)' : 'var(--accent-green)',
                                    padding: '4px 9px',
                                    fontSize: 11,
                                    gap: 4,
                                  }}
                                >
                                  <Play size={11} /> {invokedId === s.id ? 'Sent!' : 'Invoke'}
                                </button>

                                {/* Copy */}
                                <button
                                  onClick={() => handleCopy(s)}
                                  title="Copy content to clipboard"
                                  className="btn btn-icon btn-ghost btn-sm"
                                  style={{
                                    color: copiedId === s.id ? 'var(--accent-green)' : 'var(--text-secondary)',
                                    borderColor: copiedId === s.id ? 'var(--accent-green)' : undefined,
                                    padding: 5,
                                  }}
                                >
                                  {copiedId === s.id ? <Check size={13} /> : <Copy size={13} />}
                                </button>

                                {/* Edit */}
                                <button
                                  onClick={() => openEdit(s)}
                                  title="Edit"
                                  className="btn btn-icon btn-ghost btn-sm"
                                  style={{ padding: 5, color: 'var(--text-secondary)' }}
                                >
                                  <Edit2 size={13} />
                                </button>

                                {/* Duplicate */}
                                <button
                                  onClick={() => handleDuplicate(s)}
                                  title="Duplicate"
                                  className="btn btn-icon btn-ghost btn-sm"
                                  style={{ padding: 5, color: 'var(--text-secondary)' }}
                                >
                                  <CopyPlus size={13} />
                                </button>

                                {/* Delete (two-step) */}
                                {isConfirming ? (
                                  <button
                                    onClick={() => handleDeleteClick(s)}
                                    title="Confirm delete"
                                    className="btn btn-danger btn-sm"
                                    disabled={isDeleting}
                                    style={{ padding: '4px 8px', fontSize: 11, gap: 4, flexShrink: 0 }}
                                  >
                                    {isDeleting
                                      ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
                                      : <><XCircle size={11} /> Confirm?</>
                                    }
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleDeleteClick(s)}
                                    title="Delete"
                                    className="btn btn-icon btn-ghost btn-sm"
                                    disabled={isDeleting}
                                    style={{ padding: 5, color: 'var(--text-secondary)' }}
                                  >
                                    {isDeleting
                                      ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                                      : <Trash2 size={13} />
                                    }
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Content preview */}
                            {s.content && (
                              <div style={{
                                marginTop: 8,
                                fontFamily: 'var(--font-mono)',
                                fontSize: 11,
                                color: 'var(--text-tertiary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                paddingLeft: 2,
                              }}>
                                {s.content.replace(/\n/g, ' ').slice(0, 120)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Editor panel ── */}
              {isEditing && (
                <div
                  className="animate-in"
                  onKeyDown={handleFormKeyDown}
                  style={{
                    background: 'var(--bg2)',
                    border: '1px solid var(--border-active)',
                    borderRadius: 12,
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                      {newSkill ? 'New Skill' : `Edit /${editSkill?.name}`}
                    </div>
                    <button
                      onClick={cancelEdit}
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2 }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Name */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
                      Skill Name
                    </label>
                    <input
                      className="input-field"
                      placeholder="my-skill"
                      value={form.name}
                      onChange={(e) => {
                        setForm({ ...form, name: e.target.value });
                        setNameError(e.target.value ? validateName(e.target.value) : '');
                      }}
                      disabled={!newSkill}
                      style={{ fontFamily: 'var(--font-mono)', opacity: newSkill ? 1 : 0.6 }}
                    />
                    {nameError && (
                      <div style={{ fontSize: 11, color: 'var(--accent-red)', marginTop: 4 }}>{nameError}</div>
                    )}
                    {newSkill && (
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                        Letters, numbers, and hyphens only
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
                      Description
                    </label>
                    <input
                      className="input-field"
                      placeholder="What does this skill do?"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
                      SKILL.md Content
                    </label>
                    <textarea
                      className="input-field"
                      value={form.content}
                      onChange={(e) => setForm({ ...form, content: e.target.value })}
                      rows={12}
                      placeholder="Write the prompt or instructions for this skill..."
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, resize: 'vertical' }}
                    />
                  </div>

                  {formError && (
                    <div style={{ fontSize: 12, color: 'var(--accent-red)', background: 'var(--accent-red-dim)', padding: '8px 10px', borderRadius: 6 }}>
                      {formError}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleSave}
                      disabled={formBusy || !!nameError}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: formBusy || !!nameError ? 0.6 : 1 }}
                    >
                      {formBusy
                        ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Saving...</>
                        : <><Save size={13} /> Save</>
                      }
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={cancelEdit} disabled={formBusy}>
                      Cancel
                    </button>
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto', fontFamily: 'var(--font-mono)' }}>
                      Ctrl+Enter to save
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════
            MARKETPLACE TAB
        ══════════════════════════════════════════ */}
        {tab === 'browse' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <Globe size={14} style={{ color: 'var(--accent-blue)', flexShrink: 0 }} />
              <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                Install community skills directly into your Hermes skills directory.
              </span>
            </div>

            <input
              className="input-field"
              placeholder="Search marketplace..."
              value={browseQuery}
              onChange={(e) => setBrowseQuery(e.target.value)}
              style={{ fontSize: 13 }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredMarket.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                  No skills match &ldquo;{browseQuery}&rdquo;
                </div>
              )}
              {filteredMarket.map((m) => {
                const isDone = marketDone.has(m.name);
                const isBusy = marketBusy === m.name;
                const errMsg = marketError[m.name];
                const alreadyInstalled = skills.some((s) => s.name === m.name);
                return (
                  <div
                    key={m.name}
                    style={{
                      background: 'var(--bg2)',
                      border: `1px solid ${isDone ? 'rgba(34,197,94,0.3)' : errMsg ? 'rgba(239,68,68,0.25)' : 'var(--border)'}`,
                      borderRadius: 10,
                      padding: '13px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      transition: 'border-color 0.2s',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3, fontFamily: 'var(--font-mono)' }}>
                        {m.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.description}
                      </div>
                      {errMsg && (
                        <div style={{ fontSize: 11, color: 'var(--accent-red)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                          {errMsg}
                        </div>
                      )}
                    </div>

                    {alreadyInstalled && !isDone && (
                      <span className="badge badge-connected" style={{ flexShrink: 0, fontSize: 10 }}>installed</span>
                    )}

                    <button
                      className={`btn btn-sm ${isDone ? 'btn-success' : errMsg ? 'btn-danger' : 'btn-ghost'}`}
                      onClick={() => handleMarketInstall(m.name)}
                      disabled={isBusy || isDone || alreadyInstalled}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                        opacity: isBusy ? 0.7 : 1,
                        cursor: isDone || alreadyInstalled ? 'default' : 'pointer',
                        fontSize: 12,
                      }}
                    >
                      {isDone
                        ? <><CheckCircle size={12} /> Installed</>
                        : isBusy
                          ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Installing...</>
                          : errMsg
                            ? <><XCircle size={12} /> Retry</>
                            : alreadyInstalled
                              ? <><CheckCircle size={12} /> Installed</>
                              : <><Download size={12} /> Install</>
                      }
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
