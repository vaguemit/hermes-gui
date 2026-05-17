import React, { useState, useEffect, useRef } from 'react';
import { useStore, Skill } from '../store';
import { Zap, Plus, Edit2, Trash2, Play, X, Save, Copy, Check } from 'lucide-react';
import { readFile, writeFile } from '../api/desktop';

const generateId = () => Math.random().toString(36).slice(2);

const SKILLS_FILE = 'gui-skills.json';

const SOURCE_BADGE: Record<string, string> = {
  builtin: 'badge-info',
  user: 'badge-connected',
  imported: 'badge-beta',
};

export default function SkillsPanel() {
  const { skills, addSkill, updateSkill, deleteSkill, setActiveSection } = useStore();
  const [editSkill, setEditSkill] = useState<Skill | null>(null);
  const [newSkill, setNewSkill] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', content: '' });
  const [invokedId, setInvokedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted skills from disk on mount (overrides defaults if file exists)
  useEffect(() => {
    readFile(SKILLS_FILE).then(raw => {
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
  }, []);

  // Debounced persist to disk whenever skills change (after initial load)
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      writeFile(SKILLS_FILE, JSON.stringify(skills, null, 2)).catch(() => {});
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

  // Inject skill content into chat input and navigate to chat tab
  const handleInvoke = (s: Skill) => {
    if (!s.content.trim()) return;
    setActiveSection('chat');
    // Give React time to mount the chat panel before injecting
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
    // Clear the "just invoked" highlight after a moment
    setTimeout(() => setInvokedId(prev => prev === s.id ? null : prev), 1200);
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

  const isEditing = editSkill !== null || newSkill;

  const filteredSkills = query.trim()
    ? skills.filter(s =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        s.description.toLowerCase().includes(query.toLowerCase())
      )
    : skills;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 860 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Zap size={20} style={{ color: 'var(--accent-green)' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Skills Browser</div>
              {skills.length > 0 && (
                <span className="badge badge-muted">{skills.length}</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Reusable instruction sets — invoke to pre-fill chat</div>
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={openNew}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}
          >
            <Plus size={14} /> New Skill
          </button>
        </div>

        {/* Search */}
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
            {filteredSkills.map((s) => (
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

                {/* Content preview (collapsed, single line) */}
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
      </div>
    </div>
  );
}
