import { useState, useEffect, useRef, useCallback } from 'react';
import {
  claw3dStatus, claw3dSetup, claw3dStartAll, claw3dStopAll,
  claw3dSetPort, claw3dSetWsUrl, claw3dGetLogs,
  onClaw3dSetupProgress, type Claw3dStatus, type Claw3dSetupProgress,
} from '../api/desktop';

type OfficeState = 'checking' | 'not-installed' | 'installing' | 'ready' | 'error';

interface Props {
  profile?: string;
  visible?: boolean;
}

export default function OfficePanel({ profile, visible }: Props) {
  const [state, setState] = useState<OfficeState>('checking');
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [port, setPort] = useState(3000);
  const [portInput, setPortInput] = useState('3000');
  const [portInUse, setPortInUse] = useState(false);
  const [wsUrlInput, setWsUrlInput] = useState('ws://localhost:18789');
  const [error, setError] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [progress, setProgress] = useState<Claw3dSetupProgress>({
    step: 0, totalSteps: 2, title: 'Preparing...', detail: '', log: '',
  });
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const startingRef = useRef(starting);
  const runningRef = useRef(running);
  const errorRef = useRef(error);
  startingRef.current = starting;
  runningRef.current = running;
  errorRef.current = error;

  const checkStatus = useCallback(async () => {
    setState('checking');
    const status: Claw3dStatus = await claw3dStatus();
    setRemoteUrl(status.remoteUrl ?? null);
    setRunning(status.running);
    setPort(status.port);
    setPortInput(String(status.port));
    setPortInUse(status.portInUse);
    setWsUrlInput(status.wsUrl || 'ws://localhost:18789');
    if (status.error) setError(status.error);
    setState(status.installed || status.remoteUrl ? 'ready' : 'not-installed');
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  useEffect(() => {
    if (state !== 'ready' || !visible) return;
    const interval = setInterval(async () => {
      const status = await claw3dStatus();
      setRemoteUrl(status.remoteUrl ?? null);
      setRunning(status.running);
      setPort(status.port);
      setPortInUse(status.portInUse);
      if (status.error && !errorRef.current) setError(status.error);
      if (startingRef.current && status.running) setStarting(false);
      if (!startingRef.current && !status.running && runningRef.current) {
        setRunning(false);
        if (status.error) setError(status.error);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [state, visible]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [progress.log, logs]);

  async function handleInstall() {
    setState('installing');
    setError('');
    const cleanup = onClaw3dSetupProgress((p) => setProgress(p));
    try {
      const result = await claw3dSetup();
      cleanup();
      if (result.success) { setState('ready'); }
      else { setError(result.error || 'Setup failed'); setState('error'); }
    } catch (err) {
      cleanup();
      setError((err as Error).message || 'Setup failed');
      setState('error');
    }
  }

  async function handleStartStop() {
    if (running) {
      await claw3dStopAll();
      setRunning(false);
      setError('');
    } else {
      setError('');
      setStarting(true);
      const result = await claw3dStartAll(profile);
      if (!result.success) { setError(result.error || 'Failed to start Claw3D'); setStarting(false); }
      else { setTimeout(() => setRunning(true), 2000); }
    }
  }

  async function handlePortSave() {
    const newPort = parseInt(portInput, 10);
    if (isNaN(newPort) || newPort < 1024 || newPort > 65535) return;
    await claw3dSetPort(newPort);
    setPort(newPort);
    const status = await claw3dStatus();
    setPortInUse(status.portInUse);
  }

  async function handleWsUrlSave() {
    const trimmed = wsUrlInput.trim();
    if (!trimmed) return;
    await claw3dSetWsUrl(trimmed);
  }

  async function loadLogs() {
    const l = await claw3dGetLogs();
    setLogs(l);
    setShowLogs(true);
  }

  const percent = progress.totalSteps > 0 ? Math.round((progress.step / progress.totalSteps) * 100) : 0;
  const claw3dUrl = remoteUrl || `http://localhost:${port}`;

  if (state === 'checking') {
    return (
      <div className="settings-container">
        <h1 className="settings-header">Office</h1>
        <div className="office-center">
          <div className="office-spinner" />
          <p className="office-muted">Checking Claw3D status...</p>
        </div>
      </div>
    );
  }

  if (state === 'not-installed' || state === 'error') {
    return (
      <div className="settings-container">
        <h1 className="settings-header">Office</h1>
        <div className="office-center">
          <div className="office-setup-card">
            <h2 className="office-setup-title">Set up Claw3D</h2>
            <p className="office-setup-desc">
              Claw3D is a 3D visual workspace that connects to your Hermes agent.
            </p>
            <p className="office-setup-desc">
              Click Install to clone and set it up automatically.
            </p>
            {error && <div className="office-error">{error}</div>}
            <div className="office-setup-actions">
              <button className="btn btn-primary" onClick={handleInstall}>
                Install Claw3D
              </button>
              <a
                className="btn btn-secondary"
                href="https://github.com/iamlukethedev/Claw3D"
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'installing') {
    return (
      <div className="settings-container">
        <h1 className="settings-header">Office</h1>
        <div className="office-installing">
          <h2 className="office-install-title">Installing Claw3D</h2>
          <div className="install-progress-container">
            <div className="install-progress-bar">
              <div className="install-progress-fill" style={{ width: `${percent}%` }} />
            </div>
            <div className="install-percent">{percent}%</div>
          </div>
          <div className="install-step-info">
            <div className="install-step-title">
              Step {progress.step}/{progress.totalSteps}: {progress.title}
            </div>
            <div className="install-step-detail">{progress.detail}</div>
          </div>
          <div className="install-log" ref={logRef}>
            {progress.log || 'Waiting to start...'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="office-ready">
      <div className="office-toolbar">
        <div className="office-toolbar-left">
          <h1 className="office-toolbar-title">Office</h1>
          <span className={`office-status-dot ${running ? 'running' : 'stopped'}`} />
          <span className="office-status-label">
            {starting ? 'Starting...' : running ? 'Running' : 'Stopped'}
          </span>
        </div>
        <div className="office-toolbar-right">
          <button
            className={`btn btn-sm ${running ? 'btn-secondary' : 'btn-primary'}`}
            onClick={handleStartStop}
            disabled={starting || (portInUse && !running)}
          >
            {starting ? 'Starting...' : running ? 'Stop' : 'Start'}
          </button>
          {running && (
            <a
              className="btn-ghost office-toolbar-btn"
              href={claw3dUrl}
              target="_blank"
              rel="noreferrer"
              title="Open in browser"
            >
              ↗
            </a>
          )}
          <button
            className="btn-ghost office-toolbar-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="office-settings-bar">
          <div className="office-setting">
            <label className="office-setting-label">Port</label>
            <input
              className="office-port-input"
              type="number" min={1024} max={65535}
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              onBlur={handlePortSave}
              onKeyDown={(e) => { if (e.key === 'Enter') handlePortSave(); }}
            />
          </div>
          <div className="office-setting">
            <label className="office-setting-label">WebSocket URL</label>
            <input
              className="office-ws-input"
              type="text"
              value={wsUrlInput}
              onChange={(e) => setWsUrlInput(e.target.value)}
              onBlur={handleWsUrlSave}
              onKeyDown={(e) => { if (e.key === 'Enter') handleWsUrlSave(); }}
              placeholder="ws://localhost:18789"
            />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={loadLogs}>
            View Logs
          </button>
        </div>
      )}

      {portInUse && !running && (
        <div className="office-warning-bar">
          Port {port} is already in use. Change the port in settings.
        </div>
      )}

      {error && (
        <div className="office-error-bar">
          <div className="office-error-text">{error}</div>
          <div className="office-error-actions">
            <button className="btn btn-secondary btn-sm" onClick={loadLogs}>View Logs</button>
            <button className="btn btn-secondary btn-sm" onClick={() => setError('')}>Dismiss</button>
          </div>
        </div>
      )}

      {showLogs && (
        <div className="office-logs-panel">
          <div className="office-logs-header">
            <span>Process Logs</span>
            <button className="btn-ghost" onClick={() => setShowLogs(false)}>Close</button>
          </div>
          <div className="office-logs-content" ref={logRef}>
            {logs || 'No logs yet.'}
          </div>
        </div>
      )}

      <div className="office-content">
        {running && !showLogs ? (
          <iframe
            src={claw3dUrl}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title="Claw3D Office"
          />
        ) : !showLogs ? (
          <div className="office-center">
            <p className="office-muted">
              {portInUse && !running
                ? `Port ${port} is in use. Change port in settings.`
                : 'Click Start to launch Claw3D.'}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
