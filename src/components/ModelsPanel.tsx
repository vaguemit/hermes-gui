import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, Plus, Trash2, Check, ChevronDown, RefreshCw, Zap } from 'lucide-react';
import { readFile, writeFile } from '../api/desktop';
import { useStore } from '../store';
import { useHermesClient } from '../lib/hermes';

interface SavedModel {
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
}

const PROVIDERS = ['auto', 'openrouter', 'openai', 'anthropic', 'groq', 'ollama', 'custom'];

const PROVIDER_COLORS: Record<string, string> = {
  openrouter: 'var(--accent-amber)',
  openai: 'var(--accent-green)',
  anthropic: 'var(--accent-blue)',
  groq: 'var(--accent-green)',
  ollama: 'var(--text-secondary)',
  custom: 'var(--text-secondary)',
  auto: 'var(--text-secondary)',
};

const EMPTY_FORM = { name: '', provider: 'auto', model: '', baseUrl: '' };

function providerLabel(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

export default function ModelsPanel() {
  const client = useHermesClient();
  const { setActiveModel, setActiveSection } = useStore();

  const [models, setModels] = useState<SavedModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [activatedName, setActivatedName] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const [raw, cfg] = await Promise.allSettled([
        readFile('models.json'),
        client.getModelConfig(),
      ]);

      if (raw.status === 'fulfilled' && raw.value && raw.value.trim()) {
        try {
          const parsed = JSON.parse(raw.value);
          if (Array.isArray(parsed)) setModels(parsed);
        } catch {
          // treat as empty
        }
      }

      if (cfg.status === 'fulfilled' && cfg.value.model) {
        setActiveModelId(`${cfg.value.provider}::${cfg.value.model}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const persist = async (updated: SavedModel[]) => {
    await writeFile('models.json', JSON.stringify(updated, null, 2)).catch(() => {});
  };

  const handleActivate = async (m: SavedModel) => {
    await client.setModelConfig(m.provider, m.model, m.baseUrl).catch(() => {});
    setActiveModel(m.model);
    setActiveModelId(`${m.provider}::${m.model}`);
    setActivatedName(m.name);
    setTimeout(() => setActivatedName(null), 1800);
  };

  const handleDelete = async (idx: number) => {
    const updated = models.filter((_, i) => i !== idx);
    setModels(updated);
    await persist(updated);
  };

  const handleAdd = async () => {
    setFormError('');
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    if (!form.model.trim()) { setFormError('Model ID is required.'); return; }
    setSaving(true);
    const entry: SavedModel = {
      name: form.name.trim(),
      provider: form.provider,
      model: form.model.trim(),
      baseUrl: form.baseUrl.trim(),
    };
    const updated = [...models, entry];
    setModels(updated);
    await persist(updated);
    setForm(EMPTY_FORM);
    setFormOpen(false);
    setSaving(false);
  };

  const isActive = (m: SavedModel) => activeModelId === `${m.provider}::${m.model}`;

  // Group models by provider
  const grouped: Record<string, { model: SavedModel; idx: number }[]> = {};
  models.forEach((m, idx) => {
    const key = m.provider || 'other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ model: m, idx });
  });
  const groupKeys = Object.keys(grouped).sort();

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 780 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Cpu size={20} style={{ color: 'var(--accent-green)' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Saved Models</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Browse, activate, and manage named model configurations
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={loadModels}
              disabled={loading}
              title="Refresh"
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              <RefreshCw size={13} style={{ opacity: loading ? 0.5 : 1 }} />
              Refresh
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { setFormOpen(v => !v); setFormError(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            >
              {formOpen ? <ChevronDown size={14} /> : <Plus size={14} />}
              {formOpen ? 'Cancel' : 'Add Model'}
            </button>
          </div>
        </div>

        {/* Add form */}
        {formOpen && (
          <div
            className="animate-in"
            style={{
              background: 'var(--bg2)',
              border: '1px solid var(--border-active)',
              borderRadius: 'var(--radius-md)',
              padding: '16px 18px',
              marginBottom: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>New Model Configuration</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
                  Name <span style={{ color: 'var(--accent-red)' }}>*</span>
                </label>
                <input
                  className="input-field"
                  placeholder="GPT-4o Fast"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
                  Provider
                </label>
                <select
                  className="input-field"
                  value={form.provider}
                  onChange={e => setForm({ ...form, provider: e.target.value })}
                  style={{ cursor: 'pointer' }}
                >
                  {PROVIDERS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
                  Model ID <span style={{ color: 'var(--accent-red)' }}>*</span>
                </label>
                <input
                  className="input-field"
                  placeholder="anthropic/claude-3-5-sonnet-20241022"
                  value={form.model}
                  onChange={e => setForm({ ...form, model: e.target.value })}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
                  Base URL <span style={{ color: 'var(--text-label)' }}>(optional)</span>
                </label>
                <input
                  className="input-field"
                  placeholder="https://... or leave blank"
                  value={form.baseUrl}
                  onChange={e => setForm({ ...form, baseUrl: e.target.value })}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
                />
              </div>
            </div>

            {formError && (
              <div style={{ fontSize: 12, color: 'var(--accent-red)' }}>{formError}</div>
            )}

            <div>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleAdd}
                disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
              >
                <Plus size={13} />
                {saving ? 'Saving…' : 'Add Model'}
              </button>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            Loading models…
          </div>
        )}

        {/* Empty state */}
        {!loading && models.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <Cpu size={32} style={{ color: 'var(--text-tertiary)' }} />
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No saved models yet.</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 320 }}>
              Add a model configuration above, or start the gateway to use available models.
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setActiveSection('gateway')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 4 }}
            >
              <Zap size={13} />
              Go to Gateway
            </button>
          </div>
        )}

        {/* Grouped model cards */}
        {!loading && models.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {groupKeys.map((provider) => (
              <div key={provider}>
                <div
                  className="section-label"
                  style={{ marginBottom: 8 }}
                >
                  {providerLabel(provider)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {grouped[provider].map(({ model: m, idx }) => {
                    const active = isActive(m);
                    const justActivated = activatedName === m.name;
                    return (
                      <div
                        key={idx}
                        style={{
                          background: active ? 'var(--accent-green-dim)' : 'var(--bg2)',
                          border: `1px solid ${active ? 'var(--accent-green)' : 'var(--border)'}`,
                          borderRadius: 'var(--radius-md)',
                          padding: '13px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          transition: 'border-color 0.15s, background 0.15s',
                        }}
                      >
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: 13.5 }}>{m.name}</span>
                            <span
                              className="badge"
                              style={{
                                color: PROVIDER_COLORS[m.provider] ?? 'var(--text-secondary)',
                                border: `1px solid ${PROVIDER_COLORS[m.provider] ?? 'var(--border)'}`,
                                background: 'transparent',
                                fontSize: 10.5,
                                padding: '1px 7px',
                                borderRadius: 20,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {m.provider}
                            </span>
                            {active && (
                              <span className="badge badge-connected" style={{ fontSize: 10.5 }}>
                                active
                              </span>
                            )}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                            {m.model}
                          </div>
                          {m.baseUrl && (
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                              {m.baseUrl}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            className={`btn btn-sm ${active ? 'btn-ghost' : 'btn-success'}`}
                            onClick={() => handleActivate(m)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, minWidth: 100 }}
                          >
                            <Check size={12} />
                            {justActivated ? 'Activated!' : active ? 'Active' : 'Set as Active'}
                          </button>
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => handleDelete(idx)}
                            title="Delete"
                            style={{ color: 'var(--text-secondary)', transition: 'color 0.15s, border-color 0.15s' }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLElement).style.color = 'var(--accent-red)';
                              (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-red)';
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                              (e.currentTarget as HTMLElement).style.borderColor = '';
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
