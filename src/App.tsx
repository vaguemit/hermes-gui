import React, { useEffect, useCallback } from 'react';
import { useStore } from './store';
import { checkHealth, startHealthPolling } from './api/hermes';
import Sidebar from './components/Sidebar';
import ConversationPanel from './components/ConversationPanel';
import ToolsPanel from './components/ToolsPanel';
import CommandPalette from './components/CommandPalette';
import ModelSwitcher from './components/ModelSwitcher';
import GatewayPanel from './components/GatewayPanel';
import CronPanel from './components/CronPanel';
import SkillsPanel from './components/SkillsPanel';
import SettingsModal from './components/SettingsModal';
import { PanelRightClose, PanelRight } from 'lucide-react';

export default function App() {
  const {
    activeSection, setActiveSection,
    gatewayStatus, setGatewayStatus,
    rightPanelOpen, setRightPanelOpen,
    paletteOpen, setPaletteOpen,
  } = useStore();

  // Check gateway health on startup
  useEffect(() => {
    setGatewayStatus('connecting');
    checkHealth().then((ok) => {
      setGatewayStatus(ok ? 'connected' : 'disconnected');
    });
    startHealthPolling();
  }, []);

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key === 'k') { e.preventDefault(); setPaletteOpen(true); }
    if (e.key === 'Escape' && paletteOpen) setPaletteOpen(false);
  }, [paletteOpen]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const mainContent = () => {
    switch (activeSection) {
      case 'chat': return <ConversationPanel />;
      case 'gateway': return <GatewayPanel />;
      case 'crons': return <CronPanel />;
      case 'skills': return <SkillsPanel />;
      default: return <ConversationPanel />;
    }
  };

  const showRightPanel = activeSection === 'chat';

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg-base)' }}>
      {/* Sidebar */}
      <div style={{ width: 220, flexShrink: 0, height: '100%' }}>
        <Sidebar />
      </div>

      {/* Main content + header */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header bar */}
        <div style={{
          height: 44,
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 10,
        }}>
          {/* Section title */}
          <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)', flex: 1 }}>
            {activeSection === 'chat' && '💬 Conversation'}
            {activeSection === 'gateway' && '📡 Gateway'}
            {activeSection === 'crons' && '⏰ Cron Scheduler'}
            {activeSection === 'skills' && '⚡ Skills'}
            {activeSection === 'settings' && '⚙️ Settings'}
          </span>

          {/* Palette shortcut */}
          <button
            onClick={() => setPaletteOpen(true)}
            id="palette-trigger-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 12px', color: 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
          >
            <span>/ Commands</span>
            <kbd style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>⌘K</kbd>
          </button>

          {/* Toggle right panel */}
          {showRightPanel && (
            <button
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
              title={rightPanelOpen ? 'Hide Tools Panel' : 'Show Tools Panel'}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'color 0.15s, background 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
            >
              {rightPanelOpen ? <PanelRightClose size={16} /> : <PanelRight size={16} />}
            </button>
          )}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
            {mainContent()}
          </div>

          {/* Right rail */}
          {showRightPanel && rightPanelOpen && (
            <div style={{ width: 260, flexShrink: 0, height: '100%', overflow: 'hidden' }}>
              <ToolsPanel />
            </div>
          )}
        </div>
      </div>

      {/* Overlays */}
      <CommandPalette />
      <ModelSwitcher />
      <SettingsModal />
    </div>
  );
}
