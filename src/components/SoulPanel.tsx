import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Brain, RefreshCw, Check } from 'lucide-react';
import { useHermesClient } from '../lib/hermes';

const DEFAULT_SOUL = `You are Hermes, a helpful AI assistant with access to tools for browsing the web, running code, and managing files.

Be concise, accurate, and helpful. When unsure, say so. When you make mistakes, acknowledge and correct them.

Always think step by step for complex tasks.`;

export default function SoulPanel() {
  const client = useHermesClient();
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const loaded = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    client.readFile('soul.md')
      .then((text) => {
        setContent(text);
        loaded.current = true;
      })
      .catch(() => {
        setContent(DEFAULT_SOUL);
        loaded.current = true;
      })
      .finally(() => setLoading(false));
  }, [client]);

  // Cleanup debounce timer on unmount
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!loaded.current) return;
    const next = e.target.value;
    setContent(next);
    setSaved(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      client.writeFile('soul.md', next)
        .then(() => {
          setSaved(true);
          if (savedTimer.current) clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(() => setSaved(false), 2000);
        })
        .catch(() => {});
    }, 500);
  }, [client]);

  const handleReset = useCallback(async () => {
    if (!window.confirm('Reset soul to default? Your customization will be lost.')) return;

    try {
      await client.runHermesCommand(['soul', 'reset']);
    } catch {
      // fallback: write empty / default and save
      await client.writeFile('soul.md', DEFAULT_SOUL).catch(() => {});
    }

    // Reload from disk after reset
    try {
      const text = await client.readFile('soul.md');
      setContent(text);
    } catch {
      setContent(DEFAULT_SOUL);
    }

    setSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 2000);
  }, [client]);

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--bg0)' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: 'var(--bg3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Brain size={17} style={{ color: 'var(--accent-green)' }} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.2 }}>Soul</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Agent personality and system prompt</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {saved && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                <Check size={12} />
                Saved
              </div>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleReset}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              title="Reset to default"
            >
              <RefreshCw size={13} />
              Reset to default
            </button>
          </div>
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 24px 0' }}>
        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            Loading...
          </div>
        ) : (
          <textarea
            value={content}
            onChange={handleChange}
            placeholder="Define your agent's personality, goals, and behavior..."
            spellCheck={false}
            style={{
              flex: 1,
              width: '100%',
              minHeight: 300,
              resize: 'vertical',
              background: 'var(--bg1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              lineHeight: 1.7,
              padding: '12px',
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-active)'; }}
            onBlur={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
          />
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '10px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          {content.length.toLocaleString()} characters
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
          Changes save automatically
        </span>
      </div>
    </div>
  );
}
