import React, { useState } from 'react';
import { useStore } from '../store';
import { useHermesMode, useHermesClient } from '../lib/hermes';
import { formatTimestamp } from '../utils/parser';
import ProfileChip from './ProfileChip';
import {
  MessageSquare, Radio, Clock, Zap, Settings, Plus,
  ChevronDown, ChevronRight, Cpu, Download, Terminal, Bot, LayoutDashboard, Users, History, SquareTerminal, Brain, KanbanSquare, Key, BookMarked,
  Search, X, Trash2, Building2
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
  { id: 'soul', label: 'Soul', icon: Brain },
  { id: 'memory', label: 'Memory', icon: BookMarked },
  { id: 'providers', label: 'Providers', icon: Key },
  { id: 'profiles', label: 'Profiles', icon: Users },
  { id: 'sessions', label: 'Sessions', icon: History },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
  { id: 'kanban', label: 'Kanban', icon: KanbanSquare },
  { id: 'office', label: 'Office', icon: Building2 },
] as const;

export default function Sidebar() {
  const mode = useHermesMode();
  const client = useHermesClient();
  const {
    activeSection, setActiveSection, gatewayStatus, agentState,
    activeModel, setModelSwitcherOpen, sessions, activeSessionId,
    setActiveSession, addSession, tokensUsed, contextWindow, setSettingsOpen,
    browserConnected, localBrowserUrl, deleteSession, renameSession,
    crons, skills, sidebarOpen,
  } = useStore();

  const activeCronCount = crons.filter(c => c.active).length;
  const gatewayDotClass = {
    connected: 'dot dot-green',
    connecting: 'dot dot-amber',
    error: 'dot dot-red',
    disconnected: 'dot dot-red',
    unchecked: 'dot dot-dim',
  }[gatewayStatus];

  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);

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
          {mode !== 'local' && (
            <span className={`sidebar-mode-badge sidebar-mode-badge--${mode}`} style={{ marginLeft: 'auto' }}>
              {mode === 'cli' ? 'CLI' : 'Remote'}
            </span>
          )}
        </div>
        <button
          onClick={() => setModelSwitcherOpen(true)}
          id="model-switcher-btn"
          style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 9px', textAlign: 'left', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 11.5, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'border-color 0.15s', overflow: 'hidden' }}
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

      {/* Browser Connected Badge */}
      {browserConnected && (
        <div style={{ margin: '-4px 10px 10px', padding: '6px 10px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span className="dot dot-green" />
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>Browser connected</span>
        </div>
      )}

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
      <nav style={{ padding: '0 8px', marginBottom: 4, overflowY: 'auto', maxHeight: 320, flexShrink: 0 }}>
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id as typeof activeSection)}
            className={`nav-item ${activeSection === id ? 'active' : ''}`}
            style={{ width: '100%', border: 'none', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden' }}
          >
            {id === 'gateway' ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, overflow: 'hidden' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
                  <Icon size={16} />
                  <span className={gatewayDotClass} style={{ marginLeft: 4 }} />
                </span>
                {sidebarOpen && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>}
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, overflow: 'hidden' }}>
                <Icon size={16} style={{ flexShrink: 0 }} />
                {sidebarOpen && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{label}</span>}
                {sidebarOpen && id === 'crons' && activeCronCount > 0 && (
                  <span className="badge badge-muted" style={{ fontSize: 10, marginLeft: 'auto', flexShrink: 0 }}>{activeCronCount}</span>
                )}
                {sidebarOpen && id === 'skills' && skills.length > 0 && (
                  <span className="badge badge-muted" style={{ fontSize: 10, marginLeft: 'auto', flexShrink: 0 }}>{skills.length}</span>
                )}
                {sidebarOpen && id === 'chat' && sessions.length > 0 && (
                  <span className="badge badge-muted" style={{ fontSize: 10, marginLeft: 'auto', flexShrink: 0 }}>{sessions.length}</span>
                )}
              </span>
            )}
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
          Recent Sessions{sessions.length > 0 && ` (${sessions.length})`}
        </button>
        {historyExpanded && (
          <>
            {/* Search input */}
            <div style={{ padding: '0 8px 6px', flexShrink: 0 }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={11} style={{ position: 'absolute', left: 8, color: 'var(--text-tertiary)', pointerEvents: 'none', flexShrink: 0 }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search sessions..."
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'var(--bg2)', color: 'var(--text-primary)',
                    border: '1px solid var(--border)', borderRadius: 6,
                    fontSize: 12, padding: '5px 28px 5px 26px',
                    outline: 'none', fontFamily: 'var(--font-sans)',
                  }}
                  onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-hover)'; }}
                  onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0, display: 'flex', alignItems: 'center' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-tertiary)'; }}
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* Session list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
              {[...sessions]
                .sort((a, b) => b.timestamp - a.timestamp)
                .filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((s) => (
                  <div
                    key={s.id}
                    style={{ position: 'relative', marginBottom: 2 }}
                    onMouseEnter={() => setHoveredSessionId(s.id)}
                    onMouseLeave={() => setHoveredSessionId(null)}
                  >
                    <button
                      onClick={() => { if (editingId !== s.id) setActiveSession(s.id); }}
                      onDoubleClick={() => { setEditingId(s.id); setEditingTitle(s.title); }}
                      style={{
                        width: '100%', border: 'none', borderRadius: 8, textAlign: 'left',
                        padding: '8px 30px 8px 10px', cursor: 'pointer',
                        background: s.id === activeSessionId ? 'var(--accent-green-dim)' : hoveredSessionId === s.id ? 'var(--bg2)' : 'transparent',
                        color: s.id === activeSessionId ? 'var(--accent-green)' : 'var(--text-secondary)',
                        transition: 'background 0.15s, color 0.15s',
                      }}
                    >
                      {editingId === s.id ? (
                        <input
                          autoFocus
                          value={editingTitle}
                          onChange={e => setEditingTitle(e.target.value)}
                          onBlur={() => {
                            renameSession(s.id, editingTitle.trim() || s.title);
                            setEditingId(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              renameSession(s.id, editingTitle.trim() || s.title);
                              setEditingId(null);
                            } else if (e.key === 'Escape') {
                              setEditingId(null);
                            }
                            e.stopPropagation();
                          }}
                          onClick={e => e.stopPropagation()}
                          style={{
                            width: '100%', boxSizing: 'border-box',
                            background: 'transparent', border: 'none', outline: 'none',
                            color: 'inherit', fontSize: 12.5, fontWeight: 500,
                            fontFamily: 'var(--font-sans)', padding: 0,
                          }}
                        />
                      ) : (
                        <div style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                      )}
                      <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 1 }}>{formatTimestamp(s.timestamp)}</div>
                    </button>

                    {/* Delete button */}
                    {hoveredSessionId === s.id && editingId !== s.id && (
                      <button
                        onClick={async e => {
                          e.stopPropagation();
                          if (s.messages.length > 0) {
                            if (!window.confirm('Delete this session?')) return;
                          }
                          deleteSession(s.id);
                          client.deleteSession(`${s.id}.json`).catch(() => {});
                        }}
                        style={{
                          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                          width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-secondary)', borderRadius: 4, padding: 0,
                          transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-red)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
            </div>
          </>
        )}
      </div>

      {/* Bottom actions */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px' }}>
        <div style={{ marginBottom: 6 }}>
          <ProfileChip />
        </div>
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
