import React, { useState, useEffect, useRef } from 'react';
import { useStore, Skill } from '../store';
import { Zap, Plus, Edit2, Trash2, Play, X, Save, Copy, Check, CopyPlus, Package, Download, Tag } from 'lucide-react';
import { useHermesClient } from '../lib/hermes';
import type { SkillMeta } from '../lib/hermes';

const generateId = () => Math.random().toString(36).slice(2);

const SKILLS_FILE = 'gui-skills.json';

const SOURCE_BADGE: Record<string, string> = {
  builtin: 'badge-info',
  user: 'badge-connected',
  imported: 'badge-beta',
};

// Derive a display category from a skill's name
function deriveCategory(name: string): string {
  if (name.startsWith('claude-mem:') || name.includes(':mem')) return 'Memory';
  if (name.includes('gateway') || name.includes('server') || name.includes('proxy')) return 'Gateway';
  if (name.includes('agent') || name.includes('run') || name.includes('exec')) return 'Agents';
  if (name.includes('code') || name.includes('review') || name.includes('refactor') || name.includes('debug')) return 'Code';
  if (name.includes('file') || name.includes('read') || name.includes('write')) return 'Files';
  if (name.includes('graph') || name.includes('search') || name.includes('explore')) return 'Search';
  return 'General';
}

export default function SkillsPanel() {
  const client = useHermesClient();
  const { skills, addSkill, updateSkill, deleteSkill, setActiveSection } = useStore();
  const [tab, setTab] = useState<'installed' | 'browse'>('installed');
  const [editSkill, setEditSkill] = useState<Skill | null>(null);
  const [newSkill, setNewSkill] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', content: '' });
  const [invokedId, setInvokedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [browseQuery, setBrowseQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hermesSkills, setHermesSkills] = useState<SkillMeta[]>([]);
  const [installingSkill, setInstallingSkill] = useState<string | null>(null);
  const [installedDone, setInstalledDone] = useState<Set<string>>(new Set());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted skills from disk on mount
  useEffect(() => {
    client.readFile(SKILLS_FILE).then(raw => {
      if (!raw) { setLoaded(true); return; }
      try {
        const parsed: Skill[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          useStore.setState({ skills: parsed });
        }
      } catch {
        // ignore corrupt file
      }
      setLoaded(true);
    }).catch(() => setLoaded(true));
    client.listSkills().then(setHermesSkills).catch(() => {});
  }, []);

  // Debounced persist to disk whenever skills change
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      client.writeFile(SKILLS_FILE, JSON.stringify(skills, null, 2)).catch(() => {});
    }, 500);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [skills, loaded]);

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (editSkill) {
      updateSkill(editSkill.id, { name: form.name.trim(), description: form.description, content: form.content });
    } else {
      addSkill({ id: generateId(), name: form.name.trim(), description: form.description, content: form.content, source: 'user' });
    }
    setEditSkill(null);
    setNewSkill(false);
    setForm({ name: '', description: '', content: '' });
  };

  const handleFormKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  const handleDelete = (s: Skill) => {
    deleteSkill(s.id);
    if (invokedId === s.id) setInvokedId(null);
    if (editSkill?.id === s.id) { setEditSkill(null); setNewSkill(false); }
  };

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
    setTimeout(() => setInvokedId(prev => prev === s.id ? null : prev), 1200);
  };

  const handleDuplicate = (s: Skill) => {
    addSkill({
      id: generateId(),
      name: `${s.name}-copy`,
      description: s.description,
      content: s.content,
      source: 'user',
    });
  };

  const handleCopy = (s: Skill) => {
    navigator.clipboard.writeText(s.content).then(() => {
      setCopiedId(s.id);
      setTimeout(() => setCopiedId(prev => prev === s.id ? null : prev), 1500);
    }).catch(() => {});
  };

  const openEdit = (s: Skill) => {
    setForm({ name: s.name, description: s.description, content: s.content });
    setEditSkill(s);
    setNewSkill(false);
  };

  const openNew = () => {
    setForm({ name: '', description: '', content: '# Skill Name\n\nDescribe what the skill does and how Hermes should execute it.\n' });
    setNewSkill(true);
    setEditSkill(null);
  };

  const cancelEdit = () => {
    setEditSkill(null);
    setNewSkill(false);
    setForm({ name: '', description: '', content: '' });
  };

  const handleInstall = (skillName: string) => {
    setInstallingSkill(skillName);
    client.runHermesCommand(['skills', 'install', skillName]).then(() => {
      setInstalledDone(prev => new Set(prev).add(skillName));
      setTimeout(() => {
        setInstalledDone(prev => {
          const next = new Set(prev);
          next.delete(skillName);
          return next;
        });
        setInstallingSkill(prev => prev === skillName ? null : prev);
      }, 2000);
    }).catch(() => {
      setInstallingSkill(prev => prev === skillName ? null : prev);
    });
  };

  const isEditing = editSkill !== null || newSkill;

  // Installed tab — filter by search query
  const filteredSkills = query.trim()
    ? skills.filter(s =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.description.toLowerCase().includes(query.toLowerCase())
      )
    : skills;

  // Group installed skills by source
  const groups: Array<{ label: string; key: string; items: Skill[] }> = [
    { label: 'User', key: 'user', items: filteredSkills.filter(s => s.source === 'user') },
    { label: 'Imported', key: 'imported', items: filteredSkills.filter(s => s.source === 'imported') },
    { label: 'Builtin', key: 'builtin', items: filteredSkills.filter(s => s.source === 'builtin') },
  ].filter(g => g.items.length > 0);

  // Browse tab — derive categories from hermesSkills
  const allCategories = Array.from(new Set(hermesSkills.map(s => deriveCategory(s.name)))).sort();

  const filteredBrowse = hermesSkills.filter(s => {
    const q = browseQuery.toLowerCase();
    const matchesQuery = !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
    const matchesCat = !selectedCategory || deriveCategory(s.name) === selectedCategory;
    return matchesQuery && matchesCat;
  });

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 860 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Zap size={20} style={{ color: 'var(--accent-green)' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Skills Browser</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Reusable instruction sets — invoke to pre-fill chat</div>
          </div>
          {tab === 'installed' && (
            <button
              className="btn btn-primary btn-sm"
              onClick={openNew}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}
            >
              <Plus size={14} /> New Skill
            </button>
          )}
        </div>

        {/* Tab bar */}
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
            <Download size={13} />
            Browse
            {hermesSkills.length > 0 && (
              <span className="badge badge-muted" style={{ fontSize: 10, marginLeft: 2 }}>{hermesSkills.length}</span>
            )}
          </button>
        </div>

        {/* INSTALLED TAB */}
        {tab === 'installed' && (
          <>
            {skills.length > 3 && (
              <input
                className="input-field"
                placeholder="Filter skills..."
                value={query}
                onChange={e => setQuery(e.target.value)}
                style={{ marginBottom: 12, fontSize: 13 }}
              />
            )}

            <div style={{ display: 'grid', gridTemplateColumns: isEditing ? '1fr 1fr' : '1fr', gap: 16 }}>
              {/* Skill list with source grouping */}
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
                      {group.items.map((s) => (
                        <div
                          key={s.id}
                          style={{
                            background: editSkill?.id === s.id ? 'var(--accent-green-dim)' : 'var(--bg2)',
                            border: `1px solid ${editSkill?.id === s.id ? 'var(--accent-green)' : invokedId === s.id ? 'var(--accent-amber)' : 'var(--border)'}`,
                            borderRadius: 10,
                            padding: '13px 16px',
                            transition: 'border-color 0.2s, background 0.2s',
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

                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              {/* Invoke */}
                              <button
                                onClick={() => handleInvoke(s)}
                                title="Load into chat input"
                                style={{
                                  background: invokedId === s.id ? 'var(--accent-amber-dim)' : 'var(--accent-green-dim)',
                                  border: `1px solid ${invokedId === s.id ? 'rgba(245,158,11,0.4)' : 'rgba(34,197,94,0.3)'}`,
                                  borderRadius: 6,
                                  padding: '4px 9px',
                                  cursor: 'pointer',
                                  color: invokedId === s.id ? 'var(--accent-amber)' : 'var(--accent-green)',
                                  fontSize: 11,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  transition: 'all 0.2s',
                                }}
                              >
                                <Play size={11} /> {invokedId === s.id ? 'Sent!' : 'Invoke'}
                              </button>

                              {/* Copy content */}
                              <button
                                onClick={() => handleCopy(s)}
                                title="Copy content to clipboard"
                                style={{
                                  background: 'none',
                                  border: '1px solid var(--border)',
                                  borderRadius: 6,
                                  padding: 5,
                                  cursor: 'pointer',
                                  color: copiedId === s.id ? 'var(--accent-green)' : 'var(--text-secondary)',
                                  borderColor: copiedId === s.id ? 'var(--accent-green)' : 'var(--border)',
                                  transition: 'color 0.15s, border-color 0.15s',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                              >
                                {copiedId === s.id ? <Check size={13} /> : <Copy size={13} />}
                              </button>

                              {/* Edit */}
                              <button
                                onClick={() => openEdit(s)}
                                title="Edit"
                                style={{
                                  background: 'none',
                                  border: '1px solid var(--border)',
                                  borderRadius: 6,
                                  padding: 5,
                                  cursor: 'pointer',
                                  color: 'var(--text-secondary)',
                                  transition: 'color 0.15s, border-color 0.15s',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                                onMouseEnter={e => {
                                  (e.currentTarget as HTMLElement).style.color = 'var(--accent-green)';
                                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-green)';
                                }}
                                onMouseLeave={e => {
                                  (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                                }}
                              >
                                <Edit2 size={13} />
                              </button>

                              {/* Duplicate */}
                              <button
                                onClick={() => handleDuplicate(s)}
                                title="Duplicate skill"
                                style={{
                                  background: 'none',
                                  border: '1px solid var(--border)',
                                  borderRadius: 6,
                                  padding: 5,
                                  cursor: 'pointer',
                                  color: 'var(--text-secondary)',
                                  transition: 'color 0.15s, border-color 0.15s',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                                onMouseEnter={e => {
                                  (e.currentTarget as HTMLElement).style.color = 'var(--accent-green)';
                                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-green)';
                                }}
                                onMouseLeave={e => {
                                  (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                                }}
                              >
                                <CopyPlus size={13} />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => handleDelete(s)}
                                title="Delete"
                                style={{
                                  background: 'none',
                                  border: '1px solid var(--border)',
                                  borderRadius: 6,
                                  padding: 5,
                                  cursor: 'pointer',
                                  color: 'var(--text-secondary)',
                                  transition: 'color 0.15s, border-color 0.15s',
                                  display: 'flex',
                                  alignItems: 'center',
                                }}
                                onMouseEnter={e => {
                                  (e.currentTarget as HTMLElement).style.color = 'var(--accent-red)';
                                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-red)';
                                }}
                                onMouseLeave={e => {
                                  (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
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
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Editor panel */}
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

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
                      Skill Name
                    </label>
                    <input
                      className="input-field"
                      placeholder="summarize"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      style={{ fontFamily: 'var(--font-mono)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
                      Description
                    </label>
                    <input
                      className="input-field"
                      placeholder="What does this skill do?"
                      value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                    />
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
                      Content
                    </label>
                    <textarea
                      className="input-field"
                      value={form.content}
                      onChange={e => setForm({ ...form, content: e.target.value })}
                      rows={12}
                      placeholder="Write the prompt or instructions for this skill..."
                      style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleSave}
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <Save size={13} /> Save
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* BROWSE TAB */}
        {tab === 'browse' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Search */}
            <input
              className="input-field"
              placeholder="Search skills..."
              value={browseQuery}
              onChange={e => setBrowseQuery(e.target.value)}
              style={{ fontSize: 13 }}
            />

            {/* Category filter pills */}
            {allCategories.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <Tag size={13} style={{ color: 'var(--text-secondary)', alignSelf: 'center' }} />
                {allCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(prev => prev === cat ? null : cat)}
                    className={`badge ${selectedCategory === cat ? 'badge-connected' : 'badge-muted'}`}
                    style={{
                      cursor: 'pointer',
                      border: 'none',
                      fontSize: 11,
                      padding: '3px 9px',
                      borderRadius: 'var(--radius-sm)',
                      transition: 'all 0.15s',
                    }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Skills list */}
            {hermesSkills.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                No backend skills found. Make sure Hermes is running.
              </div>
            )}
            {filteredBrowse.length === 0 && hermesSkills.length > 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                No skills match your filter.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filteredBrowse.map(s => {
                const cat = deriveCategory(s.name);
                const isDone = installedDone.has(s.name);
                const isInstalling = installingSkill === s.name;
                return (
                  <div
                    key={s.name}
                    style={{
                      background: 'var(--bg2)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      padding: '13px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      transition: 'border-color 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-hover)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
                        {s.name}
                      </div>
                      {s.description && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.description}
                        </div>
                      )}
                    </div>
                    <span className="badge badge-muted" style={{ fontSize: 10, flexShrink: 0 }}>
                      {cat}
                    </span>
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => !isDone && !isInstalling && handleInstall(s.name)}
                      disabled={isInstalling}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        flexShrink: 0,
                        color: isDone ? 'var(--accent-green)' : undefined,
                        borderColor: isDone ? 'var(--accent-green)' : undefined,
                        opacity: isInstalling ? 0.6 : 1,
                        cursor: isDone || isInstalling ? 'default' : 'pointer',
                        fontSize: 12,
                      }}
                    >
                      {isDone
                        ? <><Check size={12} /> Installed</>
                        : isInstalling
                          ? 'Installing...'
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
