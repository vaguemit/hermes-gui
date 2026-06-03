import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Play, Square, Cpu, MessageSquare, Zap, ChevronRight, RefreshCw,
  Clock, Radio, History, Brain, Key,
} from 'lucide-react';
import { useStore } from '../store';
import type { NavSection } from '../store';
import { useHermesClient } from '../lib/hermes';
import type { ModelConfig } from '../lib/hermes';

type ActivityItem = { type: 'session' | 'cron' | 'skill'; label: string; ts: number };

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function DashboardPanel() {
  const client = useHermesClient();
  const {
    gatewayStatus, setGatewayStatus, setSettingsOpen, setActiveSection,
    sessions, crons, skills, activeModel, platforms,
    addSession, setActiveSession,
    tokensUsed, contextWindow,
  } = useStore();

  const [isRunning, setIsRunning] = useState(false);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [uptime, setUptime] = useState(0);
  const [gatewayPort, setGatewayPort] = useState<number>(8642);

  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [sysInfo, setSysInfo] = useState<{ ram_gb: number; cpu_count: number } | null>(null);
  const [extSysInfo, setExtSysInfo] = useState<{ platform: string; version: string; hermesHome: string } | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('hermes-activity') || '[]'); } catch { return []; }
  });

  const [message, setMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatResponse, setChatResponse] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const checkStatus = useCallback(async () => {
    const running = await client.getGatewayStatus();
    setIsRunning(running);
    setGatewayStatus(running ? 'connected' : 'disconnected');
    if (!running) setStartedAt(null);
  }, [setGatewayStatus]);

  // Poll gateway status every 5s
  useEffect(() => {
    checkStatus();
    const id = setInterval(checkStatus, 5000);
    return () => clearInterval(id);
  }, [checkStatus]);

  // Uptime counter
  useEffect(() => {
    if (!isRunning) { setUptime(0); return; }
    if (!startedAt) setStartedAt(Date.now());
    const id = setInterval(() => {
      setUptime(Math.floor((Date.now() - (startedAt ?? Date.now())) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isRunning, startedAt]);

  // Load model config, system info, and gateway port on mount
  useEffect(() => {
    client.getModelConfig().then(setModelConfig).catch(() => null);
    client.getSystemInfo().then(setSysInfo).catch(() => null);
    client.getGatewayPort().then(setGatewayPort).catch(() => null);
    client.getInstallStatus().then(info => {
      setExtSysInfo({
        platform: info.platform || '',
        version: info.version || '',
        hermesHome: info.hermes_home || '',
      });
    }).catch(() => {});
  }, []);

  // Track recent activity from sessions
  useEffect(() => {
    if (sessions.length === 0) return;
    const top = sessions[0];
    if (!top || !top.messages || top.messages.length === 0) return;
    setRecentActivity(prev => {
      if (prev.length > 0 && prev[0].ts === top.timestamp) return prev;
      const next: ActivityItem[] = [
        { type: 'session' as const, label: top.title || 'Untitled session', ts: top.timestamp },
        ...prev.filter(a => a.ts !== top.timestamp),
      ].slice(0, 10);
      try { localStorage.setItem('hermes-activity', JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, [sessions]);

  const handleStart = async () => {
    setGatewayLoading(true);
    await client.startGateway();
    await checkStatus();
    setStartedAt(Date.now());
    setGatewayLoading(false);
  };

  const handleStop = async () => {
    setGatewayLoading(true);
    await client.stopGateway();
    await checkStatus();
    setGatewayLoading(false);
  };

  const handleSendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || chatLoading) return;
    setChatLoading(true);
    setChatResponse(null);
    setChatError(null);

    if (isRunning) {
      try {
        const res = await fetch(`${client.getGatewayUrl()}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...client.getGatewayHeaders() },
          body: JSON.stringify({
            model: modelConfig?.model || 'auto',
            messages: [{ role: 'user', content: trimmed }],
            stream: false,
          }),
          signal: AbortSignal.timeout(60000),
        });
        if (res.ok) {
          const data = await res.json() as { choices?: { message?: { content?: string } }[] };
          const text = data.choices?.[0]?.message?.content ?? '(no response)';
          setChatResponse(text);
          setMessage('');
          setChatLoading(false);
          return;
        }
      } catch {
        // fall through
      }
    }

    setChatLoading(false);
    setChatError('Gateway is not running. Start it from the Gateway panel, then try again.');
    setMessage('');
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────
  const activeCrons = crons.filter(c => c.active);
  const recentSessions = [...sessions]
    .filter(s => (s.messages?.length ?? 0) > 0)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5);

  const QUICK_ACTIONS: { label: string; icon: React.ElementType; section: string }[] = [
    { label: 'New Chat', icon: MessageSquare, section: 'chat' },
    { label: 'Gateway', icon: Radio, section: 'gateway' },
    { label: 'Skills', icon: Zap, section: 'skills' },
    { label: 'Memory', icon: Brain, section: 'memory' },
    { label: 'Schedules', icon: Clock, section: 'crons' },
    { label: 'Providers', icon: Key, section: 'providers' },
  ];

  const dotClass = isRunning ? 'dot dot-green' : 'dot dot-red';

  // Token usage derived values
  const tokenPct = contextWindow > 0 ? Math.round((tokensUsed / contextWindow) * 100) : 0;
  const tokenBarColor = tokenPct >= 90
    ? 'var(--accent-red)'
    : tokenPct >= 70
      ? 'var(--accent-amber)'
      : 'var(--accent-green)';

  const statsGrid = [
    {
      label: 'Total Sessions',
      value: sessions.length,
      icon: History,
      color: 'var(--accent-green)',
    },
    {
      label: 'Active Crons',
      value: crons.filter(c => c.active).length,
      icon: Clock,
      color: 'var(--accent-amber)',
    },
    {
      label: 'Skills Loaded',
      value: skills.length,
      icon: Zap,
      color: 'var(--accent-blue)',
    },
    {
      label: 'Context Used',
      value: `${tokenPct}%`,
      icon: Cpu,
      color: tokenBarColor,
    },
  ];

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 720 }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
            Dashboard
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Overview of your Hermes agent
          </p>
        </div>

        {/* ── Stats Summary Row ──────────────────────────────────────────── */}
        <div className="section-label">Overview</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
          {statsGrid.map(stat => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="card" style={{
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <Icon size={16} style={{ color: stat.color }} />
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Token Usage Bar ────────────────────────────────────────────── */}
        <div style={{
          padding: '12px 16px',
          background: 'var(--bg1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              Context Usage
            </span>
            <span style={{ fontSize: 11, color: tokenBarColor, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              {tokensUsed.toLocaleString()} / {contextWindow.toLocaleString()} tokens ({tokenPct}%)
            </span>
          </div>
          <div style={{ height: 5, background: 'var(--bg0)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, tokenPct)}%`,
              background: tokenBarColor,
              borderRadius: 3,
              transition: 'width 0.4s ease, background 0.3s ease',
            }} />
          </div>
        </div>

        {/* ── System Info Strip ──────────────────────────────────────────── */}
        {extSysInfo && (
          <div style={{
            display: 'flex',
            gap: 16,
            padding: '7px 12px',
            background: 'var(--bg1)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            marginBottom: 10,
            flexWrap: 'wrap',
          }}>
            {extSysInfo.platform && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                Platform: <span style={{ color: 'var(--text-secondary)' }}>{extSysInfo.platform}</span>
              </span>
            )}
            {extSysInfo.version && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                Version: <span style={{ color: 'var(--text-secondary)' }}>{extSysInfo.version}</span>
              </span>
            )}
            {extSysInfo.hermesHome && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                Home: <span style={{ color: 'var(--text-secondary)' }}>
                  {extSysInfo.hermesHome.length > 40 ? '…' + extSysInfo.hermesHome.slice(-38) : extSysInfo.hermesHome}
                </span>
              </span>
            )}
          </div>
        )}

        {/* ── Gateway Status Card ────────────────────────────────────────── */}
        <div className="section-label">Gateway</div>
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className={dotClass} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                  {isRunning ? 'Gateway running' : 'Gateway stopped'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {isRunning
                    ? `Port ${gatewayPort} · Uptime ${formatUptime(uptime)}`
                    : activeModel
                      ? <span>Model: <span style={{ color: 'var(--text-primary)' }}>{activeModel}</span></span>
                      : 'Start the gateway to enable agent messaging'
                  }
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {isRunning ? (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setActiveSection('gateway')}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Radio size={13} />
                    Go to Gateway
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setActiveSection('chat')}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <MessageSquare size={13} />
                    Open Chat
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={handleStop}
                    disabled={gatewayLoading}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {gatewayLoading
                      ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                      : <Square size={13} />}
                    Stop
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-success btn-sm"
                  onClick={handleStart}
                  disabled={gatewayLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  {gatewayLoading
                    ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Play size={13} />}
                  Start Gateway
                </button>
              )}
            </div>
          </div>
          {/* Active model strip */}
          {activeModel && (
            <div style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <Cpu size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: 'var(--text-label)', fontFamily: 'var(--font-mono)' }}>
                Active model:
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                {activeModel}
              </span>
              <span className={`badge ${isRunning ? 'badge-connected' : 'badge-idle'}`} style={{ marginLeft: 'auto' }}>
                {gatewayStatus}
              </span>
            </div>
          )}
        </div>

        {/* ── Quick Actions 2×3 Grid ─────────────────────────────────────── */}
        <div className="section-label">Quick Actions</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
          {QUICK_ACTIONS.map(action => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => {
                  if (action.section === 'chat') { addSession(); }
                  setActiveSection(action.section as NavSection);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  background: 'var(--bg1)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  transition: 'background 0.15s',
                  textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg1)')}
              >
                <Icon size={20} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                {action.label}
              </button>
            );
          })}
        </div>

        {/* ── Recent Sessions ────────────────────────────────────────────── */}
        <div className="section-label">Recent Sessions</div>
        <div className="card" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
          {recentSessions.length === 0 ? (
            <div style={{
              padding: '24px 16px',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
            }}>
              No sessions yet
            </div>
          ) : (
            recentSessions.map((s, i) => {
              const msgCount = s.messages?.length ?? 0;
              const titleDisplay = s.title.length > 45 ? s.title.slice(0, 45) + '…' : s.title;
              return (
                <div
                  key={s.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '11px 14px',
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <MessageSquare size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {titleDisplay}
                  </span>
                  <span className="badge badge-muted" style={{ fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    {msgCount} msg{msgCount !== 1 ? 's' : ''}
                  </span>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setActiveSession(s.id); setActiveSection('chat'); }}
                    style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    Open
                    <ChevronRight size={11} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* ── Active Crons Widget ───────────────────────────────────────── */}
        {activeCrons.length > 0 && (
          <>
            <div className="section-label">Active Schedules</div>
            <div className="card" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
              {activeCrons.slice(0, 3).map((cron, i) => (
                <div
                  key={cron.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '11px 16px',
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <span className="dot dot-green" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {cron.description}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                      {cron.schedule}
                      {cron.platform ? ` · ${cron.platform}` : ''}
                    </div>
                  </div>
                </div>
              ))}
              {activeCrons.length > 3 && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  <button
                    onClick={() => setActiveSection('crons')}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-blue)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    View all {activeCrons.length} active schedules
                    <ChevronRight size={12} />
                  </button>
                </div>
              )}
              {activeCrons.length <= 3 && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  <button
                    onClick={() => setActiveSection('crons')}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-blue)',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    View all schedules
                    <ChevronRight size={12} />
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Quick Message ─────────────────────────────────────────────── */}
        <div className="section-label">Quick Message</div>
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <MessageSquare size={15} style={{ color: 'var(--text-tertiary)', marginTop: 10, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <textarea
                ref={textareaRef}
                className="input-field"
                placeholder="Send a message to Hermes… (Ctrl+Enter to send)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                rows={3}
                style={{ resize: 'none', fontFamily: 'var(--font-sans)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSendMessage}
                  disabled={chatLoading || !message.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  {chatLoading
                    ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Zap size={13} />}
                  {chatLoading ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>

          {chatResponse !== null && (
            <div style={{
              marginTop: 14,
              padding: '12px 14px',
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.7,
              maxHeight: 240,
              overflowY: 'auto',
            }}>
              {chatResponse}
            </div>
          )}
          {chatError !== null && (
            <div style={{
              marginTop: 14,
              padding: '10px 14px',
              background: 'var(--accent-red-dim)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              color: 'var(--accent-red)',
              fontFamily: 'var(--font-mono)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {chatError}
            </div>
          )}
        </div>

        {/* ── Active Model Card ─────────────────────────────────────────── */}
        <div className="section-label">Active Model</div>
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32, height: 32,
                background: 'var(--bg3)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Zap size={15} style={{ color: 'var(--text-secondary)' }} />
              </div>
              <div>
                {modelConfig ? (
                  <>
                    <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                      {modelConfig.model || 'Not set'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                      {modelConfig.provider || 'unknown provider'}
                      {modelConfig.base_url ? ` · ${modelConfig.base_url}` : ''}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</div>
                )}
              </div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setActiveSection('install');
                setSettingsOpen(false);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              Change Model
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* ── System Info ───────────────────────────────────────────────── */}
        <div className="section-label">System</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 32 }}>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32, height: 32,
              background: 'var(--bg3)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Cpu size={15} style={{ color: 'var(--text-secondary)' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-label)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                CPU
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>
                {sysInfo ? `${sysInfo.cpu_count} cores` : '—'}
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 32, height: 32,
              background: 'var(--bg3)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-secondary)' }}>
                <rect x="2" y="2" width="20" height="8" rx="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" />
                <line x1="6" y1="18" x2="6.01" y2="18" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-label)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
                RAM
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>
                {sysInfo ? `${sysInfo.ram_gb} GB` : '—'}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
