import React, { useState } from 'react';
import { useStore, Skill } from '../store';
import { Zap, Plus, Edit2, Trash2, Play, X, Save } from 'lucide-react';

const generateId = () => Math.random().toString(36).slice(2);

const SOURCE_BADGE: Record<string, string> = {
  builtin: 'badge-blue',
  user: 'badge-accent',
  imported: 'badge-success',
};

export default function SkillsPanel() {
  const { skills, addSkill, updateSkill, deleteSkill, setPaletteOpen } = useStore();
  const [editSkill, setEditSkill] = useState<Skill | null>(null);
  const [newSkill, setNewSkill] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', content: '' });

  const handleSave = () => {
    if (!form.name) return;
    if (editSkill) {
      updateSkill(editSkill.id, form);
    } else {
      addSkill({ id: generateId(), ...form, source: 'user' });
    }
    setEditSkill(null);
    setNewSkill(false);
    setForm({ name: '', description: '', content: '' });
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
          <Zap size={20} style={{ color: 'var(--accent)' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Skills Browser</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Manage Hermes skills — reusable instruction sets</div>
          </div>
          <button className="btn-primary" onClick={openNew} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
            <Plus size={14} /> New Skill
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isEditing ? '1fr 1fr' : '1fr', gap: 16 }}>
          {/* Skill Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {skills.map((s) => (
              <div
                key={s.id}
                style={{ background: editSkill?.id === s.id ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${editSkill?.id === s.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: '13px 16px', transition: 'border-color 0.15s, background 0.15s' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13.5, color: 'var(--accent)' }}>/{s.name}</span>
                      <span className={`badge ${SOURCE_BADGE[s.source]}`}>{s.source}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{s.description}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => { setPaletteOpen(false); /* fill /{s.name} in chat */ }}
                      title="Invoke"
                      style={{ background: 'var(--accent-dim)', border: '1px solid rgba(124,106,247,0.3)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--accent)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      <Play size={11} /> Invoke
                    </button>
                    <button onClick={() => openEdit(s)} title="Edit" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: 5, cursor: 'pointer', color: 'var(--text-muted)', transition: 'color 0.15s, border-color 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                    ><Edit2 size={13} /></button>
                    <button onClick={() => deleteSkill(s.id)} title="Delete" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: 5, cursor: 'pointer', color: 'var(--text-muted)', transition: 'color 0.15s, border-color 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--error)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--error)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                    ><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Editor */}
          {isEditing && (
            <div className="animate-in" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{newSkill ? 'New Skill' : `Edit /${editSkill?.name}`}</div>
                <button onClick={() => { setEditSkill(null); setNewSkill(false); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Skill Name</label>
                <input className="input-field" placeholder="summarize" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ fontFamily: 'monospace' }} />
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
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-primary" onClick={handleSave} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><Save size={13} /> Save Skill</button>
                <button className="btn-ghost" onClick={() => { setEditSkill(null); setNewSkill(false); }} style={{ fontSize: 13 }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
