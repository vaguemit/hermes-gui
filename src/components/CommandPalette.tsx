import React, { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useStore } from '../store';
import { SLASH_COMMANDS } from '../data/hermesCatalog';

const CATEGORY_COLORS: Record<string, string> = {
  Session: 'var(--accent-green)',
  Config: 'var(--accent-blue)',
  Tools: 'var(--accent-green)',
  Skills: 'var(--accent-amber-dim)',
  Gateway: 'var(--accent-amber)',
  Info: 'var(--text-secondary)',
  Exit: 'var(--accent-red)',
};

export default function CommandPalette() {
  const { paletteOpen, setPaletteOpen, paletteQuery, setPaletteQuery } = useStore();
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const query = paletteQuery.toLowerCase();
  const filtered = query
    ? SLASH_COMMANDS.filter((c) => c.cmd.includes(query) || c.desc.toLowerCase().includes(query) || c.category.toLowerCase().includes(query))
    : SLASH_COMMANDS;

  useEffect(() => {
    if (paletteOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelected(0);
    }
  }, [paletteOpen]);

  useEffect(() => {
    setSelected(0);
  }, [paletteQuery]);

  const select = (cmd: string) => {
    const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement | null;
    if (chatInput) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      nativeInputValueSetter?.call(chatInput, `${cmd} `);
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      chatInput.focus();
    }
    setPaletteOpen(false);
    setPaletteQuery('');
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    }
    if (e.key === 'Enter' && filtered[selected]) select(filtered[selected].cmd);
    if (e.key === 'Escape') {
      setPaletteOpen(false);
      setPaletteQuery('');
    }
  };

  if (!paletteOpen) return null;

  return (
    <div className="palette-overlay" onClick={() => { setPaletteOpen(false); setPaletteQuery(''); }}>
      <div
        className="animate-in"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 620, background: 'var(--bg2)', border: '1px solid var(--border-active)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(124,106,247,0.1)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <Search size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            id="palette-input"
            value={paletteQuery}
            onChange={(e) => setPaletteQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search slash commands..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 14.5 }}
          />
          <kbd style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 11, color: 'var(--text-secondary)' }}>Esc</kbd>
        </div>

        <div style={{ maxHeight: 420, overflowY: 'auto', padding: 6 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>No commands match</div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.cmd}
                onClick={() => select(item.cmd)}
                onMouseEnter={() => setSelected(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  background: idx === selected ? 'var(--bg2)' : 'transparent',
                  transition: 'background 0.12s',
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: CATEGORY_COLORS[item.category] || 'var(--accent-green)', minWidth: 142 }}>{item.cmd}</span>
                <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-secondary)' }}>{item.desc}</span>
                <span className="badge badge-muted" style={{ fontSize: 10, flexShrink: 0 }}>{item.category}</span>
              </button>
            ))
          )}
        </div>

        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-secondary)' }}>
          <span><kbd style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>Up/Down</kbd> Navigate</span>
          <span><kbd style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>Enter</kbd> Select</span>
          <span><kbd style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px' }}>Esc</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
