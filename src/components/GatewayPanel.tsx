import React, { useEffect, useState } from 'react';
import { CheckCircle2, Play, Radio, Settings, Square } from 'lucide-react';
import { useStore } from '../store';
import { getGatewayStatus, startGateway as startGatewayNative, stopGateway as stopGatewayNative, writeEnv } from '../api/desktop';

const PLATFORM_ICONS: Record<string, string> = {
  Telegram: 'TG',
  Discord: 'DC',
  Slack: 'SL',
  WhatsApp: 'WA',
  Signal: 'SG',
  Email: 'EM',
};

const PLATFORM_FIELDS: Record<string, Array<{ label: string; key: string; type: string; hint: string }>> = {
  Telegram: [{ label: 'Bot Token', key: 'TELEGRAM_BOT_TOKEN', type: 'password', hint: 'From BotFather' }],
  Discord: [
    { label: 'Bot Token', key: 'DISCORD_BOT_TOKEN', type: 'password', hint: 'Discord Developer Portal' },
    { label: 'Guild ID', key: 'DISCORD_GUILD_ID', type: 'text', hint: 'Server ID, optional' },
  ],
  Slack: [
    { label: 'Bot Token', key: 'SLACK_BOT_TOKEN', type: 'password', hint: 'xoxb-...' },
    { label: 'App Token', key: 'SLACK_APP_TOKEN', type: 'password', hint: 'xapp-...' },
  ],
  WhatsApp: [{ label: 'API Key', key: 'WHATSAPP_API_KEY', type: 'password', hint: 'WhatsApp Business API key' }],
  Signal: [{ label: 'Phone Number', key: 'SIGNAL_PHONE', type: 'text', hint: '+1234567890' }],
  Email: [
    { label: 'SMTP Host', key: 'SMTP_HOST', type: 'text', hint: 'smtp.gmail.com' },
    { label: 'SMTP Password', key: 'SMTP_PASSWORD', type: 'password', hint: 'App password' },
  ],
};

export default function GatewayPanel() {
  const { platforms, gatewayStatus, setGatewayStatus } = useStore();
  const [configPlatform, setConfigPlatform] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [gatewayLog, setGatewayLog] = useState<string[]>([
    '[ready] Desktop gateway controls initialized',
    '[ready] Health endpoint: http://127.0.0.1:8642/health',
  ]);

  useEffect(() => {
    let cancelled = false;
    getGatewayStatus().then((healthy) => {
      if (!cancelled) setGatewayStatus(healthy ? 'connected' : 'disconnected');
    });
    return () => { cancelled = true; };
  }, [setGatewayStatus]);

  const startGateway = async () => {
    setGatewayStatus('connecting');
    setGatewayLog((lines) => [...lines, '[info] Starting hermes gateway run --replace']);
    try {
      const result = await startGatewayNative();
      setGatewayLog((lines) => [...lines, result.stdout || result.stderr || '[info] Start command completed']);

      // Poll for health — gateway takes 3-8s to boot Python + bind port 8642
      let attempts = 0;
      const maxAttempts = 10;
      const poll = setInterval(async () => {
        attempts++;
        const healthy = await getGatewayStatus();
        if (healthy) {
          clearInterval(poll);
          setGatewayStatus('connected');
          setGatewayLog((lines) => [...lines, `[info] Gateway healthy at :8642 (after ${attempts * 1.5}s)`]);
        } else if (attempts >= maxAttempts) {
          clearInterval(poll);
          setGatewayStatus('error');
          setGatewayLog((lines) => [...lines, '[error] Gateway did not become healthy within 15s — check logs/gateway-desktop.log']);
        }
      }, 1500);
    } catch (err) {
      setGatewayStatus('error');
      setGatewayLog((lines) => [...lines, `[error] ${err instanceof Error ? err.message : String(err)}`]);
    }
  };

  const stopGateway = async () => {
    setGatewayLog((lines) => [...lines, '[info] Stopping gateway']);
    try {
      const result = await stopGatewayNative();
      setGatewayStatus('disconnected');
      setGatewayLog((lines) => [...lines, result.stdout || result.stderr || '[info] Gateway stopped']);
    } catch (err) {
      setGatewayStatus('error');
      setGatewayLog((lines) => [...lines, `[error] ${err instanceof Error ? err.message : String(err)}`]);
    }
  };

  const isConnected = gatewayStatus === 'connected';
  const isConnecting = gatewayStatus === 'connecting';

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Radio size={20} style={{ color: 'var(--accent-green)' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Gateway</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Messaging platforms and managed gateway process</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {isConnected ? (
              <button className="btn btn-danger" onClick={stopGateway} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <Square size={13} /> Stop Gateway
              </button>
            ) : (
              <button className="btn btn-primary" onClick={startGateway} disabled={isConnecting} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: isConnecting ? 0.7 : 1 }}>
                <Play size={13} />{isConnecting ? 'Starting...' : 'Start Gateway'}
              </button>
            )}
          </div>
        </div>

        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className={`status-dot ${isConnected ? 'connected' : isConnecting ? 'thinking' : gatewayStatus === 'error' ? 'error' : 'idle'}`} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{isConnected ? 'Gateway Running' : isConnecting ? 'Starting...' : gatewayStatus === 'error' ? 'Gateway Error' : 'Gateway Stopped'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
              {isConnected ? 'http://localhost:8642 - OpenAI-compatible API' : 'Start the gateway to enable chat, platform delivery, and cron dispatch'}
            </div>
          </div>
          {isConnected && <span className="badge badge-success"><CheckCircle2 size={11} /> Healthy</span>}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Platform Connections</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 20 }}>
          {platforms.map((p) => (
            <div key={p.name} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg2)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{PLATFORM_ICONS[p.name]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: p.status === 'connected' ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                  {p.status === 'connected' ? 'Connected' : 'Not configured'}
                </div>
              </div>
              <button
                onClick={() => setConfigPlatform(p.name)}
                title={`Configure ${p.name}`}
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 7, padding: 6, fontSize: 11.5, color: 'var(--text-secondary)', cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent-green)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <Settings size={12} />
              </button>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Process Log</div>
        <div style={{ background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-secondary)', maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {gatewayLog.map((line, i) => (
            <div key={`${line}-${i}`} style={{ color: line.includes('[error]') ? 'var(--accent-red)' : line.includes('[warn]') ? 'var(--accent-amber)' : line.includes('[info]') ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{line}</div>
          ))}
        </div>

        {configPlatform && (
          <div className="palette-overlay" onClick={() => setConfigPlatform(null)}>
            <div className="animate-in" onClick={(e) => e.stopPropagation()} style={{ width: 420, background: 'var(--bg2)', border: '1px solid var(--border-active)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg2)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{PLATFORM_ICONS[configPlatform]}</span>
                <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>Configure {configPlatform}</span>
              </div>
              <div style={{ padding: 18 }}>
                {(PLATFORM_FIELDS[configPlatform] || []).map((f) => (
                  <div key={f.key} style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>{f.label}</label>
                    <input
                      type={f.type}
                      placeholder={f.hint}
                      value={formValues[f.key] || ''}
                      onChange={(e) => setFormValues({ ...formValues, [f.key]: e.target.value })}
                      className="input-field"
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{f.hint}</div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                  <button
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={async () => {
                      const fields = PLATFORM_FIELDS[configPlatform] || [];
                      for (const f of fields) {
                        if (formValues[f.key]?.trim()) {
                          await writeEnv(f.key, formValues[f.key].trim()).catch(() => {});
                        }
                      }
                      setConfigPlatform(null);
                    }}
                  >
                    Save and Connect
                  </button>
                  <button className="btn btn-ghost" onClick={() => setConfigPlatform(null)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
