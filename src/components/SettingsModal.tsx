import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Settings, X, Key, User, Brain, Folder, Eye, EyeOff, Globe } from 'lucide-react';
import { readEnv, writeEnv, readFile, writeFile, readConfig, writeConfig, getAutostartEnabled, toggleAutostart, clearAllSessionsDisk } from '../api/desktop';

const PROVIDERS_KEYS = [
  { label: 'OpenAI', key: 'OPENAI_API_KEY', hint: 'sk-...' },
  { label: 'Anthropic', key: 'ANTHROPIC_API_KEY', hint: 'sk-ant-...' },
  { label: 'OpenRouter', key: 'OPENROUTER_API_KEY', hint: 'sk-or-...' },
  { label: 'NVIDIA NIM', key: 'NVIDIA_API_KEY', hint: 'nvapi-...' },
  { label: 'Google AI', key: 'GOOGLE_API_KEY', hint: 'AIza...' },
  { label: 'Nous Portal', key: 'NOUS_API_KEY', hint: 'np-...' },
];

const DEFAULT_PERSONALITY = `# Hermes Personality

You are Hermes, a powerful AI agent and personal assistant. You are direct, concise, and helpful.

## Traits
- Clear and precise in your responses
- Proactive in suggesting next steps
- Honest about your limitations

## Style
- Use markdown for structured responses
- Keep answers focused and actionable
`;

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

const BROWSER_KEYS = [
  { label: 'Browser Use API Key', key: 'BROWSER_USE_API_KEY', hint: 'For browser-harness cloud' },
  { label: 'Browserbase API Key', key: 'BROWSERBASE_API_KEY', hint: 'bb-...' },
  { label: 'Browserbase Project ID', key: 'BROWSERBASE_PROJECT_ID', hint: 'proj-...' },
];

const TABS = [
  { id: 'api-keys', label: 'API Keys', icon: Key },
  { id: 'personality', label: 'Personality', icon: User },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'workspace', label: 'Workspace', icon: Folder },
  { id: 'browser', label: 'Browser', icon: Globe },
] as const;

type SettingsTab = typeof TABS[number]['id'];

export default function SettingsModal() {
  const { settingsOpen, setSettingsOpen } = useStore();
  const [tab, setTab] = useState<SettingsTab>('api-keys');

  // API Keys tab state
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [apiSaving, setApiSaving] = useState(false);
  const [apiSaveMsg, setApiSaveMsg] = useState('');

  // Personality tab state
  const [personality, setPersonality] = useState('');
  const [personalitySaving, setPersonalitySaving] = useState(false);
  const [personalitySaveMsg, setPersonalitySaveMsg] = useState('');

  // Memory tab state
  const [memoryContent, setMemoryContent] = useState('');
  const [userContent, setUserContent] = useState('');

  // Workspace tab state
  const [workingDir, setWorkingDir] = useState('');
  const [terminalBackend, setTerminalBackend] = useState('Local');
  const [autostartEnabled, setAutostartEnabled] = useState(false);
  const [autostartLoading, setAutostartLoading] = useState(false);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);
  const [workspaceSaveMsg, setWorkspaceSaveMsg] = useState('');
  const [clearingSessions, setClearingSessions] = useState(false);
  const [clearMsg, setClearMsg] = useState('');

  // Browser automation tab state
  const [browserKeys, setBrowserKeys] = useState<Record<string, string>>({});
  const [domainSkills, setDomainSkills] = useState(false);
  const [headedMode, setHeadedMode] = useState(true);
  const [browserSaving, setBrowserSaving] = useState(false);
  const [browserSaveMsg, setBrowserSaveMsg] = useState('');

  // API Keys: load on tab open
  useEffect(() => {
    if (settingsOpen && tab === 'api-keys') {
      readEnv().then(env => {
        const keys: Record<string, string> = {};
        PROVIDERS_KEYS.forEach(p => { if (env[p.key]) keys[p.key] = env[p.key]; });
        setApiKeys(keys);
      }).catch(() => {});
    }
  }, [settingsOpen, tab]);

  // Personality: load on tab open
  useEffect(() => {
    if (settingsOpen && tab === 'personality') {
      readFile('personalities/default.md').then(content => {
        setPersonality(content);
      }).catch(() => {
        setPersonality(DEFAULT_PERSONALITY);
      });
    }
  }, [settingsOpen, tab]);

  // Memory: load both files on tab open
  useEffect(() => {
    if (settingsOpen && tab === 'memory') {
      readFile('memory/MEMORY.md').then(content => {
        setMemoryContent(content);
      }).catch(() => {
        setMemoryContent('# Memory\n\nNo memories recorded yet. Hermes will populate this automatically.');
      });
      readFile('memory/USER.md').then(content => {
        setUserContent(content);
      }).catch(() => {
        setUserContent('# User Profile\n\nNo user profile recorded yet.');
      });
    }
  }, [settingsOpen, tab]);

  // Workspace: load config and autostart on tab open
  useEffect(() => {
    if (settingsOpen && tab === 'workspace') {
      readConfig().then(yaml => {
        const match = yaml.match(/working_dir:\s*(.+)/);
        setWorkingDir(match ? match[1].trim() : '~/workspace');
      }).catch(() => {
        setWorkingDir('~/workspace');
      });
      getAutostartEnabled().then(enabled => {
        setAutostartEnabled(enabled);
      }).catch(() => {
        setAutostartEnabled(false);
      });
    }
  }, [settingsOpen, tab]);

  const saveApiKeys = async () => {
    setApiSaving(true);
    setApiSaveMsg('');
    try {
      for (const p of PROVIDERS_KEYS) {
        const val = apiKeys[p.key];
        if (val && val.trim()) {
          await writeEnv(p.key, val.trim());
        }
      }
      setApiSaveMsg('Saved');
    } catch {
      setApiSaveMsg('Error saving');
    } finally {
      setApiSaving(false);
      setTimeout(() => setApiSaveMsg(''), 2500);
    }
  };

  const savePersonality = async () => {
    setPersonalitySaving(true);
    setPersonalitySaveMsg('');
    try {
      await writeFile('personalities/default.md', personality);
      setPersonalitySaveMsg('Saved');
    } catch {
      setPersonalitySaveMsg('Error');
    } finally {
      setPersonalitySaving(false);
      setTimeout(() => setPersonalitySaveMsg(''), 2500);
    }
  };

  const handleAutostartToggle = async (enabled: boolean) => {
    setAutostartLoading(true);
    try {
      await toggleAutostart(enabled);
      setAutostartEnabled(enabled);
    } catch {
      /* non-fatal */
    } finally {
      setAutostartLoading(false);
    }
  };

  // Browser automation: load on tab open
  useEffect(() => {
    if (settingsOpen && tab === 'browser') {
      readEnv().then(env => {
        const keys: Record<string, string> = {};
        BROWSER_KEYS.forEach(k => { if (env[k.key]) keys[k.key] = env[k.key]; });
        setBrowserKeys(keys);
        setDomainSkills(env['BH_DOMAIN_SKILLS'] === '1');
        setHeadedMode(env['PLAYWRIGHT_HEADLESS'] !== 'true');
      }).catch(() => {});
    }
  }, [settingsOpen, tab]);

  const saveBrowserSettings = async () => {
    setBrowserSaving(true);
    setBrowserSaveMsg('');
    try {
      await writeEnv('PLAYWRIGHT_HEADLESS', headedMode ? 'false' : 'true');
      await writeEnv('HEADLESS', headedMode ? 'false' : 'true');
      await writeEnv('BH_DOMAIN_SKILLS', domainSkills ? '1' : '');
      for (const k of BROWSER_KEYS) {
        const val = browserKeys[k.key];
        if (val !== undefined) await writeEnv(k.key, val.trim());
      }
      setBrowserSaveMsg('Saved');
    } catch {
      setBrowserSaveMsg('Error');
    } finally {
      setBrowserSaving(false);
      setTimeout(() => setBrowserSaveMsg(''), 2500);
    }
  };

  const saveWorkspaceConfig = async () => {
    setWorkspaceSaving(true);
    setWorkspaceSaveMsg('');
    try {
      let yaml = await readConfig().catch(() => '');
      if (/working_dir:\s*.+/.test(yaml)) {
        yaml = yaml.replace(/working_dir:\s*.+/, `working_dir: ${workingDir}`);
      } else {
        yaml = yaml ? `${yaml.trimEnd()}\nworking_dir: ${workingDir}\n` : `working_dir: ${workingDir}\n`;
      }
      await writeConfig(yaml);
      setWorkspaceSaveMsg('Saved');
    } catch {
      setWorkspaceSaveMsg('Error');
    } finally {
      setWorkspaceSaving(false);
      setTimeout(() => setWorkspaceSaveMsg(''), 2500);
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
                <button className="btn btn-primary" onClick={saveApiKeys} disabled={apiSaving} style={{ marginTop: 8, fontSize: 13 }}>{apiSaving ? 'Saving...' : apiSaveMsg || 'Save API Keys'}</button>
              </div>
            )}

            {tab === 'personality' && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Personality</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 18 }}>Stored in ~/.hermes/personalities/default.md</div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Edit Personality (Markdown)</label>
                  <textarea
                    className="input-field"
                    rows={14}
                    value={personality}
                    onChange={e => setPersonality(e.target.value)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, resize: 'vertical' }}
                  />
                </div>
                <button
                  className="btn btn-primary"
                  onClick={savePersonality}
                  disabled={personalitySaving}
                  style={{ fontSize: 13 }}
                >
                  {personalitySaving ? 'Saving...' : personalitySaveMsg || 'Save Personality'}
                </button>
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
                  <div style={{ background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)', maxHeight: 140, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                    {memoryContent}
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>USER.md (read-only)</label>
                  <div style={{ background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)', maxHeight: 100, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                    {userContent}
                  </div>
                </div>
              </div>
            )}

            {tab === 'browser' && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Browser Automation</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 18 }}>Configure browser-harness and cloud browser services. Keys stored in ~/.hermes/.env</div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Headed Mode</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>Browser window appears on your screen.<br />Disabling runs the browser invisibly.</div>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" checked={headedMode} onChange={e => setHeadedMode(e.target.checked)} />
                    <span className="toggle-slider" />
                  </label>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', marginBottom: 18 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Domain Skills</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>Enable site-specific playbooks for LinkedIn, GitHub, Amazon etc. (BH_DOMAIN_SKILLS=1)</div>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" checked={domainSkills} onChange={e => setDomainSkills(e.target.checked)} />
                    <span className="toggle-slider" />
                  </label>
                </div>

                {BROWSER_KEYS.map(k => (
                  <div key={k.key} style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{k.label}</label>
                    <MaskedInput id={`bkey-${k.key}`} placeholder={k.hint} value={browserKeys[k.key] || ''} onChange={val => setBrowserKeys(prev => ({ ...prev, [k.key]: val }))} />
                  </div>
                ))}

                <div style={{ padding: '10px 14px', background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 18, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>browser-harness</strong> connects the agent directly to your Chrome browser via CDP with a self-healing architecture. Install via the Gateway panel, then use <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg3)', padding: '1px 5px', borderRadius: 4 }}>/browser</code> in chat to connect.
                </div>

                <button className="btn btn-primary" onClick={saveBrowserSettings} disabled={browserSaving} style={{ fontSize: 13 }}>
                  {browserSaving ? 'Saving…' : browserSaveMsg || 'Save Browser Settings'}
                </button>
              </div>
            )}

            {tab === 'workspace' && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Workspace</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 18 }}>Working directory and execution environment</div>

                {/* Desktop Behaviour */}
                <div style={{ marginBottom: 20 }}>
                  <div className="section-label" style={{ marginBottom: 10 }}>Desktop</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>Launch on startup</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Start Hermes automatically when you log in</div>
                    </div>
                    <label className="toggle" style={{ opacity: autostartLoading ? 0.5 : 1 }}>
                      <input
                        type="checkbox"
                        checked={autostartEnabled}
                        onChange={e => handleAutostartToggle(e.target.checked)}
                        disabled={autostartLoading}
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Working Directory</label>
                  <input className="input-field" value={workingDir} onChange={e => setWorkingDir(e.target.value)} style={{ fontFamily: 'var(--font-mono)' }} />
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
                <button
                  className="btn btn-primary"
                  onClick={saveWorkspaceConfig}
                  disabled={workspaceSaving}
                  style={{ fontSize: 13 }}
                >
                  {workspaceSaving ? 'Saving...' : workspaceSaveMsg || 'Save Workspace Config'}
                </button>

                <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-red)', marginBottom: 10, letterSpacing: '0.06em' }}>
                    DANGER ZONE
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={clearingSessions}
                      onClick={async () => {
                        if (!window.confirm('Delete all saved sessions from disk? This cannot be undone.')) return;
                        setClearingSessions(true);
                        try {
                          const n = await clearAllSessionsDisk();
                          setClearMsg(`Cleared ${n} session${n !== 1 ? 's' : ''}.`);
                          setTimeout(() => setClearMsg(''), 3000);
                        } finally {
                          setClearingSessions(false);
                        }
                      }}
                    >
                      {clearingSessions ? 'Clearing…' : 'Clear All Sessions'}
                    </button>
                    {clearMsg && <span style={{ fontSize: 12, color: 'var(--accent-green)' }}>{clearMsg}</span>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
