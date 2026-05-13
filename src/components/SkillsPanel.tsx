import React, { useState, useEffect } from 'react';
import { useStore, Skill } from '../store';
import { Zap, Plus, Edit2, Trash2, Play, X, Save, ChevronDown } from 'lucide-react';
import { runHermesCommand, writeFile } from '../api/desktop';

const generateId = () => Math.random().toString(36).slice(2);

const SOURCE_BADGE: Record<string, string> = {
  builtin: 'badge-info',
  user: 'badge-connected',
  imported: 'badge-beta',
};

export default function SkillsPanel() {
  const { skills, addSkill, updateSkill, deleteSkill } = useStore();
  const [editSkill, setEditSkill] = useState<Skill | null>(null);
  const [newSkill, setNewSkill] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', content: '' });
  const [invokeOutput, setInvokeOutput] = useState<Record<string, string>>({});
  const [invoking, setInvoking] = useState<Record<string, boolean>>({});

  // Load skills from Hermes on mount (best-effort)
  useEffect(() => {
    runHermesCommand(['skills', 'list']).then(result => {
      if (!result.success) return;
      try {
        const parsed = JSON.parse(result.stdout);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: { name?: string; description?: string; content?: string }) => {
            if (!item.name) return;
            const alreadyInStore = skills.find(s => s.name === item.name);
            if (!alreadyInStore) {
              addSkill({
                id: generateId(),
                name: item.name,
                description: item.description ?? '',
                content: item.content ?? '',
                source: 'imported',
              });
            }
          });
        }
      } catch {
        // Line-based fallback: each line is a skill name
        const lines = result.stdout.split('\n').map(l => l.trim()).filter(Boolean);
        lines.forEach(name => {
          const alreadyInStore = skills.find(s => s.name === name);
          if (!alreadyInStore) {
            addSkill({ id: generateId(), name, description: '', content: '', source: 'imported' });
          }
        });
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!form.name) return;
    if (editSkill) {
      updateSkill(editSkill.id, form);
    } else {
      addSkill({ id: generateId(), ...form, source: 'user' });
    }
    // Persist to ~/.hermes/skills/<name>.md (best-effort)
    await writeFile(`skills/${form.name}.md`, form.content).catch(() => {});
    setEditSkill(null);
    setNewSkill(false);
    setForm({ name: '', description: '', content: '' });
  };

  const handleDelete = (s: Skill) => {
    deleteSkill(s.id);
    runHermesCommand(['skills', 'delete', s.name]).catch(() => {});
  };

  const handleInvoke = async (s: Skill) => {
    // Toggle off if output already shown
    if (invokeOutput[s.id] !== undefined) {
      setInvokeOutput(prev => { const next = { ...prev }; delete next[s.id]; return next; });
      return;
    }
    setInvoking(prev => ({ ...prev, [s.id]: true }));
    try {
      const result = await runHermesCommand(['skills', 'run', s.name]);
      setInvokeOutput(prev => ({ ...prev, [s.id]: result.stdout || result.stderr || '(no output)' }));
    } catch {
      setInvokeOutput(prev => ({ ...prev, [s.id]: '(invoke failed)' }));
    } finally {
      setInvoking(prev => ({ ...prev, [s.id]: false }));
    }
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

  const isEditing = editSkill !== null || newSkill;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 800 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Zap size={20} style={{ color: 'var(--accent-green)' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Skills Browser</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Manage Hermes skills — reusable instruction sets</div>
          </div>
          <button className="btn btn-primary" onClick={openNew} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
            <Plus size={14} /> New Skill
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isEditing ? '1fr 1fr' : '1fr', gap: 16 }}>
          {/* Skill Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {skills.map((s) => (
              <div key={s.id}>
                <div
                  style={{
                    background: editSkill?.id === s.id ? 'var(--accent-green-dim)' : 'var(--bg2)',
                    border: `1px solid ${editSkill?.id === s.id ? 'var(--accent-green)' : 'var(--border)'}`,
                    borderRadius: 10,
                    padding: '13px 16px',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13.5, color: 'var(--accent-green)' }}>/{s.name}</span>
                        <span className={`badge ${SOURCE_BADGE[s.source] ?? 'badge-muted'}`}>{s.source}</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{s.description}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => handleInvoke(s)}
                        title="Invoke"
                        disabled={invoking[s.id]}
                        style={{
                          background: 'var(--accent-green-dim)',
                          border: '1px solid rgba(34,197,94,0.3)',
                          borderRadius: 6,
                          padding: '4px 8px',
                          cursor: invoking[s.id] ? 'wait' : 'pointer',
                          color: 'var(--accent-green)',
                          fontSize: 11,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          opacity: invoking[s.id] ? 0.6 : 1,
                        }}
                      >
                        {invokeOutput[s.id] !== undefined
                          ? <><ChevronDown size={11} /> Hide</>
                          : <><Play size={11} /> {invoking[s.id] ? 'Running…' : 'Invoke'}</>
                        }
                      </button>
                      <button
                        onClick={() => openEdit(s)}
                        title="Edit"
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: 5, cursor: 'pointer', color: 'var(--text-secondary)', transition: 'color 0.15s, border-color 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-green)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-green)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                      ><Edit2 size={13} /></button>
                      <button
                        onClick={() => handleDelete(s)}
                        title="Delete"
                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: 5, cursor: 'pointer', color: 'var(--text-secondary)', transition: 'color 0.15s, border-color 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-red)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-red)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                      ><Trash2 size={13} /></button>
                    </div>
                  </div>
                </div>

                {/* Invoke output area */}
                {invokeOutput[s.id] !== undefined && (
                  <div
                    className="animate-in terminal"
                    style={{ marginTop: 4, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: 'none' }}
                  >
                    <div className="terminal-bar" style={{ padding: '5px 12px', fontSize: 11 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>skills run {s.name}</span>
                    </div>
                    <div className="terminal-body" style={{ padding: '10px 12px', maxHeight: 200, overflowY: 'auto' }}>
                      <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--term-green)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{invokeOutput[s.id]}</pre>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {skills.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                No skills yet. Click <strong>New Skill</strong> to create one.
              </div>
            )}
          </div>

          {/* Editor */}
          {isEditing && (
            <div className="animate-in" style={{ background: 'var(--bg2)', border: '1px solid var(--border-active)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{newSkill ? 'New Skill' : `Edit /${editSkill?.name}`}</div>
                <button onClick={() => { setEditSkill(null); setNewSkill(false); }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Skill Name</label>
                <input className="input-field" placeholder="summarize" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Description</label>
                <input className="input-field" placeholder="Summarize text, documents, or URLs" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Content (Markdown)</label>
                <textarea
                  className="input-field"
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  rows={10}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><Save size={13} /> Save Skill</button>
                <button className="btn btn-ghost" onClick={() => { setEditSkill(null); setNewSkill(false); }} style={{ fontSize: 13 }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
