import React, { useState } from 'react';
import { Bot, CheckCircle2, Copy, GitBranch, Play, Radio, Send, XCircle } from 'lucide-react';
import { useStore } from '../store';
import { CommandResult, runHermesCommand, startGateway } from '../api/desktop';
import { AGENT_MODES, AgentMode } from '../data/hermesCatalog';

function modeIcon(mode: AgentMode) {
  if (mode.id === 'worktree') return <GitBranch size={17} />;
  if (mode.id === 'gateway') return <Radio size={17} />;
  return <Bot size={17} />;
}

function ResultBlock({ result }: { result: CommandResult | null }) {
  if (!result) return null;
  const body = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n\n');
  return (
    <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {result.success ? <CheckCircle2 size={13} style={{ color: 'var(--success)' }} /> : <XCircle size={13} style={{ color: 'var(--error)' }} />}
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{result.command}</span>
      </div>
      <pre style={{ margin: 0, color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, lineHeight: 1.55, whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>
        {body || '(no output)'}
      </pre>
    </div>
  );
}

export default function AgentsPanel() {
  const { setActiveSection } = useStore();
  const [prompt, setPrompt] = useState('Review this repository and summarize the next useful improvements.');
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

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
      } else {
        const args = mode.needsPrompt ? [...mode.args, prompt] : mode.args;
        setResult(await runHermesCommand(args, mode.needsPrompt ? 180 : 20));
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
    }
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
          <Bot size={20} style={{ color: 'var(--accent)' }} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Agents</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Main, one-shot, scripted, worktree, background, gateway, and integration modes</div>
          </div>
        </div>

        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <label style={{ display: 'block', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, marginBottom: 7 }}>Prompt used by runnable agent modes</label>
          <textarea className="input-field" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} style={{ resize: 'vertical', fontSize: 13.5 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          {AGENT_MODES.map((mode) => (
            <div key={mode.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 15, display: 'flex', flexDirection: 'column', minHeight: 230 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {modeIcon(mode)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{mode.title}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)', fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mode.command}</div>
                </div>
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 1.55, flex: 1 }}>{mode.description}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 12 }}>
                {mode.tags.map((tag) => <span key={tag} className="badge badge-muted">{tag}</span>)}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="btn-primary" onClick={() => runMode(mode)} disabled={running !== null || (!prompt.trim() && Boolean(mode.needsPrompt))} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12.5 }}>
                  {mode.id === 'background' || mode.id === 'goal' ? <Send size={13} /> : <Play size={13} />}
                  {running === mode.id ? 'Running...' : mode.id === 'background' || mode.id === 'goal' ? 'Stage' : 'Run'}
                </button>
                <button className="btn-ghost" onClick={() => copyMode(mode)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <Copy size={13} />
                  {copied === mode.id ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <ResultBlock result={result} />
      </div>
    </div>
  );
}
