import React, { useEffect, useState } from 'react';
import { ChevronRight, Loader, Cpu, MemoryStick, Download, Check } from 'lucide-react';
import {
  getHermesInstallStatus, streamInstallHermes, writeEnv, setModelConfig,
  startGateway, readFile, writeFile, getSystemInfo, streamOllamaPull,
} from '../api/desktop';

// Providers — API key providers first, then Ollama (local/free)
const PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter',  key: 'OPENROUTER_API_KEY', hint: 'sk-or-...',  url: 'https://openrouter.ai/keys',             configProvider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1',          defaultModel: 'NousResearch/Hermes-3-Llama-3.1-405B', local: false },
  { id: 'openai',    label: 'OpenAI',       key: 'OPENAI_API_KEY',     hint: 'sk-...',      url: 'https://platform.openai.com/api-keys',   configProvider: 'openai',     baseUrl: '',                                      defaultModel: 'gpt-4o',                              local: false },
  { id: 'anthropic', label: 'Anthropic',    key: 'ANTHROPIC_API_KEY',  hint: 'sk-ant-...', url: 'https://console.anthropic.com/keys',      configProvider: 'anthropic',  baseUrl: '',                                      defaultModel: 'claude-3-5-sonnet-20241022',           local: false },
  { id: 'nvidia',    label: 'NVIDIA NIM',   key: 'NVIDIA_API_KEY',     hint: 'nvapi-...',  url: 'https://build.nvidia.com',                configProvider: 'openai',     baseUrl: 'https://integrate.api.nvidia.com/v1',   defaultModel: 'meta/llama-3.1-405b-instruct',        local: false },
  { id: 'google',    label: 'Google AI',    key: 'GOOGLE_API_KEY',     hint: 'AIza...',     url: 'https://aistudio.google.com/apikey',     configProvider: 'google',     baseUrl: '',                                      defaultModel: 'gemini-1.5-pro',                      local: false },
  { id: 'nous',      label: 'Nous Portal',  key: 'NOUS_API_KEY',       hint: 'np-...',      url: 'https://portal.nousresearch.com',        configProvider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1',          defaultModel: 'NousResearch/Hermes-3-Llama-3.1-405B', local: false },
  { id: 'ollama',    label: 'Ollama',       key: '',                   hint: '',            url: 'https://ollama.ai',                      configProvider: 'openai',     baseUrl: 'http://localhost:11434/v1',             defaultModel: 'hermes3:8b',                          local: true },
];

// Ollama model options with RAM requirements
const OLLAMA_MODELS = [
  { id: 'hermes3:8b',   label: 'Hermes 3 8B',   ram: 8,  description: 'Recommended for most computers', tag: 'recommended' },
  { id: 'hermes3:70b',  label: 'Hermes 3 70B',  ram: 32, description: 'Most powerful, needs 32GB+ RAM or GPU', tag: 'powerful' },
  { id: 'hermes2-pro',  label: 'Hermes 2 Pro',  ram: 16, description: 'Balanced performance (16GB RAM)', tag: 'balanced' },
];

const STATE_FILE = 'gui-setup-state.json';

interface SetupState {
  step: number;
  providerId: string | null;
  ollamaModel?: string;
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
  // Core state
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

  // Ollama-specific state
  const [ramGb, setRamGb] = useState<number | null>(null);
  const [cpuCount, setCpuCount] = useState<number | null>(null);
  const [ollamaModel, setOllamaModel] = useState(OLLAMA_MODELS[0]);
  const [pulling, setPulling] = useState(false);
  const [pullLog, setPullLog] = useState<string[]>([]);
  const [pullDone, setPullDone] = useState(false);

  // Steps:
  // 0 = env check (is hermes installed?)
  // 1 = install hermes (streaming)
  // 2 = provider selection
  // 3 = api key input (non-ollama) OR ollama hardware check
  // 4 = ollama pull progress (ollama only)
  // 5 = done

  // On mount: detect install status and resume
  useEffect(() => {
    (async () => {
      const [status, saved] = await Promise.all([
        getHermesInstallStatus().catch(() => null),
        loadSetupState(),
      ]);
      const isInstalled = status?.installed ?? false;
      const isModelConfigured = status?.model_configured ?? false;
      setInstalled(isInstalled);

      if (saved && saved.step < 5) {
        setStep(saved.step);
        if (saved.providerId) {
          const p = PROVIDERS.find(x => x.id === saved.providerId);
          if (p) { setProvider(p); setModelName(p.defaultModel); }
        }
        if (saved.ollamaModel) {
          const m = OLLAMA_MODELS.find(m => m.id === saved.ollamaModel);
          if (m) setOllamaModel(m);
        }
      } else if (isInstalled && !isModelConfigured) {
        setStep(2);
      } else if (isInstalled) {
        setStep(2);
      }
      setResumeLoaded(true);
    })();
  }, []);

  // Load system info when provider = ollama and we reach the hardware step
  useEffect(() => {
    if (provider?.id === 'ollama' && step === 3 && ramGb === null) {
      getSystemInfo().then(info => {
        setRamGb(info.ram_gb);
        setCpuCount(info.cpu_count);
        // Auto-select recommended model based on RAM
        if (info.ram_gb < 12) setOllamaModel(OLLAMA_MODELS[0]); // 8B
        else if (info.ram_gb < 24) setOllamaModel(OLLAMA_MODELS[2]); // hermes2-pro
        else setOllamaModel(OLLAMA_MODELS[1]); // 70B
      }).catch(() => {});
    }
  }, [step, provider, ramGb]);

  const persist = async (patch: Partial<SetupState>) => {
    await saveSetupState({
      step,
      providerId: provider?.id ?? null,
      ollamaModel: ollamaModel.id,
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

  // For API-key providers
  const saveKeyAndFinish = async () => {
    if (!provider || !apiKey.trim()) return;
    setSavingKey(true);
    try {
      await writeEnv(provider.key, apiKey.trim());
      const finalModel = modelName.trim() || provider.defaultModel;
      await setModelConfig(provider.configProvider, finalModel, provider.baseUrl).catch(() => {});
      await persist({ step: 5, api_key_saved: true });
      setStep(5);
      await startGateway().catch(() => {});
      await writeFile(STATE_FILE, JSON.stringify({
        step: 5, install_completed: true, api_key_saved: true,
        providerId: provider.id, timestamp: new Date().toISOString()
      })).catch(() => {});
      setTimeout(onComplete, 1500);
    } catch {
      setSavingKey(false);
    }
  };

  // For Ollama: pull the model then finish
  const runOllamaPull = async () => {
    setPulling(true);
    setPullLog([`Pulling ${ollamaModel.id}…`]);
    try {
      const result = await streamOllamaPull(ollamaModel.id, (line) => {
        setPullLog(prev => [...prev, line]);
      });
      if (result.success || result.stdout.includes('success') || pullLog.some(l => l.includes('success'))) {
        setPullDone(true);
        setPullLog(prev => [...prev, `✓ ${ollamaModel.id} ready`]);
        setTimeout(() => goTo(5), 1200);
      } else {
        setPullLog(prev => [...prev, '[error] Pull may have failed. You can continue anyway.']);
        setPullDone(true); // allow continue
      }
    } catch (e) {
      setPullLog(prev => [...prev, `[error] ${String(e)}`]);
      setPullDone(true);
    } finally {
      setPulling(false);
    }
  };

  // For Ollama: finish without pulling (if model already exists)
  const finishOllama = async () => {
    setSavingKey(true);
    try {
      await setModelConfig('openai', ollamaModel.id, 'http://localhost:11434/v1').catch(() => {});
      await persist({ step: 5, api_key_saved: true });
      setStep(5);
      await startGateway().catch(() => {});
      await writeFile(STATE_FILE, JSON.stringify({
        step: 5, install_completed: true, api_key_saved: true,
        providerId: 'ollama', ollamaModel: ollamaModel.id, timestamp: new Date().toISOString()
      })).catch(() => {});
      setTimeout(onComplete, 1500);
    } catch {
      setSavingKey(false);
    }
  };

  if (!resumeLoaded) return null;

  const isOllama = provider?.id === 'ollama';
  const stepLabels = isOllama
    ? ['Environment', 'Install', 'Provider', 'Hardware', 'Download', 'Ready']
    : ['Environment', 'Install', 'Provider', 'API Key', '', 'Ready'];
  const progressDots = isOllama ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 5];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg0)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ width: 580, background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Hermes Desktop Setup</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 3 }}>
            {stepLabels[step] ?? 'Done'}
          </div>
          {/* Progress dots */}
          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            {progressDots.map((s, i) => (
              <div key={i} style={{
                width: s === step ? 20 : 7, height: 7, borderRadius: 99,
                background: s <= step ? 'var(--accent-green)' : 'var(--bg3)',
                transition: 'all 0.2s'
              }} />
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '24px 28px', minHeight: 200 }}>

          {/* Step 0: Environment check */}
          {step === 0 && (
            <div>
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'var(--bg2)', borderRadius: 'var(--radius-md)', marginBottom: 8 }}>
                  <span style={{ color: installed ? 'var(--accent-green)' : 'var(--accent-red)', fontSize: 18 }}>{installed ? '✓' : '✕'}</span>
                  <div>
                    <div style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>Hermes Agent — {installed ? 'installed' : 'not found'}</div>
                    {!installed && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>The Hermes CLI will be installed in the next step</div>}
                  </div>
                </div>
              </div>
              {installed ? (
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => goTo(2)}>
                  Continue <ChevronRight size={14} />
                </button>
              ) : (
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => goTo(1)}>
                  Install Hermes Agent
                </button>
              )}
            </div>
          )}

          {/* Step 1: Install */}
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

          {/* Step 2: Provider selection */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>Choose your AI provider:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
                {PROVIDERS.map(p => (
                  <button key={p.id} onClick={() => { setProvider(p); setModelName(p.defaultModel); }}
                    style={{
                      padding: '12px 14px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                      background: provider?.id === p.id ? 'var(--accent-green-dim)' : 'var(--bg2)',
                      border: `1px solid ${provider?.id === p.id ? 'var(--accent-green)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-md)',
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{p.label}</div>
                      {p.local && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--accent-green-dim)', color: 'var(--accent-green)', borderRadius: 99, border: '1px solid var(--accent-green)' }}>Free</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                      {p.local ? 'Runs locally, no internet needed' : p.defaultModel}
                    </div>
                  </button>
                ))}
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} disabled={!provider}
                onClick={async () => {
                  await persist({ step: 3, providerId: provider?.id ?? null });
                  goTo(3);
                }}>
                Continue <ChevronRight size={14} />
              </button>
            </div>
          )}

          {/* Step 3: API key (non-ollama) */}
          {step === 3 && provider && !isOllama && (
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

          {/* Step 3: Ollama hardware check + model selection */}
          {step === 3 && isOllama && (
            <div>
              {/* System info */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                <div style={{ flex: 1, padding: '12px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Cpu size={16} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>CPU Cores</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{cpuCount ?? '—'}</div>
                  </div>
                </div>
                <div style={{ flex: 1, padding: '12px 14px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MemoryStick size={16} style={{ color: 'var(--accent-amber)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>RAM</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{ramGb !== null ? `${ramGb} GB` : '—'}</div>
                  </div>
                </div>
              </div>

              {/* Model selection */}
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>Select a model to use:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                {OLLAMA_MODELS.map(m => {
                  const fits = ramGb !== null ? ramGb >= m.ram : true;
                  return (
                    <button key={m.id} onClick={() => setOllamaModel(m)}
                      style={{
                        padding: '12px 16px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                        background: ollamaModel.id === m.id ? 'var(--accent-green-dim)' : 'var(--bg2)',
                        border: `1px solid ${ollamaModel.id === m.id ? 'var(--accent-green)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius-md)',
                        opacity: fits ? 1 : 0.6,
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)' }}>{m.label}</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {m.tag === 'recommended' && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--accent-green-dim)', color: 'var(--accent-green)', border: '1px solid var(--accent-green)', borderRadius: 99 }}>Recommended</span>}
                          {!fits && <span style={{ fontSize: 10, padding: '2px 6px', background: 'var(--accent-amber-dim)', color: 'var(--accent-amber)', border: '1px solid var(--accent-amber)', borderRadius: 99 }}>Needs {m.ram}GB RAM</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3 }}>{m.description}</div>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={finishOllama} disabled={savingKey}>
                  Skip Download (already installed)
                </button>
                <button className="btn btn-primary" style={{ flex: 2 }}
                  onClick={async () => { await persist({ step: 4, ollamaModel: ollamaModel.id }); goTo(4); }}>
                  <Download size={14} /> Download Model
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Ollama pull progress */}
          {step === 4 && isOllama && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                Downloading <span style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>{ollamaModel.id}</span>…
              </div>
              <div style={{ background: 'var(--bg0)', borderRadius: 'var(--radius-md)', padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)', maxHeight: 200, overflowY: 'auto', marginBottom: 16 }}>
                {pullLog.map((l, i) => (
                  <div key={i} style={{ color: l.startsWith('✓') ? 'var(--accent-green)' : l.includes('[error]') ? 'var(--accent-red)' : 'inherit' }}>{l}</div>
                ))}
                {pulling && <div style={{ color: 'var(--accent-green)' }}>▌</div>}
              </div>
              {!pulling && pullLog.length === 0 && (
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={runOllamaPull}>
                  <Download size={14} /> Start Download
                </button>
              )}
              {pulling && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
                  <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Downloading model… this may take a while
                </div>
              )}
              {pullDone && !pulling && (
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={finishOllama}>
                  <Check size={14} /> Continue
                </button>
              )}
            </div>
          )}

          {/* Step 5: Done */}
          {step === 5 && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12, color: 'var(--accent-green)' }}>✓</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>Hermes is ready</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Starting gateway and entering the app…</div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
