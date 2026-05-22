import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, Plus, Trash2, Check, ChevronDown, RefreshCw, Zap, Search, X } from 'lucide-react';
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

function detectProvider(modelId: string): string {
  if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3')) return 'OpenAI';
  if (modelId.startsWith('claude')) return 'Anthropic';
  if (modelId.startsWith('gemini')) return 'Google';
  if (modelId.startsWith('llama') || modelId.startsWith('mistral') || modelId.startsWith('deepseek')) return 'Open Source';
  return 'Custom';
}

export default function ModelsPanel() {
  const client = useHermesClient();
  const { activeModel, setActiveModel, setActiveSection } = useStore();

  // Saved (user-configured) models
  const [savedModels, setSavedModels] = useState<SavedModel[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [activeModelId, setActiveModelId] = useState<string | null>(null);
  const [activatedName, setActivatedName] = useState<string | null>(null);

  // Gateway-fetched models
  const [gatewayModels, setGatewayModels] = useState<string[]>([]);
  const [gatewayLoading, setGatewayLoading] = useState(true);
  const [gatewayError, setGatewayError] = useState<string | null>(null);

  // Search
  const [query, setQuery] = useState('');

  // Add form
  const [form, setForm] = useState(EMPTY_FORM);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadSaved = useCallback(async () => {
    setSavedLoading(true);
    try {
      const [raw, cfg] = await Promise.allSettled([
        client.readFile('models.json'),
        client.getModelConfig(),
      ]);

      if (raw.status === 'fulfilled' && raw.value && raw.value.trim()) {
        try {
          const parsed = JSON.parse(raw.value);
          if (Array.isArray(parsed)) setSavedModels(parsed);
        } catch {
          // treat as empty
        }
      }

      if (cfg.status === 'fulfilled' && cfg.value.model) {
        setActiveModelId(`${cfg.value.provider}::${cfg.value.model}`);
      }
    } finally {
      setSavedLoading(false);
    }
  }, [client]);

  const loadGatewayModels = useCallback(async () => {
    setGatewayLoading(true);
    setGatewayError(null);
    try {
      const list = await client.fetchModels();
      setGatewayModels(list);
    } catch {
      setGatewayError('Could not load models — is the gateway running?');
    } finally {
      setGatewayLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadSaved();
    loadGatewayModels();
  }, [loadSaved, loadGatewayModels]);

  const persist = async (updated: SavedModel[]) => {
    await client.writeFile('models.json', JSON.stringify(updated, null, 2)).catch(() => {});
  };

  const handleActivateSaved = async (m: SavedModel) => {
    await client.setModelConfig(m.provider, m.model, m.baseUrl).catch(() => {});
    setActiveModel(m.model);
    setActiveModelId(`${m.provider}::${m.model}`);
    setActivatedName(m.name);
    setTimeout(() => setActivatedName(null), 1800);
  };

  const handleActivateGateway = (modelId: string) => {
    setActiveModel(modelId);
    setActivatedName(modelId);
    setTimeout(() => setActivatedName(null), 1800);
  };

  const handleDelete = async (idx: number) => {
    const updated = savedModels.filter((_, i) => i !== idx);
    setSavedModels(updated);
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
    const updated = [...savedModels, entry];
    setSavedModels(updated);
    await persist(updated);
    setForm(EMPTY_FORM);
    setFormOpen(false);
    setSaving(false);
  };

  const isSavedActive = (m: SavedModel) => activeModelId === `${m.provider}::${m.model}`;
  const isGatewayActive = (modelId: string) => activeModel === modelId;

  // Filter gateway models by search query
  const filteredGateway = gatewayModels.filter(m =>
    m.toLowerCase().includes(query.toLowerCase())
  );

  // Filter saved models by search query (name or model ID)
  const filteredSaved = savedModels.filter(m =>
    m.name.toLowerCase().includes(query.toLowerCase()) ||
    m.model.toLowerCase().includes(query.toLowerCase())
  );

  // Group saved models by provider
  const grouped: Record<string, { model: SavedModel; idx: number }[]> = {};
  filteredSaved.forEach((m, idx) => {
    // find original index for delete
    const origIdx = savedModels.indexOf(m);
    const key = m.provider || 'other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ model: m, idx: origIdx });
  });
  const groupKeys = Object.keys(grouped).sort();

  const totalCount = gatewayModels.length + savedModels.length;
  const loading = savedLoading || gatewayLoading;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 780 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Cpu size={20} style={{ color: 'var(--accent-green)' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>Models</span>
              {!loading && totalCount > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--bg3)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 20,
                    padding: '1px 8px',
                  }}
                >
                  {totalCount}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Browse, activate, and manage model configurations
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { loadSaved(); loadGatewayModels(); }}
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

        {/* Search input */}
        <div
          style={{
            position: 'relative',
            marginBottom: 16,
          }}
        >
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: 11,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-tertiary)',
              pointerEvents: 'none',
            }}
          />
          <input
            className="input-field"
            placeholder="Filter models..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ paddingLeft: 32, paddingRight: query ? 32 : 12 }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-tertiary)',
                padding: 2,
                display: 'flex',
                alignItems: 'center',
              }}
              title="Clear"
            >
              <X size={13} />
            </button>
          )}
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

        {/* Error state for gateway */}
        {!loading && gatewayError && (
          <div
            style={{
              background: 'var(--accent-red-dim)',
              border: '1px solid var(--accent-red)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--accent-red)' }}>{gatewayError}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={loadGatewayModels}
              style={{ fontSize: 12, flexShrink: 0 }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Content */}
        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* Gateway models section */}
            {!gatewayError && (
              <div>
                <div className="section-label" style={{ marginBottom: 8 }}>
                  Gateway Models
                </div>

                {filteredGateway.length === 0 && query && (
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' }}>
                    No models match &ldquo;{query}&rdquo;
                  </div>
                )}

                {filteredGateway.length === 0 && !query && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '28px 0',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 10,
                    }}
                  >
                    <Cpu size={28} style={{ color: 'var(--text-tertiary)' }} />
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      No models found — make sure the gateway is running
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setActiveSection('gateway')}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                    >
                      <Zap size={13} />
                      Go to Gateway
                    </button>
                  </div>
                )}

                {filteredGateway.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {filteredGateway.map((modelId) => {
                      const active = isGatewayActive(modelId);
                      const justActivated = activatedName === modelId;
                      const provider = detectProvider(modelId);
                      return (
                        <div
                          key={modelId}
                          style={{
                            background: active ? 'var(--accent-green-dim)' : 'var(--bg2)',
                            border: `1px solid ${active ? 'var(--accent-green)' : 'var(--border)'}`,
                            borderRadius: 'var(--radius-md)',
                            padding: '11px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 14,
                            transition: 'border-color 0.15s, background 0.15s',
                          }}
                        >
                          {/* Active dot */}
                          {active && (
                            <span className="dot dot-green" style={{ flexShrink: 0 }} />
                          )}

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 12.5,
                                  fontWeight: 600,
                                  color: 'var(--text-primary)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {modelId}
                              </span>
                              <span
                                style={{
                                  fontSize: 10.5,
                                  fontFamily: 'var(--font-mono)',
                                  color: 'var(--text-secondary)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 20,
                                  padding: '1px 7px',
                                  flexShrink: 0,
                                }}
                              >
                                {provider}
                              </span>
                              {active && (
                                <span className="badge badge-connected" style={{ fontSize: 10.5, flexShrink: 0 }}>
                                  Active
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Use button */}
                          <button
                            className={`btn btn-sm ${active ? 'btn-ghost' : 'btn-success'}`}
                            onClick={() => handleActivateGateway(modelId)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, minWidth: 80, flexShrink: 0 }}
                          >
                            <Check size={12} />
                            {justActivated ? 'Activated!' : active ? 'Active' : 'Use'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Saved (configured) models section */}
            {savedModels.length > 0 && (
              <div>
                {groupKeys.length > 0 && groupKeys.map((provider) => (
                  <div key={provider} style={{ marginBottom: 16 }}>
                    <div className="section-label" style={{ marginBottom: 8 }}>
                      {providerLabel(provider)}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {grouped[provider].map(({ model: m, idx }) => {
                        const active = isSavedActive(m);
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
                            {/* Active dot */}
                            {active && (
                              <span className="dot dot-green" style={{ flexShrink: 0 }} />
                            )}

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
                                    Active
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
                                onClick={() => handleActivateSaved(m)}
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

                {/* Saved models filtered to zero by query */}
                {query && groupKeys.length === 0 && (
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '4px 0 12px' }}>
                    No saved models match &ldquo;{query}&rdquo;
                  </div>
                )}
              </div>
            )}

            {/* Fully empty state (no gateway models, no saved models, no error) */}
            {!gatewayError && gatewayModels.length === 0 && savedModels.length === 0 && !query && (
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
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>No models found.</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 320 }}>
                  Start the gateway to see available models, or add a saved model configuration above.
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
          </div>
        )}

        {/* Stats footer */}
        {!loading && totalCount > 0 && (
          <div
            style={{
              marginTop: 20,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
              fontSize: 12,
              color: 'var(--text-tertiary)',
            }}
          >
            {gatewayModels.length > 0 && savedModels.length > 0
              ? `${gatewayModels.length} gateway model${gatewayModels.length !== 1 ? 's' : ''} · ${savedModels.length} saved configuration${savedModels.length !== 1 ? 's' : ''}`
              : gatewayModels.length > 0
              ? `${gatewayModels.length} model${gatewayModels.length !== 1 ? 's' : ''} available`
              : `${savedModels.length} saved configuration${savedModels.length !== 1 ? 's' : ''}`}
          </div>
        )}
      </div>
    </div>
  );
}
