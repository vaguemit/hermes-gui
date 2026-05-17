import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[A-Za-z]/g, '');

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<PtySession | null>(null);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const start = async () => {
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
        unlistenFn = unlisten;
      } catch (err) {
        setStatus('error');
        setErrorMsg(String(err));
      }
    };

    start();

    return () => {
      if (unlistenFn) unlistenFn();
      if (sessionRef.current) {
        invoke('hermes_pty_stop', { pty_id: sessionRef.current.ptyId }).catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [lines]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !sessionRef.current || status !== 'running') return;
    invoke('hermes_pty_write', { pty_id: sessionRef.current.ptyId, input: trimmed }).catch(console.error);
    setInput('');
  };

  const dotClass = status === 'running' ? 'dot-green' : status === 'error' ? 'dot-red' : 'dot-dim';
  const statusLabel = status === 'starting' ? 'Starting hermes…' : status === 'running' ? 'hermes terminal' : status === 'stopped' ? 'Process exited' : 'Error';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg0)' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg1)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span className={`dot ${dotClass}`} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{statusLabel}</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--term-green)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.55 }}>
        {status === 'error' && (
          <div style={{ color: 'var(--accent-red)', marginBottom: 8 }}>Failed to start hermes: {errorMsg}</div>
        )}
        {lines.map((line, i) => (
          <div key={i}>{line || ' '}</div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ borderTop: '1px solid var(--border)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg1)', flexShrink: 0 }}
      >
        <span style={{ color: 'var(--accent-green)', fontFamily: 'var(--font-mono)', fontSize: 14, flexShrink: 0 }}>❯</span>
        <input
          className="input-field"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={status === 'running' ? 'Type a message or /command…' : ''}
          disabled={status !== 'running'}
          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13 }}
          autoFocus
        />
      </form>
    </div>
  );
}
