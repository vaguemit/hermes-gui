import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore, Message, ToolCall } from '../store';
import { chatStream, chatCli, launchChrome } from '../api/desktop';
import { useHermesClient } from '../lib/hermes';
import { renderMarkdown, formatTimestamp } from '../utils/parser';
import {
  Send, Square, Paperclip, Copy, Check, MessageSquare,
  ChevronDown, ChevronRight, AlertTriangle, X,
  Brain, Terminal, CheckCircle2, XCircle, Loader2, Download, Zap,
  Edit2, RefreshCw
} from 'lucide-react';

const generateId = () => Math.random().toString(36).slice(2);

function ToolCallCard({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(true);
  const statusIcon = {
    pending: <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-secondary)' }} />,
    running: <Loader2 size={12} style={{ color: 'var(--accent-blue)', animation: 'spin 1s linear infinite' }} />,
    done: <CheckCircle2 size={12} style={{ color: 'var(--accent-green)' }} />,
    error: <XCircle size={12} style={{ color: 'var(--accent-red)' }} />,
  }[tc.status];

  return (
    <div className="tool-card my-2 animate-in">
      <button onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent-blue)' }}>
        <Terminal size={13} />
        <span style={{ fontWeight: 600, fontSize: 12, fontFamily: 'var(--font-mono)' }}>{tc.name}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {statusIcon}
          {expanded ? <ChevronDown size={12} style={{ color: 'var(--text-secondary)' }} /> : <ChevronRight size={12} style={{ color: 'var(--text-secondary)' }} />}
        </span>
      </button>
      {expanded && tc.input && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Input</div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{tc.input.slice(0, 300)}</pre>
          {tc.output && (
            <>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Output</div>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-primary)' }}>{tc.output.slice(0, 400)}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ReasoningBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const clean = content.replace(/<think>|<\/think>|^Thinking:\s*/gi, '').trim();
  return (
    <div className="reasoning-block my-2 animate-in">
      <button onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent-amber-dim)' }}>
        <Brain size={13} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>Reasoning trace</span>
        <span style={{ marginLeft: 'auto' }}>{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
      </button>
      {expanded && <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.65 }}>{clean}</div>}
    </div>
  );
}

interface MessageBubbleProps {
  msg: Message;
  isHovered: boolean;
  isEditing: boolean;
  editingContent: string;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onEditStart: () => void;
  onEditChange: (v: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
}

function MessageBubble({ msg, isHovered, isEditing, editingContent, onHoverEnter, onHoverLeave, onEditStart, onEditChange, onEditSave, onEditCancel }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Inject copy buttons into code blocks after render / on content change
  useEffect(() => {
    if (!contentRef.current) return;
    contentRef.current.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.code-copy-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'code-copy-btn';
      btn.textContent = 'Copy';
      btn.style.cssText = 'position:absolute;top:6px;right:8px;font-size:11px;padding:2px 8px;background:var(--bg3);color:var(--text-secondary);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-family:var(--font-mono);transition:color 0.15s';
      btn.onclick = () => {
        const code = pre.querySelector('code')?.innerText ?? pre.innerText;
        navigator.clipboard.writeText(code);
        btn.textContent = 'Copied!';
        btn.style.color = 'var(--accent-green)';
        setTimeout(() => { btn.textContent = 'Copy'; btn.style.color = 'var(--text-secondary)'; }, 1500);
      };
      pre.style.position = 'relative';
      pre.appendChild(btn);
    });
  }, [msg.content]);

  // Auto-resize + focus the edit textarea when editing begins
  useEffect(() => {
    if (isEditing && editTextareaRef.current) {
      const ta = editTextareaRef.current;
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, [isEditing]);

  if (msg.type === 'reasoning') return <ReasoningBlock content={msg.content} />;
  if (msg.type === 'error') return (
    <div className="animate-in" style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-start' }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <AlertTriangle size={14} style={{ color: 'var(--accent-red)' }} />
      </div>
      <div style={{ flex: 1, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px' }}>
        <span style={{ color: 'var(--accent-red)', fontSize: 13 }}>{msg.content}</span>
      </div>
    </div>
  );
  if (msg.type === 'info' || msg.type === 'system') return (
    <div className="animate-in" style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 100, padding: '3px 12px' }}>{msg.content}</span>
    </div>
  );

  const isUser = msg.role === 'user';
  const canEdit = isUser && msg.type === 'prose';

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="animate-in" onMouseEnter={onHoverEnter} onMouseLeave={onHoverLeave} style={{ display: 'flex', gap: 12, marginBottom: 18, flexDirection: isUser ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, background: isUser ? 'linear-gradient(135deg, #7c6af7, #3b9eff)' : 'linear-gradient(135deg, #1a1d26, #20242f)', border: isUser ? 'none' : '1px solid var(--border)', color: 'white' }}>
        {isUser ? 'U' : 'H'}
      </div>
      <div style={{ flex: 1, maxWidth: isUser ? '75%' : '100%', position: 'relative' }}>
        {/* Top-right hover action buttons (edit + copy) */}
        {!msg.isStreaming && isHovered && !isEditing && (
          <div style={{ position: 'absolute', top: isUser ? 6 : 0, right: isUser ? 6 : 0, zIndex: 10, display: 'flex', gap: 4 }}>
            {canEdit && (
              <button
                onClick={onEditStart}
                title="Edit message"
                style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--text-tertiary)', transition: 'color 0.15s' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}
              >
                <Edit2 size={12} />
              </button>
            )}
            <button
              onClick={handleCopyMessage}
              title="Copy message"
              style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: copied ? 'var(--accent-green)' : 'var(--text-tertiary)', transition: 'color 0.15s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = copied ? 'var(--accent-green)' : 'var(--text-primary)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = copied ? 'var(--accent-green)' : 'var(--text-tertiary)'; }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        )}

        {/* Edit mode: textarea + Save/Cancel */}
        {isEditing && canEdit ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              ref={editTextareaRef}
              value={editingContent}
              onChange={(e) => {
                onEditChange(e.target.value);
                const ta = e.target;
                ta.style.height = 'auto';
                ta.style.height = ta.scrollHeight + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.preventDefault(); onEditCancel(); }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onEditSave(); }
              }}
              style={{ width: '100%', background: 'var(--bg2)', border: '1px solid var(--border-active)', borderRadius: 10, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6, resize: 'none', outline: 'none', fontFamily: 'var(--font-sans)', minHeight: 60, overflowY: 'hidden', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={onEditCancel} className="btn btn-ghost btn-sm">Cancel</button>
              <button onClick={onEditSave} className="btn btn-primary btn-sm" disabled={!editingContent.trim()}>Save &amp; Resend</button>
            </div>
          </div>
        ) : (
          <>
            <div ref={contentRef} style={{ background: isUser ? 'linear-gradient(135deg, rgba(124,106,247,0.2), rgba(59,158,255,0.12))' : 'transparent', border: isUser ? '1px solid rgba(124,106,247,0.3)' : 'none', borderRadius: isUser ? 12 : 0, padding: isUser ? '10px 14px' : 0 }}>
              {msg.isStreaming
                ? <div className="typing-cursor">{renderMarkdown(msg.content || '…')}</div>
                : renderMarkdown(msg.content)
              }
            </div>
            {msg.toolCalls?.map((tc) => <ToolCallCard key={tc.id} tc={tc} />)}
            {!isUser && !msg.isStreaming && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <button onClick={handleCopyMessage}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: copied ? 'var(--accent-green)' : 'var(--text-secondary)', fontSize: 11.5, cursor: 'pointer', padding: '3px 7px', borderRadius: 5, transition: 'color 0.15s' }}>
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                {isHovered && (
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatTimestamp(msg.timestamp)}</span>
                )}
              </div>
            )}
            {isUser && isHovered && !isEditing && (
              <div style={{ textAlign: 'right', marginTop: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{formatTimestamp(msg.timestamp)}</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function generateMarkdownExport(messages: Message[]): string {
  const header = `# Hermes Chat Export\n\nExported: ${new Date().toISOString()}\n\n---\n\n`;
  const lines: string[] = [header];
  for (const msg of messages) {
    const ts = msg.timestamp ? `\n\n*${formatTimestamp(msg.timestamp)}*` : '';
    if (msg.type === 'reasoning') {
      const clean = msg.content.replace(/<think>|<\/think>|^Thinking:\s*/gi, '').trim();
      lines.push(`## Reasoning\n\n> ${clean.replace(/\n/g, '\n> ')}${ts}\n\n`);
    } else if (msg.type === 'tool_call' || msg.type === 'tool_output') {
      const toolName = msg.toolCalls?.[0]?.name ?? 'Tool Call';
      lines.push(`## Tool: ${toolName}\n\n\`\`\`json\n${msg.content}\n\`\`\`${ts}\n\n`);
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          if (tc.input) lines.push(`**Input:**\n\`\`\`json\n${tc.input}\n\`\`\`\n\n`);
          if (tc.output) lines.push(`**Output:**\n\`\`\`json\n${tc.output}\n\`\`\`\n\n`);
        }
      }
    } else if (msg.type === 'prose' && (msg.role === 'user' || msg.role === 'assistant')) {
      const label = msg.role === 'user' ? 'User' : 'Assistant';
      lines.push(`## ${label}\n\n${msg.content}${ts}\n\n`);
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          lines.push(`### Tool: ${tc.name}\n\n`);
          if (tc.input) lines.push(`**Input:**\n\`\`\`json\n${tc.input}\n\`\`\`\n\n`);
          if (tc.output) lines.push(`**Output:**\n\`\`\`json\n${tc.output}\n\`\`\`\n\n`);
        }
      }
    }
  }
  return lines.join('');
}

function isUrl(s: string): boolean {
  const first = s.split(/\s/)[0];
  return /^https?:\/\//i.test(first) || /^www\./i.test(first) || /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(first);
}

function extractSiteUrl(instruction: string): string {
  const input = instruction.trim();
  if (!input) return '';
  const sites: Record<string, string> = {
    instagram: 'https://instagram.com',
    twitter: 'https://twitter.com',
    x: 'https://x.com',
    google: 'https://google.com',
    youtube: 'https://youtube.com',
    facebook: 'https://facebook.com',
    github: 'https://github.com',
    reddit: 'https://reddit.com',
    linkedin: 'https://linkedin.com',
    amazon: 'https://amazon.com',
    netflix: 'https://netflix.com',
    gmail: 'https://gmail.com',
    claude: 'https://claude.ai',
    chatgpt: 'https://chatgpt.com',
    openai: 'https://openai.com',
    wikipedia: 'https://wikipedia.org',
    stackoverflow: 'https://stackoverflow.com',
    whatsapp: 'https://web.whatsapp.com',
    notion: 'https://notion.so',
    figma: 'https://figma.com',
    spotify: 'https://open.spotify.com',
    maps: 'https://maps.google.com',
  };
  const lower = input.toLowerCase();
  for (const [name, url] of Object.entries(sites)) {
    if (lower.includes(name)) return url;
  }
  const domainMatch = input.match(/\b([a-zA-Z0-9-]+\.(com|org|net|io|ai|co|app|dev))\b/i);
  if (domainMatch) return `https://${domainMatch[1]}`;
  return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
}

export default function ConversationPanel() {
  const client = useHermesClient();
  const { sessions, activeSessionId, addMessage, updateLastMessage, activeModel, contextWindow, tokensUsed, setTokenUsage, agentState, setAgentState, clearToolCalls, addToolCall, updateToolCallGlobal, gatewayStatus, setGatewayStatus, clearActiveSession, setPaletteOpen, setActiveSection, setModelSwitcherOpen, hermesSessionId, setHermesSessionId, localBrowserUrl, setLocalBrowserUrl, setPtySessionId, setPtyEventId, addToast } = useStore();
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; content: string; size: number }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sentMessages = useRef<string[]>([]);
  const historyIndex = useRef<number>(-1);
  const [autoScroll, setAutoScroll] = useState(true);
  const [fastMode, setFastMode] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSession?.messages ?? [];

  useEffect(() => { if (autoScroll) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 50);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        if (!window.confirm('Clear conversation?')) return;
        clearActiveSession();
        clearToolCalls();
        setHermesSessionId(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearActiveSession, clearToolCalls, setHermesSessionId]);

  const handleStop = () => { abortRef.current?.abort(); setIsRunning(false); setAgentState('idle'); };

  const handleExport = () => {
    const md = generateMarkdownExport(messages);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hermes-session-${activeSession?.id.slice(0, 8) ?? Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (file.size > 500_000) { addToast(`${file.name} too large (max 500KB)`, 'error'); return; }
      const reader = new FileReader();
      reader.onload = ev => {
        setAttachedFiles(prev => [...prev, { name: file.name, content: ev.target?.result as string, size: file.size }]);
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

  // Core streaming send — called by sendMessage, edit save, and regenerate
  const sendContent = async (effectiveContent: string, historyOverride?: { role: string; content: string }[]) => {
    setAutoScroll(true);
    setIsRunning(true);
    setAgentState('thinking');
    clearToolCalls();

    addMessage({ id: generateId(), role: 'assistant', type: 'prose', content: '', timestamp: Date.now(), isStreaming: true });

    const currentMessages = useStore.getState().sessions.find(s => s.id === useStore.getState().activeSessionId)?.messages ?? [];
    const history = historyOverride ?? [
      ...currentMessages.filter(m => (m.role === 'user' || m.role === 'assistant') && m.type === 'prose').map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: effectiveContent },
    ];

    const eventId = Math.random().toString(36).slice(2);
    const cleanupRef = { fn: null as (() => void) | null };
    const cleanup = () => { if (cleanupRef.fn) { cleanupRef.fn(); cleanupRef.fn = null; } };
    let aborted = false;

    const abort = new AbortController();
    abortRef.current = { abort: () => { aborted = true; abort.abort(); cleanup(); setIsRunning(false); setAgentState('idle'); updateLastMessage({ isStreaming: false }); } };

    let accumulated = '';

    try {
      const { listen } = await import('@tauri-apps/api/event');

      await new Promise<void>((resolve, reject) => {
        Promise.all([
          listen<string>(`chat-chunk-${eventId}`, (ev) => {
            if (aborted) return;
            accumulated += ev.payload;
            updateLastMessage({ content: accumulated, isStreaming: true });
          }),
          listen<string>(`chat-done-${eventId}`, () => {
            if (aborted) return;
            useStore.getState().activeToolCalls.forEach((tc) => {
              updateToolCallGlobal(tc.id, { status: 'done' });
            });
            updateLastMessage({ isStreaming: false });
            setAgentState('idle');
            cleanup();
            resolve();
          }),
          listen<string>(`chat-error-${eventId}`, (ev) => {
            if (aborted) return;
            cleanup();
            reject(new Error(ev.payload || 'Unknown gateway error'));
          }),
          listen<string>(`tool-progress-${eventId}`, (ev) => {
            if (aborted) return;
            addToolCall({ id: generateId(), name: ev.payload, input: '', status: 'running', timestamp: Date.now() });
            setAgentState('running_tool');
          }),
          listen<string>(`tool-call-${eventId}`, (ev) => {
            if (aborted) return;
            if (ev.payload === '__executing__') { setAgentState('running_tool'); return; }
            addToolCall({ id: generateId(), name: ev.payload, input: '', status: 'running', timestamp: Date.now() });
            setAgentState('running_tool');
          }),
          listen<string>(`chat-session-${eventId}`, (ev) => {
            if (ev.payload && !aborted) setHermesSessionId(ev.payload);
          }),
        ]).then(([u1, u2, u3, u4, u5, u6]) => {
          cleanupRef.fn = () => { u1(); u2(); u3(); u4(); u5(); u6(); };

          if (localBrowserUrl) {
            chatCli(eventId, effectiveContent, hermesSessionId).catch(reject);
            return;
          }
          const isTuiSlashCommand = effectiveContent.startsWith('/') && !LOCAL_COMMANDS.has(effectiveContent.split(/\s+/)[0].toLowerCase());
          if (isTuiSlashCommand) {
            chatCli(eventId, effectiveContent, hermesSessionId).catch(reject);
          } else {
            chatStream(eventId, history, activeModel).catch(reject);
          }
        }).catch(reject);
      });

    } catch (err: unknown) {
      cleanup();
      if (!aborted && (err as Error)?.name !== 'AbortError') {
        const errMsg = (err as Error)?.message || 'Connection failed. Is the Hermes gateway running?';
        updateLastMessage({ content: accumulated || errMsg, type: accumulated ? 'prose' : 'error', isStreaming: false });
        setAgentState('error');
        client.getGatewayStatus().then(ok => setGatewayStatus(ok ? 'connected' : 'disconnected')).catch(() => {});
      } else if (aborted) {
        updateLastMessage({ isStreaming: false });
        setAgentState('idle');
      }
    } finally {
      cleanup();
      setIsRunning(false);
      abortRef.current = null;
    }
  };

  const LOCAL_COMMANDS = new Set(['/new', '/reset', '/usage', '/help', '/model', '/agents', '/skills', '/gateway', '/terminal', '/tools', '/version', '/browser', '/status', '/memory', '/shell', '/persona', '/compress', '/retry', '/undo', '/compact', '/insights', '/platforms', '/kanban', '/soul', '/providers', '/fast']);

  const sendMessage = async () => {
    if ((!input.trim() && attachedFiles.length === 0) || isRunning) return;
    const userContent = input.trim();
    const fileBlock = attachedFiles.map(f => `\`\`\`${f.name}\n${f.content}\n\`\`\``).join('\n\n');
    const fullContent = attachedFiles.length > 0 ? (userContent ? `${userContent}\n\n${fileBlock}` : fileBlock) : userContent;
    setInput('');
    setAttachedFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    sentMessages.current = [userContent, ...sentMessages.current].slice(0, 50);
    historyIndex.current = -1;

    if (userContent === '/new' || userContent === '/reset') {
      if (!window.confirm('Clear conversation?')) return;
      clearActiveSession(); clearToolCalls();
      sentMessages.current = []; historyIndex.current = -1;
      addMessage({ id: generateId(), role: 'system', type: 'system', content: 'Conversation cleared.', timestamp: Date.now() });
      return;
    }
    if (userContent === '/usage') {
      addMessage({ id: generateId(), role: 'system', type: 'info', content: `Tokens: ${tokensUsed.toLocaleString()} / ${contextWindow.toLocaleString()}`, timestamp: Date.now() });
      return;
    }
    if (userContent === '/help') {
      addMessage({ id: generateId(), role: 'system', type: 'info', content: '**Hermes Commands**\n\n`/new` or `/reset` — clear conversation\n`/usage` — show token usage\n`/model` — open model switcher\n`/agents` — view agent modes\n`/skills` — open skills browser\n`/gateway` — open gateway panel\n`/terminal` — open interactive terminal\n`/tools` — open command center\n`/version` — show Hermes version\n`/status` — show agent status\n`/memory` — show memory info\n`/shell <cmd>` — run a shell command\n`/browser <url or site>` — open Chrome at URL or site name\n`/browser <query>` — open Chrome with Google search\n`/browser` — open blank Chrome\n\nAll other input is sent to the Hermes agent.', timestamp: Date.now() });
      return;
    }
    if (userContent === '/model') {
      setModelSwitcherOpen(true);
      return;
    }
    if (userContent === '/agents') {
      setActiveSection('agents');
      return;
    }
    if (userContent === '/skills') {
      setActiveSection('skills');
      return;
    }
    if (userContent === '/gateway') {
      setActiveSection('gateway');
      return;
    }
    if (userContent === '/terminal') {
      setActiveSection('terminal');
      return;
    }
    if (userContent === '/tools') {
      setActiveSection('commands');
      return;
    }
    if (userContent.startsWith('/version')) {
      import('../api/desktop').then(({ runHermesCommand }) => {
        runHermesCommand(['--version']).then(result => {
          addMessage({ id: generateId(), role: 'system', type: 'info', content: result.stdout || result.stderr || 'Could not get version.', timestamp: Date.now() });
        });
      });
      addMessage({ id: generateId(), role: 'system', type: 'info', content: 'Fetching Hermes version...', timestamp: Date.now() });
      return;
    }
    if (userContent.startsWith('/browser')) {
      const arg = userContent.slice('/browser'.length).trim();

      let targetUrl: string;
      if (!arg) {
        targetUrl = '';
      } else if (isUrl(arg)) {
        targetUrl = /^https?:\/\//i.test(arg) ? arg : `https://${arg}`;
      } else {
        targetUrl = extractSiteUrl(arg);
      }

      const displayUrl = targetUrl || 'Chrome';
      addMessage({ id: generateId(), role: 'system', type: 'info', content: `Opening ${displayUrl}…`, timestamp: Date.now() });
      const result = await launchChrome(targetUrl);

      if (!result.success) {
        addMessage({ id: generateId(), role: 'assistant', type: 'error', content: `Failed to open Chrome: ${result.error || 'unknown error'}`, timestamp: Date.now() });
        return;
      }

      addMessage({ id: generateId(), role: 'assistant', type: 'prose', content: targetUrl ? `Opened Chrome at ${targetUrl}.` : 'Opened Chrome.', timestamp: Date.now() });
      return;
    }
    if (userContent === '/status') {
      addMessage({ id: generateId(), role: 'system', type: 'info', content: 'Fetching agent status...', timestamp: Date.now() });
      import('../api/desktop').then(({ runHermesCommand }) => {
        runHermesCommand(['status'], 30).then(result => {
          const text = (result.stdout || result.stderr || 'No output from hermes status.').trim();
          addMessage({ id: generateId(), role: 'assistant', type: 'prose', content: text, timestamp: Date.now() });
        });
      });
      return;
    }
    if (userContent === '/memory') {
      setActiveSection('profiles');
      return;
    }
    if (userContent === '/kanban') {
      setActiveSection('kanban');
      return;
    }
    if (userContent === '/soul') {
      setActiveSection('soul');
      return;
    }
    if (userContent === '/providers') {
      setActiveSection('providers');
      return;
    }
    if (userContent === '/fast') {
      const next = !fastMode;
      setFastMode(next);
      addMessage({ id: generateId(), role: 'system', type: 'info', content: `Fast mode ${next ? 'ON' : 'OFF'}`, timestamp: Date.now() });
      return;
    }
    if (userContent.startsWith('/shell ')) {
      const shellCmd = userContent.slice('/shell '.length).trim();
      if (shellCmd) {
        addMessage({ id: generateId(), role: 'system', type: 'info', content: `Running: \`${shellCmd}\``, timestamp: Date.now() });
        import('../api/desktop').then(({ runHermesCommand }) => {
          runHermesCommand(['-z', `!${shellCmd}`], 60).then(result => {
            const text = (result.stdout || result.stderr || 'No output.').trim();
            addMessage({ id: generateId(), role: 'assistant', type: 'prose', content: `\`\`\`\n${text}\n\`\`\``, timestamp: Date.now() });
          });
        });
        return;
      }
    }
    if (userContent === '/compress' || userContent === '/compact') {
      addMessage({ id: generateId(), role: 'system', type: 'info', content: 'Compressing context via CLI…', timestamp: Date.now() });
      import('../api/desktop').then(({ chatCli }) => {
        const eventId = Math.random().toString(36).slice(2);
        chatCli(eventId, '/compress', hermesSessionId).catch(() => {});
      });
      return;
    }
    if (userContent === '/retry') {
      const lastUser = [...messages].reverse().find(m => m.role === 'user');
      if (lastUser) {
        addMessage({ id: generateId(), role: 'system', type: 'info', content: 'Retrying last message…', timestamp: Date.now() });
        historyIndex.current = -1;
        setInput(lastUser.content);
      }
      return;
    }
    if (userContent === '/undo') {
      addMessage({ id: generateId(), role: 'system', type: 'info', content: 'Undo sent to Hermes CLI…', timestamp: Date.now() });
      import('../api/desktop').then(({ chatCli }) => {
        const eventId = Math.random().toString(36).slice(2);
        chatCli(eventId, '/undo', hermesSessionId).catch(() => {});
      });
      return;
    }
    if (userContent.startsWith('/insights')) {
      const args = userContent.slice('/insights'.length).trim();
      addMessage({ id: generateId(), role: 'system', type: 'info', content: 'Fetching usage insights…', timestamp: Date.now() });
      import('../api/desktop').then(({ runHermesCommand }) => {
        const cmdArgs = args ? ['insights', ...args.split(/\s+/)] : ['insights'];
        runHermesCommand(cmdArgs, 30).then(result => {
          const text = (result.stdout || result.stderr || 'No insights data.').trim();
          addMessage({ id: generateId(), role: 'assistant', type: 'prose', content: text, timestamp: Date.now() });
        });
      });
      return;
    }
    if (userContent === '/platforms') {
      addMessage({ id: generateId(), role: 'system', type: 'info', content: 'Fetching platform status…', timestamp: Date.now() });
      import('../api/desktop').then(({ runHermesCommand }) => {
        runHermesCommand(['gateway', 'status'], 15).then(result => {
          const text = (result.stdout || result.stderr || 'No platform data.').trim();
          addMessage({ id: generateId(), role: 'assistant', type: 'prose', content: text, timestamp: Date.now() });
        });
      });
      return;
    }
    if (userContent === '/persona') {
      addMessage({ id: generateId(), role: 'system', type: 'info', content: 'Fetching agent persona...', timestamp: Date.now() });
      import('../api/desktop').then(({ runHermesCommand }) => {
        runHermesCommand(['-z', 'What is your current persona and name?'], 30).then(result => {
          const text = (result.stdout || result.stderr || 'No persona configured.').trim();
          addMessage({ id: generateId(), role: 'assistant', type: 'prose', content: text, timestamp: Date.now() });
        });
      });
      return;
    }
    if (userContent === '/fast') {
      const enabling = !fastMode;
      setFastMode(enabling);
      addMessage({ id: generateId(), role: 'system', type: 'info', content: enabling ? 'Fast mode ON — priority processing enabled' : 'Fast mode OFF', timestamp: Date.now() });
      const eventId = Math.random().toString(36).slice(2);
      chatCli(eventId, '/fast', hermesSessionId).catch(() => {});
      return;
    }

    const effectiveContent = fullContent;
    const userMsg: Message = { id: generateId(), role: 'user', type: 'prose', content: effectiveContent, timestamp: Date.now() };
    addMessage(userMsg);
    await sendContent(effectiveContent);
  };

  const handleEditSave = async () => {
    if (!editingMsgId || !editingContent.trim()) return;
    const sid = activeSessionId;
    if (!sid) return;
    // Truncate messages to everything up to and including the edited message, then update its content
    useStore.setState((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sid) return s;
        const idx = s.messages.findIndex((m) => m.id === editingMsgId);
        if (idx === -1) return s;
        const truncated = s.messages.slice(0, idx + 1).map((m) =>
          m.id === editingMsgId ? { ...m, content: editingContent.trim() } : m
        );
        return { ...s, messages: truncated };
      }),
    }));
    const newContent = editingContent.trim();
    setEditingMsgId(null);
    setEditingContent('');
    // Build history up to (not including) the edited user message for context
    const stateAfter = useStore.getState();
    const session = stateAfter.sessions.find((s) => s.id === sid);
    const msgsAfter = session?.messages ?? [];
    const editedIdx = msgsAfter.findIndex((m) => m.id === editingMsgId);
    const historyBefore = msgsAfter
      .slice(0, editedIdx)
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.type === 'prose')
      .map((m) => ({ role: m.role, content: m.content }));
    await sendContent(newContent, [...historyBefore, { role: 'user', content: newContent }]);
  };

  const handleRegenerate = async () => {
    if (isRunning) return;
    const sid = activeSessionId;
    if (!sid) return;
    // Remove last assistant message
    useStore.setState((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sid) return s;
        const msgs = [...s.messages];
        const lastAssistantIdx = msgs.map((m, i) => ({ m, i })).reverse().find(({ m }) => m.role === 'assistant')?.i;
        if (lastAssistantIdx === undefined) return s;
        msgs.splice(lastAssistantIdx, 1);
        return { ...s, messages: msgs };
      }),
    }));
    // Find last user message from the now-updated store
    const updatedMsgs = useStore.getState().sessions.find((s) => s.id === sid)?.messages ?? [];
    const lastUser = [...updatedMsgs].reverse().find((m) => m.role === 'user' && m.type === 'prose');
    if (!lastUser) return;
    const history = updatedMsgs
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.type === 'prose')
      .map((m) => ({ role: m.role, content: m.content }));
    await sendContent(lastUser.content, [...history, { role: 'user', content: lastUser.content }]);
  };

  const isDisconnected = gatewayStatus === 'disconnected' || gatewayStatus === 'error';
  const usagePct = contextWindow > 0 ? (tokensUsed / contextWindow) * 100 : 0;

  // Determine if Regenerate button should show
  const lastMsg = messages[messages.length - 1];
  const showRegenerate = !isRunning && lastMsg && lastMsg.role === 'assistant' && !lastMsg.isStreaming && messages.some((m) => m.role === 'user');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {messages.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 20px 0', borderBottom: '1px solid var(--border)' }}>
          <button className="btn btn-ghost btn-sm" onClick={handleExport} title="Export session to Markdown" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Download size={13} />
            Export ↗
          </button>
        </div>
      )}
      <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {messages.length === 0 && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 72, height: 72, borderRadius: '50%', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <MessageSquare size={32} style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Start a conversation</div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Ask anything, run commands, or type <kbd style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 11, color: 'var(--text-secondary)' }}>/</kbd> for slash commands</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 420 }}>
              {['What can you do?', 'Show system status', 'Help me write code'].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => { setInput(prompt); textareaRef.current?.focus(); }}
                  style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 20, padding: '6px 14px', fontSize: 12.5, color: 'var(--text-secondary)', cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s' }}
                  onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'var(--border-hover)'; b.style.color = 'var(--text-primary)'; }}
                  onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = 'var(--border)'; b.style.color = 'var(--text-secondary)'; }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isHovered={hoveredMsgId === msg.id}
            isEditing={editingMsgId === msg.id}
            editingContent={editingMsgId === msg.id ? editingContent : ''}
            onHoverEnter={() => setHoveredMsgId(msg.id)}
            onHoverLeave={() => setHoveredMsgId(null)}
            onEditStart={() => { setEditingMsgId(msg.id); setEditingContent(msg.content); }}
            onEditChange={setEditingContent}
            onEditSave={handleEditSave}
            onEditCancel={() => { setEditingMsgId(null); setEditingContent(''); }}
          />
        ))}
        {showRegenerate && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleRegenerate}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={13} />
              Regenerate
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {tokensUsed > 0 && (
        <div style={{ padding: '0 28px 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10.5, color: 'var(--text-secondary)' }}>Context</span>
            <span style={{ fontSize: 10.5, color: usagePct > 80 ? 'var(--accent-amber)' : 'var(--text-secondary)' }}>{tokensUsed.toLocaleString()} / {contextWindow.toLocaleString()}</span>
          </div>
          <div style={{ height: 3, background: 'var(--bg2)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${Math.min(usagePct, 100)}%`, background: usagePct > 80 ? 'var(--accent-amber)' : 'var(--accent-green)', borderRadius: 2, transition: 'width 0.4s' }} />
          </div>
        </div>
      )}

      <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg1)' }}>
        {isDisconnected && (
          <div style={{ marginBottom: 10, padding: '7px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12.5, color: 'var(--accent-red)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertTriangle size={13} /> Gateway not connected — start it from the Gateway panel.
          </div>
        )}
        {localBrowserUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, padding: '5px 10px', fontSize: 11.5, color: 'var(--accent-green)', background: 'var(--accent-green-dim)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8 }}>
            <span className="dot dot-green" />
            Local browser connected — agent controls your Chrome
            <button
              onClick={() => { setLocalBrowserUrl(null); setPtySessionId(null); setPtyEventId(null); }}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, padding: '2px 4px', borderRadius: 4 }}
            >
              Disconnect
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".txt,.md,.json,.yaml,.yml,.csv,.py,.js,.ts,.tsx,.jsx,.rs,.go,.sh"
          style={{ display: 'none' }}
          onChange={handleFileAttach}
        />
        <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12 }}>
          {attachedFiles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 14px 0' }}>
              {attachedFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 11.5 }}>
                  <Paperclip size={10} style={{ color: 'var(--text-tertiary)' }} />
                  <span style={{ color: 'var(--text-secondary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <button onClick={() => setAttachedFiles(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0, display: 'flex' }}><X size={10} /></button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 14px' }}>
          <button title="Attach file" onClick={() => fileInputRef.current?.click()} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, borderRadius: 6, flexShrink: 0 }}>
            <Paperclip size={17} />
          </button>
          <textarea
            ref={textareaRef}
            id="chat-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const ta = e.target; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
              if (e.target.value === '/') setPaletteOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); return; }
              if (e.key === 'ArrowUp' && !e.shiftKey && (e.currentTarget.selectionStart === 0 || input === '')) {
                if (sentMessages.current.length > 0) {
                  e.preventDefault();
                  const nextIdx = Math.min(historyIndex.current + 1, sentMessages.current.length - 1);
                  historyIndex.current = nextIdx;
                  setInput(sentMessages.current[nextIdx]);
                }
                return;
              }
              if (e.key === 'ArrowDown' && !e.shiftKey) {
                if (historyIndex.current > 0) {
                  e.preventDefault();
                  historyIndex.current -= 1;
                  setInput(sentMessages.current[historyIndex.current]);
                } else if (historyIndex.current === 0) {
                  e.preventDefault();
                  historyIndex.current = -1;
                  setInput('');
                }
                return;
              }
            }}
            placeholder="Message Hermes… (/ for commands)"
            rows={1}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none', color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6, maxHeight: 180, overflowY: 'auto' }}
          />
          {isRunning
            ? <button onClick={handleStop} id="stop-btn" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'var(--accent-red)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Square size={15} fill="currentColor" /></button>
            : <button onClick={sendMessage} id="send-btn" disabled={!input.trim() && attachedFiles.length === 0} style={{ background: (input.trim() || attachedFiles.length > 0) ? 'var(--accent-green)' : 'var(--bg2)', border: 'none', borderRadius: 8, color: (input.trim() || attachedFiles.length > 0) ? 'white' : 'var(--text-secondary)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: (input.trim() || attachedFiles.length > 0) ? 'pointer' : 'not-allowed', flexShrink: 0 }}><Send size={15} /></button>
          }
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: '0 2px' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}><kbd style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>↵</kbd> Send · <kbd style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Shift+↵</kbd> Newline · <kbd style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>↑↓</kbd> History</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {input.length > 0 && <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{input.length} chars</span>}
            <button
              onClick={() => {
                const enabling = !fastMode;
                setFastMode(enabling);
                addMessage({ id: generateId(), role: 'system', type: 'info', content: enabling ? 'Fast mode ON — priority processing enabled' : 'Fast mode OFF', timestamp: Date.now() });
                const eventId = Math.random().toString(36).slice(2);
                chatCli(eventId, '/fast', hermesSessionId).catch(() => {});
              }}
              title="Toggle fast mode (/fast)"
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: fastMode ? 'var(--accent-amber-dim)' : 'none', border: fastMode ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent', borderRadius: 5, padding: '2px 7px', fontSize: 11, color: fastMode ? 'var(--accent-amber)' : 'var(--text-tertiary)', cursor: 'pointer', transition: 'all 0.15s' }}
            >
              <Zap size={11} />
              Fast
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
