import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Play, Square, Cpu, MessageSquare, Zap, ChevronRight, RefreshCw, Hash, Clock, BookOpen, Radio, PlusSquare, CalendarClock, Layers, Server, Plug } from 'lucide-react';
import { useStore } from '../store';
import {
  getGatewayStatus,
  startGateway,
  stopGateway,
  getModelConfig,
  runHermesCommand,
  getSystemInfo,
} from '../api/desktop';
import { getBaseUrl, getAuthHeaders } from '../api/hermes';
import type { ModelConfig } from '../api/desktop';

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function DashboardPanel() {
  const { gatewayStatus, setGatewayStatus, setSettingsOpen, setActiveSection, sessions, crons, skills, platforms, addSession, setActiveSession } = useStore();

  const [isRunning, setIsRunning] = useState(false);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [uptime, setUptime] = useState(0);

  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [sysInfo, setSysInfo] = useState<{ ram_gb: number; cpu_count: number } | null>(null);

  const [message, setMessage] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatResponse, setChatResponse] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const checkStatus = useCallback(async () => {
    const running = await getGatewayStatus();
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

  // Load model config and system info on mount
  useEffect(() => {
    getModelConfig().then(setModelConfig).catch(() => null);
    getSystemInfo().then(setSysInfo).catch(() => null);
  }, []);

  const handleStart = async () => {
    setGatewayLoading(true);
    await startGateway();
    await checkStatus();
    setStartedAt(Date.now());
    setGatewayLoading(false);
  };

  const handleStop = async () => {
    setGatewayLoading(true);
    await stopGateway();
    await checkStatus();
    setGatewayLoading(false);
  };

  const handleSendMessage = async () => {
    const trimmed = message.trim();
    if (!trimmed || chatLoading) return;
    setChatLoading(true);
    setChatResponse(null);
    setChatError(null);

    // Prefer HTTP API (same as chat panel) — faster and streaming-capable
    if (isRunning) {
      try {
        const res = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
        // fall through to CLI fallback
      }
    }

    // CLI fallback: hermes -z "prompt" (one-shot mode, correct flag per hermes --help)
    const result = await runHermesCommand(['-z', trimmed], 60);
    setChatLoading(false);
    if (result.success) {
      setChatResponse(result.stdout || '(no output)');
    } else {
      setChatError(result.stderr || result.stdout || 'Unknown error. Is the Gateway running?');
    }
    setMessage('');
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const dotClass = isRunning ? 'dot dot-green' : 'dot dot-red';

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

        {/* Stats Grid */}
        {(() => {
          const activeSessions = sessions.filter(s => s.messages.length > 0).length;
          const activeCrons = crons.filter(c => c.active).length;
          const connectedPlatforms = platforms.filter(p => p.status === 'connected').length;
          const stats = [
            { label: 'Active Sessions', value: activeSessions, icon: <Hash size={14} />, accent: 'var(--text-secondary)' },
            { label: 'Scheduled Crons', value: activeCrons, icon: <Clock size={14} />, accent: 'var(--accent-amber)' },
            { label: 'Skills', value: skills.length, icon: <BookOpen size={14} />, accent: '#3b82f6' },
            { label: 'Platforms On', value: connectedPlatforms, icon: <Radio size={14} />, accent: 'var(--accent-green)' },
          ];
          return (
            <>
              <div className="section-label">Overview</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
                {stats.map(stat => (
                  <div key={stat.label} className="card" style={{ padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, color: 'var(--text-secondary)' }}>
                      {stat.icon}
                      <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' }}>
                        {stat.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>
                      {stat.value}
                    </div>
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: 2,
                      background: stat.accent,
                      opacity: 0.6,
                    }} />
                  </div>
                ))}
              </div>
            </>
          );
        })()}

        {/* Quick Actions */}
        <div className="section-label">Quick Actions</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {[
            { label: 'New Chat', icon: <PlusSquare size={13} />, action: () => { addSession(); setActiveSection('chat'); } },
            { label: 'Cron Scheduler', icon: <CalendarClock size={13} />, action: () => setActiveSection('crons') },
            { label: 'Skills', icon: <Layers size={13} />, action: () => setActiveSection('skills') },
            { label: 'Gateway', icon: <Server size={13} />, action: () => setActiveSection('gateway') },
            { label: 'Providers', icon: <Plug size={13} />, action: () => setActiveSection('providers' as any) },
          ].map(item => (
            <button
              key={item.label}
              className="btn btn-ghost btn-sm"
              onClick={item.action}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {/* Recent Sessions */}
        {(() => {
          const recentSessions = [...sessions]
            .filter(s => s.messages.length > 0)
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 3);
          if (recentSessions.length === 0) return null;
          return (
            <>
              <div className="section-label">Recent Sessions</div>
              <div className="card" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
                {recentSessions.map((s, i) => {
                  const ago = (() => {
                    const diff = Date.now() - s.timestamp;
                    const m = Math.floor(diff / 60000);
                    if (m < 1) return 'just now';
                    if (m < 60) return `${m}m ago`;
                    const h = Math.floor(m / 60);
                    if (h < 24) return `${h}h ago`;
                    return `${Math.floor(h / 24)}d ago`;
                  })();
                  return (
                    <button
                      key={s.id}
                      onClick={() => { setActiveSession(s.id); setActiveSection('chat'); }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        background: 'none',
                        border: 'none',
                        borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <MessageSquare size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.title}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                        {s.messages.length} msg{s.messages.length !== 1 ? 's' : ''}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', marginLeft: 8 }}>
                        {ago}
                      </span>
                      <ChevronRight size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    </button>
                  );
                })}
              </div>
            </>
          );
        })()}

        {/* Agent Status Card */}
        <div className="section-label">Agent Status</div>
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className={dotClass} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
                  Gateway {isRunning ? 'Running' : 'Stopped'}
                </div>
                {isRunning && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                    Uptime: {formatUptime(uptime)}
                  </div>
                )}
                {!isRunning && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    Start the gateway to enable agent messaging
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!isRunning ? (
                <button
                  className="btn btn-success btn-sm"
                  onClick={handleStart}
                  disabled={gatewayLoading}
                >
                  {gatewayLoading
                    ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Play size={13} />}
                  Start
                </button>
              ) : (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={handleStop}
                  disabled={gatewayLoading}
                >
                  {gatewayLoading
                    ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Square size={13} />}
                  Stop
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Quick Message */}
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
                >
                  {chatLoading
                    ? <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    : <Zap size={13} />}
                  {chatLoading ? 'Sending…' : 'Send'}
                </button>
              </div>
            </div>
          </div>

          {/* Response area */}
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

        {/* Active Model Card */}
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

        {/* System Info Row */}
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
