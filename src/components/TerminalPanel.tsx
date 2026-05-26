import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal, RefreshCw, Trash2, Send, X } from 'lucide-react';
import { isTauriApp, ptySpawn, ptyWrite, ptyKill } from '../api/desktop';

const SHELL_PROGRAM = navigator.platform.toLowerCase().includes('win') ? 'powershell.exe' : 'bash';
const SHELL_ARGS = navigator.platform.toLowerCase().includes('win') ? ['-NoLogo'] : ['--login'];

const HISTORY_LIMIT = 50;

const stripAnsi = (s: string) =>
  s.replace(/\x1B\[[0-9;?]*[A-Za-z]/g, '')
   .replace(/\x1B[()][A-Z0-9]/g, '')
   .replace(/\x1B[NOPQRSTUVWXYZ\\^_]/g, '');

type TermStatus = 'starting' | 'running' | 'stopped' | 'error';

export default function TerminalPanel() {
  const [lines, setLines] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<TermStatus>('starting');
  const [errMsg, setErrMsg] = useState('');
  const [histIdx, setHistIdx] = useState(-1);

  const ptyIdRef = useRef<string | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const histRef = useRef<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Spawn shell ──────────────────────────────────────────────────────────────
  const spawnShell = useCallback(async () => {
    setStatus('starting');
    setErrMsg('');

    const eventId = `pty-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      // Register event listener before spawning to avoid dropping early output
      const { listen } = await import('@tauri-apps/api/event');
      const unlisten = await listen<string>(eventId, (ev) => {
        if (ev.payload === '__DONE__') {
          setStatus('stopped');
          setLines(prev => [...prev, '[Process exited]']);
          return;
        }
        const clean = stripAnsi(ev.payload);
        setLines(prev => [...prev, clean]);
      });
      unlistenRef.current = unlisten;

      const ptyId = await ptySpawn(SHELL_PROGRAM, SHELL_ARGS, 40, 120, eventId);
      ptyIdRef.current = ptyId;
      setStatus('running');
      inputRef.current?.focus();
    } catch (err) {
      setStatus('error');
      setErrMsg(String(err));
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    }
  }, []);

  // ── Mount / unmount ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTauriApp()) return;
    spawnShell();

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
      if (ptyIdRef.current) {
        ptyKill(ptyIdRef.current).catch(() => {});
        ptyIdRef.current = null;
      }
    };
  }, [spawnShell]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [lines]);

  // ── Send a line ──────────────────────────────────────────────────────────────
  const sendLine = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed || status !== 'running' || !ptyIdRef.current) return;

    if (trimmed === 'clear') {
      setLines([]);
      setInput('');
      setHistIdx(-1);
      return;
    }

    histRef.current = [trimmed, ...histRef.current.filter(c => c !== trimmed)].slice(0, HISTORY_LIMIT);
    ptyWrite(ptyIdRef.current, trimmed + '\n').catch(() => {});
    setInput('');
    setHistIdx(-1);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendLine(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const hist = histRef.current;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (hist.length === 0) return;
      const next = Math.min(histIdx + 1, hist.length - 1);
      setHistIdx(next);
      setInput(hist[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx <= 0) { setHistIdx(-1); setInput(''); }
      else { const next = histIdx - 1; setHistIdx(next); setInput(hist[next]); }
    }
  };

  // ── Restart ──────────────────────────────────────────────────────────────────
  const handleRestart = async () => {
    if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
    if (ptyIdRef.current) { ptyKill(ptyIdRef.current).catch(() => {}); ptyIdRef.current = null; }
    setLines([]);
    spawnShell();
  };

  // ── Browser-only fallback ────────────────────────────────────────────────────
  if (!isTauriApp()) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--bg0)' }}>
        <div style={{ textAlign: 'center' }}>
          <Terminal size={32} style={{ color: 'var(--text-tertiary)', marginBottom: 12 }} />
          <span className="badge badge-info" style={{ fontSize: 13, padding: '6px 16px' }}>
            Terminal only available in desktop mode
          </span>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
            Run <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--term-green)' }}>npm run tauri dev</code> to enable the terminal.
          </div>
        </div>
      </div>
    );
  }

  const dotClass = status === 'running' ? 'dot-green' : status === 'error' ? 'dot-red' : 'dot-dim';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg0)' }}>

      {/* ── Header bar ─────────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg1)',
        display: 'flex', alignItems: 'center', gap: 8,
        flexShrink: 0,
      }}>
        <Terminal size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>Terminal</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
          {SHELL_PROGRAM}
        </span>
        <span className={`dot ${dotClass}`} style={{ marginLeft: 2 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
          {status === 'starting' ? 'starting…' : status === 'running' ? 'running' : status === 'stopped' ? 'exited' : 'error'}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => setLines([])}
            title="Clear output"
          >
            <Trash2 size={13} />
          </button>
          <button
            className="btn btn-ghost btn-sm btn-icon"
            onClick={handleRestart}
            title="Kill and restart shell"
          >
            <RefreshCw size={13} />
          </button>
          {status === 'stopped' || status === 'error' ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleRestart}
              style={{ fontSize: 11, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              <RefreshCw size={11} /> Restart
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Output area ────────────────────────────────────────────────────── */}
      <div
        className="terminal-body"
        style={{
          flex: 1,
          overflowY: 'auto',
          maxHeight: 'none',
          padding: '12px 16px',
          color: 'var(--term-green)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: 1.6,
          cursor: 'text',
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {status === 'starting' && (
          <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Starting {SHELL_PROGRAM}…</div>
        )}
        {status === 'error' && (
          <div style={{ color: 'var(--accent-red)', marginBottom: 6 }}>
            Failed to start shell: {errMsg}
          </div>
        )}
        {lines.map((line, i) => (
          <div key={i} className="term-line">
            <span className="term-out" style={{ color: 'var(--term-green)' }}>{line || ' '}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ──────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--bg1)',
          padding: '8px 12px',
          display: 'flex', alignItems: 'center', gap: 8,
          flexShrink: 0,
        }}
      >
        <span style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', fontSize: 14, flexShrink: 0, userSelect: 'none' }}>
          ❯
        </span>
        <input
          ref={inputRef}
          className="input-field"
          value={input}
          onChange={e => { setInput(e.target.value); setHistIdx(-1); }}
          onKeyDown={handleKeyDown}
          placeholder={
            status === 'running' ? 'Type a command…  ↑↓ history' :
            status === 'starting' ? 'Starting shell…' :
            'Shell stopped — click Restart'
          }
          disabled={status !== 'running'}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13, background: 'var(--bg0)', border: '1px solid var(--border)' }}
        />
        <button
          type="submit"
          className="btn btn-ghost btn-sm btn-icon"
          disabled={status !== 'running' || !input.trim()}
          title="Send"
        >
          <Send size={13} />
        </button>
        {status === 'running' && input && (
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            onClick={() => { setInput(''); setHistIdx(-1); }}
            title="Clear input"
          >
            <X size={13} />
          </button>
        )}
      </form>
    </div>
  );
}
