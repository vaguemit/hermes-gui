import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { Search, Command } from 'lucide-react';

const SLASH_COMMANDS = [
  { cmd: '/new', desc: 'Start a fresh conversation', category: 'Session' },
  { cmd: '/reset', desc: 'Clear conversation (same as /new)', category: 'Session' },
  { cmd: '/model', desc: 'Switch the active LLM — /model openrouter:claude-3.5-sonnet', category: 'Config' },
  { cmd: '/personality', desc: 'Change Hermes personality — /personality default', category: 'Config' },
  { cmd: '/retry', desc: 'Re-run the last turn', category: 'Session' },
  { cmd: '/undo', desc: 'Remove the last exchange', category: 'Session' },
  { cmd: '/compress', desc: 'Compress context to save tokens', category: 'Context' },
  { cmd: '/usage', desc: 'Show token usage for this session', category: 'Context' },
  { cmd: '/insights', desc: 'Usage and memory insights — /insights --days 7', category: 'Context' },
  { cmd: '/skills', desc: 'Browse available skills', category: 'Skills' },
  { cmd: '/stop', desc: 'Interrupt current agent work', category: 'Session' },
  { cmd: '/platforms', desc: 'Show connected messaging platforms', category: 'Gateway' },
  { cmd: '/status', desc: 'Gateway status', category: 'Gateway' },
  { cmd: '/sethome', desc: 'Set home platform', category: 'Gateway' },
  { cmd: '/summarize', desc: 'Summarize provided text or URL (skill)', category: 'Skills' },
  { cmd: '/code-review', desc: 'Review code for bugs and style (skill)', category: 'Skills' },
  { cmd: '/translate', desc: 'Translate text to any language (skill)', category: 'Skills' },
];

const CATEGORY_COLORS: Record<string, string> = {
  Session: 'var(--accent)',
  Config: 'var(--tool-blue)',
  Context: 'var(--success)',
  Skills: 'var(--reasoning)',
  Gateway: 'var(--warning)',
};

export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen, paletteQuery, setPaletteQuery } = useStore();
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = paletteQuery
    ? SLASH_COMMANDS.filter((c) => c.cmd.includes(paletteQuery.toLowerCase()) || c.desc.toLowerCase().includes(paletteQuery.toLowerCase()) || c.category.toLowerCase().includes(paletteQuery.toLowerCase()))
    : SLASH_COMMANDS;

  useEffect(() => {
    if (paletteOpen) { setTimeout(() => inputRef.current?.focus(), 50); setSelected(0); }
  }, [paletteOpen]);

  useEffect(() => { setSelected(0); }, [paletteQuery]);

  const select = (cmd: string) => {
    // Fill chat input with selected command
    const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement | null;
    if (chatInput) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      nativeInputValueSetter?.call(chatInput, cmd + ' ');
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      chatInput.focus();
    }
    setPaletteOpen(false);
    setPaletteQuery('');
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && filtered[selected]) { select(filtered[selected].cmd); }
    if (e.key === 'Escape') { setPaletteOpen(false); setPaletteQuery(''); }
  };

  if (!paletteOpen) return null;

  return (
    <div className="palette-overlay" onClick={() => { setPaletteOpen(false); setPaletteQuery(''); }}>
      <div
        className="animate-in"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 560, background: 'var(--bg-elevated)', border: '1px solid var(--border-bright)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,106,247,0.1)' }}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            id="palette-input"
            value={paletteQuery}
            onChange={(e) => setPaletteQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search slash commands…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 14.5 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 11 }}>
            <kbd style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>Esc</kbd>
          </div>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No commands match</div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.cmd}
                onClick={() => select(item.cmd)}
                onMouseEnter={() => setSelected(idx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '9px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: idx === selected ? 'var(--bg-hover)' : 'transparent',
                  transition: 'background 0.12s',
                }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: CATEGORY_COLORS[item.category] || 'var(--accent)', minWidth: 140 }}>{item.cmd}</span>
                <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-secondary)' }}>{item.desc}</span>
                <span className="badge badge-muted" style={{ fontSize: 10, flexShrink: 0 }}>{item.category}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)' }}>
          <span><kbd style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>↑↓</kbd> Navigate</span>
          <span><kbd style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>↵</kbd> Select</span>
          <span><kbd style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
