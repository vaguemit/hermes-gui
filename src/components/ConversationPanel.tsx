import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore, Message, ToolCall } from '../store';
import { streamChat } from '../api/hermes';
import { renderMarkdown, formatTimestamp } from '../utils/parser';
import {
  Send, Square, Paperclip, Copy,
  ChevronDown, ChevronRight, AlertTriangle,
  Brain, Terminal, CheckCircle2, XCircle, Loader2
} from 'lucide-react';

const generateId = () => Math.random().toString(36).slice(2);

function ToolCallCard({ tc }: { tc: ToolCall }) {
  const [expanded, setExpanded] = useState(true);
  const statusIcon = {
    pending: <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-muted)' }} />,
    running: <Loader2 size={12} style={{ color: 'var(--tool-blue)', animation: 'spin 1s linear infinite' }} />,
    done: <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />,
    error: <XCircle size={12} style={{ color: 'var(--error)' }} />,
  }[tc.status];

  return (
    <div className="tool-card my-2 animate-in">
      <button onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--tool-blue)' }}>
        <Terminal size={13} />
        <span style={{ fontWeight: 600, fontSize: 12, fontFamily: 'monospace' }}>{tc.name}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {statusIcon}
          {expanded ? <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
        </span>
      </button>
      {expanded && tc.input && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-secondary)' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Input</div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{tc.input.slice(0, 300)}</pre>
          {tc.output && (
            <>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 8, marginBottom: 4 }}>Output</div>
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
      <button onClick={() => setExpanded(!expanded)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--reasoning)' }}>
        <Brain size={13} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>Reasoning trace</span>
        <span style={{ marginLeft: 'auto' }}>{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
      </button>
      {expanded && <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.65 }}>{clean}</div>}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const [copied, setCopied] = useState(false);
  if (msg.type === 'reasoning') return <ReasoningBlock content={msg.content} />;
  if (msg.type === 'error') return (
    <div className="animate-in" style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'flex-start' }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <AlertTriangle size={14} style={{ color: 'var(--error)' }} />
      </div>
      <div style={{ flex: 1, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, padding: '10px 14px' }}>
        <span style={{ color: 'var(--error)', fontSize: 13 }}>{msg.content}</span>
      </div>
    </div>
  );
  if (msg.type === 'info' || msg.type === 'system') return (
    <div className="animate-in" style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 100, padding: '3px 12px' }}>{msg.content}</span>
    </div>
  );

  const isUser = msg.role === 'user';
  return (
    <div className="animate-in" style={{ display: 'flex', gap: 12, marginBottom: 18, flexDirection: isUser ? 'row-reverse' : 'row', alignItems: 'flex-start' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, background: isUser ? 'linear-gradient(135deg, #7c6af7, #3b9eff)' : 'linear-gradient(135deg, #1a1d26, #20242f)', border: isUser ? 'none' : '1px solid var(--border)', color: 'white' }}>
        {isUser ? 'U' : 'H'}
      </div>
      <div style={{ flex: 1, maxWidth: isUser ? '75%' : '100%' }}>
        <div style={{ background: isUser ? 'linear-gradient(135deg, rgba(124,106,247,0.2), rgba(59,158,255,0.12))' : 'transparent', border: isUser ? '1px solid rgba(124,106,247,0.3)' : 'none', borderRadius: isUser ? 12 : 0, padding: isUser ? '10px 14px' : 0 }}>
          {msg.isStreaming
            ? <div className="typing-cursor">{renderMarkdown(msg.content || '…')}</div>
            : renderMarkdown(msg.content)
          }
        </div>
        {msg.toolCalls?.map((tc) => <ToolCallCard key={tc.id} tc={tc} />)}
        {!isUser && !msg.isStreaming && (
          <button onClick={() => { navigator.clipboard.writeText(msg.content); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11.5, cursor: 'pointer', padding: '3px 7px', borderRadius: 5, marginTop: 6 }}>
            <Copy size={11} />{copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ConversationPanel() {
  const { sessions, activeSessionId, activeModel, gatewayStatus, agentState, setAgentState, addMessage, updateLastMessage, addToolCall, clearToolCalls, setPaletteOpen, tokensUsed, contextWindow, setTokenUsage, clearActiveSession } = useStore();
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const messages = activeSession?.messages ?? [];

  useEffect(() => { if (autoScroll) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 50);
  }, []);

  const handleStop = () => { abortRef.current?.abort(); setIsRunning(false); setAgentState('idle'); };

  const sendMessage = async () => {
    if (!input.trim() || isRunning) return;
    const userContent = input.trim();
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    if (userContent === '/new' || userContent === '/reset') {
      clearActiveSession(); clearToolCalls();
      addMessage({ id: generateId(), role: 'system', type: 'system', content: 'Conversation cleared.', timestamp: Date.now() });
      return;
    }
    if (userContent === '/usage') {
      addMessage({ id: generateId(), role: 'system', type: 'info', content: `Tokens: ${tokensUsed.toLocaleString()} / ${contextWindow.toLocaleString()}`, timestamp: Date.now() });
      return;
    }

    const userMsg: Message = { id: generateId(), role: 'user', type: 'prose', content: userContent, timestamp: Date.now() };
    addMessage(userMsg);
    setAutoScroll(true);
    setIsRunning(true);
    setAgentState('thinking');
    clearToolCalls();

    addMessage({ id: generateId(), role: 'assistant', type: 'prose', content: '', timestamp: Date.now(), isStreaming: true });

    const abort = new AbortController();
    abortRef.current = abort;
    const history = [...messages.filter(m => (m.role === 'user' || m.role === 'assistant') && m.type === 'prose').map(m => ({ role: m.role, content: m.content })), { role: 'user', content: userContent }];

    let accumulated = '';
    try {
      const gen = streamChat(history, activeModel, (event) => {
        if (event.type === 'delta' && event.content) { accumulated += event.content; updateLastMessage({ content: accumulated, isStreaming: true }); }
        if (event.type === 'tool_call' && event.toolName) {
          addToolCall({ id: event.toolCallId || generateId(), name: event.toolName, input: event.toolInput || '', status: 'running', timestamp: Date.now() });
          setAgentState('running_tool');
        }
        if (event.type === 'done' && event.usage) setTokenUsage(event.usage.total_tokens, contextWindow);
      }, abort.signal);
      for await (const _ of gen) { /* handled in callback */ }
      updateLastMessage({ isStreaming: false });
      setAgentState('idle');
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        updateLastMessage({ content: accumulated || 'Connection failed. Is the Hermes gateway running?', type: accumulated ? 'prose' : 'error', isStreaming: false });
        setAgentState('error');
      } else { updateLastMessage({ isStreaming: false }); setAgentState('idle'); }
    } finally { setIsRunning(false); abortRef.current = null; }
  };

  const isDisconnected = gatewayStatus === 'disconnected' || gatewayStatus === 'error';
  const usagePct = contextWindow > 0 ? (tokensUsed / contextWindow) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {messages.length === 0 && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, opacity: 0.5 }}>
            <div style={{ fontSize: 48 }}>🪽</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Start a conversation with Hermes</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Type a message or press <kbd style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>/</kbd> for slash commands</div>
            </div>
          </div>
        )}
        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
        <div ref={messagesEndRef} />
      </div>

      {tokensUsed > 0 && (
        <div style={{ padding: '0 28px 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Context</span>
            <span style={{ fontSize: 10.5, color: usagePct > 80 ? 'var(--warning)' : 'var(--text-muted)' }}>{tokensUsed.toLocaleString()} / {contextWindow.toLocaleString()}</span>
          </div>
          <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${Math.min(usagePct, 100)}%`, background: usagePct > 80 ? 'var(--warning)' : 'var(--accent)', borderRadius: 2, transition: 'width 0.4s' }} />
          </div>
        </div>
      )}

      <div style={{ padding: '12px 20px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
        {isDisconnected && (
          <div style={{ marginBottom: 10, padding: '7px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, fontSize: 12.5, color: 'var(--error)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertTriangle size={13} /> Gateway not connected — start it from the Gateway panel.
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
          <button title="Attach file" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, borderRadius: 6, flexShrink: 0 }}>
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
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Message Hermes… (/ for commands)"
            rows={1}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none', color: 'var(--text-primary)', fontSize: 14, lineHeight: 1.6, maxHeight: 180, overflowY: 'auto' }}
          />
          {isRunning
            ? <button onClick={handleStop} id="stop-btn" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'var(--error)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Square size={15} fill="currentColor" /></button>
            : <button onClick={sendMessage} id="send-btn" disabled={!input.trim()} style={{ background: input.trim() ? 'var(--accent)' : 'var(--bg-hover)', border: 'none', borderRadius: 8, color: input.trim() ? 'white' : 'var(--text-muted)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'not-allowed', boxShadow: input.trim() ? '0 0 12px var(--accent-glow)' : 'none', flexShrink: 0 }}><Send size={15} /></button>
          }
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: '0 2px' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}><kbd style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>↵</kbd> Send · <kbd style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Shift+↵</kbd> Newline</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{input.length > 0 ? `${input.length} chars` : ''}</span>
        </div>
      </div>
    </div>
  );
}
