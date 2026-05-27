import React, { useEffect, useRef, useState } from 'react';
import {
  Key, Eye, EyeOff, Check, ChevronDown, ChevronUp,
  Cpu, RefreshCw, Plus, Trash2,
} from 'lucide-react';
import { useHermesClient } from '../lib/hermes';
import type { ModelConfig } from '../lib/hermes';

const PROVIDERS = [
  { id: 'openai',     label: 'OpenAI',        envKey: 'OPENAI_API_KEY',     hint: 'sk-...' },
  { id: 'anthropic',  label: 'Anthropic',      envKey: 'ANTHROPIC_API_KEY',  hint: 'sk-ant-...' },
  { id: 'gemini',     label: 'Google Gemini',  envKey: 'GEMINI_API_KEY',     hint: 'AIza...' },
  { id: 'groq',       label: 'Groq',           envKey: 'GROQ_API_KEY',       hint: 'gsk_...' },
  { id: 'openrouter', label: 'OpenRouter',     envKey: 'OPENROUTER_API_KEY', hint: 'sk-or-...' },
  { id: 'mistral',    label: 'Mistral',        envKey: 'MISTRAL_API_KEY',    hint: 'Your Mistral key' },
  { id: 'together',   label: 'Together AI',    envKey: 'TOGETHER_API_KEY',   hint: 'Your Together key' },
  { id: 'xai',        label: 'xAI (Grok)',     envKey: 'XAI_API_KEY',        hint: 'xai-...' },
  { id: 'deepseek',   label: 'DeepSeek',       envKey: 'DEEPSEEK_API_KEY',   hint: 'sk-...' },
  { id: 'ollama',     label: 'Ollama (local)', envKey: 'OLLAMA_BASE_URL',    hint: 'http://localhost:11434' },
];

const PROVIDER_OPTIONS = ['auto', 'openai', 'anthropic', 'gemini', 'groq', 'openrouter', 'ollama', 'custom'];

const POOL_FILE = 'credential-pool.json';

interface PoolEntry {
  id: string;
  provider: string;
  key: string;
  label: string;
}

function maskKey(key: string): string {
  if (key.length <= 12) return '••••••••';
  return key.slice(0, 8) + '...' + key.slice(-4);
}

function SavedFlash({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-green)', fontSize: 11, fontWeight: 500 }}>
      <Check size={11} /> Saved
    </span>
  );
}

export default function ProvidersPanel() {
  const client = useHermesClient();

  // --- Model config ---
  const [modelConfig, setModelConfigState] = useState<ModelConfig>({ provider: 'auto', model: '', base_url: '' });
  const [modelSaved, setModelSaved] = useState(false);
  const modelDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ollama model list
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaFetching, setOllamaFetching] = useState(false);
  const [ollamaFetchError, setOllamaFetchError] = useState<string | null>(null);

  // --- API keys ---
  const [localKeys, setLocalKeys] = useState<Record<string, string>>({});
  const [savedIndicators, setSavedIndicators] = useState<Record<string, boolean>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // --- Credential pool ---
  const [pool, setPool] = useState<PoolEntry[]>([]);
  const [poolOpen, setPoolOpen] = useState(false);
  const [newPoolProvider, setNewPoolProvider] = useState(PROVIDERS[0].id);
  const [newPoolKey, setNewPoolKey] = useState('');
  const [newPoolLabel, setNewPoolLabel] = useState('');
  const [newPoolKeyVisible, setNewPoolKeyVisible] = useState(false);
  const [poolSaving, setPoolSaving] = useState(false);

  // Load env and model config on mount
  useEffect(() => {
    client.readEnv().then(env => {
      const keys: Record<string, string> = {};
      for (const p of PROVIDERS) keys[p.id] = env[p.envKey] ?? '';
      setLocalKeys(keys);
    }).catch(() => {});

    client.getModelConfig().then(cfg => setModelConfigState(cfg)).catch(() => {});

    client.readFile(POOL_FILE)
      .then(raw => setPool(JSON.parse(raw)))
      .catch(() => setPool([]));
  }, [client]);

  // --- Model config handlers ---
  const triggerModelSave = (cfg: ModelConfig) => {
    if (modelDebounceRef.current) clearTimeout(modelDebounceRef.current);
    modelDebounceRef.current = setTimeout(async () => {
      try {
        await client.setModelConfig(cfg.provider, cfg.model, cfg.base_url);
        setModelSaved(true);
        setTimeout(() => setModelSaved(false), 2000);
      } catch { /* ignore */ }
    }, 800);
  };

  const updateModelField = (field: keyof ModelConfig, value: string) => {
    const next = { ...modelConfig, [field]: value };
    setModelConfigState(next);
    triggerModelSave(next);
  };

  const handleFetchOllamaModels = async () => {
    setOllamaFetching(true);
    setOllamaFetchError(null);
    try {
      const models = await client.listOllamaModels();
      setOllamaModels(models);
      if (models.length === 0) setOllamaFetchError('No models found. Is Ollama running?');
    } catch {
      setOllamaFetchError('Could not reach Ollama. Is it running?');
      setOllamaModels([]);
    } finally {
      setOllamaFetching(false);
    }
  };

  // --- API key handlers ---
  const persistKey = (providerId: string, envKey: string, value: string) => {
    client.writeEnv(envKey, value).then(() => {
      setSavedIndicators(prev => ({ ...prev, [providerId]: true }));
      setTimeout(() => setSavedIndicators(prev => ({ ...prev, [providerId]: false })), 2000);
    }).catch(() => {});
  };

  const handleKeyChange = (providerId: string, envKey: string, value: string) => {
    setLocalKeys(prev => ({ ...prev, [providerId]: value }));
    if (saveTimers.current[providerId]) clearTimeout(saveTimers.current[providerId]);
    saveTimers.current[providerId] = setTimeout(() => {
      persistKey(providerId, envKey, value);
    }, 400);
  };

  const handleKeyBlur = (providerId: string, envKey: string, value: string) => {
    if (saveTimers.current[providerId]) {
      clearTimeout(saveTimers.current[providerId]);
      delete saveTimers.current[providerId];
    }
    persistKey(providerId, envKey, value);
  };

  const toggleShow = (providerId: string) => {
    setShowKeys(prev => ({ ...prev, [providerId]: !prev[providerId] }));
  };

  // --- Pool handlers ---
  const persistPool = async (next: PoolEntry[]) => {
    setPoolSaving(true);
    try {
      await client.writeFile(POOL_FILE, JSON.stringify(next, null, 2));
    } catch { /* ignore */ }
    setPoolSaving(false);
  };

  const handleAddPoolEntry = async () => {
    const trimmedKey = newPoolKey.trim();
    if (!trimmedKey) return;
    const entry: PoolEntry = {
      id: Date.now().toString(),
      provider: newPoolProvider,
      key: trimmedKey,
      label: newPoolLabel.trim(),
    };
    const next = [...pool, entry];
    setPool(next);
    await persistPool(next);
    setNewPoolKey('');
    setNewPoolLabel('');
    setNewPoolKeyVisible(false);
  };

  const handleDeletePoolEntry = async (id: string) => {
    const next = pool.filter(e => e.id !== id);
    setPool(next);
    await persistPool(next);
  };

  const showBaseUrl = modelConfig.provider === 'ollama' || modelConfig.provider === 'custom';
  const showOllamaModels = modelConfig.provider === 'ollama';

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Model Configuration ── */}
      <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Cpu size={15} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
          <span className="section-label" style={{ margin: 0 }}>Model Configuration</span>
          <SavedFlash show={modelSaved} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500 }}>Provider</label>
            <div style={{ position: 'relative' }}>
              <select
                value={modelConfig.provider}
                onChange={e => updateModelField('provider', e.target.value)}
                style={{
                  width: '100%',
                  appearance: 'none',
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  padding: '7px 30px 7px 10px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {PROVIDER_OPTIONS.map(p => (
                  <option key={p} value={p} style={{ background: 'var(--bg2)' }}>
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500 }}>Model</label>
            <input
              className="input-field"
              type="text"
              list={showOllamaModels && ollamaModels.length > 0 ? 'ollama-models-list' : undefined}
              value={modelConfig.model}
              placeholder={showOllamaModels ? 'e.g. llama3, mistral' : 'e.g. gpt-4o, claude-opus-4-5'}
              onChange={e => updateModelField('model', e.target.value)}
              style={{ fontSize: 13 }}
            />
            {showOllamaModels && ollamaModels.length > 0 && (
              <datalist id="ollama-models-list">
                {ollamaModels.map(m => <option key={m} value={m} />)}
              </datalist>
            )}
          </div>
        </div>

        {showOllamaModels && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: -4 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleFetchOllamaModels}
              disabled={ollamaFetching}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}
            >
              <RefreshCw size={12} style={{ animation: ollamaFetching ? 'spin 1s linear infinite' : 'none' }} />
              {ollamaFetching ? 'Fetching…' : 'Fetch models'}
            </button>
            {ollamaModels.length > 0 && !ollamaFetchError && (
              <span style={{ fontSize: 11.5, color: 'var(--accent-green)' }}>
                {ollamaModels.length} model{ollamaModels.length !== 1 ? 's' : ''} available
              </span>
            )}
            {ollamaFetchError && (
              <span style={{ fontSize: 11.5, color: 'var(--accent-red)' }}>{ollamaFetchError}</span>
            )}
          </div>
        )}

        {showBaseUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500 }}>Base URL</label>
            <input
              className="input-field"
              type="text"
              value={modelConfig.base_url}
              placeholder="http://localhost:11434/v1"
              onChange={e => updateModelField('base_url', e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>
        )}
      </div>

      {/* ── API Keys ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Key size={15} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
          <span className="section-label" style={{ margin: 0 }}>API Keys</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {PROVIDERS.map(p => {
            const val = localKeys[p.id] ?? '';
            const configured = val.trim().length > 0;
            const visible = showKeys[p.id] ?? false;
            const isSaved = savedIndicators[p.id] ?? false;

            return (
              <div
                key={p.id}
                style={{
                  background: 'var(--bg1)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.label}</span>
                    {configured && !isSaved && (
                      <span className="dot dot-green" />
                    )}
                  </div>
                  <SavedFlash show={isSaved} />
                </div>

                {/* Input row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    className="input-field"
                    type={visible ? 'text' : 'password'}
                    value={val}
                    placeholder={p.hint}
                    onChange={e => handleKeyChange(p.id, p.envKey, e.target.value)}
                    onBlur={() => handleKeyBlur(p.id, p.envKey, val)}
                    style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)', padding: '6px 10px' }}
                  />
                  <button
                    type="button"
                    onClick={() => toggleShow(p.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 5,
                      borderRadius: 'var(--radius-sm)',
                      flexShrink: 0,
                    }}
                    title={visible ? 'Hide key' : 'Show key'}
                  >
                    {visible ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>

                {/* Footer hint */}
                <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  {p.envKey}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Backup Keys (Credential Pool) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Collapsible header */}
        <button
          type="button"
          onClick={() => setPoolOpen(o => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'none',
            border: 'none',
            borderBottom: poolOpen ? '1px solid var(--border)' : '1px solid transparent',
            borderRadius: poolOpen ? '0' : '0',
            padding: '10px 0',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            width: '100%',
            textAlign: 'left',
          }}
        >
          {poolOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          <span className="section-label" style={{ margin: 0 }}>Backup Keys</span>
          {pool.length > 0 && (
            <span style={{
              fontSize: 10.5,
              background: 'var(--bg3)',
              color: 'var(--text-secondary)',
              borderRadius: 10,
              padding: '1px 7px',
              fontWeight: 500,
            }}>
              {pool.length}
            </span>
          )}
          {poolSaving && (
            <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>saving…</span>
          )}
        </button>

        {poolOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 16 }}>

            {/* Existing pool entries */}
            {pool.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pool.map(entry => {
                  const provLabel = PROVIDERS.find(p => p.id === entry.provider)?.label ?? entry.provider;
                  return (
                    <div
                      key={entry.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '9px 12px',
                        background: 'var(--bg1)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', width: 96, flexShrink: 0 }}>{provLabel}</span>
                      <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {maskKey(entry.key)}
                      </span>
                      {entry.label && (
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>{entry.label}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeletePoolEntry(entry.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--accent-red)',
                          display: 'flex',
                          alignItems: 'center',
                          padding: 4,
                          borderRadius: 4,
                          flexShrink: 0,
                          opacity: 0.7,
                        }}
                        title="Remove backup key"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {pool.length === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
                No backup keys stored. Add one below.
              </p>
            )}

            {/* Add new entry form */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                padding: '14px 16px',
                background: 'var(--bg1)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-secondary)' }}>Add backup key</span>

              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8 }}>
                {/* Provider dropdown */}
                <div style={{ position: 'relative' }}>
                  <select
                    value={newPoolProvider}
                    onChange={e => setNewPoolProvider(e.target.value)}
                    style={{
                      width: '100%',
                      appearance: 'none',
                      background: 'var(--bg2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                      padding: '6px 26px 6px 9px',
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    {PROVIDERS.map(p => (
                      <option key={p.id} value={p.id} style={{ background: 'var(--bg2)' }}>{p.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={12} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
                </div>

                {/* Label input */}
                <input
                  className="input-field"
                  type="text"
                  value={newPoolLabel}
                  placeholder="Label (optional)"
                  onChange={e => setNewPoolLabel(e.target.value)}
                  style={{ fontSize: 12, padding: '6px 10px' }}
                />
              </div>

              {/* Key input row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  className="input-field"
                  type={newPoolKeyVisible ? 'text' : 'password'}
                  value={newPoolKey}
                  placeholder="Paste API key…"
                  onChange={e => setNewPoolKey(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddPoolEntry(); }}
                  style={{ flex: 1, fontSize: 12, fontFamily: 'var(--font-mono)', padding: '6px 10px' }}
                />
                <button
                  type="button"
                  onClick={() => setNewPoolKeyVisible(v => !v)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    padding: 5,
                    borderRadius: 'var(--radius-sm)',
                    flexShrink: 0,
                  }}
                >
                  {newPoolKeyVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={handleAddPoolEntry}
                  disabled={!newPoolKey.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, flexShrink: 0 }}
                >
                  <Plus size={13} /> Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
