import React, { useState } from 'react';
import { useStore, CronJob } from '../store';
import { Clock, Plus, Trash2, Play, ToggleLeft, ToggleRight } from 'lucide-react';

const generateId = () => Math.random().toString(36).slice(2);

const STATUS_COLORS: Record<string, string> = { active: 'var(--success)', inactive: 'var(--text-muted)', error: 'var(--error)' };

export default function CronPanel() {
  const { crons, addCron, toggleCron, deleteCron, platforms } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ schedule: '', description: '', platform: 'Telegram' });

  const handleAdd = () => {
    if (!form.schedule || !form.description) return;
    addCron({ id: generateId(), ...form, active: true });
    setForm({ schedule: '', description: '', platform: 'Telegram' });
    setShowForm(false);
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 700 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Clock size={20} style={{ color: 'var(--accent)' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Cron Scheduler</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Scheduled tasks delivered to any platform</div>
          </div>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
            <Plus size={14} /> New Cron
          </button>
        </div>

        {/* Add Cron Form */}
        {showForm && (
          <div className="animate-in" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 14 }}>Add Scheduled Task</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Schedule</label>
                <input
                  className="input-field"
                  placeholder="e.g. every day at 9am"
                  value={form.schedule}
                  onChange={e => setForm({ ...form, schedule: e.target.value })}
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Natural language — Hermes parses this</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Delivery Platform</label>
                <select
                  className="input-field"
                  value={form.platform}
                  onChange={e => setForm({ ...form, platform: e.target.value })}
                  style={{ cursor: 'pointer' }}
                >
                  {platforms.map(p => <option key={p.name}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Task Description</label>
              <textarea
                className="input-field"
                placeholder="What should Hermes do? e.g. Send me a morning briefing with weather and top news"
                rows={3}
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-primary" onClick={handleAdd} style={{ fontSize: 13 }}>Add Task</button>
              <button className="btn-ghost" onClick={() => setShowForm(false)} style={{ fontSize: 13 }}>Cancel</button>
              <button className="btn-ghost" style={{ fontSize: 13, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}><Play size={12} /> Test Run</button>
            </div>
          </div>
        )}

        {/* Cron List */}
        {crons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
            <Clock size={32} style={{ margin: '0 auto 12px', opacity: 0.2, display: 'block' }} />
            <div style={{ fontSize: 14 }}>No scheduled tasks</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Create one with "New Cron" above</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {crons.map((c) => (
              <div key={c.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.description}</span>
                    <span className={`badge ${c.active ? 'badge-success' : 'badge-muted'}`}>{c.active ? 'Active' : 'Paused'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span>🕐 {c.schedule}</span>
                    <span>📡 {c.platform}</span>
                    {c.lastRun && <span>↩ Last: {c.lastRun}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                  <label className="toggle">
                    <input type="checkbox" checked={c.active} onChange={() => toggleCron(c.id)} />
                    <span className="toggle-slider" />
                  </label>
                  <button
                    onClick={() => deleteCron(c.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6, borderRadius: 6, transition: 'color 0.15s, background 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--error)'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
