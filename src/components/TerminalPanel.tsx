import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Clipboard, ClipboardCheck } from 'lucide-react';

const HISTORY_LIMIT = 20;

const QUICK_COMMANDS = [
  { label: 'ls',            cmd: 'ls' },
  { label: 'pwd',           cmd: 'pwd' },
  { label: 'hermes status', cmd: 'hermes status' },
  { label: 'hermes doctor', cmd: 'hermes doctor' },
  { label: 'clear',         cmd: 'clear' },
];

const stripAnsi = (str: string) =>
  str
    .replace(/\x1B\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1B[()][A-Z0-9]/g, '')
    .replace(/\x1B[NOPQRSTUVWXYZ\\^_]/g, '');

interface PtySession {
  ptyId: string;
  eventId: string;
}

type Status = 'starting' | 'running' | 'stopped' | 'error';

export default function TerminalPanel() {
  const [lines, setLines] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status>('starting');
  const [errorMsg, setErrorMsg] = useState('');
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<PtySession | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const historyRef = useRef<string[]>([]);

  const start = useCallback(async () => {
    setStatus('starting');
    setErrorMsg('');
    try {
      const result = await invoke<{ pty_id: string; event_id: string }>('hermes_pty_start');
      const sess: PtySession = { ptyId: result.pty_id, eventId: result.event_id };
      sessionRef.current = sess;
      setStatus('running');

      const unlisten = await listen<string>(result.event_id, (event) => {
        if (event.payload === '__DONE__') {
          setStatus('stopped');
          setLines(prev => [...prev, '[Process exited]']);
          return;
        }
        const clean = stripAnsi(event.payload);
        setLines(prev => [...prev, clean]);
      });
      unlistenRef.current = unlisten;
    } catch (err) {
      setStatus('error');
      setErrorMsg(String(err));
    }
  }, []);

  useEffect(() => {
    start();
    return () => {
      if (unlistenRef.current) unlistenRef.current();
      if (sessionRef.current) {
        invoke('hermes_pty_stop', { ptyId: sessionRef.current.ptyId }).catch(() => {});
      }
    };
  }, [start]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [lines]);

  const submitCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed || !sessionRef.current || status !== 'running') return;

    // Handle built-in clear
    if (trimmed === 'clear') {
      setLines([]);
      setInput('');
      setHistoryIndex(-1);
      return;
    }

    // Push to history (newest first for arrow-up navigation)
    historyRef.current = [trimmed, ...historyRef.current.filter(c => c !== trimmed)].slice(0, HISTORY_LIMIT);

    invoke('hermes_pty_write', { ptyId: sessionRef.current.ptyId, input: trimmed }).catch(console.error);
    setInput('');
    setHistoryIndex(-1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCommand(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const history = historyRef.current;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      const next = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      setInput(history[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
        setInput('');
      } else {
        const next = historyIndex - 1;
        setHistoryIndex(next);
        setInput(history[next]);
      }
    }
  };

  const handleRestart = () => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }
    if (sessionRef.current) {
      invoke('hermes_pty_stop', { ptyId: sessionRef.current.ptyId }).catch(() => {});
      sessionRef.current = null;
    }
    setLines([]);
    start();
  };

  const copyAll = async () => {
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const dotClass = status === 'running' ? 'dot-green' : status === 'error' ? 'dot-red' : 'dot-dim';
  const statusLabel = status === 'starting' ? 'Starting hermes…' : status === 'running' ? 'hermes terminal' : status === 'stopped' ? 'Process exited' : 'Error';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg0)' }}>
      {/* Header bar */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg1)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span className={`dot ${dotClass}`} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{statusLabel}</span>
        <button
          className="btn btn-ghost btn-sm"
          onClick={copyAll}
          title="Copy all terminal output"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}
        >
          {copied ? <ClipboardCheck size={12} style={{ color: 'var(--accent-green)' }} /> : <Clipboard size={12} />}
          {copied ? 'Copied' : 'Copy All'}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setLines([])}
          title="Clear terminal"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
        >
          Clear
        </button>
        {(status === 'stopped' || status === 'error') && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleRestart}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
          >
            Restart
          </button>
        )}
      </div>

      {/* Output area */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--term-green)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.55 }}>
        {status === 'error' && (
          <div style={{ color: 'var(--accent-red)', marginBottom: 8 }}>Failed to start hermes: {errorMsg}</div>
        )}
        {lines.map((line, i) => (
          <div key={i}>{line || ' '}</div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Quick command chips */}
      <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg1)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--text-label)', fontFamily: 'var(--font-mono)', marginRight: 2 }}>quick:</span>
        {QUICK_COMMANDS.map(qc => (
          <button
            key={qc.cmd}
            onClick={() => {
              if (qc.cmd === 'clear') {
                setLines([]);
              } else {
                setInput(qc.cmd);
              }
            }}
            disabled={status !== 'running'}
            style={{
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '2px 9px',
              cursor: status === 'running' ? 'pointer' : 'default',
              opacity: status === 'running' ? 1 : 0.4,
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseEnter={e => { if (status === 'running') { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg4)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-hover)'; } }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg3)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
          >
            {qc.label}
          </button>
        ))}
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        style={{ borderTop: '1px solid var(--border)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg1)', flexShrink: 0 }}
      >
        <span style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', fontSize: 14, flexShrink: 0 }}>❯</span>
        <input
          className="input-field"
          value={input}
          onChange={e => { setInput(e.target.value); setHistoryIndex(-1); }}
          onKeyDown={handleKeyDown}
          placeholder={status === 'running' ? 'Type a command… (↑↓ history)' : ''}
          disabled={status !== 'running'}
          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13 }}
          autoFocus
        />
      </form>
    </div>
  );
}
