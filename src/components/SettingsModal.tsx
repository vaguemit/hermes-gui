import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Settings, X, Key, User, Brain, Folder, Eye, EyeOff } from 'lucide-react';
import { readEnv, writeEnv } from '../api/desktop';

const PROVIDERS_KEYS = [
  { label: 'OpenAI', key: 'OPENAI_API_KEY', hint: 'sk-...' },
  { label: 'Anthropic', key: 'ANTHROPIC_API_KEY', hint: 'sk-ant-...' },
  { label: 'OpenRouter', key: 'OPENROUTER_API_KEY', hint: 'sk-or-...' },
  { label: 'NVIDIA NIM', key: 'NVIDIA_API_KEY', hint: 'nvapi-...' },
  { label: 'Google AI', key: 'GOOGLE_API_KEY', hint: 'AIza...' },
  { label: 'Nous Portal', key: 'NOUS_API_KEY', hint: 'np-...' },
];

function MaskedInput({ placeholder, id, value, onChange }: {
  placeholder: string;
  id: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-field"
        style={{ paddingRight: 38 }}
      />
      <button
        onClick={() => setShow(!show)}
        style={{ position: 'absolute', right: 10, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

const TABS = [
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'personality', label: 'Personality', icon: User },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'workspace', label: 'Workspace', icon: Folder },
] as const;

type SettingsTab = typeof TABS[number]['id'];

export default function SettingsModal() {
  const { settingsOpen, setSettingsOpen } = useStore();
  const [tab, setTab] = useState<SettingsTab>('api-keys');
  const [workingDir, setWorkingDir] = useState('~/workspace');
  const [terminalBackend, setTerminalBackend] = useState('Local');
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    if (settingsOpen && tab === 'api-keys') {
      readEnv().then(env => {
        const keys: Record<string, string> = {};
        PROVIDERS_KEYS.forEach(p => { if (env[p.key]) keys[p.key] = env[p.key]; });
        setApiKeys(keys);
      }).catch(() => {});
    }
  }, [settingsOpen, tab]);

  const saveApiKeys = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      for (const p of PROVIDERS_KEYS) {
        const val = apiKeys[p.key];
        if (val && val.trim()) {
          await writeEnv(p.key, val.trim());
        }
      }
      setSaveMsg('Saved');
    } catch {
      setSaveMsg('Error saving');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 2500);
    }
  };

  if (!settingsOpen) return null;

  return (
    <div className="palette-overlay" onClick={() => setSettingsOpen(false)}>
      <div
        className="animate-in"
        onClick={e => e.stopPropagation()}
        style={{ width: 680, maxHeight: '80vh', background: 'var(--bg2)', border: '1px solid var(--border-active)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 32px 80px rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Settings size={18} style={{ color: 'var(--accent-green)' }} />
          <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Settings</span>
          <button onClick={() => setSettingsOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={17} /></button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left nav */}
          <div style={{ width: 160, borderRight: '1px solid var(--border)', padding: '10px 8px', flexShrink: 0 }}>
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`nav-item ${tab === id ? 'active' : ''}`}
                style={{ width: '100%', border: 'none', fontSize: 13 }}
              >
                <Icon size={15} />{label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>
            {tab === 'api-keys' && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>API Keys</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 18 }}>Stored in ~/.hermes/.env — never logged or transmitted</div>
                {PROVIDERS_KEYS.map((p) => (
                  <div key={p.key} style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{p.label}</label>
                    <MaskedInput id={`key-${p.key}`} placeholder={p.hint} value={apiKeys[p.key] || ''} onChange={val => setApiKeys(prev => ({ ...prev, [p.key]: val }))} />
                  </div>
                ))}
                <button className="btn btn-primary" onClick={saveApiKeys} disabled={saving} style={{ marginTop: 8, fontSize: 13 }}>{saving ? 'Saving...' : saveMsg || 'Save API Keys'}</button>
              </div>
            )}

            {tab === 'personality' && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Personality</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 18 }}>Hermes personality files from ~/.hermes/personalities/</div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Active Personality</label>
                  <select className="input-field" style={{ cursor: 'pointer' }}>
                    <option>default</option>
                    <option>assistant</option>
                    <option>researcher</option>
                    <option>coder</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Edit Personality (Markdown)</label>
                  <textarea
                    className="input-field"
                    rows={10}
                    style={{ fontFamily: 'monospace', fontSize: 12.5, resize: 'vertical' }}
                    defaultValue="# Hermes Personality\n\nYou are Hermes, a powerful AI agent..."
                  />
                </div>
                <button className="btn btn-primary" style={{ marginTop: 10, fontSize: 13 }}>Save Personality</button>
              </div>
            )}

            {tab === 'memory' && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Memory</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 18 }}>Agent memory files and nudge settings</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Memory Nudges</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>Hermes proactively recalls relevant memories</div>
                  </div>
                  <label className="toggle"><input type="checkbox" defaultChecked /><span className="toggle-slider" /></label>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>MEMORY.md (read-only)</label>
                  <div style={{ background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-secondary)', maxHeight: 140, overflowY: 'auto' }}>
                    # Memory{'\n\n'}No memories recorded yet. Hermes will populate this automatically.
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>USER.md</label>
                  <div style={{ background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-secondary)', maxHeight: 100, overflowY: 'auto' }}>
                    # User Profile{'\n\n'}No user profile recorded yet.
                  </div>
                </div>
                <button className="btn btn-ghost" style={{ marginTop: 12, fontSize: 12.5 }}>Open in System Editor</button>
              </div>
            )}

            {tab === 'workspace' && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Workspace</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 18 }}>Working directory and execution environment</div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Working Directory</label>
                  <input className="input-field" value={workingDir} onChange={e => setWorkingDir(e.target.value)} style={{ fontFamily: 'monospace' }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Terminal Backend</label>
                  <select className="input-field" value={terminalBackend} onChange={e => setTerminalBackend(e.target.value)} style={{ cursor: 'pointer' }}>
                    <option>Local</option>
                    <option>Docker</option>
                    <option>SSH</option>
                    <option>Daytona</option>
                    <option>Modal</option>
                    <option>Singularity</option>
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Controls where Hermes executes shell commands</div>
                </div>
                <button className="btn btn-primary" style={{ fontSize: 13 }}>Save Workspace Config</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
