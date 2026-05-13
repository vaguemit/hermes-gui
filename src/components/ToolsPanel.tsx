import React, { useState } from 'react';
import { useStore } from '../store';
import { ChevronRight, ChevronDown, Terminal, CheckCircle2, XCircle, Loader2, Wrench, ToggleLeft, ToggleRight } from 'lucide-react';

const TOOL_GROUPS = [
  { name: 'File System', tools: ['read_file', 'write_file', 'list_dir', 'delete_file'], icon: '📁', enabled: true },
  { name: 'Shell', tools: ['run_command', 'run_script', 'run_background'], icon: '⚡', enabled: true },
  { name: 'Web', tools: ['web_search', 'web_fetch', 'web_screenshot'], icon: '🌐', enabled: true },
  { name: 'Memory', tools: ['save_memory', 'recall_memory', 'forget_memory'], icon: '🧠', enabled: true },
  { name: 'Skills', tools: ['invoke_skill', 'list_skills'], icon: '⚙️', enabled: true },
  { name: 'MCP', tools: ['(dynamic — connect a server)'], icon: '🔌', enabled: false },
];

function LiveToolCard({ tc }: { tc: { id: string; name: string; input: string; output?: string; status: string; timestamp: number } }) {
  const [expanded, setExpanded] = useState(false);
  const statusColors: Record<string, string> = { pending: 'var(--text-secondary)', running: 'var(--accent-blue)', done: 'var(--accent-green)', error: 'var(--accent-red)' };
  const color = statusColors[tc.status] || 'var(--text-secondary)';
  return (
    <div style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '9px 12px', marginBottom: 8, background: 'var(--bg2)', fontSize: 12 }}>
      <button onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color }}>
        <Terminal size={12} />
        <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 11.5, flex: 1, textAlign: 'left' }}>{tc.name}</span>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', marginRight: 4 }}>
          {tc.status === 'running' && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />}
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
  const { activeToolCalls } = useStore();
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
            {activeToolCalls.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 160, gap: 10, color: 'var(--text-secondary)' }}>
                <Wrench size={24} style={{ opacity: 0.3 }} />
                <span style={{ fontSize: 12 }}>No active tool calls</span>
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
