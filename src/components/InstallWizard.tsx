import React, { useEffect, useState } from 'react';
import { ChevronRight, Loader } from 'lucide-react';
import { getHermesInstallStatus, installHermes, writeEnv, startGateway } from '../api/desktop';

const PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter', key: 'OPENROUTER_API_KEY', hint: 'sk-or-...', url: 'https://openrouter.ai/keys' },
  { id: 'openai', label: 'OpenAI', key: 'OPENAI_API_KEY', hint: 'sk-...', url: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic', label: 'Anthropic', key: 'ANTHROPIC_API_KEY', hint: 'sk-ant-...', url: 'https://console.anthropic.com/keys' },
  { id: 'nvidia', label: 'NVIDIA NIM', key: 'NVIDIA_API_KEY', hint: 'nvapi-...', url: 'https://build.nvidia.com' },
  { id: 'google', label: 'Google AI', key: 'GOOGLE_API_KEY', hint: 'AIza...', url: 'https://aistudio.google.com/apikey' },
  { id: 'nous', label: 'Nous Portal', key: 'NOUS_API_KEY', hint: 'np-...', url: 'https://portal.nousresearch.com' },
];

interface Props {
  onComplete: () => void;
}

export default function InstallWizard({ onComplete }: Props) {
  const [step, setStep] = useState(0); // 0=check, 1=install, 2=provider, 3=key, 4=done
  const [installed, setInstalled] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState<string[]>([]);
  const [provider, setProvider] = useState<typeof PROVIDERS[0] | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);

  useEffect(() => {
    getHermesInstallStatus().then(s => {
      setInstalled(s.installed);
      if (s.installed) setStep(2); // skip install step
    });
  }, []);

  const runInstall = async () => {
    setInstalling(true);
    setInstallLog(['Starting installer...']);
    try {
      const result = await installHermes();
      const lines = (result.stdout + '\n' + result.stderr).trim().split('\n').filter(Boolean);
      setInstallLog(lines.length ? lines : ['Installation completed.']);
      if (result.success) {
        setInstalled(true);
        setTimeout(() => setStep(2), 1200);
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
      setStep(4);
      // Auto-start gateway
      await startGateway().catch(() => {});
      setTimeout(onComplete, 1500);
    } catch {
      setSavingKey(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ width: 560, background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Hermes Desktop Setup</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3 }}>
            {['Environment check', 'Install Hermes', 'Choose provider', 'API key', 'All set'][step]}
          </div>
          {/* Step dots */}
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
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setStep(2)}>Continue <ChevronRight size={14} /></button>
              ) : (
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setStep(1)}>Install Hermes Agent</button>
              )}
            </div>
          )}

          {step === 1 && (
            <div>
              <div style={{ background: 'var(--bg0)', borderRadius: 'var(--radius-md)', padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)', maxHeight: 220, overflowY: 'auto', marginBottom: 16 }}>
                {installLog.map((l, i) => <div key={i} style={{ color: l.includes('[error]') ? 'var(--accent-red)' : 'inherit' }}>{l}</div>)}
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
                  <button key={p.id} onClick={() => setProvider(p)}
                    style={{ padding: '12px 14px', background: provider?.id === p.id ? 'var(--accent-green-dim)' : 'var(--bg2)', border: `1px solid ${provider?.id === p.id ? 'var(--accent-green)' : 'var(--border)'}`, borderRadius: 'var(--radius-md)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{p.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>{p.hint}</div>
                  </button>
                ))}
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={!provider} onClick={() => setStep(3)}>
                Continue <ChevronRight size={14} />
              </button>
            </div>
          )}

          {step === 3 && provider && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {provider.label} API Key — <a href={provider.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)' }}>Get one here</a>
              </div>
              <div style={{ position: 'relative', marginBottom: 18 }}>
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
