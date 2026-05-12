import React, { useState } from 'react';
import { useStore } from '../store';
import { Radio, Play, Square, AlertTriangle, CheckCircle2, Settings, ChevronRight } from 'lucide-react';

const PLATFORM_ICONS: Record<string, string> = {
  Telegram: '✈️', Discord: '🎮', Slack: '💬', WhatsApp: '📱', Signal: '🔒', Email: '✉️',
};

const PLATFORM_FIELDS: Record<string, Array<{ label: string; key: string; type: string; hint: string }>> = {
  Telegram: [{ label: 'Bot Token', key: 'TELEGRAM_BOT_TOKEN', type: 'password', hint: 'From @BotFather' }],
  Discord: [{ label: 'Bot Token', key: 'DISCORD_BOT_TOKEN', type: 'password', hint: 'Discord Developer Portal' }, { label: 'Guild ID', key: 'DISCORD_GUILD_ID', type: 'text', hint: 'Server ID (optional)' }],
  Slack: [{ label: 'Bot Token', key: 'SLACK_BOT_TOKEN', type: 'password', hint: 'xoxb-...' }, { label: 'App Token', key: 'SLACK_APP_TOKEN', type: 'password', hint: 'xapp-...' }],
  WhatsApp: [{ label: 'API Key', key: 'WHATSAPP_API_KEY', type: 'password', hint: 'WhatsApp Business API key' }],
  Signal: [{ label: 'Phone Number', key: 'SIGNAL_PHONE', type: 'text', hint: '+1234567890' }],
  Email: [{ label: 'SMTP Host', key: 'SMTP_HOST', type: 'text', hint: 'smtp.gmail.com' }, { label: 'SMTP Password', key: 'SMTP_PASSWORD', type: 'password', hint: 'App password' }],
};

export default function GatewayPanel() {
  const { platforms, gatewayStatus, setGatewayStatus } = useStore();
  const [configPlatform, setConfigPlatform] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [gatewayLog, setGatewayLog] = useState<string[]>([
    '[2026-05-13 02:34] Gateway process started',
    '[2026-05-13 02:34] Listening on :8642',
    '[2026-05-13 02:34] Health endpoint: /health',
    '[2026-05-13 02:34] No platforms configured',
  ]);

  const startGateway = () => {
    setGatewayStatus('connecting');
    setGatewayLog(l => [...l, '[info] Starting hermes gateway run…']);
    setTimeout(() => {
      setGatewayStatus('connected');
      setGatewayLog(l => [...l, '[info] Gateway healthy at :8642']);
    }, 2000);
  };

  const stopGateway = () => {
    setGatewayStatus('disconnected');
    setGatewayLog(l => [...l, '[info] Gateway stopped']);
  };

  const isConnected = gatewayStatus === 'connected';
  const isConnecting = gatewayStatus === 'connecting';

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 700 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Radio size={20} style={{ color: 'var(--accent)' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Gateway</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Manage platform connections and process lifecycle</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {isConnected
              ? <button className="btn-danger" onClick={stopGateway} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}><Square size={13} /> Stop Gateway</button>
              : <button className="btn-primary" onClick={startGateway} disabled={isConnecting} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: isConnecting ? 0.7 : 1 }}><Play size={13} />{isConnecting ? 'Starting…' : 'Start Gateway'}</button>
            }
          </div>
        </div>

        {/* Status Card */}
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className={`status-dot ${isConnected ? 'connected' : isConnecting ? 'thinking' : 'idle'}`} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{isConnected ? 'Gateway Running' : isConnecting ? 'Starting…' : 'Gateway Stopped'}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              {isConnected ? 'http://localhost:8642 · OpenAI-compatible API' : 'Start the gateway to enable agent functionality'}
            </div>
          </div>
          {isConnected && <span className="badge badge-success">Healthy</span>}
        </div>

        {/* Platform Cards */}
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Platform Connections</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          {platforms.map((p) => (
            <div key={p.name} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>{PLATFORM_ICONS[p.name]}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                <div style={{ fontSize: 11, color: p.status === 'connected' ? 'var(--success)' : 'var(--text-muted)' }}>
                  {p.status === 'connected' ? 'Connected' : 'Not configured'}
                </div>
              </div>
              <button
                onClick={() => setConfigPlatform(p.name)}
                style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', fontSize: 11.5, color: 'var(--text-secondary)', cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
              >
                <Settings size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Gateway Log */}
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Process Log</div>
        <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 16px', fontFamily: 'monospace', fontSize: 11.5, color: 'var(--text-secondary)', maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {gatewayLog.map((line, i) => (
            <div key={i} style={{ color: line.includes('error') || line.includes('Error') ? 'var(--error)' : line.includes('info') ? 'var(--text-secondary)' : 'var(--text-primary)' }}>{line}</div>
          ))}
        </div>

        {/* Platform Config Modal */}
        {configPlatform && (
          <div className="palette-overlay" onClick={() => setConfigPlatform(null)}>
            <div className="animate-in" onClick={e => e.stopPropagation()} style={{ width: 420, background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>{PLATFORM_ICONS[configPlatform]}</span>
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
                      onChange={e => setFormValues({ ...formValues, [f.key]: e.target.value })}
                      className="input-field"
                    />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{f.hint}</div>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                  <button className="btn-primary" style={{ flex: 1 }} onClick={() => setConfigPlatform(null)}>Save & Connect</button>
                  <button className="btn-ghost" onClick={() => setConfigPlatform(null)}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
