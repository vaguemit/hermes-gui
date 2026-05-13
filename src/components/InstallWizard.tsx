import React, { useEffect, useState } from 'react';
import {
  ArrowRight, CheckCircle2, Download, ExternalLink, Eye, EyeOff,
  Loader2, XCircle, ChevronLeft,
} from 'lucide-react';
import {
  getHermesInstallStatus, streamInstallHermes, writeEnv, setModelConfig,
  HermesInstallStatus,
} from '../api/desktop';

// ── Provider catalogue (mirrored from reference app constants.ts) ─────────────

interface ProviderDef {
  id: string;
  name: string;
  desc: string;
  tag?: string;
  envKey: string;
  url: string;
  placeholder: string;
  configProvider: string;
  baseUrl: string;
  needsKey: boolean;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'openrouter', name: 'OpenRouter', tag: 'Recommended — 200+ models',
    desc: 'Access hundreds of models through a single API key.',
    envKey: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/keys',
    placeholder: 'sk-or-v1-...', configProvider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1', needsKey: true,
  },
  {
    id: 'anthropic', name: 'Anthropic', desc: 'Direct Claude access.',
    envKey: 'ANTHROPIC_API_KEY', url: 'https://console.anthropic.com/settings/keys',
    placeholder: 'sk-ant-...', configProvider: 'anthropic', baseUrl: '', needsKey: true,
  },
  {
    id: 'openai', name: 'OpenAI', desc: 'Direct GPT model access.',
    envKey: 'OPENAI_API_KEY', url: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-...', configProvider: 'openai', baseUrl: '', needsKey: true,
  },
  {
    id: 'google', name: 'Google (Gemini)', desc: 'Gemini models via AI Studio.',
    envKey: 'GOOGLE_API_KEY', url: 'https://aistudio.google.com/app/apikey',
    placeholder: 'AIza...', configProvider: 'google', baseUrl: '', needsKey: true,
  },
  {
    id: 'xai', name: 'xAI (Grok)', desc: 'Grok models.',
    envKey: 'XAI_API_KEY', url: 'https://console.x.ai',
    placeholder: 'xai-...', configProvider: 'xai', baseUrl: '', needsKey: true,
  },
  {
    id: 'nous', name: 'Nous Portal', tag: 'Free tier available',
    desc: 'Run Hermes through the Nous research portal.',
    envKey: '', url: '', placeholder: '', configProvider: 'nous', baseUrl: '', needsKey: false,
  },
  {
    id: 'local', name: 'Local / Custom', tag: 'No API key required',
    desc: 'Connect to LM Studio, Ollama, vLLM, or any OpenAI-compatible server.',
    envKey: '', url: '', placeholder: 'sk-...',
    configProvider: 'custom', baseUrl: 'http://localhost:1234/v1', needsKey: false,
  },
];

const LOCAL_PRESETS = [
  { id: 'lmstudio', name: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  { id: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { id: 'vllm', name: 'vLLM', baseUrl: 'http://localhost:8000/v1' },
  { id: 'llamacpp', name: 'llama.cpp', baseUrl: 'http://localhost:8080/v1' },
];

// ── Step identifiers ──────────────────────────────────────────────────────────
type Step = 'detect' | 'install' | 'provider' | 'apikey' | 'done';

// ── Persisted state ───────────────────────────────────────────────────────────
const STATE_KEY = 'hermes-wizard-state';
interface PersistedState { step: Step; provider: string }
function loadState(): PersistedState {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) ?? '{}'); } catch { return {} as PersistedState; }
}
function saveState(s: PersistedState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(s));
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props { onComplete: () => void }

export default function InstallWizard({ onComplete }: Props) {
  const persisted = loadState();

  const [step, setStep] = useState<Step>(persisted.step || 'detect');
  const [status, setStatus] = useState<HermesInstallStatus | null>(null);
  const [installLines, setInstallLines] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState('');

  const [selectedProvider, setSelectedProvider] = useState(persisted.provider || 'openrouter');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('http://localhost:1234/v1');
  const [modelName, setModelName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const provider = PROVIDERS.find((p) => p.id === selectedProvider) ?? PROVIDERS[0];
  const isLocal = selectedProvider === 'local';

  // ── Step 1: detect existing install ──────────────────────────────────────
  useEffect(() => {
    if (step !== 'detect') return;
    getHermesInstallStatus().then((s) => {
      setStatus(s);
      if (s.installed && s.configured) {
        // Already set up, skip straight to provider step
        goTo('provider');
      } else if (s.installed) {
        goTo('provider');
      } else {
        goTo('install');
      }
    }).catch(() => goTo('install'));
  }, []);

  function goTo(s: Step) {
    setStep(s);
    saveState({ step: s, provider: selectedProvider });
  }

  // ── Step 2: run installer ────────────────────────────────────────────────
  async function runInstall() {
    setInstalling(true);
    setInstallError('');
    setInstallLines([]);
    try {
      const result = await streamInstallHermes((line) => setInstallLines((prev) => [...prev, line]));
      if (result.success || result.stdout.toLowerCase().includes('installed')) {
        goTo('provider');
      } else {
        setInstallError(result.stderr || 'Installation failed. Check the log above.');
      }
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  }

  // ── Step 4: save API key + model config ──────────────────────────────────
  async function handleSave() {
    if (provider.needsKey && !apiKey.trim()) {
      setSaveError('Please enter your API key.');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      if (provider.needsKey && provider.envKey) {
        await writeEnv(provider.envKey, apiKey.trim());
      } else if (isLocal && apiKey.trim()) {
        await writeEnv('CUSTOM_API_KEY', apiKey.trim());
      }
      const configProvider = isLocal ? 'custom' : provider.configProvider;
      const configBase = isLocal ? baseUrl.trim() : provider.baseUrl;
      await setModelConfig(configProvider, modelName.trim(), configBase);
      localStorage.removeItem(STATE_KEY);
      goTo('done');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg0)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        width: '100%', maxWidth: 560, background: 'var(--bg1)',
        border: '1px solid var(--border)', borderRadius: 16, padding: '36px 40px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Logo + title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px',
            background: 'linear-gradient(135deg, #7c6af7 0%, #3b9eff 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, boxShadow: '0 8px 24px rgba(124,106,247,0.4)',
          }}>🤖</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Hermes Desktop</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {step === 'detect' && 'Checking environment…'}
            {step === 'install' && 'Install Hermes Agent'}
            {step === 'provider' && 'Choose your AI provider'}
            {step === 'apikey' && 'Enter your API key'}
            {step === 'done' && 'All set!'}
          </div>
        </div>

        {/* ── detect ── */}
        {step === 'detect' && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            Checking for existing Hermes installation…
          </div>
        )}

        {/* ── install ── */}
        {step === 'install' && (
          <>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              Hermes Agent is not yet installed. Click below to run the official Nous Research installer — it handles Python, dependencies, and the agent itself automatically.
            </div>
            {installLines.length > 0 && (
              <pre style={{
                background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '10px 12px', fontSize: 11.5, lineHeight: 1.55, maxHeight: 200,
                overflow: 'auto', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
                marginBottom: 16,
              }}>
                {installLines.join('\n')}
              </pre>
            )}
            {installError && (
              <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <XCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                {installError}
              </div>
            )}
            <button
              className="btn btn-primary"
              onClick={runInstall}
              disabled={installing}
              style={{ width: '100%', justifyContent: 'center', gap: 8, fontSize: 14 }}
            >
              {installing
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Installing…</>
                : <><Download size={14} />Install Hermes Agent</>
              }
            </button>
          </>
        )}

        {/* ── provider ── */}
        {step === 'provider' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProvider(p.id); saveState({ step: 'provider', provider: p.id }); }}
                  style={{
                    background: selectedProvider === p.id ? 'rgba(124,106,247,0.18)' : 'var(--bg2)',
                    border: `1.5px solid ${selectedProvider === p.id ? '#7c6af7' : 'var(--border)'}`,
                    borderRadius: 10, padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }}>{p.desc}</div>
                  {p.tag && (
                    <div style={{
                      marginTop: 6, display: 'inline-block', fontSize: 10, fontWeight: 600,
                      background: 'rgba(124,106,247,0.2)', color: '#a78bfa', borderRadius: 4, padding: '2px 6px',
                    }}>{p.tag}</div>
                  )}
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary"
              onClick={() => goTo('apikey')}
              style={{ width: '100%', justifyContent: 'center', gap: 8, fontSize: 14 }}
            >
              Continue <ArrowRight size={14} />
            </button>
          </>
        )}

        {/* ── apikey ── */}
        {step === 'apikey' && (
          <>
            <button
              onClick={() => goTo('provider')}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 20 }}
            >
              <ChevronLeft size={14} /> Back
            </button>

            {isLocal ? (
              <>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Quick presets</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {LOCAL_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => setBaseUrl(preset.baseUrl)}
                        style={{
                          background: baseUrl === preset.baseUrl ? 'rgba(124,106,247,0.18)' : 'var(--bg2)',
                          border: `1px solid ${baseUrl === preset.baseUrl ? '#7c6af7' : 'var(--border)'}`,
                          borderRadius: 7, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer', color: 'var(--text-primary)',
                        }}
                      >{preset.name}</button>
                    ))}
                  </div>
                </div>
                <label style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 6 }}>Server URL</label>
                <input
                  className="input"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:1234/v1"
                  style={{ width: '100%', marginBottom: 14 }}
                />
                <label style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Model name <span style={{ opacity: 0.5 }}>(optional)</span>
                </label>
                <input
                  className="input"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="e.g. llama-3.3-70b-instruct"
                  style={{ width: '100%', marginBottom: 20 }}
                />
              </>
            ) : (
              <>
                <label style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {provider.name} API Key
                </label>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <input
                    className="input"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setSaveError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    placeholder={provider.placeholder}
                    autoFocus
                    style={{ width: '100%', paddingRight: 44 }}
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {provider.url && (
                  <a href={provider.url} target="_blank" rel="noreferrer"
                    style={{ fontSize: 12.5, color: 'var(--accent-blue)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20, textDecoration: 'none' }}
                  >
                    Get your {provider.name} API key <ExternalLink size={11} />
                  </a>
                )}
              </>
            )}

            {saveError && (
              <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <XCircle size={14} />{saveError}
              </div>
            )}
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || (provider.needsKey && !apiKey.trim()) || (isLocal && !baseUrl.trim())}
              style={{ width: '100%', justifyContent: 'center', gap: 8, fontSize: 14 }}
            >
              {saving
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Saving…</>
                : <>Save & Continue <ArrowRight size={14} /></>
              }
            </button>
          </>
        )}

        {/* ── done ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle2 size={48} style={{ color: 'var(--accent-green)', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Hermes is ready!</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>
              Your provider and API key have been saved. Start the Gateway from the Gateway tab, then head to the Chat tab to start a conversation.
            </div>
            <button
              className="btn btn-primary"
              onClick={onComplete}
              style={{ width: '100%', justifyContent: 'center', gap: 8, fontSize: 14 }}
            >
              Open Hermes <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
