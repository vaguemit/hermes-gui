import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Settings, X, Key, User, Brain, Folder, Eye, EyeOff, Globe, Palette, Network, Activity, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { useHermesClient } from '../lib/hermes';
import type { DoctorResult, UpdateInfo } from '../lib/hermes';

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
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'connection', label: 'Connection', icon: Network },
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
] as const;

const THEMES = [
  { id: 'dark',       label: 'Dark',        swatch: ['#080808', '#0f0f0f', '#22c55e'] },
  { id: 'oled',       label: 'OLED',        swatch: ['#000000', '#050505', '#22c55e'] },
  { id: 'light',      label: 'Light',       swatch: ['#f8f8f8', '#ffffff', '#16a34a'] },
  { id: 'monokai',    label: 'Monokai',     swatch: ['#1a1a16', '#272822', '#a6e22e'] },
  { id: 'nord',       label: 'Nord',        swatch: ['#242933', '#2e3440', '#a3be8c'] },
  { id: 'catppuccin', label: 'Catppuccin',  swatch: ['#1e1e2e', '#181825', '#a6e3a1'] },
  { id: 'gruvbox',    label: 'Gruvbox',     swatch: ['#1d2021', '#282828', '#b8bb26'] },
  { id: 'solarized',  label: 'Solarized',   swatch: ['#001e26', '#002b36', '#859900'] },
];

type SettingsTab = typeof TABS[number]['id'];

export default function SettingsModal({ onRerunWizard }: { onRerunWizard?: () => void } = {}) {
  const { settingsOpen, setSettingsOpen, cronDefaultMode, setCronDefaultMode, theme, setTheme } = useStore();
  const client = useHermesClient();
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
  const [gatewayPort, setGatewayPortState] = useState<number>(8642);

  // Connection tab state
  const [connMode, setConnMode] = useState<'local' | 'remote' | 'ssh'>('local');
  const [connRemoteUrl, setConnRemoteUrl] = useState('');
  const [connApiKey, setConnApiKey] = useState('');
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState('22');
  const [sshUser, setSshUser] = useState('');
  const [sshKeyPath, setSshKeyPath] = useState('');
  const [sshRemotePort, setSshRemotePort] = useState('8642');
  const [sshLocalPort, setSshLocalPort] = useState('18642');
  const [connSaved, setConnSaved] = useState(false);
  const [connTesting, setConnTesting] = useState(false);
  const [connTestResult, setConnTestResult] = useState<'ok' | 'error' | null>(null);

  // Browser automation tab state
  const [browserKeys, setBrowserKeys] = useState<Record<string, string>>({});
  const [domainSkills, setDomainSkills] = useState(false);
  const [headedMode, setHeadedMode] = useState(true);
  const [browserSaving, setBrowserSaving] = useState(false);
  const [browserSaveMsg, setBrowserSaveMsg] = useState('');

  // Diagnostics tab state
  const [diagVersion, setDiagVersion] = useState<string | null>(null);
  const [diagVersionLoading, setDiagVersionLoading] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [doctorResult, setDoctorResult] = useState<DoctorResult | null>(null);
  const [doctorRunning, setDoctorRunning] = useState(false);
  const [doctorRawOpen, setDoctorRawOpen] = useState(false);
  const [quickCmdOutput, setQuickCmdOutput] = useState<Record<string, string>>({});
  const [quickCmdRunning, setQuickCmdRunning] = useState<Record<string, boolean>>({});

  // API Keys: load on tab open
  useEffect(() => {
    if (settingsOpen && tab === 'api-keys') {
      client.readEnv().then(env => {
        const keys: Record<string, string> = {};
        PROVIDERS_KEYS.forEach(p => { if (env[p.key]) keys[p.key] = env[p.key]; });
        setApiKeys(keys);
      }).catch(() => {});
    }
  }, [settingsOpen, tab]);

  // Personality: load on tab open
  useEffect(() => {
    if (settingsOpen && tab === 'personality') {
      client.readFile('personalities/default.md').then(content => {
        setPersonality(content);
      }).catch(() => {
        setPersonality(DEFAULT_PERSONALITY);
      });
    }
  }, [settingsOpen, tab]);

  // Memory: load both files on tab open
  useEffect(() => {
    if (settingsOpen && tab === 'memory') {
      client.readFile('memory/MEMORY.md').then(content => {
        setMemoryContent(content);
      }).catch(() => {
        setMemoryContent('# Memory\n\nNo memories recorded yet. Hermes will populate this automatically.');
      });
      client.readFile('memory/USER.md').then(content => {
        setUserContent(content);
      }).catch(() => {
        setUserContent('# User Profile\n\nNo user profile recorded yet.');
      });
    }
  }, [settingsOpen, tab]);

  // Gateway port: load from desktop.json on workspace tab open
  useEffect(() => {
    if (settingsOpen && tab === 'workspace') {
      client.getGatewayPort().then(p => setGatewayPortState(p)).catch(() => {});
    }
  }, [settingsOpen, tab]);

  // Workspace: load config and autostart on tab open
  useEffect(() => {
    if (settingsOpen && tab === 'workspace') {
      client.readConfig().then(yaml => {
        const match = yaml.match(/working_dir:\s*(.+)/);
        setWorkingDir(match ? match[1].trim() : '~/workspace');
      }).catch(() => {
        setWorkingDir('~/workspace');
      });
      client.getAutostartEnabled().then(enabled => {
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
          await client.writeEnv(p.key, val.trim());
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
      await client.writeFile('personalities/default.md', personality);
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
      await client.toggleAutostart(enabled);
      setAutostartEnabled(enabled);
    } catch {
      /* non-fatal */
    } finally {
      setAutostartLoading(false);
    }
  };

  // Connection: load from gui-prefs.json on tab open
  useEffect(() => {
    if (settingsOpen && tab === 'connection') {
      client.readFile('gui-prefs.json').then(raw => {
        if (!raw) return;
        const prefs = JSON.parse(raw);
        if (prefs.connMode) setConnMode(prefs.connMode);
        if (prefs.connRemoteUrl) setConnRemoteUrl(prefs.connRemoteUrl);
        if (prefs.sshHost) setSshHost(prefs.sshHost);
        if (prefs.sshPort) setSshPort(String(prefs.sshPort));
        if (prefs.sshUser) setSshUser(prefs.sshUser);
        if (prefs.sshKeyPath) setSshKeyPath(prefs.sshKeyPath);
        if (prefs.sshRemotePort) setSshRemotePort(String(prefs.sshRemotePort));
        if (prefs.sshLocalPort) setSshLocalPort(String(prefs.sshLocalPort));
      }).catch(() => {});
    }
  }, [settingsOpen, tab]);

  // Browser automation: load on tab open
  useEffect(() => {
    if (settingsOpen && tab === 'browser') {
      client.readEnv().then(env => {
        const keys: Record<string, string> = {};
        BROWSER_KEYS.forEach(k => { if (env[k.key]) keys[k.key] = env[k.key]; });
        setBrowserKeys(keys);
        setDomainSkills(env['BH_DOMAIN_SKILLS'] === '1');
        setHeadedMode(env['PLAYWRIGHT_HEADLESS'] !== 'true');
      }).catch(() => {});
    }
  }, [settingsOpen, tab]);

  // Diagnostics: load version on tab open
  useEffect(() => {
    if (settingsOpen && tab === 'diagnostics' && diagVersion === null && !diagVersionLoading) {
      setDiagVersionLoading(true);
      client.getInstallStatus().then(status => {
        setDiagVersion(status.version ?? 'Not installed');
      }).catch(() => {
        setDiagVersion('Not installed');
      }).finally(() => {
        setDiagVersionLoading(false);
      });
    }
  }, [settingsOpen, tab]);

  const handleCheckUpdate = async () => {
    setUpdateChecking(true);
    setUpdateInfo(null);
    try {
      const info = await client.checkUpdate();
      setUpdateInfo(info);
    } catch {
      setUpdateInfo({ current_version: null, latest_version: null, update_available: false, release_url: null });
    } finally {
      setUpdateChecking(false);
    }
  };

  const handleRunDoctor = async () => {
    setDoctorRunning(true);
    setDoctorResult(null);
    setDoctorRawOpen(false);
    try {
      const result = await client.runDoctor();
      setDoctorResult(result);
    } catch {
      setDoctorResult({ ok: false, checks: [], raw: 'Failed to run hermes doctor.' });
    } finally {
      setDoctorRunning(false);
    }
  };

  const handleQuickCmd = async (key: string, args: string[]) => {
    setQuickCmdRunning(prev => ({ ...prev, [key]: true }));
    setQuickCmdOutput(prev => ({ ...prev, [key]: '' }));
    try {
      const result = await client.runHermesCommand(args);
      const out = [result.stdout, result.stderr].filter(Boolean).join('\n').trim() || '(no output)';
      setQuickCmdOutput(prev => ({ ...prev, [key]: out }));
    } catch (e) {
      setQuickCmdOutput(prev => ({ ...prev, [key]: String(e) }));
    } finally {
      setQuickCmdRunning(prev => ({ ...prev, [key]: false }));
    }
  };

  const saveBrowserSettings = async () => {
    setBrowserSaving(true);
    setBrowserSaveMsg('');
    try {
      await client.writeEnv('PLAYWRIGHT_HEADLESS', headedMode ? 'false' : 'true');
      await client.writeEnv('HEADLESS', headedMode ? 'false' : 'true');
      await client.writeEnv('BH_DOMAIN_SKILLS', domainSkills ? '1' : '');
      for (const k of BROWSER_KEYS) {
        const val = browserKeys[k.key];
        if (val !== undefined) await client.writeEnv(k.key, val.trim());
      }
      setBrowserSaveMsg('Saved');
    } catch {
      setBrowserSaveMsg('Error');
    } finally {
      setBrowserSaving(false);
      setTimeout(() => setBrowserSaveMsg(''), 2500);
    }
  };

  const saveConnConfig = async () => {
    let prefs: Record<string, unknown> = {};
    try { const raw = await client.readFile('gui-prefs.json'); if (raw) prefs = JSON.parse(raw); } catch {}
    prefs = { ...prefs, connMode, connRemoteUrl, sshHost, sshPort: parseInt(sshPort) || 22, sshUser, sshKeyPath, sshRemotePort: parseInt(sshRemotePort) || 8642, sshLocalPort: parseInt(sshLocalPort) || 18642 };
    await client.writeFile('gui-prefs.json', JSON.stringify(prefs, null, 2));
    setConnSaved(true);
    setTimeout(() => setConnSaved(false), 2000);
  };

  const testConn = async () => {
    setConnTesting(true);
    setConnTestResult(null);
    const ok = await client.getGatewayStatus().catch(() => false);
    setConnTestResult(ok ? 'ok' : 'error');
    setConnTesting(false);
    setTimeout(() => setConnTestResult(null), 3000);
  };

  const saveWorkspaceConfig = async () => {
    setWorkspaceSaving(true);
    setWorkspaceSaveMsg('');
    try {
      // TODO(phase-1): replace with a proper YAML parser (js-yaml) to prevent injection.
      // Guard: reject working_dir values that would break YAML structure.
      if (workingDir.includes('\n') || workingDir.includes('\r')) {
        setWorkspaceSaveMsg('Error: path must not contain newlines');
        return;
      }
      // Escape any trailing characters that could break inline YAML (e.g. bare # starts a comment).
      // Wrap in double-quotes if the value contains YAML-special characters.
      const needsQuoting = /[:#\[\]{},&*?|<>=!%@`'"\\]/.test(workingDir) || workingDir.trimStart() !== workingDir || workingDir.trimEnd() !== workingDir;
      const safeDir = needsQuoting ? `"${workingDir.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : workingDir;
      let yaml = await client.readConfig().catch(() => '');
      if (/working_dir:\s*.+/.test(yaml)) {
        yaml = yaml.replace(/working_dir:\s*.+/, `working_dir: ${safeDir}`);
      } else {
        yaml = yaml ? `${yaml.trimEnd()}\nworking_dir: ${safeDir}\n` : `working_dir: ${safeDir}\n`;
      }
      await client.writeConfig(yaml);
      await client.setGatewayPort(gatewayPort).catch(() => {});
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
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Cron Delivery Mode</label>
                  <select
                    className="input-field"
                    value={cronDefaultMode}
                    onChange={e => setCronDefaultMode(e.target.value as 'auto' | 'gateway' | 'pty')}
                    style={{ cursor: 'pointer' }}
                  >
                    <option value="auto">Auto</option>
                    <option value="gateway">Gateway</option>
                    <option value="pty">PTY</option>
                  </select>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Auto tries the gateway first and falls back to PTY if it's offline.</div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Gateway Port</label>
                  <input
                    className="input-field"
                    type="number"
                    value={gatewayPort}
                    onChange={e => {
                      const port = parseInt(e.target.value, 10);
                      if (!isNaN(port)) setGatewayPortState(port);
                    }}
                    style={{ fontFamily: 'var(--font-mono)' }}
                  />
<div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Hermes HTTP API port. Change if you run gateway on a custom port.</div>
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
                          const n = await client.clearAllSessions();
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

            {tab === 'connection' && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Connection</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 18 }}>Choose how this app connects to the Hermes gateway</div>

                {/* Mode selector */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  {(['local', 'remote', 'ssh'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setConnMode(mode)}
                      style={{
                        flex: 1,
                        padding: '8px 0',
                        background: connMode === mode ? 'var(--accent-green-dim)' : 'var(--bg1)',
                        border: `1px solid ${connMode === mode ? 'var(--accent-green)' : 'var(--border)'}`,
                        borderRadius: 8,
                        color: connMode === mode ? 'var(--accent-green)' : 'var(--text-secondary)',
                        fontSize: 13,
                        fontWeight: connMode === mode ? 600 : 400,
                        cursor: 'pointer',
                        textTransform: 'capitalize',
                        transition: 'border-color 0.15s, color 0.15s',
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                {/* Local mode */}
                {connMode === 'local' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                    <span className="dot dot-green" />
                    Connected to local Hermes gateway on port 8642
                  </div>
                )}

                {/* Remote mode */}
                {connMode === 'remote' && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Remote URL</label>
                      <input
                        className="input-field"
                        value={connRemoteUrl}
                        onChange={e => setConnRemoteUrl(e.target.value)}
                        placeholder="https://your-server:8642"
                        style={{ fontFamily: 'var(--font-mono)' }}
                      />
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>API Key (optional)</label>
                      <MaskedInput
                        id="conn-api-key"
                        placeholder="API Key (optional)"
                        value={connApiKey}
                        onChange={setConnApiKey}
                      />
                    </div>
                  </div>
                )}

                {/* SSH mode */}
                {connMode === 'ssh' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Host</label>
                      <input className="input-field" value={sshHost} onChange={e => setSshHost(e.target.value)} placeholder="192.168.1.100" style={{ fontFamily: 'var(--font-mono)' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Port</label>
                      <input className="input-field" value={sshPort} onChange={e => setSshPort(e.target.value)} placeholder="22" style={{ fontFamily: 'var(--font-mono)' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Username</label>
                      <input className="input-field" value={sshUser} onChange={e => setSshUser(e.target.value)} placeholder="ubuntu" style={{ fontFamily: 'var(--font-mono)' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Key Path</label>
                      <input className="input-field" value={sshKeyPath} onChange={e => setSshKeyPath(e.target.value)} placeholder="~/.ssh/id_rsa" style={{ fontFamily: 'var(--font-mono)' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Remote Port</label>
                      <input className="input-field" value={sshRemotePort} onChange={e => setSshRemotePort(e.target.value)} placeholder="8642" style={{ fontFamily: 'var(--font-mono)' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Local Port</label>
                      <input className="input-field" value={sshLocalPort} onChange={e => setSshLocalPort(e.target.value)} placeholder="18642" style={{ fontFamily: 'var(--font-mono)' }} />
                    </div>
                  </div>
                )}

                {/* Actions row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={testConn}
                    disabled={connTesting}
                    style={{ fontSize: 13 }}
                  >
                    {connTesting ? 'Testing…' : connTestResult === 'ok' ? <span style={{ color: 'var(--accent-green)' }}>Connected ✓</span> : connTestResult === 'error' ? <span style={{ color: 'var(--accent-red)' }}>Failed ✗</span> : 'Test Connection'}
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={saveConnConfig}
                    style={{ fontSize: 13 }}
                  >
                    {connSaved ? 'Saved ✓' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {tab === 'appearance' && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Appearance</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 18 }}>Choose a colour theme for the interface</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {THEMES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        background: theme === t.id ? 'var(--accent-green-dim)' : 'var(--bg1)',
                        border: `1px solid ${theme === t.id ? 'var(--accent-green)' : 'var(--border)'}`,
                        borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        {t.swatch.map((c, i) => (
                          <div key={i} style={{ width: 12, height: 12, borderRadius: 3, background: c, border: '1px solid rgba(255,255,255,0.1)' }} />
                        ))}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: theme === t.id ? 'var(--accent-green)' : 'var(--text-primary)' }}>{t.label}</span>
                      {theme === t.id && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--accent-green)' }}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'diagnostics' && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Diagnostics</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 20 }}>Engine info, health checks, and quick commands</div>

                {/* Hermes Engine section */}
                <div style={{ marginBottom: 24 }}>
                  <div className="section-label" style={{ marginBottom: 12 }}>Hermes Engine</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Installed version</span>
                      {diagVersionLoading ? (
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>Loading…</span>
                      ) : diagVersion && diagVersion !== 'Not installed' ? (
                        <span className="badge badge-connected" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{diagVersion}</span>
                      ) : (
                        <span className="badge badge-error" style={{ fontSize: 11 }}>Not installed</span>
                      )}
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={handleCheckUpdate}
                      disabled={updateChecking}
                      style={{ fontSize: 12 }}
                    >
                      {updateChecking ? 'Checking…' : 'Check for Updates'}
                    </button>
                  </div>
                  {updateInfo && (
                    <div style={{ padding: '10px 14px', background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span style={{ color: 'var(--text-secondary)', minWidth: 110 }}>Current version</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{updateInfo.current_version ?? '—'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <span style={{ color: 'var(--text-secondary)', minWidth: 110 }}>Latest version</span>
                          <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{updateInfo.latest_version ?? '—'}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-secondary)', minWidth: 110 }}>Status</span>
                          {updateInfo.update_available ? (
                            <span className="badge badge-info" style={{ fontSize: 11 }}>Update available</span>
                          ) : (
                            <span className="badge badge-connected" style={{ fontSize: 11 }}>Up to date</span>
                          )}
                        </div>
                        {updateInfo.release_url && (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                            <span style={{ color: 'var(--text-secondary)', minWidth: 110 }}>Release notes</span>
                            <a
                              href={updateInfo.release_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--accent-blue)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                            >
                              Open <ExternalLink size={11} />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Health Check section */}
                <div style={{ marginBottom: 24 }}>
                  <div className="section-label" style={{ marginBottom: 12 }}>Health Check</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={handleRunDoctor}
                      disabled={doctorRunning}
                      style={{ fontSize: 12 }}
                    >
                      {doctorRunning ? 'Running…' : 'Run Doctor'}
                    </button>
                    {doctorResult && (
                      doctorResult.ok
                        ? <span className="badge badge-connected" style={{ fontSize: 11 }}>All checks passed</span>
                        : <span className="badge badge-error" style={{ fontSize: 11 }}>Some checks failed</span>
                    )}
                  </div>
                  {doctorResult && (
                    <div>
                      {doctorResult.checks.length > 0 && (
                        <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
                          {doctorResult.checks.map((check, i) => (
                            <div
                              key={i}
                              style={{
                                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 12px',
                                borderBottom: i < doctorResult.checks.length - 1 ? '1px solid var(--border)' : 'none',
                              }}
                            >
                              {check.passed
                                ? <CheckCircle size={14} style={{ color: 'var(--accent-green)', marginTop: 1, flexShrink: 0 }} />
                                : <XCircle size={14} style={{ color: 'var(--accent-red)', marginTop: 1, flexShrink: 0 }} />
                              }
                              <div>
                                <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>{check.name}</div>
                                {check.message && (
                                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>{check.message}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {doctorResult.raw && (
                        <div>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setDoctorRawOpen(v => !v)}
                            style={{ fontSize: 11, marginBottom: 6 }}
                          >
                            {doctorRawOpen ? 'Hide' : 'Show'} raw output
                          </button>
                          {doctorRawOpen && (
                            <div className="terminal">
                              <div className="terminal-body" style={{ maxHeight: 180, overflowY: 'auto' }}>
                                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11.5 }}>{doctorResult.raw}</pre>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Setup Wizard */}
                {onRerunWizard && (
                  <div style={{ marginBottom: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                    <div className="section-label" style={{ marginBottom: 12 }}>Setup Wizard</div>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setSettingsOpen(false); onRerunWizard(); }}
                      style={{ fontSize: 12 }}
                    >
                      Relaunch Setup Wizard
                    </button>
                    <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 6 }}>
                      Re-run the first-time setup wizard to change your provider, model, or API keys.
                    </div>
                  </div>
                )}

                {/* Quick Commands section */}
                <div>
                  <div className="section-label" style={{ marginBottom: 12 }}>Quick Commands</div>
                  {[
                    { key: 'status', label: 'hermes status', args: ['status'] },
                    { key: 'version', label: 'hermes --version', args: ['--version'] },
                  ].map(cmd => (
                    <div key={cmd.key} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleQuickCmd(cmd.key, cmd.args)}
                          disabled={quickCmdRunning[cmd.key]}
                          style={{ fontSize: 12 }}
                        >
                          {quickCmdRunning[cmd.key] ? 'Running…' : 'Run'}
                        </button>
                        <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{cmd.label}</code>
                      </div>
                      {quickCmdOutput[cmd.key] !== undefined && (
                        <div className="terminal">
                          <div className="terminal-body" style={{ maxHeight: 120, overflowY: 'auto' }}>
                            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11.5 }}>{quickCmdOutput[cmd.key]}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
