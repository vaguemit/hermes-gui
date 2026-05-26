import React, { useState, useEffect } from 'react';
import { Zap, CheckCircle, ArrowRight, ArrowLeft, Globe, Monitor, Key, Bot } from 'lucide-react';
import { useStore } from '../store';
import { detectApiKeys, writeEnv, setModelConfig, setConnectionConfig } from '../api/desktop';
import type { ApiKeyStatus } from '../api/desktop';

// ─── Types ────────────────────────────────────────────────────────────────────

type ConnectionMode = 'local' | 'remote';

interface ModelOption {
  provider: string;
  model: string;
  baseUrl: string;
  label: string;
  sub: string;
  icon: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const API_PROVIDERS = ['Anthropic', 'OpenAI', 'OpenRouter', 'Google'] as const;
type ApiProvider = typeof API_PROVIDERS[number];

const ENV_KEY_MAP: Record<ApiProvider, string> = {
  Anthropic: 'ANTHROPIC_API_KEY',
  OpenAI: 'OPENAI_API_KEY',
  OpenRouter: 'OPENROUTER_API_KEY',
  Google: 'GOOGLE_API_KEY',
};

const PROVIDER_DETECTED_MAP: Record<ApiProvider, string> = {
  Anthropic: 'anthropic',
  OpenAI: 'openai',
  OpenRouter: 'openrouter',
  Google: 'google',
};

const MODEL_OPTIONS: ModelOption[] = [
  { provider: 'anthropic', model: 'claude-sonnet-4-5', baseUrl: '', label: 'Anthropic', sub: 'claude-sonnet-4-5', icon: 'AN' },
  { provider: 'openai', model: 'gpt-4o', baseUrl: '', label: 'OpenAI', sub: 'gpt-4o', icon: 'OA' },
  { provider: 'openrouter', model: 'openrouter/auto', baseUrl: 'https://openrouter.ai/api/v1', label: 'OpenRouter', sub: 'openrouter/auto', icon: 'OR' },
];

// ─── Progress Dots ────────────────────────────────────────────────────────────

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 32 }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: i + 1 === current ? 20 : 7,
            height: 7,
            borderRadius: 4,
            background: i + 1 <= current ? 'var(--accent-green)' : 'var(--bg4)',
            transition: 'all 0.25s ease',
            opacity: i + 1 < current ? 0.5 : 1,
          }}
        />
      ))}
    </div>
  );
}

// ─── Step 1 — Welcome ─────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="animate-in" style={{ textAlign: 'center' }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 42,
        fontWeight: 700,
        letterSpacing: '0.18em',
        color: 'var(--text-primary)',
        marginBottom: 8,
      }}>
        HERMES
      </div>
      <div style={{
        fontSize: 15,
        color: 'var(--text-secondary)',
        marginBottom: 36,
        letterSpacing: '0.02em',
      }}>
        Your AI desktop agent
      </div>

      <div style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '18px 22px',
        marginBottom: 32,
        textAlign: 'left',
      }}>
        {[
          { icon: <Bot size={14} />, text: 'Chat with powerful AI models locally or remotely' },
          { icon: <Zap size={14} />, text: 'Run scheduled cron tasks and automate workflows' },
          { icon: <Globe size={14} />, text: 'Connect platforms — Telegram, Discord, Slack and more' },
        ].map(({ icon, text }, i) => (
          <div key={i} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '7px 0',
            borderBottom: i < 2 ? '1px solid var(--border)' : 'none',
            color: 'var(--text-secondary)',
            fontSize: 13,
          }}>
            <span style={{ color: 'var(--accent-green)', flexShrink: 0 }}>{icon}</span>
            {text}
          </div>
        ))}
      </div>

      <button className="btn btn-primary" onClick={onNext} style={{ width: '100%', justifyContent: 'center', fontSize: 14, padding: '11px 16px' }}>
        Get Started
        <ArrowRight size={15} />
      </button>
    </div>
  );
}

// ─── Step 2 — Connection Mode ─────────────────────────────────────────────────

function StepConnection({
  onNext,
  onBack,
}: {
  onNext: (mode: ConnectionMode, remoteUrl: string, remoteKey: string) => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<ConnectionMode>('local');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [remoteKey, setRemoteKey] = useState('');

  function handleNext() {
    onNext(selected, remoteUrl.trim(), remoteKey.trim());
  }

  const cardStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--bg3)' : 'var(--bg2)',
    border: `1px solid ${active ? 'var(--border-active)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-md)',
    padding: '16px 18px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 8,
    textAlign: 'left' as const,
    width: '100%',
  });

  return (
    <div className="animate-in">
      <div className="section-label" style={{ marginBottom: 20 }}>Connection Mode</div>

      <button style={cardStyle(selected === 'local')} onClick={() => setSelected('local')}>
        <Monitor size={18} style={{ color: 'var(--accent-green)', marginTop: 1, flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>Local</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Run Hermes on this machine. Best for privacy and low latency.</div>
        </div>
        {selected === 'local' && <div style={{ marginLeft: 'auto', color: 'var(--accent-green)', flexShrink: 0 }}><CheckCircle size={16} /></div>}
      </button>

      <button style={cardStyle(selected === 'remote')} onClick={() => setSelected('remote')}>
        <Globe size={18} style={{ color: 'var(--accent-blue)', marginTop: 1, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>Remote</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Connect to a Hermes instance running on another machine.</div>
        </div>
        {selected === 'remote' && <div style={{ marginLeft: 'auto', color: 'var(--accent-green)', flexShrink: 0 }}><CheckCircle size={16} /></div>}
      </button>

      {selected === 'remote' && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }} className="animate-in">
          <input
            className="input-field"
            type="url"
            placeholder="http://192.168.1.100:8642"
            value={remoteUrl}
            onChange={e => setRemoteUrl(e.target.value)}
          />
          <input
            className="input-field"
            type="password"
            placeholder="API key (optional)"
            value={remoteKey}
            onChange={e => setRemoteKey(e.target.value)}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6 }}>
          <ArrowLeft size={14} /> Back
        </button>
        <button className="btn btn-primary" onClick={handleNext} style={{ flex: 1, justifyContent: 'center' }}>
          Next <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Step 3 — API Keys ────────────────────────────────────────────────────────

function StepApiKeys({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [detected, setDetected] = useState<ApiKeyStatus | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    detectApiKeys().then(setDetected).catch(() => setDetected({ has_keys: false, providers: [] }));
  }, []);

  function hasProvider(provider: ApiProvider) {
    if (!detected) return false;
    const needle = PROVIDER_DETECTED_MAP[provider].toLowerCase();
    return detected.providers.some(p => p.toLowerCase().includes(needle));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.allSettled(
        Object.entries(keys)
          .filter(([, v]) => v.trim())
          .map(([k, v]) => writeEnv(k, v.trim()))
      );
    } finally {
      setSaving(false);
      onNext();
    }
  }

  return (
    <div className="animate-in">
      <div className="section-label" style={{ marginBottom: 6 }}>API Keys</div>
      <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 18 }}>
        Keys are saved to your local Hermes config. Already-detected keys are shown below.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {API_PROVIDERS.map(provider => {
          const already = hasProvider(provider);
          const envKey = ENV_KEY_MAP[provider];
          return (
            <div key={provider} style={{
              background: 'var(--bg2)',
              border: `1px solid ${already ? 'rgba(34,197,94,0.2)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: already ? 0 : 8 }}>
                <Key size={13} style={{ color: already ? 'var(--accent-green)' : 'var(--text-tertiary)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{provider}</span>
                {already
                  ? <span className="badge badge-connected"><CheckCircle size={9} /> detected</span>
                  : <span className="badge badge-muted">not set</span>
                }
              </div>
              {!already && (
                <input
                  className="input-field"
                  type="password"
                  placeholder={`${envKey}=sk-...`}
                  value={keys[envKey] ?? ''}
                  onChange={e => setKeys(prev => ({ ...prev, [envKey]: e.target.value }))}
                />
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 24, alignItems: 'center' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6 }}>
          <ArrowLeft size={14} /> Back
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
          {saving ? 'Saving…' : 'Save & Continue'}
          {!saving && <ArrowRight size={14} />}
        </button>
        <button
          onClick={onNext}
          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 12.5, cursor: 'pointer', padding: '0 4px', textDecoration: 'underline', textUnderlineOffset: 3 }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}

// ─── Step 4 — Model Selection ─────────────────────────────────────────────────

function StepModelSelection({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    if (!selected) { onNext(); return; }
    setSaving(true);
    try {
      const opt = MODEL_OPTIONS.find(m => m.provider === selected);
      if (opt) {
        await setModelConfig(opt.provider, opt.model, opt.baseUrl);
      }
    } catch { /* ignore */ } finally {
      setSaving(false);
      onNext();
    }
  }

  return (
    <div className="animate-in">
      <div className="section-label" style={{ marginBottom: 6 }}>Model Selection</div>
      <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 18 }}>
        Choose a default AI provider. You can change this at any time from the sidebar.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {MODEL_OPTIONS.map(opt => (
          <button
            key={opt.provider}
            onClick={() => setSelected(opt.provider)}
            style={{
              background: selected === opt.provider ? 'var(--bg3)' : 'var(--bg2)',
              border: `1px solid ${selected === opt.provider ? 'var(--border-active)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '13px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <div style={{
              width: 34,
              height: 34,
              background: 'var(--bg4)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-secondary)',
              flexShrink: 0,
            }}>
              {opt.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{opt.sub}</div>
            </div>
            {selected === opt.provider && <CheckCircle size={16} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />}
          </button>
        ))}

        <button
          onClick={() => setSelected(null)}
          style={{
            background: selected === null ? 'var(--bg3)' : 'transparent',
            border: `1px solid ${selected === null ? 'var(--border-active)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-md)',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 12.5,
            transition: 'border-color 0.15s, background 0.15s',
            width: '100%',
          }}
        >
          Use default (auto-detect)
          {selected === null && <CheckCircle size={14} style={{ color: 'var(--accent-green)', marginLeft: 'auto' }} />}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ gap: 6 }}>
          <ArrowLeft size={14} /> Back
        </button>
        <button className="btn btn-primary" onClick={handleContinue} disabled={saving} style={{ flex: 1, justifyContent: 'center' }}>
          {saving ? 'Saving…' : 'Continue'}
          {!saving && <ArrowRight size={14} />}
        </button>
      </div>
    </div>
  );
}

// ─── Step 5 — Done ────────────────────────────────────────────────────────────

function StepDone({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="animate-in" style={{ textAlign: 'center' }}>
      {/* CSS-only animated checkmark */}
      <style>{`
        @keyframes check-draw {
          from { stroke-dashoffset: 60; opacity: 0; }
          to   { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes circle-grow {
          from { transform: scale(0.6); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        .done-circle {
          animation: circle-grow 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards;
          width: 72px; height: 72px;
          background: var(--accent-green-dim);
          border: 2px solid rgba(34,197,94,0.3);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 24px;
        }
        .done-check {
          animation: check-draw 0.4s 0.2s ease-out forwards;
          stroke-dasharray: 60;
          stroke-dashoffset: 60;
          opacity: 0;
        }
      `}</style>

      <div className="done-circle">
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
          <polyline
            className="done-check"
            points="7,18 14,25 27,10"
            stroke="var(--accent-green)"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
        You're all set!
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 32, lineHeight: 1.6 }}>
        Hermes is ready. You can configure more<br />settings anytime from the sidebar.
      </div>

      <button className="btn btn-primary" onClick={onOpen} style={{ width: '100%', justifyContent: 'center', fontSize: 14, padding: '11px 16px' }}>
        Open Hermes
        <ArrowRight size={15} />
      </button>
    </div>
  );
}

// ─── Main WelcomePanel ────────────────────────────────────────────────────────

const TOTAL_STEPS = 5;

interface WelcomePanelProps {
  onDone?: () => void;
}

export default function WelcomePanel({ onDone }: WelcomePanelProps) {
  const [step, setStep] = useState(1);
  const { setActiveSection } = useStore();

  function next() { setStep(s => Math.min(s + 1, TOTAL_STEPS)); }
  function back() { setStep(s => Math.max(s - 1, 1)); }

  async function handleConnectionNext(mode: ConnectionMode, remoteUrl: string, remoteKey: string) {
    try {
      await setConnectionConfig(mode, remoteUrl, remoteKey || undefined);
    } catch { /* ignore */ }
    next();
  }

  function handleOpen() {
    localStorage.setItem('hermes_onboarding_done', '1');
    onDone?.();
    setActiveSection('chat');
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.82)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      zIndex: 2000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--bg1)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '36px 32px',
        width: '100%',
        maxWidth: 480,
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        <ProgressDots current={step} total={TOTAL_STEPS} />

        {step === 1 && <StepWelcome onNext={next} />}
        {step === 2 && <StepConnection onNext={handleConnectionNext} onBack={back} />}
        {step === 3 && <StepApiKeys onNext={next} onBack={back} />}
        {step === 4 && <StepModelSelection onNext={next} onBack={back} />}
        {step === 5 && <StepDone onOpen={handleOpen} />}
      </div>
    </div>
  );
}
