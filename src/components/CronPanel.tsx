import React, { useState, useEffect, useRef } from 'react';
import { useStore, CronJob } from '../store';
import { isTauriApp } from '../api/desktop';
import { useHermesClient } from '../lib/hermes';
import { getBaseUrl, getAuthHeaders } from '../api/hermes';
import { Clock, Plus, Trash2, Play } from 'lucide-react';

const generateId = () => Math.random().toString(36).slice(2);

/** Convert a hermes schedule value (string OR {kind,expr/minutes/run_at} object) to a display string. */
function formatSchedule(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && raw !== null) {
    const s = raw as Record<string, unknown>;
    if (s.kind === 'cron' && s.expr) return String(s.expr);
    if (s.kind === 'interval' && s.minutes) return `Every ${s.minutes} min`;
    if (s.kind === 'once' && s.run_at) return `Once at ${s.run_at}`;
    if (s.value) return String(s.value);
  }
  return '';
}

// Extended type used locally — `mode` is not in the store CronJob interface
// but is serialized to gui-crons.json and read back. Old entries without it default to 'auto'.
type CronJobWithMode = CronJob & { mode?: 'auto' | 'gateway' | 'pty' };

/** Returns true when a cron should fire right now based on its schedule string. */
function shouldFire(cron: CronJob): boolean {
  const now = new Date();
  const schedule = cron.schedule.trim().toLowerCase();

  // "Daily at HH:MM" — fire once per day at that time (within the current minute)
  const dailyMatch = schedule.match(/^daily at (\d{1,2}):(\d{2})$/);
  if (dailyMatch) {
    const h = parseInt(dailyMatch[1], 10);
    const m = parseInt(dailyMatch[2], 10);
    if (now.getHours() === h && now.getMinutes() === m) {
      const today = now.toISOString().slice(0, 10);
      if (cron.lastRun === today) return false;
      return true;
    }
    return false;
  }

  // "Every N minutes" — fire when elapsed minutes since lastRun >= N
  const intervalMatch = schedule.match(/^every (\d+) minutes?$/);
  if (intervalMatch) {
    const n = parseInt(intervalMatch[1], 10);
    if (!cron.lastRun) return true;
    const last = new Date(cron.lastRun);
    return (now.getTime() - last.getTime()) >= n * 60 * 1000;
  }

  // "Every Monday" / "Every [weekday]" — fire once on the matching weekday
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayMatch = schedule.match(/^every (\w+)$/);
  if (dayMatch) {
    const dayIndex = days.indexOf(dayMatch[1]);
    if (dayIndex === -1) return false;
    if (now.getDay() !== dayIndex) return false;
    const today = now.toISOString().slice(0, 10);
    if (cron.lastRun === today) return false;
    return true;
  }

  return false;
}

export default function CronPanel() {
  const client = useHermesClient();
  const { crons, addCron, toggleCron, deleteCron, updateCronLastRun, platforms, gatewayStatus, addToast } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ schedule: '', description: '', platform: 'Telegram', mode: 'auto' as 'auto' | 'gateway' | 'pty' });

  // Load crons from disk on mount
  useEffect(() => {
    if (!isTauriApp()) return;

    // Load cron jobs from hermes-native cron/jobs.json
    client.readFile('cron/jobs.json').then(raw => {
      const nativeJobs = JSON.parse(raw);
      if (!Array.isArray(nativeJobs)) return;
      const mapped: CronJob[] = nativeJobs.map((j: {
        id?: string;
        prompt?: string;
        name?: string;
        schedule_display?: string;
        schedule?: string;
        deliver?: string | string[];
        enabled?: boolean;
        state?: string;
        last_run_at?: string;
      }) => ({
        id: j.id || generateId(),
        description: j.prompt || j.name || 'Unnamed',
        schedule: j.schedule_display || formatSchedule(j.schedule) || 'Unknown',
        platform: Array.isArray(j.deliver) ? j.deliver[0] : (j.deliver || 'local'),
        active: j.enabled !== false && j.state !== 'paused',
        lastRun: j.last_run_at ? new Date(j.last_run_at).toISOString().slice(0, 10) : undefined,
        source: 'hermes' as const,
      }));
      useStore.setState(state => {
        const existingIds = new Set(state.crons.map(c => c.id));
        const newJobs = mapped.filter(j => !existingIds.has(j.id));
        return { crons: [...state.crons, ...newJobs] };
      });
    }).catch(() => {}); // file may not exist
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist crons to disk in hermes-native format so hermes scheduler can execute them
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isTauriApp()) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const nativeCrons = crons.map(c => ({
        id: c.id,
        prompt: c.description,
        name: c.description,
        schedule_display: c.schedule,
        schedule: c.schedule,
        deliver: [c.platform],
        enabled: c.active,
        state: c.active ? 'idle' : 'paused',
        last_run_at: c.lastRun ?? null,
      }));
      client.writeFile('cron/jobs.json', JSON.stringify(nativeCrons, null, 2)).catch(() => {});
    }, 800);
  }, [crons]);

  // Dispatch routing: 'auto' tries gateway first and falls back to PTY if the gateway
  // is not connected. 'gateway' and 'pty' force a specific path. PTY runs hermes CLI
  // directly (no gateway required); gateway sends to http://127.0.0.1:8642/v1/chat/completions.
  async function dispatchCronTask(cron: CronJobWithMode): Promise<void> {
    const effectiveMode = cron.mode ?? 'auto';
    const gatewayAlive = useStore.getState().gatewayStatus === 'connected';

    if (effectiveMode === 'gateway' && !gatewayAlive) {
      addToast(`Cron "${cron.description.slice(0, 40)}" failed — gateway unreachable. Switching to PTY.`, 'error');
      // Fall through to PTY
    }

    const usePty = effectiveMode === 'pty' || (effectiveMode === 'auto' && !gatewayAlive) || (effectiveMode === 'gateway' && !gatewayAlive);

    if (usePty) {
      try {
        const result = await client.runHermesCommand(['chat', '-q', cron.description, '-Q', '--source', 'cron'], 120);
        if (!result.success) {
          addToast(`Cron "${cron.description.slice(0, 40)}" PTY run failed: ${result.stderr.slice(0, 80)}`, 'error');
          console.error(`[cron] PTY task "${cron.description}" failed:`, result.stderr);
        }
      } catch (err) {
        addToast(`Cron "${cron.description.slice(0, 40)}" PTY run error`, 'error');
        console.error(`[cron] PTY task "${cron.description}" threw:`, err);
      }
      return;
    }

    // Gateway path
    try {
      const res = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          model: 'auto',
          messages: [{ role: 'user', content: cron.description }],
          stream: false,
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        addToast(`Cron "${cron.description.slice(0, 40)}" failed — gateway returned ${res.status}.`, 'error');
        console.error(`[cron] task "${cron.description}" failed: gateway returned ${res.status}`);
      }
    } catch (err) {
      addToast(`Cron "${cron.description.slice(0, 40)}" failed — gateway unreachable. Switching to PTY.`, 'error');
      console.error(`[cron] task "${cron.description}" failed: gateway not reachable`, err);
      // Auto-retry via PTY when gateway drops mid-run
      if (effectiveMode === 'auto') {
        try {
          await client.runHermesCommand(['chat', '-q', cron.description, '-Q', '--source', 'cron'], 120);
        } catch (ptyErr) {
          console.error(`[cron] PTY fallback also failed:`, ptyErr);
        }
      }
    }
  }

  // Live scheduler: check every 60 seconds whether any active cron should fire.
  // Guard: when the gateway is connected its internal scheduler already fires crons every 60s —
  // skip GUI-side dispatch for 'hermes'-sourced jobs to avoid double-firing. GUI-created jobs
  // (no source field) always run here since the gateway doesn't know about them.
  useEffect(() => {
    async function tick() {
      const { crons: current, gatewayStatus: gStatus } = useStore.getState();
      const gatewayManaging = gStatus === 'connected';
      for (const cron of current) {
        if (!cron.active) continue;
        // Skip hermes-native jobs when gateway is managing them
        if (gatewayManaging && (cron as CronJobWithMode & { source?: string }).source === 'hermes') continue;
        if (!shouldFire(cron)) continue;
        const lastRun = new Date().toISOString().slice(0, 10);
        updateCronLastRun(cron.id, lastRun);
        dispatchCronTask(cron as CronJobWithMode);
      }
    }

    tick(); // run once immediately on mount
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [updateCronLastRun]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = (c: CronJob) => {
    toggleCron(c.id);
  };

  const handleDelete = (id: string) => {
    deleteCron(id);
  };

  const handleAdd = () => {
    if (!form.schedule || !form.description) return;
    const id = generateId();
    addCron({ id, schedule: form.schedule, description: form.description, platform: form.platform, active: true, ...(form.mode !== 'auto' ? { mode: form.mode } : {}) } as CronJob);
    setForm({ schedule: '', description: '', platform: 'Telegram', mode: 'auto' });
    setShowForm(false);
  };

  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTestRun = async () => {
    if (!form.description || testRunning) return;
    setTestRunning(true);
    setTestResult(null);

    const gatewayAlive = useStore.getState().gatewayStatus === 'connected';
    const usePty = form.mode === 'pty' || (form.mode === 'auto' && !gatewayAlive);

    if (usePty) {
      try {
        const result = await client.runHermesCommand(['chat', '-q', form.description, '-Q', '--source', 'cron'], 60);
        if (result.success) {
          setTestResult(`✓ ${result.stdout || '(task completed)'}`);
          addToast('Task sent via PTY', 'success');
        } else {
          setTestResult(`PTY run failed: ${result.stderr || result.stdout || '(no output)'}`);
          addToast(`PTY run failed`, 'error');
        }
      } catch (err) {
        setTestResult(`PTY error: ${err instanceof Error ? err.message : String(err)}`);
        addToast(`PTY run error`, 'error');
      } finally {
        setTestRunning(false);
      }
      return;
    }

    const url = `${getBaseUrl()}/v1/chat/completions`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          model: 'auto',
          messages: [{ role: 'user', content: form.description }],
          stream: false,
        }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const data = await res.json() as { choices?: { message?: { content?: string } }[] };
        const reply = data.choices?.[0]?.message?.content ?? '(no response)';
        setTestResult(`✓ ${reply}`);
        addToast('Task sent to gateway', 'success');
      } else {
        let body = '';
        try { body = await res.text(); } catch { /* ignore */ }
        setTestResult(`Gateway returned HTTP ${res.status}${body ? ': ' + body.slice(0, 300) : ''}.\n\nVerify the gateway is healthy in the Gateway panel.`);
        addToast(`Gateway error ${res.status}`, 'error');
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'TimeoutError';
      if (isTimeout) {
        setTestResult('Request timed out (60s). The gateway may be processing — check Gateway panel logs.');
        addToast('Test run timed out', 'error');
      } else {
        if (form.mode === 'auto') {
          // Gateway down in auto mode — fall back to PTY for test run
          addToast(`Cron "${form.description.slice(0, 40)}" failed — gateway unreachable. Switching to PTY.`, 'error');
          setTestResult(`Gateway unreachable. Retrying via PTY…`);
          try {
            const result = await client.runHermesCommand(['chat', '-q', form.description, '-Q', '--source', 'cron'], 60);
            if (result.success) {
              setTestResult(`✓ (PTY fallback) ${result.stdout || '(task completed)'}`);
              addToast('Task completed via PTY fallback', 'success');
            } else {
              setTestResult(`PTY fallback failed: ${result.stderr || '(no output)'}`);
            }
          } catch (ptyErr) {
            setTestResult(`Both gateway and PTY unavailable: ${ptyErr instanceof Error ? ptyErr.message : String(ptyErr)}`);
          }
        } else {
          setTestResult(`Cannot reach gateway at ${url}.\n\nStart the gateway from the Gateway panel, then retry.`);
          addToast('Gateway unreachable', 'error');
        }
      }
    } finally {
      setTestRunning(false);
    }
  };

  const MODE_LABELS: Record<string, string> = { auto: 'Auto', gateway: 'Gateway', pty: 'PTY' };
  const MODE_TITLES: Record<string, string> = {
    auto: 'Try gateway first; fall back to PTY if gateway is offline',
    gateway: 'Gateway only — fails if gateway is not running',
    pty: 'PTY only — runs hermes CLI directly, no gateway required',
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ maxWidth: 700 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <Clock size={20} style={{ color: 'var(--accent-green)' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Cron Scheduler</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Scheduled tasks delivered to any platform</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}>
            <Plus size={14} /> New Cron
          </button>
        </div>

        {/* Gateway offline banner */}
        {(gatewayStatus === 'disconnected' || gatewayStatus === 'error' || gatewayStatus === 'unchecked') && (
          <div style={{
            background: 'var(--accent-amber-dim)',
            border: '1px solid var(--accent-amber)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            marginBottom: 16,
            fontSize: 12.5,
            color: 'var(--accent-amber)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ fontWeight: 700 }}>Gateway offline.</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              Tasks set to "Auto" or "PTY" mode will run via the Hermes CLI. "Gateway" mode tasks will fail.
            </span>
          </div>
        )}

        {/* Add Cron Form */}
        {showForm && (
          <div className="animate-in" style={{ background: 'var(--bg2)', border: '1px solid var(--border-active)', borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 14 }}>Add Scheduled Task</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Schedule</label>
                <input
                  className="input-field"
                  placeholder="e.g. every day at 9am"
                  value={form.schedule}
                  onChange={e => setForm({ ...form, schedule: e.target.value })}
                />
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>Natural language — Hermes parses this</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Delivery Platform</label>
                <select
                  className="input-field"
                  value={form.platform}
                  onChange={e => setForm({ ...form, platform: e.target.value })}
                  style={{ cursor: 'pointer' }}
                >
                  {platforms.map(p => <option key={p.name}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>Task Description</label>
              <textarea
                className="input-field"
                placeholder="What should Hermes do? e.g. Send me a morning briefing with weather and top news"
                rows={3}
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 7 }}>Execution Mode</label>
              <div style={{ display: 'flex', gap: 0, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden', width: 'fit-content' }}>
                {(['auto', 'gateway', 'pty'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setForm({ ...form, mode: m })}
                    title={MODE_TITLES[m]}
                    aria-pressed={form.mode === m}
                    style={{
                      padding: '5px 14px',
                      fontSize: 12,
                      fontWeight: 600,
                      border: 'none',
                      borderRight: m !== 'pty' ? '1px solid var(--border)' : 'none',
                      cursor: 'pointer',
                      background: form.mode === m ? 'var(--bg4)' : 'var(--bg1)',
                      color: form.mode === m ? 'var(--text-primary)' : 'var(--text-secondary)',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {MODE_LABELS[m]}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                {form.mode === 'auto' && 'Try gateway first; fall back to PTY if gateway is offline.'}
                {form.mode === 'gateway' && 'Gateway only — task will fail if gateway is not running.'}
                {form.mode === 'pty' && 'PTY only — runs hermes CLI directly, no gateway required.'}
              </div>
            </div>
            {testResult && (
              <div style={{ marginBottom: 10, fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--bg0)', borderRadius: 6, padding: '8px 12px', color: 'var(--text-secondary)', maxHeight: 80, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                {testResult}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleAdd} style={{ fontSize: 13 }}>Add Task</button>
              <button className="btn btn-ghost" onClick={() => setShowForm(false)} style={{ fontSize: 13 }}>Cancel</button>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 13, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, opacity: (testRunning || !form.description) ? 0.6 : 1 }}
                onClick={handleTestRun}
                disabled={testRunning || !form.description}
              >
                <Play size={12} /> {testRunning ? 'Running…' : 'Test Run'}
              </button>
            </div>
          </div>
        )}

        {/* Cron List */}
        {crons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-secondary)' }}>
            <Clock size={32} style={{ margin: '0 auto 12px', opacity: 0.2, display: 'block' }} />
            <div style={{ fontSize: 14 }}>No scheduled tasks</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Create one with "New Cron" above</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {crons.map((c) => {
              const cWm = c as CronJobWithMode;
              return (
                <div key={c.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{c.description}</span>
                      <span className={`badge ${c.active ? 'badge-connected' : 'badge-muted'}`}>{c.active ? 'Active' : 'Paused'}</span>
                      {c.source === 'hermes' && (
                        <span className="badge badge-info" style={{ fontSize: 10, letterSpacing: '0.04em' }}>hermes</span>
                      )}
                      {cWm.mode && cWm.mode !== 'auto' && (
                        <span className="badge badge-muted" style={{ fontSize: 10, letterSpacing: '0.04em' }}>{MODE_LABELS[cWm.mode]}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span>🕐 {c.schedule}</span>
                      <span style={{ color: c.source === 'hermes' ? 'var(--accent-amber)' : 'var(--text-secondary)' }}>📡 {c.platform}</span>
                      {c.lastRun && <span>↩ Last: {c.lastRun}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <label className="toggle">
                      <input type="checkbox" checked={c.active} onChange={() => handleToggle(c)} />
                      <span className="toggle-slider" />
                    </label>
                    <button
                      onClick={() => handleDelete(c.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 6, borderRadius: 6, transition: 'color 0.15s, background 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent-red)'; (e.currentTarget as HTMLElement).style.background = 'var(--accent-red-dim)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
