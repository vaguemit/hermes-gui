import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Download, Play, RefreshCw, Settings, Terminal, XCircle } from 'lucide-react';
import { CommandResult, HermesInstallStatus, getHermesInstallStatus, installHermes, runHermesCommand } from '../api/desktop';
import { CLI_COMMANDS } from '../data/hermesCatalog';

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`badge ${ok ? 'badge-success' : 'badge-warning'}`} style={{ whiteSpace: 'nowrap' }}>
      {ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
      {label}
    </span>
  );
}

function ResultBlock({ result }: { result: CommandResult | null }) {
  if (!result) return null;
  const body = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n\n');
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {result.success ? <CheckCircle2 size={14} style={{ color: 'var(--success)' }} /> : <XCircle size={14} style={{ color: 'var(--error)' }} />}
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{result.command}</span>
        {result.code !== null && <span className="badge badge-muted">exit {result.code}</span>}
      </div>
      <pre style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, lineHeight: 1.55, maxHeight: 260, overflow: 'auto', padding: 12, whiteSpace: 'pre-wrap' }}>
        {body || '(no output)'}
      </pre>
    </div>
  );
}

export default function InstallPanel() {
  const [status, setStatus] = useState<HermesInstallStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<CommandResult | null>(null);

  const safeAdminCommands = useMemo(
    () => CLI_COMMANDS.filter((cmd) => ['status', 'doctor', 'dump', 'update-check'].includes(cmd.id)),
    []
  );

  const refresh = async () => {
    setLoading(true);
    try {
      setStatus(await getHermesInstallStatus());
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

  const installCommand = /win/i.test(status?.platform || '')
    ? 'irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1 | iex'
    : 'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash';

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '22px 26px' }}>
      <div style={{ maxWidth: 980 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Download size={20} style={{ color: 'var(--accent)' }} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>Install and Runtime</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hermes Agent discovery, official install, setup, health, and diagnostics</div>
          </div>
          <button className="btn-ghost" onClick={refresh} disabled={loading} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, opacity: loading ? 0.7 : 1 }}>
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : undefined }} />
            Refresh
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Terminal size={15} style={{ color: 'var(--accent)' }} />
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>Agent Binary</span>
            </div>
            <StatusPill ok={Boolean(status?.installed)} label={status?.installed ? 'Installed' : 'Missing'} />
            <div style={{ marginTop: 10, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, overflowWrap: 'anywhere' }}>
              {status?.binary_path || status?.repo_path || 'No Hermes executable found'}
            </div>
          </div>

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Settings size={15} style={{ color: 'var(--tool-blue)' }} />
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>Configuration</span>
            </div>
            <StatusPill ok={Boolean(status?.configured)} label={status?.configured ? 'Ready' : 'Needs setup'} />
            <div style={{ marginTop: 10, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, overflowWrap: 'anywhere' }}>
              {status?.hermes_home || '~/.hermes'}
            </div>
          </div>

          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Activity size={15} style={{ color: 'var(--success)' }} />
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>API Gateway</span>
            </div>
            <StatusPill ok={Boolean(status?.api_healthy)} label={status?.api_healthy ? 'Healthy' : 'Offline'} />
            <div style={{ marginTop: 10, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5 }}>
              http://127.0.0.1:8642
            </div>
          </div>
        </div>

        {status?.last_error && (
          <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, color: 'var(--warning)', fontSize: 12.5, padding: '10px 12px', marginBottom: 16 }}>
            {status.last_error}
          </div>
        )}

        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>Official Installer</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>Runs the Nous Research installer with setup skipped, then lets you launch setup from this app.</div>
              <pre style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 7, padding: '9px 11px', color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{installCommand}</pre>
            </div>
            <button className="btn-primary" onClick={() => runAction('installer', installHermes)} disabled={running !== null} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, opacity: running ? 0.75 : 1 }}>
              <Download size={14} />
              {running === 'installer' ? 'Installing...' : 'Install Hermes'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }}>
          <button className="btn-primary" onClick={() => runAction('setup', () => runHermesCommand(['setup', '--quick', '--non-interactive'], 180))} disabled={running !== null} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12.5 }}>
            <Play size={13} /> Quick Setup
          </button>
          {safeAdminCommands.map((cmd) => (
            <button key={cmd.id} className="btn-ghost" onClick={() => runAction(cmd.id, () => runHermesCommand(cmd.args, cmd.id === 'doctor' ? 120 : 45))} disabled={running !== null} style={{ fontSize: 12.5 }}>
              {running === cmd.id ? 'Running...' : cmd.title}
            </button>
          ))}
        </div>

        <ResultBlock result={result} />
      </div>
    </div>
  );
}
