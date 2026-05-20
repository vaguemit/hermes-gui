import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Brain, RefreshCw, Save } from 'lucide-react';
import { useHermesClient } from '../lib/hermes';

const DEFAULT_SOUL = `You are Hermes, a helpful AI assistant with access to tools for browsing the web, running code, and managing files.

Be concise, accurate, and helpful. When unsure, say so. When you make mistakes, acknowledge and correct them.

Always think step by step for complex tasks.`;

export default function SoulPanel() {
  const client = useHermesClient();
  const [content, setContent] = useState('');
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    client.readFile('soul.md')
      .then((text) => setContent(text))
      .catch(() => setContent(DEFAULT_SOUL))
      .finally(() => setLoading(false));
  }, []);

  const triggerSave = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      client.writeFile('soul.md', text)
        .then(() => {
          setSavedIndicator(true);
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(() => setSavedIndicator(false), 2000);
        })
        .catch(() => {});
    }, 800);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setContent(next);
    triggerSave(next);
  };

  const handleReset = () => {
    setContent(DEFAULT_SOUL);
    triggerSave(DEFAULT_SOUL);
  };

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
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>Your agent's personality and system prompt</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {savedIndicator && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                <Save size={12} />
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
            placeholder="Write your agent's system prompt here..."
            spellCheck={false}
            style={{
              flex: 1,
              width: '100%',
              resize: 'none',
              background: 'var(--bg1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 13.5,
              lineHeight: 1.7,
              padding: '16px 18px',
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
      <div style={{ padding: '10px 24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
          {content.length.toLocaleString()} chars
        </span>
      </div>
    </div>
  );
}
