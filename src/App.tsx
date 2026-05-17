import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useStore } from './store';
import { startHealthPolling } from './api/hermes';
import { getHermesInstallStatus, getGatewayStatus, startGateway, checkUpdate, runHermesCommand, updateTrayStatus, isTauriApp, listSessionsDisk, readSessionDisk, writeSessionDisk } from './api/desktop';
import type { UpdateInfo } from './api/desktop';
import Sidebar from './components/Sidebar';
import ConversationPanel from './components/ConversationPanel';
import ToolsPanel from './components/ToolsPanel';
import CommandPalette from './components/CommandPalette';
import ModelSwitcher from './components/ModelSwitcher';
import InstallPanel from './components/InstallPanel';
import CommandCenterPanel from './components/CommandCenterPanel';
import AgentsPanel from './components/AgentsPanel';
import GatewayPanel from './components/GatewayPanel';
import CronPanel from './components/CronPanel';
import SkillsPanel from './components/SkillsPanel';
import SettingsModal from './components/SettingsModal';
import InstallWizard from './components/InstallWizard';
import DashboardPanel from './components/DashboardPanel';
import ProfilesPanel from './components/ProfilesPanel';
import SessionsPanel from './components/SessionsPanel';
import ModelsPanel from './components/ModelsPanel';
import TerminalPanel from './components/TerminalPanel';
import Toast from './components/Toast';
import type { ToastMessage } from './components/Toast';
import { PanelRightClose, PanelRight } from 'lucide-react';

export default function App() {
  const {
    activeSection,
    gatewayStatus, setGatewayStatus,
    rightPanelOpen, setRightPanelOpen,
    paletteOpen, setPaletteOpen,
    sessions,
  } = useStore();

  // Wizard state
  const [wizardDone, setWizardDone] = useState(false);
  const [checkingInstall, setCheckingInstall] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  // Toast state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = useCallback((message: string, type: ToastMessage['type']) => {
    setToasts(prev => [...prev, { id: Date.now().toString(), message, type }]);
  }, []);

  // Update banner state
  const [updateBanner, setUpdateBanner] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>({ current_version: null, latest_version: null, update_available: false, release_url: null });

  // Gateway auto-restart refs
  const failureCount = useRef(0);
  const gatewayPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRestartTime = useRef(0);
  const RESTART_COOLDOWN_MS = 60_000; // Don't restart more than once per minute
  const FAILURE_THRESHOLD = 5; // Require 5 consecutive failures (2.5 min at 30s intervals)

  // Check install status on mount — show wizard only in Tauri desktop mode
  useEffect(() => {
    if (!isTauriApp()) {
      setCheckingInstall(false); // browser preview: skip wizard entirely
      return;
    }
    getHermesInstallStatus().then(s => {
      if (!s.installed || !s.model_configured) {
        setShowWizard(true);
      }
      setCheckingInstall(false);
    }).catch(() => {
      setCheckingInstall(false);
    });
  }, []);

  // Check gateway status on startup using IPC (PID probe) — mirrors reference app.
  // Lazy-auto-starts the gateway exactly like the reference's "lazy-start on first message".
  useEffect(() => {
    if (!isTauriApp()) {
      startHealthPolling();
      return;
    }
    setGatewayStatus('connecting');
    getGatewayStatus().then(async (running) => {
      if (running) {
        setGatewayStatus('connected');
      } else {
        setGatewayStatus('disconnected');
        // Auto-start gateway if Hermes is installed
        try {
          const status = await getHermesInstallStatus();
          if (status.installed) {
            await startGateway();
            // Poll via IPC until the gateway PID is alive (max 15s)
            let attempts = 0;
            const poll = setInterval(async () => {
              attempts++;
              const alive = await getGatewayStatus().catch(() => false);
              if (alive) {
                clearInterval(poll);
                setGatewayStatus('connected');
              } else if (attempts >= 10) {
                clearInterval(poll);
              }
            }, 1500);
          }
        } catch { /* ignore */ }
      }
    }).catch(() => setGatewayStatus('disconnected'));
    startHealthPolling();
  }, []);

  // Mirror gateway status to system tray menu
  useEffect(() => {
    updateTrayStatus(gatewayStatus).catch(() => {});
  }, [gatewayStatus]);

  // Check for updates after 3s
  useEffect(() => {
    const timer = setTimeout(() => {
      checkUpdate().then(info => {
        if (info.update_available) {
          setUpdateInfo(info);
          setUpdateBanner(true);
        }
      }).catch(() => {});
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  // Gateway auto-restart polling — only when connected
  useEffect(() => {
    if (gatewayStatus !== 'connected') {
      if (gatewayPollRef.current) {
        clearInterval(gatewayPollRef.current);
        gatewayPollRef.current = null;
      }
      failureCount.current = 0;
      return;
    }

    gatewayPollRef.current = setInterval(async () => {
      try {
        const alive = await getGatewayStatus();
        if (alive) {
          failureCount.current = 0;
        } else {
          failureCount.current += 1;
          const now = Date.now();
          if (failureCount.current >= FAILURE_THRESHOLD && (now - lastRestartTime.current) > RESTART_COOLDOWN_MS) {
            failureCount.current = 0;
            lastRestartTime.current = now;
            await startGateway().catch(() => {});
            addToast('Gateway restarted automatically', 'info');
          }
        }
      } catch {
        failureCount.current += 1;
        const now = Date.now();
        if (failureCount.current >= FAILURE_THRESHOLD && (now - lastRestartTime.current) > RESTART_COOLDOWN_MS) {
          failureCount.current = 0;
          lastRestartTime.current = now;
          await startGateway().catch(() => {});
          addToast('Gateway restarted automatically', 'info');
        }
      }
    }, 30000);

    return () => {
      if (gatewayPollRef.current) {
        clearInterval(gatewayPollRef.current);
        gatewayPollRef.current = null;
      }
    };
  }, [gatewayStatus, addToast]);

  // Global keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key === 'k') { e.preventDefault(); setPaletteOpen(true); }
    if (e.key === 'Escape' && paletteOpen) setPaletteOpen(false);
  }, [paletteOpen, setPaletteOpen]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Load persisted sessions on startup
  useEffect(() => {
    if (!isTauriApp()) return;
    listSessionsDisk().then(metas => {
      if (metas.length === 0) return;
      Promise.all(metas.map(m => readSessionDisk(m.name).catch(() => null))).then(raws => {
        const loaded = raws
          .filter((r): r is string => r !== null)
          .map(r => { try { return JSON.parse(r); } catch { return null; } })
          .filter(Boolean);
        if (loaded.length > 0) {
          // Merge with existing empty sessions — replace if disk has data
          useStore.setState(state => ({
            sessions: loaded,
            activeSessionId: loaded[0]?.id ?? state.activeSessionId,
          }));
        }
      });
    }).catch(() => {});
  }, []);

  // Persist sessions to disk when they change (debounced via ref)
  const sessionsRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isTauriApp()) return;
    if (sessionsRef.current) clearTimeout(sessionsRef.current);
    sessionsRef.current = setTimeout(() => {
      sessions.forEach(s => {
        if (s.messages.length > 0) {
          writeSessionDisk(`${s.id}.json`, JSON.stringify(s)).catch(() => {});
        }
      });
    }, 2000); // debounce 2s
  }, [sessions]);

  const mainContent = () => {
    switch (activeSection) {
      case 'chat': return <ConversationPanel />;
      case 'install': return <InstallPanel onOpenWizard={() => setShowWizard(true)} />;
      case 'commands': return <CommandCenterPanel />;
      case 'agents': return <AgentsPanel />;
      case 'gateway': return <GatewayPanel />;
      case 'crons': return <CronPanel />;
      case 'skills': return <SkillsPanel />;
      case 'dashboard': return <DashboardPanel />;
      case 'profiles': return <ProfilesPanel />;
      case 'models': return <ModelsPanel />;
      case 'sessions': return <SessionsPanel />;
      case 'terminal': return <TerminalPanel />;
      default: return <ConversationPanel />;
    }
  };

  const showRightPanel = activeSection === 'chat';

  // Show wizard for first-time users (not yet done, not still checking)
  if (!checkingInstall && showWizard && !wizardDone) {
    return (
      <>
        <InstallWizard onComplete={() => { setWizardDone(true); setShowWizard(false); }} />
        <Toast toasts={toasts} onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />
      </>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden', background: 'var(--bg0)' }}>
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
          background: 'var(--bg1)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 10,
        }}>
          {/* Section title */}
          <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)', flex: 1 }}>
            {activeSection === 'chat' && 'Conversation'}
            {activeSection === 'install' && 'Install and Runtime'}
            {activeSection === 'commands' && 'Command Center'}
            {activeSection === 'agents' && 'Agents'}
            {activeSection === 'gateway' && 'Gateway'}
            {activeSection === 'crons' && 'Cron Scheduler'}
            {activeSection === 'skills' && 'Skills'}
            {activeSection === 'settings' && 'Settings'}
            {activeSection === 'dashboard' && 'Dashboard'}
            {activeSection === 'profiles' && 'Profiles & Memory'}
            {activeSection === 'models' && 'Models'}
            {activeSection === 'sessions' && 'Sessions'}
            {activeSection === 'terminal' && 'Terminal'}
          </span>

          {/* Palette shortcut */}
          <button
            onClick={() => setPaletteOpen(true)}
            id="palette-trigger-btn"
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 12px', color: 'var(--text-secondary)', fontSize: 12.5, cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-green)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
          >
            <span>/ Commands</span>
            <kbd style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Ctrl K</kbd>
          </button>

          {/* Toggle right panel */}
          {showRightPanel && (
            <button
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
              title={rightPanelOpen ? 'Hide Tools Panel' : 'Show Tools Panel'}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'color 0.15s, background 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
            >
              {rightPanelOpen ? <PanelRightClose size={16} /> : <PanelRight size={16} />}
            </button>
          )}
        </div>

        {/* Update banner */}
        {updateBanner && (
          <div style={{ background: 'var(--accent-amber-dim)', borderBottom: '1px solid var(--accent-amber)', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, flexShrink: 0 }}>
            <span style={{ color: 'var(--accent-amber)', fontWeight: 600 }}>Update available</span>
            <span style={{ color: 'var(--text-secondary)' }}>{updateInfo.current_version} → {updateInfo.latest_version}</span>
            <button className="btn btn-ghost" style={{ fontSize: 11.5, marginLeft: 'auto' }} onClick={() => runHermesCommand(['update'])}>Update</button>
            <button onClick={() => setUpdateBanner(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>×</button>
          </div>
        )}

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

      {/* Toast notifications */}
      <Toast toasts={toasts} onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />
    </div>
  );
}
