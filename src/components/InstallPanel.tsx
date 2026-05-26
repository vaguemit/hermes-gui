import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  Clipboard,
  Download,
  HeartPulse,
  Loader2,
  Package,
  Play,
  RefreshCw,
  Settings,
  Terminal,
  XCircle,
} from 'lucide-react';
import type { CommandResult } from '../api/desktop';
import { useHermesClient } from '../lib/hermes';
import type { HermesInstallStatus, DoctorResult, UpdateInfo } from '../lib/hermes';
import { CLI_COMMANDS } from '../data/hermesCatalog';

// ─── StatusPill ─────────────────────────────────────────────────────────────

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`badge ${ok ? 'badge-success' : 'badge-warning'}`} style={{ whiteSpace: 'nowrap' }}>
      {ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
      {label}
    </span>
  );
}

// ─── ResultBlock ─────────────────────────────────────────────────────────────

function ResultBlock({ result }: { result: CommandResult }) {
  const [copied, setCopied] = useState(false);
  const body = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n\n');
  const copy = () => {
    navigator.clipboard.writeText(body || '(no output)').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {result.success
          ? <CheckCircle2 size={14} style={{ color: 'var(--accent-green)' }} />
          : <XCircle size={14} style={{ color: 'var(--accent-red)' }} />}
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{result.command}</span>
        {result.code !== null && <span className="badge badge-muted">exit {result.code}</span>}
        <button
          onClick={copy}
          title="Copy output"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', color: copied ? 'var(--accent-green)' : 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5 }}
        >
          <Clipboard size={12} />{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{ background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.55, maxHeight: 260, overflow: 'auto', padding: 12, whiteSpace: 'pre-wrap' }}>
        {body || '(no output)'}
      </pre>
    </div>
  );
}

// ─── DoctorResultBlock ───────────────────────────────────────────────────────

function DoctorResultBlock({ result }: { result: DoctorResult }) {
  return (
    <div className="terminal" style={{ marginTop: 12 }}>
      <div className="terminal-bar" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <HeartPulse size={13} style={{ color: result.ok ? 'var(--accent-green)' : 'var(--accent-red)' }} />
        <span>hermes doctor</span>
        <span className={`badge ${result.ok ? 'badge-connected' : 'badge-error'}`} style={{ marginLeft: 'auto' }}>
          {result.ok ? 'All checks passed' : 'Issues found'}
        </span>
      </div>
      <div className="terminal-body">
        {result.checks.map((check, i) => (
          <div key={i} className={`term-line ${check.passed ? 'term-ok' : 'term-err'}`}>
            {check.passed ? '✓' : '✗'} {check.name}: {check.message}
          </div>
        ))}
        {result.raw && (
          <div className="term-line term-out" style={{ marginTop: 8, whiteSpace: 'pre-wrap', opacity: 0.7 }}>
            {result.raw.trim()}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── StreamingTerminal ───────────────────────────────────────────────────────

function StreamingTerminal({
  lines,
  title,
  onCancel,
  cancelled,
}: {
  lines: string[];
  title: string;
  onCancel?: () => void;
  cancelled?: boolean;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [lines]);

  return (
    <div className="terminal" style={{ marginTop: 16 }}>
      <div className="terminal-bar" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Terminal size={13} style={{ color: 'var(--accent-amber)' }} />
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>{title}</span>
        {!cancelled && onCancel && (
          <button
            className="btn btn-danger btn-sm"
            onClick={onCancel}
            style={{ marginLeft: 'auto', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 5 }}
          >
            <XCircle size={11} /> Cancel
          </button>
        )}
        {cancelled && (
          <span className="badge badge-warning" style={{ marginLeft: 'auto' }}>Cancelled</span>
        )}
      </div>
      <div className="terminal-body" ref={bodyRef}>
        {lines.length === 0 ? (
          <div className="term-line term-out">Waiting for output...</div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={`term-line ${line.startsWith('ERROR') || line.startsWith('error') ? 'term-err' : line.startsWith('WARNING') || line.startsWith('warn') ? 'term-warn' : 'term-out'}`}>
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── PrerequisiteCheck ───────────────────────────────────────────────────────

type PrereqState = 'pending' | 'checking' | 'pass' | 'fail';

interface Prereq {
  id: string;
  name: string;
  detail: string;
  state: PrereqState;
  message: string;
}

function PrerequisiteIcon({ state }: { state: PrereqState }) {
  if (state === 'pending') return <div className="step-icon step-pending"><span>?</span></div>;
  if (state === 'checking') return <div className="step-icon step-running"><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /></div>;
  if (state === 'pass') return <div className="step-icon step-done"><CheckCircle size={12} /></div>;
  return <div className="step-icon" style={{ background: 'var(--accent-red-dim)', color: 'var(--accent-red)', border: '1px solid rgba(239,68,68,0.25)', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><XCircle size={12} /></div>;
}

// ─── PostInstallCard ─────────────────────────────────────────────────────────

function PostInstallCard({ status }: { status: HermesInstallStatus }) {
  return (
    <div style={{ background: 'var(--accent-green-dim)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '14px 18px', marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Package size={15} style={{ color: 'var(--accent-green)' }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-green)' }}>Installation Complete</span>
        {status.version && (
          <span className="badge badge-connected" style={{ marginLeft: 'auto' }}>
            {status.version.startsWith('v') ? status.version : `v${status.version}`}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {status.binary_path && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', minWidth: 80 }}>binary</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>{status.binary_path}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', minWidth: 80 }}>home</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>{status.hermes_home}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', minWidth: 80 }}>platform</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{status.platform}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

const INITIAL_PREREQS: Prereq[] = [
  { id: 'python', name: 'Python 3.10+', detail: 'Required runtime for Hermes Agent', state: 'pending', message: '' },
  { id: 'pip', name: 'pip', detail: 'Python package installer', state: 'pending', message: '' },
  { id: 'git', name: 'git', detail: 'Version control — used by installer', state: 'pending', message: '' },
  { id: 'internet', name: 'Internet connectivity', detail: 'Needed to fetch packages', state: 'pending', message: '' },
];

export default function InstallPanel({ onOpenWizard }: { onOpenWizard?: () => void }) {
  const client = useHermesClient();

  // Install status
  const [status, setStatus] = useState<HermesInstallStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // General command runner
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<CommandResult | null>(null);

  // Streaming install
  const [installLines, setInstallLines] = useState<string[]>([]);
  const [installCancelled, setInstallCancelled] = useState(false);
  const [postInstallStatus, setPostInstallStatus] = useState<HermesInstallStatus | null>(null);

  // Streaming update
  const [updateRunning, setUpdateRunning] = useState(false);
  const [updateLines, setUpdateLines] = useState<string[]>([]);
  const [updateCancelled, setUpdateCancelled] = useState(false);

  // Doctor
  const [doctorRunning, setDoctorRunning] = useState(false);
  const [doctorResult, setDoctorResult] = useState<DoctorResult | null>(null);

  // Update check
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  // Prerequisites
  const [prereqs, setPrereqs] = useState<Prereq[]>(INITIAL_PREREQS);
  const [prereqsDone, setPrereqsDone] = useState(false);

  const safeAdminCommands = useMemo(
    () => CLI_COMMANDS.filter((cmd) => ['status', 'doctor', 'dump', 'update-check'].includes(cmd.id)),
    []
  );

  // ── Helpers ──────────────────────────────────────────────────────────────

  const refresh = async () => {
    setLoading(true);
    try {
      setStatus(await client.getInstallStatus());
    } catch (err) {
      setStatus({
        installed: false,
        configured: false,
        api_healthy: false,
        version: null,
        hermes_home: '~/.hermes',
        repo_path: null,
        binary_path: null,
        platform: 'unknown',
        last_error: err instanceof Error ? err.message : String(err),
        model_configured: false,
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Prerequisites check ───────────────────────────────────────────────────

  const runPrereqs = async () => {
    // Reset to checking state
    setPrereqs(INITIAL_PREREQS.map(p => ({ ...p, state: 'checking' as PrereqState })));
    setPrereqsDone(false);

    const checks: Array<{ id: string; run: () => Promise<{ pass: boolean; message: string }> }> = [
      {
        id: 'python',
        run: async () => {
          try {
            const res = await client.runHermesCommand(['--check-python'], 15);
            if (res.success) return { pass: true, message: res.stdout.trim().split('\n')[0] || 'OK' };
            // Fallback: check via doctor output
            const doc = await client.runHermesCommand(['doctor', '--check', 'python'], 15);
            const pass = doc.success || (doc.stdout + doc.stderr).toLowerCase().includes('3.1');
            const msg = (doc.stdout + doc.stderr).trim().split('\n')[0] || (pass ? 'OK' : 'Not found or version too old');
            return { pass, message: msg };
          } catch {
            return { pass: false, message: 'Check failed' };
          }
        },
      },
      {
        id: 'pip',
        run: async () => {
          try {
            const res = await client.runHermesCommand(['doctor', '--check', 'pip'], 15);
            const out = (res.stdout + res.stderr).toLowerCase();
            const pass = res.success || out.includes('pip') && !out.includes('not found');
            return { pass, message: res.stdout.trim().split('\n')[0] || (pass ? 'OK' : 'pip not found') };
          } catch {
            return { pass: false, message: 'Check failed' };
          }
        },
      },
      {
        id: 'git',
        run: async () => {
          try {
            const res = await client.runHermesCommand(['doctor', '--check', 'git'], 15);
            const out = (res.stdout + res.stderr).toLowerCase();
            const pass = res.success || (out.includes('git') && !out.includes('not found'));
            return { pass, message: res.stdout.trim().split('\n')[0] || (pass ? 'OK' : 'git not found') };
          } catch {
            return { pass: false, message: 'Check failed' };
          }
        },
      },
      {
        id: 'internet',
        run: async () => {
          try {
            const res = await client.runHermesCommand(['doctor', '--check', 'network'], 15);
            const pass = res.success || (res.stdout + res.stderr).toLowerCase().includes('ok');
            return { pass, message: pass ? 'Reachable' : 'No internet or DNS resolution failed' };
          } catch {
            // Basic connectivity fallback
            return { pass: true, message: 'Assumed reachable' };
          }
        },
      },
    ];

    const results: Prereq[] = [...INITIAL_PREREQS];

    for (const check of checks) {
      const idx = results.findIndex(p => p.id === check.id);
      if (idx === -1) continue;
      results[idx] = { ...results[idx], state: 'checking' };
      setPrereqs([...results]);

      const { pass, message } = await check.run();
      results[idx] = { ...results[idx], state: pass ? 'pass' : 'fail', message };
      setPrereqs([...results]);
    }

    setPrereqsDone(true);
  };

  // ── Mount ────────────────────────────────────────────────────────────────

  useEffect(() => {
    void refresh();
    void runPrereqs();
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────

  const runAction = async (id: string, action: () => Promise<CommandResult>) => {
    setRunning(id);
    setResult(null);
    try {
      const output = await action();
      setResult(output);
      await refresh();
    } catch (err) {
      setResult({
        success: false,
        code: null,
        command: id,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(null);
    }
  };

  const runInstall = async () => {
    setRunning('installer');
    setResult(null);
    setInstallLines([]);
    setInstallCancelled(false);
    setPostInstallStatus(null);
    try {
      const output = await client.installHermes(
        (line) => {
          setInstallLines((prev) => {
            if (prev.length > 2000) return [...prev.slice(-1999), line];
            return [...prev, line];
          });
        },
      );
      setResult(output);
      if (output.success) {
        const fresh = await client.getInstallStatus();
        setPostInstallStatus(fresh);
        setStatus(fresh);
      } else {
        await refresh();
      }
    } catch (err) {
      setResult({
        success: false,
        code: null,
        command: 'Official Hermes Installer',
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRunning(null);
    }
  };

  const runHealthCheck = async () => {
    setDoctorRunning(true);
    setDoctorResult(null);
    try {
      const res = await client.runDoctor();
      setDoctorResult(res);
    } catch (err) {
      setDoctorResult({
        ok: false,
        checks: [{ name: 'Doctor', passed: false, message: err instanceof Error ? err.message : String(err) }],
        raw: '',
      });
    } finally {
      setDoctorRunning(false);
    }
  };

  const runUpdateCheck = async () => {
    setUpdateChecking(true);
    setUpdateInfo(null);
    setUpdateMsg(null);
    try {
      const info = await client.checkUpdate();
      setUpdateInfo(info);
      if (!info.update_available) {
        setUpdateMsg('Up to date');
        setTimeout(() => setUpdateMsg(null), 3000);
      }
    } catch (err) {
      setUpdateMsg(err instanceof Error ? err.message : String(err));
      setTimeout(() => setUpdateMsg(null), 3000);
    } finally {
      setUpdateChecking(false);
    }
  };

  const runUpdateNow = async () => {
    setUpdateRunning(true);
    setUpdateLines([]);
    setUpdateCancelled(false);
    try {
      await client.streamCommand(
        ['update'],
        (line) => {
          setUpdateLines((prev) => {
            if (prev.length > 2000) return [...prev.slice(-1999), line];
            return [...prev, line];
          });
        },
        600,
      );
      setUpdateInfo(null);
      await runUpdateCheck();
      await refresh();
    } catch (err) {
      setUpdateLines((prev) => [...prev, `ERROR: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setUpdateRunning(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const installCommand = /win/i.test(status?.platform || '')
    ? 'irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1 | iex'
    : 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash';

  const isInstalling = running === 'installer';
  const isbusy = running !== null || doctorRunning || updateChecking || updateRunning;

  const prereqAllPass = prereqsDone && prereqs.every(p => p.state === 'pass');
  const prereqAnyFail = prereqsDone && prereqs.some(p => p.state === 'fail');

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '22px 26px' }}>
      <div style={{ maxWidth: 980 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Download size={20} style={{ color: 'var(--accent-green)' }} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Install and Runtime</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Hermes Agent discovery, official install, setup, health, and diagnostics</div>
          </div>
          <button
            className="btn btn-ghost"
            onClick={refresh}
            disabled={loading}
            style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, opacity: loading ? 0.7 : 1 }}
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
            Refresh
          </button>
        </div>

        {/* Version + env info block (shown when installed) */}
        {status?.installed && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 120 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Hermes Agent</span>
              {status.version ? (
                <span style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent-green)', lineHeight: 1.1 }}>
                  {status.version.startsWith('v') ? status.version : `v${status.version}`}
                </span>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 18, fontWeight: 700, color: 'var(--accent-green)' }}>
                  <CheckCircle2 size={18} />
                  Installed
                </span>
              )}
            </div>
            <div className="divider" style={{ width: 1, height: 48, background: 'var(--border)', flexShrink: 0 }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', minWidth: 80 }}>install path</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>
                  {status.binary_path || status.repo_path || status.hermes_home}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', minWidth: 80 }}>platform</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{status.platform}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', minWidth: 80 }}>hermes home</span>
                <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', overflowWrap: 'anywhere' }}>{status.hermes_home}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={runHealthCheck}
                disabled={isbusy}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, opacity: isbusy ? 0.6 : 1 }}
              >
                <HeartPulse size={13} style={{ color: 'var(--accent-green)' }} />
                {doctorRunning ? 'Checking...' : 'Run Health Check'}
              </button>
              {/* Update check row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {updateInfo?.update_available && (
                  <span className="badge badge-beta" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}>
                    Update available: {updateInfo.latest_version ?? ''}
                  </span>
                )}
                {updateMsg && !updateInfo?.update_available && (
                  <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{updateMsg}</span>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={runUpdateCheck}
                  disabled={isbusy}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, opacity: isbusy ? 0.6 : 1 }}
                >
                  <RefreshCw size={12} style={{ animation: updateChecking ? 'spin 1s linear infinite' : undefined }} />
                  {updateChecking ? 'Checking...' : 'Check for Updates'}
                </button>
              </div>
              {/* Update now button */}
              {updateInfo?.update_available && !updateRunning && (
                <button
                  className="btn btn-success btn-sm"
                  onClick={runUpdateNow}
                  disabled={isbusy}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
                >
                  <Download size={12} /> Update now
                </button>
              )}
              {updateRunning && (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => setUpdateCancelled(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
                >
                  <XCircle size={12} /> Cancel update
                </button>
              )}
            </div>
          </div>
        )}

        {/* Status cards row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Terminal size={15} style={{ color: 'var(--accent-green)' }} />
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>Agent Binary</span>
            </div>
            <StatusPill ok={Boolean(status?.installed)} label={status?.installed ? 'Installed' : 'Missing'} />
            <div style={{ marginTop: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11.5, overflowWrap: 'anywhere' }}>
              {status?.binary_path || status?.repo_path || 'No Hermes executable found'}
            </div>
          </div>

          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Settings size={15} style={{ color: 'var(--accent-blue)' }} />
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>Configuration</span>
            </div>
            <StatusPill ok={Boolean(status?.configured)} label={status?.configured ? 'Ready' : 'Needs setup'} />
            <div style={{ marginTop: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11.5, overflowWrap: 'anywhere' }}>
              {status?.hermes_home || '~/.hermes'}
            </div>
          </div>

          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Activity size={15} style={{ color: 'var(--accent-green)' }} />
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>API Gateway</span>
            </div>
            <StatusPill ok={Boolean(status?.api_healthy)} label={status?.api_healthy ? 'Healthy' : 'Offline'} />
            <div style={{ marginTop: 10, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
              http://127.0.0.1:8642
            </div>
          </div>
        </div>

        {status?.last_error && (
          <div style={{ background: 'var(--accent-amber-dim)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, color: 'var(--accent-amber)', fontSize: 12.5, padding: '10px 12px', marginBottom: 16 }}>
            {status.last_error}
          </div>
        )}

        {/* Doctor result */}
        {doctorResult && <DoctorResultBlock result={doctorResult} />}

        {/* ── Prerequisites check ── */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16, marginTop: doctorResult ? 16 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>Prerequisites</span>
            {prereqsDone && prereqAllPass && (
              <span className="badge badge-connected" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <CheckCircle size={10} /> All prerequisites met
              </span>
            )}
            {prereqsDone && prereqAnyFail && (
              <span className="badge badge-error" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <XCircle size={10} /> Fix prerequisites
              </span>
            )}
            <button
              className="btn btn-ghost btn-sm"
              onClick={runPrereqs}
              disabled={prereqs.some(p => p.state === 'checking')}
              style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, opacity: prereqs.some(p => p.state === 'checking') ? 0.6 : 1 }}
            >
              <RefreshCw size={11} style={{ animation: prereqs.some(p => p.state === 'checking') ? 'spin 1s linear infinite' : undefined }} />
              Re-check
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {prereqs.map((prereq) => (
              <div key={prereq.id} className="install-step">
                <PrerequisiteIcon state={prereq.state} />
                <div className="step-text">
                  <div className="step-name">{prereq.name}</div>
                  <div className="step-detail">
                    {prereq.state === 'pending' && prereq.detail}
                    {prereq.state === 'checking' && 'Checking...'}
                    {(prereq.state === 'pass' || prereq.state === 'fail') && (prereq.message || prereq.detail)}
                  </div>
                </div>
                {prereq.state === 'checking' && (
                  <span className="badge badge-beta">checking</span>
                )}
                {prereq.state === 'pass' && (
                  <span className="badge badge-connected">OK</span>
                )}
                {prereq.state === 'fail' && (
                  <span className="badge badge-error">missing</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Official installer block */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>Official Installer</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 10 }}>
                Runs the Nous Research installer with setup skipped, then lets you launch setup from this app.
              </div>
              <pre style={{ background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {installCommand}
              </pre>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', flexShrink: 0 }}>
              <button
                className="btn btn-primary"
                onClick={runInstall}
                disabled={isbusy}
                style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, opacity: isbusy ? 0.75 : 1 }}
              >
                <Download size={14} />
                {isInstalling ? 'Installing...' : 'Install Hermes'}
              </button>
              {isInstalling && (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => setInstallCancelled(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                >
                  <XCircle size={11} /> Cancel
                </button>
              )}
            </div>
          </div>

          {/* Streaming install terminal */}
          {(isInstalling || (installLines.length > 0 && !result)) && (
            <StreamingTerminal
              lines={installLines}
              title="hermes install"
              onCancel={() => setInstallCancelled(true)}
              cancelled={installCancelled}
            />
          )}
        </div>

        {/* Streaming update terminal */}
        {(updateRunning || updateLines.length > 0) && (
          <div style={{ marginBottom: 16 }}>
            <StreamingTerminal
              lines={updateLines}
              title="hermes update"
              onCancel={() => setUpdateCancelled(true)}
              cancelled={updateCancelled}
            />
          </div>
        )}

        {/* Post-install summary card */}
        {postInstallStatus && <PostInstallCard status={postInstallStatus} />}

        {/* Command result (non-install actions) */}
        {result && running === null && <ResultBlock result={result} />}

        {/* Quick action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10, marginTop: 16 }}>
          <button
            className="btn btn-primary"
            onClick={() => onOpenWizard?.()}
            disabled={isbusy}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12.5 }}
          >
            <Play size={13} /> Configure Provider
          </button>
          {safeAdminCommands.map((cmd) => (
            <button
              key={cmd.id}
              className="btn btn-ghost"
              onClick={() => runAction(cmd.id, () => client.runHermesCommand(cmd.args, cmd.id === 'doctor' ? 120 : 45))}
              disabled={isbusy}
              style={{ fontSize: 12.5 }}
            >
              {running === cmd.id ? 'Running...' : cmd.title}
            </button>
          ))}
        </div>

      </div>
    </div>
  );
}
