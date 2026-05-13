import React, { useState } from 'react';
import { useStore } from '../store';
import { X, Search, Cpu, ChevronRight } from 'lucide-react';

const PROVIDERS = [
  {
    name: 'OpenRouter',
    models: ['openrouter:claude-3.5-sonnet', 'openrouter:claude-3-opus', 'openrouter:gpt-4o', 'openrouter:gemini-flash-1.5', 'openrouter:deepseek-r1', 'openrouter:llama-3.3-70b'],
  },
  {
    name: 'OpenAI',
    models: ['openai:gpt-4o', 'openai:gpt-4o-mini', 'openai:o1', 'openai:o3-mini'],
  },
  {
    name: 'Nous Portal',
    models: ['nous:hermes-3-llama-3.1-70b', 'nous:hermes-3-mistral-7b'],
  },
  {
    name: 'NVIDIA NIM',
    models: ['nvidia:llama3-70b-instruct', 'nvidia:mistral-7b-instruct'],
  },
  {
    name: 'Custom',
    models: ['custom:endpoint'],
  },
];

export default function ModelSwitcher() {
  const { modelSwitcherOpen, setModelSwitcherOpen, activeModel, setActiveModel } = useStore();
  const [search, setSearch] = useState('');

  if (!modelSwitcherOpen) return null;

  const filtered = PROVIDERS.map((p) => ({
    ...p,
    models: p.models.filter((m) => m.toLowerCase().includes(search.toLowerCase()) || p.name.toLowerCase().includes(search.toLowerCase())),
  })).filter((p) => p.models.length > 0);

  const select = (model: string) => {
    setActiveModel(model);
    setModelSwitcherOpen(false);
    setSearch('');
  };

  return (
    <div className="palette-overlay" onClick={() => { setModelSwitcherOpen(false); setSearch(''); }}>
      <div
        className="animate-in"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 480, background: 'var(--bg2)', border: '1px solid var(--border-active)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Cpu size={16} style={{ color: 'var(--accent-green)' }} />
          <span style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>Switch Model</span>
          <button onClick={() => setModelSwitcherOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <Search size={14} style={{ color: 'var(--text-secondary)' }} />
          <input
            autoFocus
            id="model-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13.5 }}
          />
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', padding: 8 }}>
          {filtered.map((provider) => (
            <div key={provider.name} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '4px 8px' }}>{provider.name}</div>
              {provider.models.map((model) => (
                <button
                  key={model}
                  onClick={() => select(model)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', borderRadius: 7, border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: model === activeModel ? 'var(--accent-dim)' : 'transparent',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (model !== activeModel) (e.currentTarget as HTMLElement).style.background = 'var(--bg2)'; }}
                  onMouseLeave={e => { if (model !== activeModel) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: 12.5, color: model === activeModel ? 'var(--accent-green)' : 'var(--text-primary)', flex: 1 }}>{model}</span>
                  {model === activeModel && <span className="badge badge-accent">Active</span>}
                </button>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>No models match</div>
          )}
        </div>
      </div>
    </div>
  );
}
