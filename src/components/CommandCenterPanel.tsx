import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Clock, Copy, Play, Search, Star, Terminal, X, XCircle } from 'lucide-react';
import type { CommandResult } from '../api/desktop';
import { useHermesClient } from '../lib/hermes';
import { CLI_COMMANDS, CliCommand } from '../data/hermesCatalog';

// Commands that start an interactive prompt_toolkit session.
// Spawning these from Tauri (no console) causes NoConsoleScreenBufferError.
// Users must run them from an external terminal.
const INTERACTIVE_CLI_IDS = new Set([
  'chat', 'one-shot', 'pure-output',
  'setup', 'setup-model', 'setup-terminal', 'setup-gateway', 'setup-tools',
  'gateway-run',
  'acp',
]);

const CATEGORIES = ['All', 'Favorites', 'Recent', 'Setup', 'Chat', 'Gateway', 'Automation', 'Memory', 'Tools', 'Admin', 'Developer'] as const;
type Category = (typeof CATEGORIES)[number];

const RECENTS_KEY = 'hermes_recent_commands';
const FAVS_KEY = 'hermes_fav_commands';
const MAX_RECENTS = 5;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecents(ids: string[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function loadFavs(): string[] {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveFavs(ids: string[]) {
  try {
    localStorage.setItem(FAVS_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function splitArgs(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if ((char === '"' || char === "'") && !quote) {
      quote = char;
      continue;
    }
    if (char === quote) {
      quote = null;
      continue;
    }
    if (/\s/.test(char) && !quote) {
      if (current) out.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) out.push(current);
  return out;
}

// ─── Streaming terminal block ─────────────────────────────────────────────────
function StreamingBlock({
  lines,
  running,
  result,
  onClear,
}: {
  lines: string[];
  running: boolean;
  result: CommandResult | null;
  onClear: () => void;
}) {
  const bodyRef = useRef<HTMLPreElement>(null);

  // Auto-scroll to bottom while streaming
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [lines]);

  if (!running && lines.length === 0 && !result) return null;

  const exitBadge = result && result.code !== null ? (
    <span className="badge badge-muted">exit {result.code}</span>
  ) : null;

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        {running ? (
          <span className="dot dot-amber" style={{ flexShrink: 0 }} />
        ) : result?.success ? (
          <CheckCircle2 size={14} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
        ) : (
          <XCircle size={14} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
          {result?.command ?? 'Running…'}
        </span>
        {exitBadge}
        {running && <span className="badge badge-muted">streaming</span>}
      </div>
      <pre
        ref={bodyRef}
        style={{
          margin: 0,
          background: 'var(--bg0)',
          border: '1px solid var(--border)',
          borderRadius: 7,
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11.5,
          lineHeight: 1.55,
          maxHeight: 420,
          overflow: 'auto',
          padding: 12,
          whiteSpace: 'pre-wrap',
        }}
      >
        {lines.length > 0 ? lines.join('\n') : (result ? ([result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n\n') || '(no output)') : '…')}
        {running && <span className="typing-cursor" />}
      </pre>
      {!running && (
        <button
          onClick={onClear}
          style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, padding: 0, display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <X size={12} /> Clear output
        </button>
      )}
    </div>
  );
}

// ─── Command row ──────────────────────────────────────────────────────────────
function CommandRow({
  cmd,
  isSelected,
  isFav,
  onSelect,
  onToggleFav,
  onRemoveRecent,
  isRecent,
}: {
  cmd: CliCommand;
  isSelected: boolean;
  isFav: boolean;
  onSelect: (cmd: CliCommand) => void;
  onToggleFav: (id: string, e: React.MouseEvent) => void;
  onRemoveRecent?: () => void;
  isRecent?: boolean;
}) {
  const [rowCopied, setRowCopied] = useState(false);

  const copyRow = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(cmd.command).then(() => {
      setRowCopied(true);
      setTimeout(() => setRowCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <button
      onClick={() => onSelect(cmd)}
      style={{
        width: '100%',
        background: isSelected ? 'var(--accent-green-dim)' : 'transparent',
        border: `1px solid ${isSelected ? 'var(--accent-green)' : 'transparent'}`,
        borderRadius: 8,
        color: 'var(--text-primary)',
        display: 'block',
        marginBottom: 6,
        padding: '10px 11px',
        textAlign: 'left',
        position: 'relative',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cmd.title}</span>
        <span className="badge badge-muted" style={{ flexShrink: 0 }}>{cmd.category}</span>

        {/* Favorite star */}
        <button
          onClick={(e) => onToggleFav(cmd.id, e)}
          title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          style={{
            flexShrink: 0,
            background: 'none',
            border: 'none',
            color: isFav ? 'var(--accent-amber)' : 'var(--text-tertiary)',
            cursor: 'pointer',
            padding: '2px 4px',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 4,
          }}
        >
          <Star size={12} fill={isFav ? 'var(--accent-amber)' : 'none'} />
        </button>

        {/* Copy row button */}
        <button
          onClick={copyRow}
          title="Copy command"
          style={{ flexShrink: 0, background: 'none', border: 'none', color: rowCopied ? 'var(--accent-green)' : 'var(--text-secondary)', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', borderRadius: 4 }}
        >
          {rowCopied ? <Check size={12} /> : <Copy size={12} />}
        </button>

        {/* Remove from recents */}
        {isRecent && onRemoveRecent && (
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveRecent(); }}
            title="Remove from recents"
            style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', borderRadius: 4 }}
          >
            <X size={12} />
          </button>
        )}
      </div>
      <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11.5, marginBottom: 4 }}>{cmd.command}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{cmd.description}</div>
    </button>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────
export default function CommandCenterPanel() {
  const client = useHermesClient();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category>('All');
  const [selected, setSelected] = useState<CliCommand>(CLI_COMMANDS[0]);
  const [customArgs, setCustomArgs] = useState(CLI_COMMANDS[0].args.join(' '));
  const [running, setRunning] = useState(false);
  const [streamLines, setStreamLines] = useState<string[]>([]);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [runHovered, setRunHovered] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>(loadRecents);
  const [favIds, setFavIds] = useState<string[]>(loadFavs);

  // Persist recents/favs whenever they change
  useEffect(() => { saveRecents(recentIds); }, [recentIds]);
  useEffect(() => { saveFavs(favIds); }, [favIds]);

  const recentCommands = useMemo(
    () => recentIds.map((id) => CLI_COMMANDS.find((c) => c.id === id)).filter((c): c is CliCommand => c !== undefined),
    [recentIds]
  );

  const favCommands = useMemo(
    () => favIds.map((id) => CLI_COMMANDS.find((c) => c.id === id)).filter((c): c is CliCommand => c !== undefined),
    [favIds]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (category === 'Favorites') {
      if (!needle) return favCommands;
      return favCommands.filter((cmd) =>
        [cmd.title, cmd.command, cmd.description, cmd.category].some((p) => p.toLowerCase().includes(needle))
      );
    }

    if (category === 'Recent') {
      if (!needle) return recentCommands;
      return recentCommands.filter((cmd) =>
        [cmd.title, cmd.command, cmd.description, cmd.category].some((p) => p.toLowerCase().includes(needle))
      );
    }

    return CLI_COMMANDS.filter((cmd) => {
      const categoryMatches = category === 'All' || cmd.category === category;
      if (!categoryMatches) return false;
      if (!needle) return true;
      return [cmd.title, cmd.command, cmd.description, cmd.category].some((part) => part.toLowerCase().includes(needle));
    });
  }, [category, query, favCommands, recentCommands]);

  const stageCommand = (cmd: CliCommand) => {
    setSelected(cmd);
    setCustomArgs(cmd.args.join(' '));
    setResult(null);
    setStreamLines([]);
  };

  const pushRecent = useCallback((id: string) => {
    setRecentIds((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENTS);
      return next;
    });
  }, []);

  const removeRecent = useCallback((id: string) => {
    setRecentIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const toggleFav = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const runSelected = async () => {
    if (INTERACTIVE_CLI_IDS.has(selected.id)) {
      setStreamLines([]);
      setResult({
        success: false,
        code: null,
        command: ['hermes', ...splitArgs(customArgs)].join(' '),
        stdout: '',
        stderr: 'This command opens an interactive terminal session and cannot run inside the desktop runner. Use the Chat panel (gateway API) or run it from an external terminal.',
      });
      return;
    }

    const args = splitArgs(customArgs);
    if (args.length === 0) return;
    const safeArgs = [...args, '--no-color'];

    setRunning(true);
    setResult(null);
    setStreamLines([]);

    const collectedLines: string[] = [];

    try {
      const res = await client.streamCommand(
        safeArgs,
        (line: string) => {
          collectedLines.push(line);
          setStreamLines([...collectedLines]);
        },
        selected.safeToRun ? 90 : 30,
      );
      setResult(res);
      pushRecent(selected.id);
    } catch (err) {
      setResult({
        success: false,
        code: null,
        command: ['hermes', ...args].join(' '),
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(false);
    }
  };

  const copyCommand = async () => {
    await navigator.clipboard.writeText(['hermes', ...splitArgs(customArgs)].join(' '));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Only show the inline recents section when browsing "All" without a query
  const showInlineRecents = !query.trim() && recentCommands.length > 0 && category === 'All';

  // Category pill labels with counts
  const favCount = favIds.length;
  const recentCount = recentIds.length;

  return (
    <div style={{ height: '100%', overflow: 'hidden', display: 'grid', gridTemplateColumns: 'minmax(340px, 420px) minmax(0, 1fr)' }}>
      {/* Left column: search + list */}
      <div style={{ borderRight: '1px solid var(--border)', background: 'var(--bg1)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '18px 18px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
            <Terminal size={18} style={{ color: 'var(--accent-green)' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Command Center</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>Full Hermes CLI surface, staged as desktop actions</div>
            </div>
          </div>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
            <Search size={14} style={{ color: 'var(--text-secondary)' }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search commands"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 13 }}
            />
          </div>

          {/* Category pills — horizontally scrollable */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
            {CATEGORIES.map((name) => {
              const isActive = category === name;
              const isFavPill = name === 'Favorites';
              const isRecentPill = name === 'Recent';
              return (
                <button
                  key={name}
                  onClick={() => setCategory(name)}
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '5px 9px',
                    fontSize: 11.5,
                    fontWeight: isActive ? 700 : 500,
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${isActive ? 'var(--accent-green)' : 'var(--border)'}`,
                    background: isActive ? 'var(--accent-green-dim)' : 'transparent',
                    color: isActive ? 'var(--accent-green)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {isFavPill && <Star size={10} fill={isActive ? 'var(--accent-green)' : 'none'} />}
                  {isRecentPill && <Clock size={10} />}
                  {name}
                  {isFavPill && favCount > 0 && (
                    <span style={{ background: 'var(--bg4)', borderRadius: 10, fontSize: 10, padding: '0 5px', color: 'var(--text-secondary)' }}>
                      {favCount}
                    </span>
                  )}
                  {isRecentPill && recentCount > 0 && (
                    <span style={{ background: 'var(--bg4)', borderRadius: 10, fontSize: 10, padding: '0 5px', color: 'var(--text-secondary)' }}>
                      {recentCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Command list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
          {/* Inline Recent section (only when browsing All) */}
          {showInlineRecents && (
            <div style={{ marginBottom: 10 }}>
              <div className="section-label" style={{ marginBottom: 8, paddingLeft: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={11} />
                Recent
              </div>
              {recentCommands.map((cmd) => (
                <CommandRow
                  key={`recent-${cmd.id}`}
                  cmd={cmd}
                  isSelected={selected.id === cmd.id}
                  isFav={favIds.includes(cmd.id)}
                  onSelect={stageCommand}
                  onToggleFav={toggleFav}
                  isRecent
                  onRemoveRecent={() => removeRecent(cmd.id)}
                />
              ))}
              <div className="divider" style={{ marginBottom: 10 }} />
            </div>
          )}

          {/* Favorites empty state */}
          {category === 'Favorites' && favCommands.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12.5, padding: '40px 20px' }}>
              <Star size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
              <div>No favorites yet.</div>
              <div style={{ marginTop: 4 }}>Click the star on any command to save it here.</div>
            </div>
          )}

          {/* Recent empty state */}
          {category === 'Recent' && recentCommands.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12.5, padding: '40px 20px' }}>
              <Clock size={28} style={{ margin: '0 auto 10px', opacity: 0.3 }} />
              <div>No recent commands yet.</div>
              <div style={{ marginTop: 4 }}>Run a command to see it here.</div>
            </div>
          )}

          {/* Filtered commands */}
          {filtered.map((cmd) => (
            <CommandRow
              key={cmd.id}
              cmd={cmd}
              isSelected={selected.id === cmd.id}
              isFav={favIds.includes(cmd.id)}
              onSelect={stageCommand}
              onToggleFav={toggleFav}
              isRecent={category === 'Recent'}
              onRemoveRecent={category === 'Recent' ? () => removeRecent(cmd.id) : undefined}
            />
          ))}
        </div>
      </div>

      {/* Right column: detail + run */}
      <div style={{ padding: '22px 26px', overflowY: 'auto', minWidth: 0 }}>
        <div style={{ maxWidth: 820 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>{selected.title}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{selected.description}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {/* Favorite toggle in detail pane */}
              <button
                onClick={(e) => toggleFav(selected.id, e)}
                title={favIds.includes(selected.id) ? 'Remove from favorites' : 'Add to favorites'}
                style={{
                  background: favIds.includes(selected.id) ? 'var(--accent-amber-dim)' : 'var(--bg3)',
                  border: `1px solid ${favIds.includes(selected.id) ? 'var(--accent-amber)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  color: favIds.includes(selected.id) ? 'var(--accent-amber)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '5px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 12,
                }}
              >
                <Star size={12} fill={favIds.includes(selected.id) ? 'var(--accent-amber)' : 'none'} />
                {favIds.includes(selected.id) ? 'Saved' : 'Save'}
              </button>

              {INTERACTIVE_CLI_IDS.has(selected.id) ? (
                <span className="badge badge-error" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertTriangle size={11} />
                  Requires terminal
                </span>
              ) : (
                <span className={`badge ${selected.safeToRun ? 'badge-connected' : 'badge-warning'}`}>
                  {selected.safeToRun ? 'Non-interactive' : 'May need terminal input'}
                </span>
              )}
            </div>
          </div>

          {INTERACTIVE_CLI_IDS.has(selected.id) && (
            <div style={{ background: 'var(--accent-amber-dim)', border: '1px solid var(--accent-amber)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <AlertTriangle size={14} style={{ color: 'var(--accent-amber)', flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                <strong>Gateway-only command.</strong> This command opens an interactive session that requires a real console. Run it from an external terminal, or use the <strong>Chat</strong> panel to send tasks via the gateway API.
              </div>
            </div>
          )}

          {/* Args input */}
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 7 }}>Arguments after hermes</label>
            <textarea
              className="input-field"
              value={customArgs}
              onChange={(e) => setCustomArgs(e.target.value)}
              rows={3}
              style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button
                className="btn btn-primary"
                onClick={runSelected}
                disabled={running || INTERACTIVE_CLI_IDS.has(selected.id)}
                onMouseEnter={() => setRunHovered(true)}
                onMouseLeave={() => setRunHovered(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, opacity: (running || INTERACTIVE_CLI_IDS.has(selected.id)) ? 0.45 : 1 }}
              >
                <Play size={13} />
                {running ? 'Running…' : 'Run'}
                {runHovered && !running && !INTERACTIVE_CLI_IDS.has(selected.id) && (
                  <span className="kbd" style={{ fontSize: 10.5, marginLeft: 2 }}>Enter</span>
                )}
              </button>
              <button className="btn btn-ghost" onClick={copyCommand} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Streaming terminal output */}
          <StreamingBlock
            lines={streamLines}
            running={running}
            result={result}
            onClear={() => { setStreamLines([]); setResult(null); }}
          />
        </div>
      </div>
    </div>
  );
}
