import React, { useState } from 'react';
import { useStore } from '../store';
import { ChevronRight, ChevronDown, Terminal, CheckCircle2, XCircle, Loader2, Wrench } from 'lucide-react';

const TOOL_GROUPS = [
  { name: 'File System', tools: ['read_file', 'write_file', 'list_dir', 'delete_file'], icon: '📁', enabled: true },
  { name: 'Shell', tools: ['run_command', 'run_script', 'run_background'], icon: '⚡', enabled: true },
  { name: 'Web', tools: ['web_search', 'web_fetch', 'web_screenshot'], icon: '🌐', enabled: true },
  { name: 'Memory', tools: ['save_memory', 'recall_memory', 'forget_memory'], icon: '🧠', enabled: true },
  { name: 'Skills', tools: ['invoke_skill', 'list_skills'], icon: '⚙️', enabled: true },
  { name: 'MCP', tools: ['(dynamic — connect a server)'], icon: '🔌', enabled: false },
];

function toolLabel(name: string): { emoji: string; label: string } {
  const map: Record<string, { emoji: string; label: string }> = {
    browser_navigate: { emoji: '🌐', label: 'Opening URL' },
    browser_click: { emoji: '🖱️', label: 'Clicking element' },
    browser_snapshot: { emoji: '📸', label: 'Taking screenshot' },
    browser_type: { emoji: '⌨️', label: 'Typing text' },
    browser_scroll: { emoji: '📜', label: 'Scrolling' },
    web_search: { emoji: '🔍', label: 'Searching web' },
    search_web: { emoji: '🔍', label: 'Searching web' },
    read_file: { emoji: '📄', label: 'Reading file' },
    write_file: { emoji: '✏️', label: 'Writing file' },
    run_command: { emoji: '⚡', label: 'Running command' },
    bash: { emoji: '💻', label: 'Running shell' },
    computer_use: { emoji: '🖥️', label: 'Computer control' },
    generate_image: { emoji: '🎨', label: 'Generating image' },
  };
  return map[name] || { emoji: '🔧', label: name.replace(/_/g, ' ') };
}

function LiveToolCard({ tc }: { tc: { id: string; name: string; input: string; output?: string; status: string; timestamp: number } }) {
  const [expanded, setExpanded] = useState(false);
  const statusColors: Record<string, string> = { pending: 'var(--text-secondary)', running: 'var(--accent-amber)', done: 'var(--accent-green)', error: 'var(--accent-red)' };
  const color = statusColors[tc.status] || 'var(--text-secondary)';
  const { emoji, label } = toolLabel(tc.name);
  return (
    <div style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '9px 12px', marginBottom: 8, background: 'var(--bg2)', fontSize: 12 }}>
      <button onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
        <span style={{ fontSize: 14, lineHeight: 1 }}>{emoji}</span>
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)' }}>{label}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>{tc.name}</div>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', marginRight: 4 }}>
          {tc.status === 'running' && <Loader2 size={11} style={{ color: 'var(--accent-amber)', animation: 'spin 1s linear infinite' }} />}
          {tc.status === 'done' && <CheckCircle2 size={11} style={{ color: 'var(--accent-green)' }} />}
          {tc.status === 'error' && <XCircle size={11} style={{ color: 'var(--accent-red)' }} />}
        </span>
        {expanded ? <ChevronDown size={11} style={{ color: 'var(--text-secondary)' }} /> : <ChevronRight size={11} style={{ color: 'var(--text-secondary)' }} />}
      </button>
      {expanded && (
        <div style={{ marginTop: 7, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>Input</div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-secondary)', maxHeight: 80, overflowY: 'auto' }}>{tc.input.slice(0, 200)}</pre>
          {tc.output && <>
            <div style={{ color: 'var(--text-secondary)', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 7, marginBottom: 3 }}>Output</div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-primary)', maxHeight: 80, overflowY: 'auto' }}>{tc.output.slice(0, 200)}</pre>
          </>}
        </div>
      )}
    </div>
  );
}

export default function ToolsPanel() {
  const { activeToolCalls, agentState } = useStore();
  const [activeTab, setActiveTab] = useState<'live' | 'config'>('live');
  const [toolGroups, setToolGroups] = useState(TOOL_GROUPS);

  const toggleGroup = (idx: number) => {
    setToolGroups(groups => groups.map((g, i) => i === idx ? { ...g, enabled: !g.enabled } : g));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg1)', borderLeft: '1px solid var(--border)' }}>
      {/* Header */}
      <div style={{ padding: '14px 14px 0', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10, paddingLeft: 2 }}>Tools</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`tab-btn ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>Live Activity</button>
          <button className={`tab-btn ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>Config</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {activeTab === 'live' && (
          <>
            {activeToolCalls.length > 0 && agentState === 'running_tool' && (
              <div className="animate-in" style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'var(--accent-amber-dim)',
                border: '1px solid var(--accent-amber)',
                borderRadius: 'var(--radius-sm)',
                padding: '8px 11px',
                marginBottom: 10,
                fontSize: 12,
                color: 'var(--accent-amber)',
                fontWeight: 500,
              }}>
                <span className="dot dot-amber" style={{ flexShrink: 0, animation: 'pulse 1.4s ease-in-out infinite' }} />
                Agent is using tools...
              </div>
            )}
            {activeToolCalls.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, gap: 8, color: 'var(--text-secondary)' }}>
                <Wrench size={24} style={{ opacity: 0.25 }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>No active tools</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.5, maxWidth: 160 }}>Tools used during this conversation will appear here.</span>
              </div>
            ) : (
              activeToolCalls.map((tc) => <LiveToolCard key={tc.id} tc={tc} />)
            )}
          </>
        )}

        {activeTab === 'config' && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>Toggle tool categories. Changes apply to new sessions.</div>
            {toolGroups.map((g, idx) => (
              <div key={g.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>{g.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{g.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{g.tools.join(', ')}</div>
                </div>
                <label className="toggle" style={{ marginTop: 2 }}>
                  <input type="checkbox" checked={g.enabled} onChange={() => toggleGroup(idx)} />
                  <span className="toggle-slider" />
                </label>
              </div>
            ))}
            <button className="btn-primary" style={{ marginTop: 14, width: '100%', padding: '8px 0', fontSize: 12.5 }}>Save Tool Config</button>
          </div>
        )}
      </div>
    </div>
  );
}
