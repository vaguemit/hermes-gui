import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clipboard, Download, HeartPulse, Play, RefreshCw, Settings, Terminal, XCircle } from 'lucide-react';
import type { CommandResult } from '../api/desktop';
import { useHermesClient } from '../lib/hermes';
import type { HermesInstallStatus, DoctorResult, UpdateInfo } from '../lib/hermes';
import { CLI_COMMANDS } from '../data/hermesCatalog';

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`badge ${ok ? 'badge-success' : 'badge-warning'}`} style={{ whiteSpace: 'nowrap' }}>
      {ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
      {label}
    </span>
  );
}

function ResultBlock({ result, streamLines }: { result: CommandResult | null; streamLines?: string[] }) {
  const [copied, setCopied] = useState(false);
  if (!result && (!streamLines || streamLines.length === 0)) return null;
  const body = result
    ? [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n\n')
    : streamLines!.join('\n');
  const success = result ? result.success : true;
  const command = result?.command ?? 'hermes install';
  const code = result?.code ?? null;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(body || '(no output)').then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {success ? <CheckCircle2 size={14} style={{ color: 'var(--accent-green)' }} /> : <XCircle size={14} style={{ color: 'var(--accent-red)' }} />}
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{command}</span>
        {code !== null && <span className="badge badge-muted">exit {code}</span>}
        <button
          onClick={copyToClipboard}
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

export default function InstallPanel({ onOpenWizard }: { onOpenWizard?: () => void }) {
  const client = useHermesClient();
  const [status, setStatus] = useState<HermesInstallStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<CommandResult | null>(null);
  const [installLines, setInstallLines] = useState<string[]>([]);

  // Health check state
  const [doctorRunning, setDoctorRunning] = useState(false);
  const [doctorResult, setDoctorResult] = useState<DoctorResult | null>(null);

  // Update check state
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  const safeAdminCommands = useMemo(
    () => CLI_COMMANDS.filter((cmd) => ['status', 'doctor', 'dump', 'update-check'].includes(cmd.id)),
    []
  );

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

  useEffect(() => {
    void refresh();
  }, []);

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
    try {
      const output = await client.installHermes(
        (line) => setInstallLines((prev) => [...prev, line]),
      );
      setResult(output);
      await refresh();
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
        setUpdateMsg('Up to date ✓');
        setTimeout(() => setUpdateMsg(null), 3000);
      }
    } catch (err) {
      setUpdateMsg(err instanceof Error ? err.message : String(err));
      setTimeout(() => setUpdateMsg(null), 3000);
    } finally {
      setUpdateChecking(false);
    }
  };

  const installCommand = /win/i.test(status?.platform || '')
    ? 'irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1 | iex'
    : 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash';

  const isbusy = running !== null || doctorRunning || updateChecking;

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
          <button className="btn btn-ghost" onClick={refresh} disabled={loading} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, opacity: loading ? 0.7 : 1 }}>
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
              {/* Health check button */}
              <button
                className="btn btn-ghost btn-sm"
                onClick={runHealthCheck}
                disabled={isbusy}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, opacity: isbusy ? 0.6 : 1 }}
              >
                <HeartPulse size={13} style={{ color: 'var(--accent-green)' }} />
                {doctorRunning ? 'Checking...' : 'Run Health Check'}
              </button>
              {/* Update check button + result */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {updateInfo?.update_available && (
                  <span className="badge badge-connected" style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5 }}>
                    <CheckCircle2 size={11} />
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
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, color: 'var(--accent-amber)', fontSize: 12.5, padding: '10px 12px', marginBottom: 16 }}>
            {status.last_error}
          </div>
        )}

        {/* Doctor result */}
        {doctorResult && <DoctorResultBlock result={doctorResult} />}

        {/* Official installer block */}
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16, marginTop: doctorResult ? 16 : 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>Official Installer</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 10 }}>Runs the Nous Research installer with setup skipped, then lets you launch setup from this app.</div>
              <pre style={{ background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 11.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{installCommand}</pre>
            </div>
            <button className="btn btn-primary" onClick={runInstall} disabled={isbusy} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, opacity: isbusy ? 0.75 : 1 }}>
              <Download size={14} />
              {running === 'installer' ? 'Installing...' : 'Install Hermes'}
            </button>
          </div>
        </div>

        {/* Quick action buttons */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
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

        {running === 'installer' && installLines.length > 0 && !result && (
          <ResultBlock result={null} streamLines={installLines} />
        )}
        {result && <ResultBlock result={result} />}
      </div>
    </div>
  );
}
