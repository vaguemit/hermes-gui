import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useStore, Message, ToolCall } from '../store';
import { getGatewayStatus, chatStream, chatCli, launchChrome, writeEnvVar } from '../api/desktop';
import { renderMarkdown, formatTimestamp } from '../utils/parser';
import {
  Send, Square, Paperclip, Copy,
  ChevronDown, ChevronRight, AlertTriangle,
  Brain, Terminal, CheckCircle2, XCircle, Loader2, Download
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

function MessageBubble({ msg }: { msg: Message }) {
  const [copied, setCopied] = useState(false);
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
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 11.5, cursor: 'pointer', padding: '3px 7px', borderRadius: 5, marginTop: 6 }}>
            <Copy size={11} />{copied ? 'Copied!' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}

function exportSessionToMarkdown(messages: Message[]): string {
  const lines: string[] = [];
  for (const msg of messages) {
    const ts = formatTimestamp(msg.timestamp);
    if (msg.type === 'reasoning') {
      const clean = msg.content.replace(/<think>|<\/think>|^Thinking:\s*/gi, '').trim();
      lines.push(`## reasoning ${ts}\n\n> ${clean.replace(/\n/g, '\n> ')}\n`);
    } else if (msg.type === 'tool_call' || msg.type === 'tool_output') {
      lines.push(`## ${msg.role} ${ts}\n\n\`\`\`json\n${msg.content}\n\`\`\`\n`);
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          lines.push(`### tool: ${tc.name}\n`);
          if (tc.input) lines.push(`**Input:**\n\`\`\`json\n${tc.input}\n\`\`\`\n`);
          if (tc.output) lines.push(`**Output:**\n\`\`\`json\n${tc.output}\n\`\`\`\n`);
        }
      }
    } else {
      lines.push(`## ${msg.role} ${ts}\n\n${msg.content}\n`);
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          lines.push(`### tool: ${tc.name}\n`);
          if (tc.input) lines.push(`**Input:**\n\`\`\`json\n${tc.input}\n\`\`\`\n`);
          if (tc.output) lines.push(`**Output:**\n\`\`\`json\n${tc.output}\n\`\`\`\n`);
        }
      }
    }
  }
  return lines.join('\n');
}

function isUrl(s: string): boolean {
  const first = s.split(/\s/)[0];
  return /^https?:\/\//i.test(first) || /^www\./i.test(first) || /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(first);
}

function extractSiteUrl(instruction: string): string {
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
  };
  const lower = instruction.toLowerCase();
  for (const [name, url] of Object.entries(sites)) {
    if (lower.includes(name)) return url;
  }
  const domainMatch = instruction.match(/\b([a-zA-Z0-9-]+\.(com|org|net|io|ai|co|app|dev))\b/i);
  if (domainMatch) return `https://${domainMatch[1]}`;
  return 'https://claude.ai';
}

export default function ConversationPanel() {
  const { sessions, activeSessionId, addMessage, updateLastMessage, activeModel, contextWindow, tokensUsed, setTokenUsage, agentState, setAgentState, clearToolCalls, addToolCall, updateToolCallGlobal, gatewayStatus, setGatewayStatus, clearActiveSession, setPaletteOpen, setActiveSection, setModelSwitcherOpen, hermesSessionId, setHermesSessionId, localBrowserUrl, setLocalBrowserUrl, setBrowserConnected, setPtySessionId, setPtyEventId } = useStore();
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const abortRef = useRef<{ abort: () => void } | null>(null);
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

  const handleExport = () => {
    const md = exportSessionToMarkdown(messages);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hermes-session-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const LOCAL_COMMANDS = new Set(['/new', '/reset', '/usage', '/help', '/model', '/agents', '/skills', '/gateway', '/tools', '/version', '/browser', '/status', '/memory', '/shell', '/persona', '/compress', '/retry', '/undo', '/compact', '/insights', '/platforms']);

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
    if (userContent === '/help') {
      addMessage({ id: generateId(), role: 'system', type: 'info', content: '**Hermes Commands**\n\n`/new` or `/reset` — clear conversation\n`/usage` — show token usage\n`/model` — open model switcher\n`/agents` — view agent modes\n`/skills` — open skills browser\n`/gateway` — open gateway panel\n`/tools` — open command center\n`/version` — show Hermes version\n`/status` — show agent status\n`/memory` — show memory info\n`/shell <cmd>` — run a shell command\n`/browser connect` — browser tool guidance\n`/browser <url>` — navigate to URL\n\nAll other natural language is sent to the Hermes agent. Use natural language to invoke tools: "search for X", "navigate to Y", "take a screenshot".', timestamp: Date.now() });
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
      const cdpUrl = 'http://127.0.0.1:9222';
      const targetUrl = !arg || arg === 'connect' ? 'https://claude.ai'
        : isUrl(arg) ? (/^https?:\/\//i.test(arg) ? arg : `https://${arg}`)
        : extractSiteUrl(arg);

      addMessage({ id: generateId(), role: 'system', type: 'info', content: `Launching Chrome at ${targetUrl}…`, timestamp: Date.now() });
      const result = await launchChrome(targetUrl);

      if (!result.success) {
        addMessage({ id: generateId(), role: 'assistant', type: 'error', content: `Failed to launch Chrome: ${result.error || 'unknown error'}`, timestamp: Date.now() });
        return;
      }

      setLocalBrowserUrl(cdpUrl);
      setBrowserConnected(true);
      writeEnvVar('BROWSER_CDP_URL', cdpUrl).catch(() => {});
      writeEnvVar('PLAYWRIGHT_HEADLESS', 'false').catch(() => {});
      writeEnvVar('HEADLESS', 'false').catch(() => {});
      addMessage({ id: generateId(), role: 'assistant', type: 'prose', content: `Chrome is open and connected. Type your next message and the agent will control the browser.`, timestamp: Date.now() });
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
      addMessage({ id: generateId(), role: 'system', type: 'info', content: 'Fetching memory info...', timestamp: Date.now() });
      import('../api/desktop').then(({ runHermesCommand }) => {
        runHermesCommand(['memory'], 30).then(result => {
          const text = (result.stdout || result.stderr || 'No memory output.').trim();
          addMessage({ id: generateId(), role: 'assistant', type: 'prose', content: text, timestamp: Date.now() });
        });
      });
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

    const effectiveContent = userContent;

    const userMsg: Message = { id: generateId(), role: 'user', type: 'prose', content: effectiveContent, timestamp: Date.now() };
    addMessage(userMsg);
    setAutoScroll(true);
    setIsRunning(true);
    setAgentState('thinking');
    clearToolCalls();

    addMessage({ id: generateId(), role: 'assistant', type: 'prose', content: '', timestamp: Date.now(), isStreaming: true });

    const history = [...messages.filter(m => (m.role === 'user' || m.role === 'assistant') && m.type === 'prose').map(m => ({ role: m.role, content: m.content })), { role: 'user', content: effectiveContent }];

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
            if (ev.payload === '__executing__') {
              setAgentState('running_tool');
              return;
            }
            addToolCall({ id: generateId(), name: ev.payload, input: '', status: 'running', timestamp: Date.now() });
            setAgentState('running_tool');
          }),
          listen<string>(`chat-session-${eventId}`, (ev) => {
            if (ev.payload && !aborted) {
              setHermesSessionId(ev.payload);
            }
          }),
        ]).then(([u1, u2, u3, u4, u5, u6]) => {
          cleanupRef.fn = () => { u1(); u2(); u3(); u4(); u5(); u6(); };

          // When local Chrome is connected, always use CLI so BROWSER_CDP_URL is read from .env
          if (localBrowserUrl) {
            chatCli(eventId, effectiveContent, hermesSessionId).catch(reject);
            return;
          }

          // Slash commands not handled locally go to the hermes CLI (supports TUI commands like /web, etc.)
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
        getGatewayStatus().then(ok => setGatewayStatus(ok ? 'connected' : 'disconnected')).catch(() => {});
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

  const isDisconnected = gatewayStatus === 'disconnected' || gatewayStatus === 'error';
  const usagePct = contextWindow > 0 ? (tokensUsed / contextWindow) * 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {messages.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 20px 0', borderBottom: '1px solid var(--border)' }}>
          <button className="btn btn-ghost btn-sm" onClick={handleExport} title="Export session to Markdown" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Download size={13} />
            Export
          </button>
        </div>
      )}
      <div ref={scrollRef} onScroll={handleScroll} style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {messages.length === 0 && (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, opacity: 0.5 }}>
            <div style={{ fontSize: 48 }}>🪽</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Start a conversation with Hermes</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Type a message or press <kbd style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px', fontSize: 11 }}>/</kbd> for slash commands</div>
            </div>
          </div>
        )}
        {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
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
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px' }}>
          <button title="Attach file" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4, borderRadius: 6, flexShrink: 0 }}>
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
            ? <button onClick={handleStop} id="stop-btn" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'var(--accent-red)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><Square size={15} fill="currentColor" /></button>
            : <button onClick={sendMessage} id="send-btn" disabled={!input.trim()} style={{ background: input.trim() ? 'var(--accent-green)' : 'var(--bg2)', border: 'none', borderRadius: 8, color: input.trim() ? 'white' : 'var(--text-secondary)', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'not-allowed', flexShrink: 0 }}><Send size={15} /></button>
          }
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, padding: '0 2px' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}><kbd style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>↵</kbd> Send · <kbd style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>Shift+↵</kbd> Newline</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{input.length > 0 ? `${input.length} chars` : ''}</span>
        </div>
      </div>
    </div>
  );
}
