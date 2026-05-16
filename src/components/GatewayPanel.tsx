import React, { useEffect, useState } from 'react';
import { CheckCircle2, Globe, Play, Radio, Settings, Square } from 'lucide-react';
import { useStore } from '../store';
import { getChromeCdpStatus, getGatewayStatus, launchChrome, readEnv, runHermesCommand, sendHermesPtyMessage, startGateway as startGatewayNative, startHermesPtyChat, stopGateway as stopGatewayNative, writeEnv, writeEnvVar } from '../api/desktop';

interface ToolPlatform {
  id: string;
  name: string;
  description: string;
}

const TOOL_PLATFORMS: ToolPlatform[] = [
  { id: 'browser',   name: 'Browser',          description: 'Chrome DevTools Protocol browser control' },
  { id: 'web_search', name: 'Web Search',       description: 'Live web search and page retrieval' },
  { id: 'shell',     name: 'Shell',             description: 'System shell command execution' },
  { id: 'file',      name: 'File',              description: 'File read/write operations' },
  { id: 'image_gen', name: 'Image Generation',  description: 'AI image generation' },
];

type ToolToggleState = {
  enabled: boolean;
  loading: boolean;
  feedback: string | null; // 'ok' | error message
};

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
  const { platforms, gatewayStatus, setGatewayStatus, localBrowserUrl, setLocalBrowserUrl, browserConnected, setBrowserConnected, setPtySessionId, setPtyEventId } = useStore();
  const [configPlatform, setConfigPlatform] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [toolStates, setToolStates] = useState<Record<string, ToolToggleState>>(() =>
    Object.fromEntries(
      TOOL_PLATFORMS.map((t) => [t.id, { enabled: false, loading: false, feedback: null }])
    )
  );

  const toggleTool = async (platformId: string, enable: boolean) => {
    setToolStates((prev) => ({
      ...prev,
      [platformId]: { ...prev[platformId], loading: true, feedback: null },
    }));
    try {
      const result = await runHermesCommand([
        'config', 'set', `platforms.${platformId}.enabled`, enable ? 'true' : 'false',
      ]);
      setToolStates((prev) => ({
        ...prev,
        [platformId]: { enabled: result.success ? enable : prev[platformId].enabled, loading: false, feedback: result.success ? 'ok' : (result.stderr || result.stdout || 'Command failed') },
      }));
    } catch (err) {
      setToolStates((prev) => ({
        ...prev,
        [platformId]: { ...prev[platformId], loading: false, feedback: err instanceof Error ? err.message : 'IPC unavailable in browser mode' },
      }));
    }
    // Clear feedback after 3 seconds
    setTimeout(() => {
      setToolStates((prev) => ({
        ...prev,
        [platformId]: { ...prev[platformId], feedback: null },
      }));
    }, 3000);
  };

  const [cdpUrl, setCdpUrl] = useState('http://127.0.0.1:9222');
  const [browserLaunching, setBrowserLaunching] = useState(false);
  const [browserConnecting, setBrowserConnecting] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);

  const [bhInstalled, setBhInstalled] = useState<boolean | null>(null);
  const [bhInstalling, setBhInstalling] = useState(false);
  const [bhInstallLog, setBhInstallLog] = useState<string[]>([]);
  const [bhDomainSkills, setBhDomainSkills] = useState(false);
  const [bhExpanded, setBhExpanded] = useState(false);

  useEffect(() => {
    readEnv().then(env => setBhDomainSkills(env['BH_DOMAIN_SKILLS'] === '1')).catch(() => {});
    runHermesCommand(['run', 'browser-harness', '--help'], 5)
      .then(r => setBhInstalled(r.success || r.stdout.includes('browser-harness')))
      .catch(() => setBhInstalled(false));
  }, []);

  const installBrowserHarness = async () => {
    setBhInstalling(true);
    setBhInstallLog([]);
    try {
      const { streamHermesCommand } = await import('../api/desktop');
      await streamHermesCommand(
        ['run', 'pip', 'install', 'browser-harness', '--upgrade'],
        line => setBhInstallLog(prev => [...prev, line]),
        120,
      );
      setBhInstalled(true);
    } catch (e) {
      setBhInstallLog(prev => [...prev, `Error: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setBhInstalling(false);
    }
  };

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

  // Poll CDP every 3s while browser is connected — disconnect if Chrome closes
  useEffect(() => {
    if (!browserConnected) return;
    const timer = setInterval(async () => {
      const alive = await getChromeCdpStatus();
      if (!alive) {
        setBrowserConnected(false);
        setLocalBrowserUrl(null);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [browserConnected, setBrowserConnected, setLocalBrowserUrl]);

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

  const CDP_URL = 'http://127.0.0.1:9222';

  async function handleLaunchChrome() {
    setBrowserLaunching(true);
    setBrowserError(null);
    try {
      const result = await launchChrome();
      if (result.success) {
        const resolvedUrl = result.cdpUrl || CDP_URL;
        setCdpUrl(resolvedUrl);
        setLocalBrowserUrl(resolvedUrl);
        setBrowserConnected(true);
        await writeEnvVar('BROWSER_CDP_URL', resolvedUrl);
      } else {
        setBrowserError(result.error || 'Failed to launch Chrome');
      }
    } catch (e) {
      setBrowserError(`Could not launch Chrome: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBrowserLaunching(false);
    }
  }

  async function handleBrowserConnect() {
    if (browserConnecting) return;
    setBrowserConnecting(true);
    setBrowserError(null);
    try {
      const result = await runHermesCommand(['browser', 'connect', cdpUrl], 15);
      if (result.success) {
        setBrowserConnected(true);
        setLocalBrowserUrl(cdpUrl);
        await writeEnvVar('BROWSER_CDP_URL', cdpUrl);
        await writeEnv('PLAYWRIGHT_HEADLESS', 'false').catch(() => {});
        const newEventId = Math.random().toString(36).slice(2);
        const newPtyId = await startHermesPtyChat(newEventId);
        setPtySessionId(newPtyId);
        setPtyEventId(newEventId);
        setTimeout(() => {
          sendHermesPtyMessage(newPtyId, `/browser connect ${cdpUrl}`).catch(() => {});
        }, 2000);
      } else {
        setBrowserError(
          result.stderr ||
          'Could not connect. Start Chrome with: chrome --remote-debugging-port=9222'
        );
      }
    } catch (e) {
      setBrowserError(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBrowserConnecting(false);
    }
  }

  async function handleBrowserDisconnect() {
    try {
      await runHermesCommand(['browser', 'disconnect'], 10);
    } catch {
      // best-effort
    }
    setBrowserConnected(false);
    setLocalBrowserUrl(null);
    setPtySessionId(null);
    setPtyEventId(null);
    await writeEnvVar('BROWSER_CDP_URL', '').catch(() => {});
  }

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

        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Tools</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {TOOL_PLATFORMS.map((tool) => {
            const ts = toolStates[tool.id];
            return (
              <div
                key={tool.id}
                style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12 }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{tool.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>{tool.description}</div>
                </div>
                {ts.feedback && ts.feedback !== 'ok' && (
                  <div style={{ fontSize: 11, color: 'var(--accent-red)', maxWidth: 180, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={ts.feedback}>
                    {ts.feedback}
                  </div>
                )}
                {ts.feedback === 'ok' && (
                  <div style={{ fontSize: 11, color: 'var(--accent-green)' }}>Saved</div>
                )}
                <span
                  className={ts.enabled ? 'badge badge-connected' : 'badge badge-idle'}
                  style={{ flexShrink: 0 }}
                >
                  {ts.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <button
                  className={`btn btn-sm ${ts.enabled ? 'btn-danger' : 'btn-ghost'}`}
                  disabled={ts.loading}
                  onClick={() => toggleTool(tool.id, !ts.enabled)}
                  style={{ flexShrink: 0, opacity: ts.loading ? 0.6 : 1 }}
                >
                  {ts.loading ? '...' : ts.enabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            );
          })}
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

        <div style={{ marginTop: 20 }}>
          <div className="section-label">Local Browser</div>
          <div className="card" style={{ padding: '14px 16px' }}>
            {/* Status row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span className={browserConnected ? 'dot dot-green' : 'dot dot-dim'} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: browserConnected ? 'var(--accent-green)' : 'var(--text-secondary)' }}>
                  {browserConnected ? 'Connected' : 'Disconnected'}
                </div>
                {browserConnected && localBrowserUrl && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    {localBrowserUrl}
                  </div>
                )}
                {!browserConnected && (
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Chrome DevTools Protocol — lets the agent control your browser
                  </div>
                )}
              </div>
              {browserConnected ? (
                <button className="btn btn-danger btn-sm" onClick={handleBrowserDisconnect}>
                  Disconnect
                </button>
              ) : (
                <button
                  className="btn btn-success btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: browserLaunching ? 0.7 : 1 }}
                  onClick={handleLaunchChrome}
                  disabled={browserLaunching || browserConnecting}
                >
                  <Globe size={12} />
                  {browserLaunching ? 'Launching…' : 'Launch Chrome'}
                </button>
              )}
            </div>

            {/* Manual CDP URL + connect (for already-running Chrome) */}
            {!browserConnected && (
              <div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                  Or connect to an existing Chrome instance:
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="input-field"
                    value={cdpUrl}
                    onChange={e => setCdpUrl(e.target.value)}
                    placeholder="http://127.0.0.1:9222"
                    style={{ flex: 1, fontSize: 12 }}
                    disabled={browserConnecting}
                  />
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleBrowserConnect}
                    disabled={browserConnecting || !cdpUrl.trim()}
                  >
                    {browserConnecting ? 'Connecting…' : 'Connect'}
                  </button>
                </div>
              </div>
            )}

            {/* Error display */}
            {browserError && (
              <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--accent-red)', fontFamily: 'var(--font-mono)', background: 'var(--accent-red-dim)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', whiteSpace: 'pre-wrap' }}>
                {browserError}
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setBhExpanded(!bhExpanded)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', width: '100%', padding: 0, marginBottom: bhExpanded ? 10 : 0 }}
          >
            <div className="section-label" style={{ flex: 1, marginBottom: 0 }}>Browser Harness</div>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{bhExpanded ? '▲' : '▼'}</span>
          </button>
          {bhExpanded && (
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span className={bhInstalled === true ? 'dot dot-green' : bhInstalled === false ? 'dot dot-red' : 'dot dot-dim'} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {bhInstalled === true ? 'Installed' : bhInstalled === false ? 'Not installed' : 'Checking…'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Connects the agent to Chrome via CDP with self-healing automation
                  </div>
                </div>
                {bhInstalled === false && (
                  <button className="btn btn-primary btn-sm" onClick={installBrowserHarness} disabled={bhInstalling}>
                    {bhInstalling ? 'Installing…' : 'Install'}
                  </button>
                )}
              </div>
              {bhInstallLog.length > 0 && (
                <div style={{ background: 'var(--bg0)', borderRadius: 6, padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', maxHeight: 120, overflowY: 'auto', marginBottom: 12 }}>
                  {bhInstallLog.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Domain Skills</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>Site-specific playbooks (LinkedIn, GitHub, Amazon…)</div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={bhDomainSkills} onChange={async e => {
                    setBhDomainSkills(e.target.checked);
                    await writeEnvVar('BH_DOMAIN_SKILLS', e.target.checked ? '1' : '').catch(() => {});
                  }} />
                  <span className="toggle-slider" />
                </label>
              </div>
            </div>
          )}
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
