import React, { useEffect, useState } from 'react';
import { ChevronRight, Loader } from 'lucide-react';
import { getHermesInstallStatus, streamInstallHermes, writeEnv, setModelConfig, startGateway, readFile, writeFile } from '../api/desktop';

const PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter',  key: 'OPENROUTER_API_KEY', hint: 'sk-or-...',  url: 'https://openrouter.ai/keys',             configProvider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1',          defaultModel: 'NousResearch/Hermes-3-Llama-3.1-405B' },
  { id: 'openai',    label: 'OpenAI',       key: 'OPENAI_API_KEY',     hint: 'sk-...',      url: 'https://platform.openai.com/api-keys',   configProvider: 'openai',     baseUrl: '',                                      defaultModel: 'gpt-4o' },
  { id: 'anthropic', label: 'Anthropic',    key: 'ANTHROPIC_API_KEY',  hint: 'sk-ant-...', url: 'https://console.anthropic.com/keys',      configProvider: 'anthropic',  baseUrl: '',                                      defaultModel: 'claude-3-5-sonnet-20241022' },
  { id: 'nvidia',    label: 'NVIDIA NIM',   key: 'NVIDIA_API_KEY',     hint: 'nvapi-...',  url: 'https://build.nvidia.com',                configProvider: 'openai',     baseUrl: 'https://integrate.api.nvidia.com/v1',   defaultModel: 'meta/llama-3.1-405b-instruct' },
  { id: 'google',    label: 'Google AI',    key: 'GOOGLE_API_KEY',     hint: 'AIza...',     url: 'https://aistudio.google.com/apikey',     configProvider: 'google',     baseUrl: '',                                      defaultModel: 'gemini-1.5-pro' },
  { id: 'nous',      label: 'Nous Portal',  key: 'NOUS_API_KEY',       hint: 'np-...',      url: 'https://portal.nousresearch.com',        configProvider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1',          defaultModel: 'NousResearch/Hermes-3-Llama-3.1-405B' },
];

const STATE_FILE = 'gui-setup-state.json';

interface SetupState {
  step: number;
  providerId: string | null;
  install_completed: boolean;
  api_key_saved: boolean;
  timestamp?: string;
}

async function loadSetupState(): Promise<SetupState | null> {
  try {
    const raw = await readFile(STATE_FILE);
    return JSON.parse(raw) as SetupState;
  } catch {
    return null;
  }
}

async function saveSetupState(s: SetupState): Promise<void> {
  await writeFile(STATE_FILE, JSON.stringify({ ...s, timestamp: new Date().toISOString() }, null, 2)).catch(() => {});
}

interface Props {
  onComplete: () => void;
}

export default function InstallWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState<string[]>([]);
  const [provider, setProvider] = useState<typeof PROVIDERS[0] | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [modelName, setModelName] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [resumeLoaded, setResumeLoaded] = useState(false);

  // On mount: check install status and resume from saved state
  useEffect(() => {
    (async () => {
      const [status, saved] = await Promise.all([
        getHermesInstallStatus().catch(() => null),
        loadSetupState(),
      ]);
      const isInstalled = status?.installed ?? false;
      const isModelConfigured = status?.model_configured ?? false;
      setInstalled(isInstalled);

      if (saved && saved.step < 4) {
        // Resume from last saved point
        setStep(saved.step);
        if (saved.providerId) {
          const p = PROVIDERS.find(x => x.id === saved.providerId);
          if (p) { setProvider(p); setModelName(p.defaultModel); }
        }
      } else if (isInstalled && !isModelConfigured) {
        setStep(2); // Installed but no model configured — go straight to provider selection
      } else if (isInstalled) {
        setStep(2); // Skip install step if already installed
      }
      setResumeLoaded(true);
    })();
  }, []);

  const persist = async (patch: Partial<SetupState>) => {
    await saveSetupState({
      step,
      providerId: provider?.id ?? null,
      install_completed: installed,
      api_key_saved: false,
      ...patch,
    });
  };

  const goTo = async (nextStep: number) => {
    setStep(nextStep);
    await persist({ step: nextStep });
  };

  const runInstall = async () => {
    setInstalling(true);
    setInstallLog(['Starting installer…']);
    await persist({ step: 1 });
    try {
      const result = await streamInstallHermes((line) => {
        setInstallLog(prev => [...prev, line]);
      });
      if (result.success) {
        setInstalled(true);
        await persist({ step: 2, install_completed: true });
        setTimeout(() => goTo(2), 1200);
      } else {
        setInstallLog(prev => [...prev, '[error] Installation failed. Check the output above.']);
      }
    } catch (e) {
      setInstallLog(prev => [...prev, `[error] ${String(e)}`]);
    } finally {
      setInstalling(false);
    }
  };

  const saveKeyAndFinish = async () => {
    if (!provider || !apiKey.trim()) return;
    setSavingKey(true);
    try {
      await writeEnv(provider.key, apiKey.trim());
      const finalModel = modelName.trim() || provider.defaultModel;
      await setModelConfig(provider.configProvider, finalModel, provider.baseUrl).catch(() => {});
      await persist({ step: 4, api_key_saved: true });
      setStep(4);
      await startGateway().catch(() => {});
      await writeFile(STATE_FILE, JSON.stringify({ step: 4, install_completed: true, api_key_saved: true, providerId: provider.id, timestamp: new Date().toISOString() })).catch(() => {});
      setTimeout(onComplete, 1500);
    } catch {
      setSavingKey(false);
    }
  };

  if (!resumeLoaded) return null; // Wait for resume check before rendering

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ width: 560, background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Hermes Desktop Setup</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3 }}>
            {['Environment check', 'Install Hermes', 'Choose provider', 'API key', 'All set'][step]}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} style={{ width: i === step ? 20 : 7, height: 7, borderRadius: 99, background: i <= step ? 'var(--accent-green)' : 'var(--bg3)', transition: 'all 0.2s' }} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px' }}>
          {step === 0 && (
            <div>
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--bg2)', borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
                  <span style={{ color: installed ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: 18 }}>{installed ? '✓' : '✕'}</span>
                  <span style={{ fontSize: 13.5 }}>Hermes Agent — {installed ? 'installed' : 'not installed'}</span>
                </div>
              </div>
              {installed ? (
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => goTo(2)}>Continue <ChevronRight size={14} /></button>
              ) : (
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => goTo(1)}>Install Hermes Agent</button>
              )}
            </div>
          )}

          {step === 1 && (
            <div>
              <div style={{ background: 'var(--bg0)', borderRadius: 'var(--radius-md)', padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)', maxHeight: 220, overflowY: 'auto', marginBottom: 16 }}>
                {installLog.map((l, i) => (
                  <div key={i} style={{ color: l.includes('[error]') ? 'var(--accent-red)' : l.startsWith('✓') || l.startsWith('→') ? 'var(--accent-green)' : 'inherit' }}>{l}</div>
                ))}
                {installing && <div style={{ color: 'var(--accent-green)' }}>▌</div>}
              </div>
              {!installing && installLog.length === 0 && (
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={runInstall}>Start Installation</button>
              )}
              {installing && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                  <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Installing… this takes 2–5 minutes
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>Choose your AI provider:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
                {PROVIDERS.map(p => (
                  <button key={p.id} onClick={() => { setProvider(p); setModelName(p.defaultModel); }}
                    style={{ padding: '12px 14px', background: provider?.id === p.id ? 'var(--accent-green-dim)' : 'var(--bg2)', border: `1px solid ${provider?.id === p.id ? 'var(--accent-green)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{p.defaultModel}</div>
                  </button>
                ))}
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={!provider} onClick={async () => { await persist({ step: 3, providerId: provider?.id ?? null }); goTo(3); }}>
                Continue <ChevronRight size={14} />
              </button>
            </div>
          )}

          {step === 3 && provider && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                {provider.label} API Key — <a href={provider.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)' }}>Get one here</a>
              </div>
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={provider.hint}
                  className="input-field"
                  style={{ paddingRight: 44, fontFamily: 'var(--font-mono)', fontSize: 13 }}
                  autoFocus
                />
                <button onClick={() => setShowKey(!showKey)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12 }}>
                  {showKey ? 'hide' : 'show'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Model name</div>
              <input
                type="text"
                value={modelName}
                onChange={e => setModelName(e.target.value)}
                placeholder={provider.defaultModel}
                className="input-field"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, marginBottom: 18 }}
              />
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={!apiKey.trim() || savingKey} onClick={saveKeyAndFinish}>
                {savingKey ? 'Saving...' : 'Save and Launch'}
              </button>
            </div>
          )}

          {step === 4 && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Hermes is ready</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Starting gateway and entering the app…</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
