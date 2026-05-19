import React, { useRef, useState } from 'react';
import { Bot, CheckCircle2, Copy, GitBranch, Play, Radio, Send, XCircle } from 'lucide-react';
import { useStore } from '../store';
import { CommandResult, runHermesCommand, startGateway, streamHermesCommand } from '../api/desktop';
import { AGENT_MODES, AgentMode } from '../data/hermesCatalog';

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

export default function AgentsPanel() {
  const { setActiveSection } = useStore();
  const [prompt, setPrompt] = useState('Review this repository and summarize the next useful improvements.');
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

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

  const runMode = async (mode: AgentMode) => {
    setRunning(mode.id);
    setResult(null);
    setStreamLines([]);
    cancelRef.current = null;

    try {
      if (mode.id === 'gateway') {
        setResult(await startGateway());
      } else if (mode.id === 'background' || mode.id === 'goal') {
        fillChat(commandFor(mode));
        setResult({
          success: true,
          code: null,
          command: commandFor(mode),
          stdout: 'Staged in the chat composer.',
          stderr: '',
        });
      } else if (mode.needsPrompt) {
        let cancelled = false;
        cancelRef.current = () => { cancelled = true; };

        const args = [...mode.args, prompt];
        const res = await streamHermesCommand(
          args,
          (line) => {
            if (cancelled) return;
            setStreamLines((prev) => [...prev, line]);
          },
          180,
        );

        if (cancelled) {
          setStreamLines((prev) => [...prev, '— Cancelled —']);
          setResult(null);
        } else {
          setResult(res);
        }
        cancelRef.current = null;
      } else {
        setResult(await runHermesCommand(mode.args, 20));
      }
    } catch (err) {
      setResult({
        success: false,
        code: null,
        command: commandFor(mode),
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(null);
      cancelRef.current = null;
    }
  };

  const cancelMode = () => {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Bot size={20} style={{ color: 'var(--accent-green)' }} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Agents</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Main, one-shot, scripted, worktree, background, gateway, and integration modes</div>
          </div>
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
                  {mode.id === 'background' || mode.id === 'goal' ? <Send size={13} /> : <Play size={13} />}
                  {running === mode.id ? 'Running…' : mode.id === 'background' || mode.id === 'goal' ? 'Stage' : 'Run'}
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
