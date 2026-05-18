import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Brain, User, Save, Trash2, RefreshCw } from 'lucide-react';
import { readFile, writeFile, isTauriApp } from '../api/desktop';

type Tab = 'agent' | 'user';

const AGENT_FILE = 'memory.md';
const USER_FILE = 'user.md';
const AGENT_MAX = 32000;
const USER_MAX = 8000;
const DEBOUNCE_MS = 1000;
const SAVED_DISPLAY_MS = 2000;

function CapacityBar({ chars, max }: { chars: number; max: number }) {
  const pct = Math.min((chars / max) * 100, 100);
  const barColor =
    pct > 90
      ? 'var(--accent-red)'
      : pct > 70
      ? 'var(--accent-amber)'
      : 'var(--accent-green)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: barColor,
            borderRadius: 2,
            transition: 'width 0.3s, background 0.3s',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)' }}>
        <span>{chars.toLocaleString()} / {max.toLocaleString()} chars</span>
        <span style={{ color: barColor }}>{Math.round(pct)}%</span>
      </div>
    </div>
  );
}

export default function MemoryPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('agent');
  const [agentContent, setAgentContent] = useState('');
  const [userContent, setUserContent] = useState('');
  const [agentSaved, setAgentSaved] = useState(false);
  const [userSaved, setUserSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agentDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agentSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFile = useCallback(async (tab: Tab) => {
    setLoading(true);
    setError(null);
    try {
      const name = tab === 'agent' ? AGENT_FILE : USER_FILE;
      const content = await readFile(name);
      if (tab === 'agent') setAgentContent(content);
      else setUserContent(content);
    } catch (e) {
      // File missing is fine — treat as empty
      if (tab === 'agent') setAgentContent('');
      else setUserContent('');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load both files on mount
  useEffect(() => {
    loadFile('agent');
    loadFile('user');
  }, [loadFile]);

  const flashSaved = (tab: Tab) => {
    if (tab === 'agent') {
      setAgentSaved(true);
      if (agentSavedTimer.current) clearTimeout(agentSavedTimer.current);
      agentSavedTimer.current = setTimeout(() => setAgentSaved(false), SAVED_DISPLAY_MS);
    } else {
      setUserSaved(true);
      if (userSavedTimer.current) clearTimeout(userSavedTimer.current);
      userSavedTimer.current = setTimeout(() => setUserSaved(false), SAVED_DISPLAY_MS);
    }
  };

  const scheduleSave = useCallback((tab: Tab, content: string) => {
    const timerRef = tab === 'agent' ? agentDebounce : userDebounce;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const name = tab === 'agent' ? AGENT_FILE : USER_FILE;
        await writeFile(name, content);
        flashSaved(tab);
      } catch {
        // silent — no IPC in browser mode
      }
    }, DEBOUNCE_MS);
  }, []);

  const handleAgentChange = (val: string) => {
    setAgentContent(val);
    scheduleSave('agent', val);
  };

  const handleUserChange = (val: string) => {
    setUserContent(val);
    scheduleSave('user', val);
  };

  const handleClear = async (tab: Tab) => {
    const label = tab === 'agent' ? 'agent memory' : 'user profile';
    if (!window.confirm(`Clear ${label}? This cannot be undone.`)) return;
    try {
      const name = tab === 'agent' ? AGENT_FILE : USER_FILE;
      await writeFile(name, '');
      if (tab === 'agent') setAgentContent('');
      else setUserContent('');
      flashSaved(tab);
    } catch {
      // silent
    }
  };

  const handleRefresh = () => {
    loadFile('agent');
    loadFile('user');
  };

  const content = activeTab === 'agent' ? agentContent : userContent;
  const maxChars = activeTab === 'agent' ? AGENT_MAX : USER_MAX;
  const isSaved = activeTab === 'agent' ? agentSaved : userSaved;
  const placeholder =
    activeTab === 'agent'
      ? 'No memory entries yet. The agent will populate this as you interact.'
      : 'Add notes about yourself that the agent should remember...';

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg0)' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'var(--bg3)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Brain size={18} style={{ color: 'var(--accent-green)' }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>Memory</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>Agent working memory and user profile</div>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={handleRefresh}
            title="Refresh from disk"
            disabled={loading}
          >
            <RefreshCw size={14} style={{ color: loading ? 'var(--text-secondary)' : 'var(--text-primary)', animation: loading ? 'spin 1s linear infinite' : undefined }} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
          <button
            className={`tab-btn${activeTab === 'agent' ? ' active' : ''}`}
            onClick={() => setActiveTab('agent')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Brain size={13} />
            Agent Memory
          </button>
          <button
            className={`tab-btn${activeTab === 'user' ? ' active' : ''}`}
            onClick={() => setActiveTab('user')}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <User size={13} />
            User Profile
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 24px 20px', minHeight: 0, gap: 12 }}>
        {!isTauriApp() && (
          <div style={{ padding: '8px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            Memory files are read/written via Tauri IPC. Changes here are local previews only.
          </div>
        )}

        {error && (
          <div style={{ padding: '8px 12px', background: 'var(--accent-red-dim)', border: '1px solid var(--accent-red)', borderRadius: 8, fontSize: 12, color: 'var(--accent-red)' }}>
            {error}
          </div>
        )}

        {/* Textarea */}
        <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
          {content === '' && !loading && (
            <div style={{ position: 'absolute', top: 12, left: 12, right: 12, pointerEvents: 'none', fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', fontFamily: 'var(--font-mono)', lineHeight: 1.6, zIndex: 1 }}>
              {placeholder}
            </div>
          )}
          <textarea
            value={content}
            onChange={(e) => activeTab === 'agent' ? handleAgentChange(e.target.value) : handleUserChange(e.target.value)}
            spellCheck={false}
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--bg1)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '12px',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              lineHeight: 1.65,
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-active)'; }}
            onBlur={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
          />
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0 }}>
          <CapacityBar chars={content.length} max={maxChars} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {isSaved && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent-green)', fontWeight: 500 }}>
                  <Save size={12} />
                  Saved
                </span>
              )}
            </div>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => handleClear(activeTab)}
              style={{ display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <Trash2 size={12} />
              Clear {activeTab === 'agent' ? 'Memory' : 'Profile'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
