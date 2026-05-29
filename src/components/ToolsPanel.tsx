import React, { useState, useEffect } from 'react';
import { ChevronRight, ChevronDown, CheckCircle2, XCircle, Loader2, Wrench, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { useHermesClient } from '../lib/hermes';

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

const TOOL_CATALOG = [
  { key: 'web', label: 'Web Search', description: 'Search the internet for information', icon: '🔍' },
  { key: 'browser', label: 'Browser Control', description: 'Navigate, click, and extract from websites', icon: '🌐' },
  { key: 'terminal', label: 'Terminal', description: 'Run shell commands and scripts', icon: '⚡' },
  { key: 'file', label: 'File System', description: 'Read, write, and manage files', icon: '📁' },
  { key: 'code_execution', label: 'Code Execution', description: 'Execute Python, JS, and other code', icon: '💻' },
  { key: 'vision', label: 'Vision', description: 'Analyze and describe images', icon: '👁️' },
  { key: 'image_gen', label: 'Image Generation', description: 'Create images from descriptions', icon: '🎨' },
  { key: 'memory', label: 'Memory', description: 'Save and recall information across sessions', icon: '🧠' },
  { key: 'skills', label: 'Skills', description: 'Invoke registered skill files', icon: '⚙️' },
  { key: 'session_search', label: 'Session Search', description: 'Search through conversation history', icon: '🔎' },
  { key: 'cronjob', label: 'Cron Jobs', description: 'Schedule and manage automated tasks', icon: '⏰' },
  { key: 'delegation', label: 'Delegation', description: 'Spawn and manage sub-agents', icon: '🤖' },
];

export default function ToolsPanel() {
  const client = useHermesClient();
  // null = not yet loaded (all enabled by default per Hermes); empty config means all enabled
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean> | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    client.getEnabledToolsets().then(keys => {
      if (keys.length === 0) {
        // Empty list means all enabled (Hermes default)
        setEnabledTools({});
      } else {
        const map: Record<string, boolean> = {};
        TOOL_CATALOG.forEach(t => { map[t.key] = keys.includes(t.key); });
        setEnabledTools(map);
      }
    }).catch(() => setEnabledTools({}));
  }, [client]);

  const isEnabled = (key: string) => !enabledTools || enabledTools[key] !== false;

  const toggle = (key: string) => {
    setEnabledTools(prev => ({ ...(prev ?? {}), [key]: !isEnabled(key) }));
  };

  const enableAll = () => {
    const all: Record<string, boolean> = {};
    TOOL_CATALOG.forEach(t => { all[t.key] = true; });
    setEnabledTools(all);
  };

  const disableAll = () => {
    const all: Record<string, boolean> = {};
    TOOL_CATALOG.forEach(t => { all[t.key] = false; });
    setEnabledTools(all);
  };

  const applyChanges = async () => {
    const activeKeys = TOOL_CATALOG.map(t => t.key).filter(k => isEnabled(k));
    await client.setEnabledToolsets(activeKeys).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', padding: '20px 20px 24px' }}>
      {/* Header */}
      <div className="section-label" style={{ marginBottom: 4 }}>Tool Configuration</div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>Enable or disable agent capabilities</div>

      {/* Bulk actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" onClick={enableAll} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <ToggleRight size={13} />
          Enable All
        </button>
        <button className="btn btn-ghost btn-sm" onClick={disableAll} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <ToggleLeft size={13} />
          Disable All
        </button>
      </div>

      {/* Tool grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {TOOL_CATALOG.map(tool => {
          const enabled = isEnabled(tool.key);
          return (
            <div
              key={tool.key}
              onClick={() => toggle(tool.key)}
              style={{
                background: 'var(--bg2)',
                border: `1px solid ${enabled ? 'var(--accent-green-dim)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                padding: 14,
                cursor: 'pointer',
                opacity: enabled ? 1 : 0.6,
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                transition: 'border-color 0.15s, opacity 0.15s',
              }}
            >
              {/* Icon */}
              <div style={{
                width: 36, height: 36, flexShrink: 0,
                background: 'var(--bg3)',
                borderRadius: 'var(--radius-sm)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16,
              }}>
                {tool.icon}
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-primary)', marginBottom: 2 }}>{tool.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{tool.description}</div>
              </div>

              {/* Toggle */}
              <label className="toggle" style={{ flexShrink: 0, marginTop: 2 }} onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={enabled} onChange={() => toggle(tool.key)} />
                <span className="toggle-slider" />
              </label>
            </div>
          );
        })}
      </div>

      {/* Apply button */}
      <button
        className="btn btn-primary"
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        onClick={applyChanges}
      >
        <Save size={13} />
        {saved ? 'Applied ✓' : 'Apply Changes'}
      </button>
    </div>
  );
}
