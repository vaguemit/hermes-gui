import React, { useState } from 'react';
import { useStore } from '../store';
import { formatTimestamp } from '../utils/parser';
import {
  MessageSquare, Radio, Clock, Zap, Settings, Plus,
  ChevronDown, ChevronRight, Cpu, Download, Terminal, Bot, LayoutDashboard, Users, History
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'install', label: 'Install', icon: Download },
  { id: 'commands', label: 'Commands', icon: Terminal },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'gateway', label: 'Gateway', icon: Radio },
  { id: 'crons', label: 'Crons', icon: Clock },
  { id: 'skills', label: 'Skills', icon: Zap },
  { id: 'profiles', label: 'Profiles', icon: Users },
  { id: 'sessions', label: 'Sessions', icon: History },
  { id: 'models', label: 'Models', icon: Cpu },
] as const;

export default function Sidebar() {
  const {
    activeSection, setActiveSection, gatewayStatus, agentState,
    activeModel, setModelSwitcherOpen, sessions, activeSessionId,
    setActiveSession, addSession, tokensUsed, contextWindow, setSettingsOpen
  } = useStore();

  const [historyExpanded, setHistoryExpanded] = useState(true);

  const statusLabel = {
    unchecked: 'Checking...',
    connecting: 'Connecting...',
    connected: 'Connected',
    disconnected: 'Disconnected',
    error: 'Error',
  }[gatewayStatus];

  const agentLabel = {
    idle: 'Idle',
    thinking: 'Thinking...',
    running_tool: 'Using tool...',
    error: 'Error',
  }[agentState];

  const dotClass = {
    unchecked: 'idle',
    connecting: 'thinking',
    connected: agentState === 'idle' ? 'connected' : 'thinking',
    disconnected: 'idle',
    error: 'error',
  }[gatewayStatus];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg1)', borderRight: '1px solid var(--border)' }}>
      {/* Header / Logo */}
      <div style={{ padding: '18px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/logo.png" alt="Hermes" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, objectFit: 'cover' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--text-primary)' }}>Hermes</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Desktop Agent</div>
          </div>
        </div>
      </div>

      {/* Status Card */}
      <div style={{ margin: '12px 10px', padding: '10px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span className={`status-dot ${dotClass}`} />
          <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)' }}>
            {gatewayStatus === 'connected' ? agentLabel : statusLabel}
          </span>
        </div>
        <button
          onClick={() => setModelSwitcherOpen(true)}
          id="model-switcher-btn"
          style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 9px', textAlign: 'left', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11.5, fontFamily: 'monospace', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'border-color 0.15s', overflow: 'hidden' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-green)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{activeModel}</span>
          <Cpu size={11} style={{ flexShrink: 0, marginLeft: 4, color: 'var(--accent-green)' }} />
        </button>
        {tokensUsed > 0 && contextWindow > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Context</span>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{Math.round((tokensUsed / contextWindow) * 100)}%</span>
            </div>
            <div style={{ height: 3, background: 'var(--bg0)', borderRadius: 2 }}>
              <div style={{ height: '100%', width: `${Math.min((tokensUsed / contextWindow) * 100, 100)}%`, background: 'var(--accent-green)', borderRadius: 2, transition: 'width 0.4s' }} />
            </div>
          </div>
        )}
      </div>

      {/* New Chat Button */}
      <div style={{ padding: '0 10px 8px' }}>
        <button
          onClick={addSession}
          id="new-chat-btn"
          className="btn btn-primary"
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '8px 0', borderRadius: 8, fontSize: 13 }}
        >
          <Plus size={14} /> New Chat
        </button>
      </div>

      {/* Navigation */}
      <nav style={{ padding: '0 8px', marginBottom: 4 }}>
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id as typeof activeSection)}
            className={`nav-item ${activeSection === id ? 'active' : ''}`}
            style={{ width: '100%', border: 'none', textAlign: 'left' }}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </nav>

      <div className="divider" style={{ margin: '8px 10px' }} />

      {/* Session History */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <button
          onClick={() => setHistoryExpanded(!historyExpanded)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600 }}
        >
          {historyExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          Recent Sessions
        </button>
        {historyExpanded && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSession(s.id)}
                style={{
                  width: '100%', border: 'none', borderRadius: 8, textAlign: 'left', padding: '8px 10px', cursor: 'pointer', marginBottom: 2,
                  background: s.id === activeSessionId ? 'var(--accent-dim)' : 'transparent',
                  color: s.id === activeSessionId ? 'var(--accent-green)' : 'var(--text-secondary)',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { if (s.id !== activeSessionId) (e.currentTarget as HTMLElement).style.background = 'var(--bg2)'; }}
                onMouseLeave={e => { if (s.id !== activeSessionId) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 1 }}>{formatTimestamp(s.timestamp)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px' }}>
        <button
          onClick={() => setSettingsOpen(true)}
          className="nav-item"
          style={{ width: '100%', border: 'none' }}
          id="settings-btn"
        >
          <Settings size={15} /> Settings
        </button>
      </div>
    </div>
  );
}
