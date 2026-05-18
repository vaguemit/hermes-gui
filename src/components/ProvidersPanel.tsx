import React, { useEffect, useRef, useState } from 'react';
import { Key, Eye, EyeOff, Check, ChevronDown, Cpu } from 'lucide-react';
import { readEnv, writeEnv, getModelConfig, setModelConfig } from '../api/desktop';
import type { ModelConfig } from '../api/desktop';

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

function MaskedInput({
  value,
  hint,
  onChange,
  onBlur,
}: {
  value: string;
  hint: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
      <input
        className="input-field"
        type={visible ? 'text' : 'password'}
        value={value}
        placeholder={hint}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        style={{ flex: 1, fontSize: 12.5, fontFamily: 'var(--font-mono)', padding: '6px 10px' }}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          padding: 4,
          borderRadius: 4,
          flexShrink: 0,
        }}
        title={visible ? 'Hide key' : 'Show key'}
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

function SavedFlash({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-green)', fontSize: 11.5, fontWeight: 500 }}>
      <Check size={12} /> Saved
    </span>
  );
}

export default function ProvidersPanel() {
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});

  const [modelConfig, setModelConfigState] = useState<ModelConfig>({ provider: 'auto', model: '', base_url: '' });
  const [modelSaved, setModelSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load env values and model config on mount
  useEffect(() => {
    readEnv().then(env => {
      const init: Record<string, string> = {};
      PROVIDERS.forEach(p => { init[p.envKey] = env[p.envKey] ?? ''; });
      setEnvValues(init);
    }).catch(() => {});

    getModelConfig().then(cfg => setModelConfigState(cfg)).catch(() => {});
  }, []);

  // Debounced model config save
  const triggerModelSave = (cfg: ModelConfig) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        await setModelConfig(cfg.provider, cfg.model, cfg.base_url);
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

  const handleKeyChange = (envKey: string, value: string) => {
    setEnvValues(prev => ({ ...prev, [envKey]: value }));
  };

  const handleKeyBlur = async (envKey: string) => {
    const value = envValues[envKey] ?? '';
    try {
      await writeEnv(envKey, value);
      setSavedKeys(prev => ({ ...prev, [envKey]: true }));
      setTimeout(() => setSavedKeys(prev => ({ ...prev, [envKey]: false })), 2000);
    } catch { /* ignore */ }
  };

  const showBaseUrl = modelConfig.provider === 'ollama' || modelConfig.provider === 'custom';

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Model Configuration */}
      <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Cpu size={15} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
          <span className="section-label" style={{ margin: 0 }}>Model Configuration</span>
          <SavedFlash show={modelSaved} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {/* Provider */}
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

          {/* Model name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500 }}>Model</label>
            <input
              className="input-field"
              type="text"
              value={modelConfig.model}
              placeholder="e.g. gpt-4o, claude-opus-4-5"
              onChange={e => updateModelField('model', e.target.value)}
              style={{ fontSize: 13 }}
            />
          </div>
        </div>

        {/* Base URL — only when ollama or custom */}
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

      {/* API Keys */}
      <div className="card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Key size={15} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
          <span className="section-label" style={{ margin: 0 }}>API Keys</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {PROVIDERS.map((p, i) => {
            const val = envValues[p.envKey] ?? '';
            const configured = val.trim().length > 0;

            return (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: i % 2 === 0 ? 'var(--bg2)' : 'transparent',
                }}
              >
                {/* Provider label */}
                <div style={{ width: 120, flexShrink: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.label}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{p.envKey}</div>
                </div>

                {/* Input */}
                <MaskedInput
                  value={val}
                  hint={p.hint}
                  onChange={v => handleKeyChange(p.envKey, v)}
                  onBlur={() => handleKeyBlur(p.envKey)}
                />

                {/* Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 90, flexShrink: 0, justifyContent: 'flex-end' }}>
                  {savedKeys[p.envKey] ? (
                    <SavedFlash show />
                  ) : configured ? (
                    <>
                      <span className="dot dot-green" />
                      <span className="badge badge-connected" style={{ fontSize: 10.5 }}>Configured</span>
                    </>
                  ) : (
                    <>
                      <span className="dot dot-dim" />
                      <span className="badge badge-idle" style={{ fontSize: 10.5 }}>Not set</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
