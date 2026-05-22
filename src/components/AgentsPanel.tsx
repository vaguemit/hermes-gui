import React, { useRef, useState } from 'react';
import { Bot, CheckCircle2, Copy, GitBranch, Play, Radio, Send, XCircle } from 'lucide-react';
import { useStore } from '../store';
import type { CommandResult } from '../api/desktop';
import { useHermesClient } from '../lib/hermes';
import { AGENT_MODES, AgentMode } from '../data/hermesCatalog';

// ── Mode selector data ───────────────────────────────────────────────────────

const MODE_CARDS = [
  { id: 'auto',       label: 'Auto',       description: 'Agent decides which tools to use',          icon: '🤖', badge: 'Default' },
  { id: 'one-shot',   label: 'One-Shot',   description: 'Single response, no follow-up',             icon: '⚡', badge: null },
  { id: 'loop',       label: 'Loop',       description: 'Runs until task is complete',               icon: '🔄', badge: 'Beta' },
  { id: 'supervised', label: 'Supervised', description: 'Asks for confirmation before each tool call', icon: '👁️', badge: null },
  { id: 'scripted',   label: 'Scripted',   description: 'Runs a predefined sequence of steps',       icon: '📜', badge: null },
] as const;

type ModeId = typeof MODE_CARDS[number]['id'];

const TOOL_LIST = [
  { id: 'browser',   label: 'Browser Control',   description: 'Web browsing and automation' },
  { id: 'shell',     label: 'Shell Commands',     description: 'Execute terminal commands' },
  { id: 'file',      label: 'File Access',        description: 'Read and write files' },
  { id: 'web_search',label: 'Web Search',         description: 'Search the web for information' },
  { id: 'image_gen', label: 'Image Generation',   description: 'Generate images with AI' },
  { id: 'memory',    label: 'Memory',             description: 'Persistent agent memory' },
];

function loadMode(): ModeId {
  try { return (localStorage.getItem('hermes-agent-mode') as ModeId) || 'auto'; } catch { return 'auto'; }
}

function loadTools(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem('hermes-enabled-tools');
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch { /* ignore */ }
  return Object.fromEntries(TOOL_LIST.map(t => [t.id, true]));
}

// ── Existing helpers ─────────────────────────────────────────────────────────

function modeIcon(mode: AgentMode) {
  if (mode.id === 'worktree') return <GitBranch size={17} />;
  if (mode.id === 'gateway') return <Radio size={17} />;
  return <Bot size={17} />;
}

function ResultBlock({ result, streamLines }: { result: CommandResult | null; streamLines: string[] }) {
  const [copied, setCopied] = useState(false);

  const isStreaming = streamLines.length > 0 && !result;
  const displayLines = isStreaming ? streamLines : null;
  const body = result ? [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n\n') : null;
  const fullText = displayLines ? displayLines.join('\n') : (body ?? '');

  if (!isStreaming && !result) return null;

  const copyOutput = async () => {
    await navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {result ? (
          result.success
            ? <CheckCircle2 size={13} style={{ color: 'var(--accent-green)' }} />
            : <XCircle size={13} style={{ color: 'var(--accent-red)' }} />
        ) : (
          <span className="dot dot-amber" style={{ flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>
          {result ? result.command : 'Running…'}
        </span>
        <button
          className="btn btn-ghost btn-sm btn-icon"
          onClick={copyOutput}
          title="Copy output"
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', fontSize: 11 }}
        >
          <Copy size={12} />
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>
        {displayLines ? (displayLines.length > 0 ? displayLines.join('\n') : '…') : (body || '(no output)')}
      </pre>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentsPanel() {
  const client = useHermesClient();
  const { setActiveSection } = useStore();
  const [prompt, setPrompt] = useState('Review this repository and summarize the next useful improvements.');
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  // Mode selector state
  const [selectedMode, setSelectedMode] = useState<ModeId>(loadMode);
  const [enabledTools, setEnabledTools] = useState<Record<string, boolean>>(loadTools);
  const [applied, setApplied] = useState(false);

  const applySettings = () => {
    try {
      localStorage.setItem('hermes-agent-mode', selectedMode);
      localStorage.setItem('hermes-enabled-tools', JSON.stringify(enabledTools));
    } catch { /* ignore */ }
    setApplied(true);
    setTimeout(() => setApplied(false), 1800);
  };

  const toggleTool = (id: string) => {
    setEnabledTools(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const fillChat = (text: string) => {
    setActiveSection('chat');
    window.setTimeout(() => {
      const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement | null;
      if (!chatInput) return;
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      nativeInputValueSetter?.call(chatInput, text);
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      chatInput.focus();
    }, 80);
  };

  const commandFor = (mode: AgentMode) => {
    if (mode.id === 'background') return `/background ${prompt}`;
    if (mode.id === 'goal') return `/goal ${prompt}`;
    if (mode.needsPrompt) return ['hermes', ...mode.args, prompt].join(' ');
    return mode.command;
  };

  const INTERACTIVE_CLI_MODES = new Set(['main', 'oneshot', 'worktree', 'acp']);

  const runMode = async (mode: AgentMode) => {
    if (INTERACTIVE_CLI_MODES.has(mode.id)) {
      if (mode.id === 'main') {
        fillChat(prompt);
        setResult({ success: true, code: null, command: mode.command, stdout: 'Staged in the chat composer. The gateway API handles this without a terminal.', stderr: '' });
        return;
      }
      if (mode.id === 'oneshot' || mode.id === 'worktree') {
        fillChat(prompt);
        setResult({ success: true, code: null, command: commandFor(mode), stdout: 'Prompt staged in the chat composer. Send it there — the gateway API handles one-shot tasks without a terminal.', stderr: '' });
        return;
      }
      if (mode.id === 'acp') {
        setResult({ success: false, code: null, command: mode.command, stdout: '', stderr: 'hermes acp starts a long-running server process that requires a real terminal. Run it from an external terminal: hermes acp' });
        return;
      }
    }

    setRunning(mode.id);
    setResult(null);
    setStreamLines([]);
    cancelRef.current = null;

    try {
      if (mode.id === 'gateway') {
        setResult(await client.startGateway());
      } else if (mode.id === 'background' || mode.id === 'goal') {
        fillChat(commandFor(mode));
        setResult({ success: true, code: null, command: commandFor(mode), stdout: 'Staged in the chat composer.', stderr: '' });
      } else if (mode.needsPrompt) {
        let cancelled = false;
        cancelRef.current = () => { cancelled = true; };
        const args = [...mode.args, '--no-color', prompt];
        const res = await client.streamCommand(args, (line) => { if (!cancelled) setStreamLines(prev => [...prev, line]); }, 180);
        if (cancelled) {
          setStreamLines(prev => [...prev, '— Cancelled —']);
          setResult(null);
        } else {
          setResult(res);
        }
        cancelRef.current = null;
      } else {
        setResult(await client.runHermesCommand([...mode.args, '--no-color'], 20));
      }
    } catch (err) {
      setResult({ success: false, code: null, command: commandFor(mode), stdout: '', stderr: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunning(null);
      cancelRef.current = null;
    }
  };

  const cancelMode = () => {
    if (cancelRef.current) { cancelRef.current(); cancelRef.current = null; }
    setRunning(null);
  };

  const copyMode = async (mode: AgentMode) => {
    await navigator.clipboard.writeText(commandFor(mode));
    setCopied(mode.id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '22px 26px' }}>
      <div style={{ maxWidth: 1040 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
          <Bot size={20} style={{ color: 'var(--accent-green)' }} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Agents</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Configure agent mode, tool access, and run agent tasks</div>
          </div>
        </div>

        {/* ── Mode Selector ────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>Agent Mode</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
            {MODE_CARDS.map(card => {
              const active = selectedMode === card.id;
              return (
                <button
                  key={card.id}
                  onClick={() => setSelectedMode(card.id)}
                  style={{
                    background: active ? 'var(--accent-green-dim)' : 'var(--bg1)',
                    border: `1px solid ${active ? 'var(--accent-green)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 14px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'background 0.15s, border-color 0.15s',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg2)'; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg1)'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{card.icon}</span>
                    {card.badge && (
                      <span className={card.badge === 'Beta' ? 'badge badge-beta' : 'badge badge-connected'} style={{ fontSize: 10 }}>
                        {card.badge}
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: active ? 'var(--accent-green)' : 'var(--text-primary)' }}>{card.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{card.description}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tool Toggles ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 20 }}>
          <div className="section-label" style={{ marginBottom: 12 }}>Enabled Tools</div>
          <div style={{ background: 'var(--bg1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {TOOL_LIST.map((tool, i) => (
              <div
                key={tool.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '11px 16px',
                  borderBottom: i < TOOL_LIST.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{tool.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>{tool.description}</div>
                </div>
                <label className="toggle" style={{ flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={!!enabledTools[tool.id]}
                    onChange={() => toggleTool(tool.id)}
                  />
                  <span className="toggle-slider" />
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* ── Apply Button ─────────────────────────────────────────── */}
        <div style={{ marginBottom: 26 }}>
          <button
            className="btn btn-primary"
            onClick={applySettings}
            style={{ minWidth: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 13 }}
          >
            {applied ? 'Applied ✓' : 'Apply Settings'}
          </button>
        </div>

        <div className="divider" style={{ marginBottom: 22 }} />

        {/* ── Agent Runner (existing) ───────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Agent Runner</div>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Run Hermes agent modes directly</span>
        </div>

        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, marginBottom: 7 }}>Prompt used by runnable agent modes</label>
          <textarea className="input-field" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} style={{ resize: 'vertical', fontSize: 13.5 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {AGENT_MODES.map((mode) => (
            <div key={mode.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 15, display: 'flex', flexDirection: 'column', minHeight: 230 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent-green-dim)', color: 'var(--accent-green)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {modeIcon(mode)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{mode.title}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mode.command}</div>
                </div>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 1.55, flex: 1 }}>{mode.description}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
                {mode.tags.map((tag) => <span key={tag} className="badge badge-muted">{tag}</span>)}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => runMode(mode)}
                  disabled={running !== null || (!prompt.trim() && Boolean(mode.needsPrompt))}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12.5 }}
                >
                  {mode.id === 'background' || mode.id === 'goal' || mode.id === 'main' || mode.id === 'oneshot' || mode.id === 'worktree' ? <Send size={13} /> : <Play size={13} />}
                  {running === mode.id ? 'Running…'
                    : (mode.id === 'background' || mode.id === 'goal' || mode.id === 'oneshot' || mode.id === 'worktree') ? 'Stage in Chat'
                    : mode.id === 'main' ? 'Open in Chat'
                    : 'Run'}
                </button>
                {running === mode.id && mode.needsPrompt && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={cancelMode}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
                  >
                    <XCircle size={13} />
                    Cancel
                  </button>
                )}
                <button className="btn btn-ghost" onClick={() => copyMode(mode)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <Copy size={13} />
                  {copied === mode.id ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <ResultBlock result={result} streamLines={streamLines} />
      </div>
    </div>
  );
}
