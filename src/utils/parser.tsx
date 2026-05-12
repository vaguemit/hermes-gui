import React from 'react';

// Detect message type from content
export function detectMessageType(content: string): 'tool_call' | 'tool_output' | 'error' | 'reasoning' | 'info' | 'prose' {
  if (content.match(/^\[tool:/i) || content.match(/^Tool:/i)) return 'tool_call';
  if (content.match(/^Tool output:/i)) return 'tool_output';
  if (content.match(/\bERROR\b/) || content.match(/^Error:/i)) return 'error';
  if (content.match(/<think>|<\/think>|^Thinking:/i)) return 'reasoning';
  if (content.match(/^\[INFO\]|\[system\]/i) || content.match(/^\[SYSTEM\]/i)) return 'info';
  return 'prose';
}

// Simple markdown-to-HTML renderer (no external dep)
export function renderMarkdown(text: string): React.ReactElement {
  const lines = text.split('\n');
  const elements: React.ReactElement[] = [];
  let codeBuffer: string[] = [];
  let inCode = false;
  let codeLang = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCode) {
        elements.push(
          <pre key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px', overflowX: 'auto', margin: '10px 0' }}>
            <code style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: 'var(--text-primary)' }}>
              {codeBuffer.join('\n')}
            </code>
          </pre>
        );
        codeBuffer = [];
        inCode = false;
      } else {
        codeLang = line.slice(3).trim();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} style={{ fontSize: 18, fontWeight: 700, margin: '12px 0 6px', color: 'var(--text-primary)' }}>{line.slice(2)}</h1>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} style={{ fontSize: 15, fontWeight: 600, margin: '10px 0 4px', color: 'var(--text-primary)' }}>{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} style={{ fontSize: 13.5, fontWeight: 600, margin: '8px 0 4px', color: 'var(--text-secondary)' }}>{line.slice(4)}</h3>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(<li key={i} style={{ marginLeft: 18, marginBottom: 3, color: 'var(--text-primary)' }}>{inlineFormat(line.slice(2))}</li>);
    } else if (line.match(/^\d+\. /)) {
      elements.push(<li key={i} style={{ marginLeft: 18, marginBottom: 3, listStyleType: 'decimal', color: 'var(--text-primary)' }}>{inlineFormat(line.replace(/^\d+\. /, ''))}</li>);
    } else if (line.trim() === '') {
      elements.push(<br key={i} />);
    } else {
      elements.push(<p key={i} style={{ margin: '3px 0', color: 'var(--text-primary)', lineHeight: 1.75 }}>{inlineFormat(line)}</p>);
    }
  }

  return <div className="message-prose">{elements}</div>;
}

function inlineFormat(text: string): React.ReactNode {
  // Handle **bold**, *italic*, `code`
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const italicMatch = remaining.match(/\*(.+?)\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);

    const candidates = [
      boldMatch && { idx: boldMatch.index!, len: boldMatch[0].length, node: <strong key={key++} style={{ fontWeight: 700 }}>{boldMatch[1]}</strong> },
      italicMatch && { idx: italicMatch.index!, len: italicMatch[0].length, node: <em key={key++}>{italicMatch[1]}</em> },
      codeMatch && { idx: codeMatch.index!, len: codeMatch[0].length, node: <code key={key++} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace', fontSize: 12, color: 'var(--accent)' }}>{codeMatch[1]}</code> },
    ].filter(Boolean) as Array<{ idx: number; len: number; node: React.ReactNode }>;

    if (candidates.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = candidates.reduce((a, b) => (a.idx < b.idx ? a : b));

    if (first.idx > 0) {
      parts.push(remaining.slice(0, first.idx));
    }
    parts.push(first.node);
    remaining = remaining.slice(first.idx + first.len);
  }

  return parts;
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString();
}
