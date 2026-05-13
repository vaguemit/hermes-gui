import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Square, Terminal } from 'lucide-react';
import { ptySpawn, ptyWrite, ptyKill, isTauriApp } from '../api/desktop';

export interface PtyTerminalProps {
  program: string;
  args: string[];
  autoStart?: boolean;
  onDone?: () => void;
  height?: number;
}

interface TermLine {
  id: number;
  text: string;
}

let lineCounter = 0;

const listenToEvent = async (
  eventId: string,
  cb: (line: string) => void,
): Promise<() => void> => {
  if (!isTauriApp()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<string>(eventId, (ev) => cb(ev.payload));
  return unlisten;
};

export default function PtyTerminal({
  program,
  args,
  autoStart = false,
  onDone,
  height = 300,
}: PtyTerminalProps) {
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(false);
  const [lines, setLines] = useState<TermLine[]>([]);
  const [inputText, setInputText] = useState('');
  const [ptyId, setPtyId] = useState<string | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const ptyIdRef = useRef<string | null>(null);

  const appendLine = useCallback((text: string) => {
    setLines((prev) => [...prev, { id: lineCounter++, text }]);
    // Auto-scroll
    setTimeout(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
      }
    }, 0);
  }, []);

  const spawnPty = useCallback(async () => {
    if (!isTauriApp()) return;
    const eventId = `pty-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const unlisten = await listenToEvent(eventId, (line) => {
      if (line === '__DONE__' || line === '__EXIT__') {
        setDone(true);
        onDone?.();
        return;
      }
      appendLine(line);
    });
    unlistenRef.current = unlisten;

    try {
      const id = await ptySpawn(program, args, 24, 80, eventId);
      ptyIdRef.current = id;
      setPtyId(id);
      setStarted(true);
    } catch (err) {
      appendLine(`[error] Failed to start: ${String(err)}`);
    }
  }, [program, args, onDone, appendLine]);

  // Auto-start on mount
  useEffect(() => {
    if (autoStart) {
      spawnPty();
    }
    return () => {
      // Clean up listener on unmount
      unlistenRef.current?.();
    };
  }, []); // intentionally empty deps — run once on mount

  const handleStart = () => {
    if (started) return;
    setDone(false);
    setLines([]);
    spawnPty();
  };

  const handleKill = async () => {
    if (ptyIdRef.current) {
      await ptyKill(ptyIdRef.current);
    }
    setDone(true);
    setStarted(false);
    setPtyId(null);
    ptyIdRef.current = null;
    unlistenRef.current?.();
    unlistenRef.current = null;
  };

  const handleSendInput = async () => {
    if (!ptyIdRef.current || done || !inputText) return;
    await ptyWrite(ptyIdRef.current, inputText + '\n');
    appendLine(`▸ ${inputText}`);
    setInputText('');
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendInput();
    }
  };

  if (!isTauriApp()) {
    return (
      <div className="terminal" style={{ height }}>
        <div className="terminal-bar">
          <div className="terminal-dot" style={{ background: '#ff5f57' }} />
          <div className="terminal-dot" style={{ background: '#ffbd2e' }} />
          <div className="terminal-dot" style={{ background: '#28ca41' }} />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
            terminal
          </span>
        </div>
        <div className="terminal-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: height - 40, maxHeight: 'none', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12, gap: 8 }}>
          <Terminal size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          Terminal is only available in the desktop app.
        </div>
      </div>
    );
  }

  return (
    <div className="terminal" style={{ height, display: 'flex', flexDirection: 'column' }}>
      {/* Terminal bar */}
      <div className="terminal-bar" style={{ justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="terminal-dot" style={{ background: '#ff5f57' }} />
          <div className="terminal-dot" style={{ background: '#ffbd2e' }} />
          <div className="terminal-dot" style={{ background: '#28ca41' }} />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginLeft: 4 }}>
            {program} {args.join(' ')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {!started && !done && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleStart}
              style={{ fontSize: 11, padding: '3px 10px' }}
            >
              Start
            </button>
          )}
          {done && (
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              [exited]
            </span>
          )}
          {started && !done && (
            <button
              className="btn btn-danger btn-sm"
              onClick={handleKill}
              style={{ fontSize: 11, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Square size={10} />
              Kill
            </button>
          )}
        </div>
      </div>

      {/* Terminal body */}
      <div
        ref={bodyRef}
        className="terminal-body"
        style={{ flex: 1, maxHeight: 'none', overflowY: 'auto', paddingBottom: 8 }}
      >
        {lines.length === 0 && !started && (
          <div className="term-line">
            <span className="term-out">Press Start to launch the process.</span>
          </div>
        )}
        {lines.map((line) => (
          <div key={line.id} className="term-line">
            <span className={
              line.text.startsWith('[error]') ? 'term-err'
              : line.text.startsWith('[warn]') ? 'term-warn'
              : line.text.startsWith('▸') ? 'term-cmd'
              : 'term-out'
            }>
              {line.text}
            </span>
          </div>
        ))}
        {started && !done && (
          <div className="term-line">
            <span className="term-prompt">$</span>
            <span className="term-cmd typing-cursor" />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        borderTop: '1px solid var(--border)',
        background: 'var(--bg1)',
        flexShrink: 0,
      }}>
        <span style={{
          padding: '0 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-tertiary)',
          userSelect: 'none',
        }}>
          $
        </span>
        <input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleInputKeyDown}
          disabled={!started || done}
          placeholder={done ? 'Process exited' : started ? 'Enter command…' : 'Start the process first'}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-primary)',
            padding: '8px 0 8px 0',
          }}
        />
        <button
          onClick={handleSendInput}
          disabled={!started || done || !inputText.trim()}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: started && !done && inputText.trim() ? 'pointer' : 'default',
            padding: '0 12px',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: started && !done && inputText.trim() ? 'var(--accent-green)' : 'var(--text-tertiary)',
            transition: 'color 0.15s',
          }}
        >
          ↵
        </button>
      </div>
    </div>
  );
}
