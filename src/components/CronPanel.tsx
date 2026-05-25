import React, { useState, useEffect, useRef } from 'react';
import { useStore, CronJob } from '../store';
import { isTauriApp } from '../api/desktop';
import { useHermesClient } from '../lib/hermes';
import { Clock, Plus, Trash2, Play, Search, X } from 'lucide-react';

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

/** Estimate the next run time label from a schedule string. */
function estimateNextRun(schedule: string): string {
  const s = schedule.toLowerCase();
  if (s.includes('daily') || s.includes('every day')) return 'Tomorrow';
  if (s.includes('hourly') || s.includes('every hour')) return 'In ~1 hour';
  if (s.includes('monday') || s.includes('weekly')) return 'Next Monday';
  if (s.includes('minute')) return 'In <1 min';
  return 'Scheduled';
}

/** Format a lastRun string as a relative label. */
function formatLastRun(lastRun: string | undefined): string {
  if (!lastRun) return 'Never';
  const d = new Date(lastRun);
  if (isNaN(d.getTime())) return lastRun;
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d ago`;
}

type SortMode = 'active-first' | 'a-z';

export default function CronPanel() {
  const client = useHermesClient();
  const { crons, addCron, toggleCron, deleteCron, updateCronLastRun, platforms, gatewayStatus, addToast } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: '', platform: 'Telegram', mode: 'auto' as 'auto' | 'gateway' | 'pty' });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('active-first');

  type FreqTab = 'minutes' | 'hourly' | 'daily' | 'weekly' | 'custom';
  const [freqTab, setFreqTab] = useState<FreqTab>('daily');
  const [freqMinutes, setFreqMinutes] = useState('30');
  const [freqHour, setFreqHour] = useState('9');
  const [freqMinute, setFreqMinute] = useState('0');
  const [freqDay, setFreqDay] = useState('monday');
  const [freqDayHour, setFreqDayHour] = useState('9');
  const [freqCustom, setFreqCustom] = useState('');

  function buildSchedule(): string {
    switch (freqTab) {
      case 'minutes': return `Every ${freqMinutes} minutes`;
      case 'hourly': return `Every hour at :${freqMinute.padStart(2, '0')}`;
      case 'daily': return `Daily at ${freqHour}:${freqMinute.padStart(2, '0')}`;
      case 'weekly': return `Every ${freqDay} at ${freqDayHour}:00`;
      case 'custom': return freqCustom;
      default: return '';
    }
  }
  // Per-row run state: id -> 'running' | 'done' | 'error'
  const [rowRunState, setRowRunState] = useState<Record<string, 'running' | 'done' | 'error'>>({});

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
      const res = await fetch(`${client.getGatewayUrl()}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...client.getGatewayHeaders() },
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
    const schedule = buildSchedule();
    if (!schedule || !form.description) return;
    const id = generateId();
    addCron({ id, schedule, description: form.description, platform: form.platform, active: true, ...(form.mode !== 'auto' ? { mode: form.mode } : {}) } as CronJob);
    setForm({ description: '', platform: 'Telegram', mode: 'auto' });
    setFreqCustom('');
    setShowForm(false);
  };

  const handleRunNow = async (cron: CronJobWithMode) => {
    if (rowRunState[cron.id] === 'running') return;
    setRowRunState(prev => ({ ...prev, [cron.id]: 'running' }));
    try {
      const result = await client.runHermesCommand(['cron', 'run', cron.id]);
      if (result.success) {
        setRowRunState(prev => ({ ...prev, [cron.id]: 'done' }));
        addToast(`Cron "${cron.description.slice(0, 40)}" triggered`, 'success');
      } else {
        setRowRunState(prev => ({ ...prev, [cron.id]: 'error' }));
        addToast(`Cron run failed: ${result.stderr.slice(0, 80)}`, 'error');
      }
    } catch {
      setRowRunState(prev => ({ ...prev, [cron.id]: 'error' }));
      addToast(`Cron run error`, 'error');
    }
    // Clear indicator after 3 seconds
    setTimeout(() => {
      setRowRunState(prev => {
        const next = { ...prev };
        delete next[cron.id];
        return next;
      });
    }, 3000);
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

    const url = `${client.getGatewayUrl()}/v1/chat/completions`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...client.getGatewayHeaders() },
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

  // Filtered + sorted cron list
  const filteredCrons = crons
    .filter(c => !searchQuery || c.description.toLowerCase().includes(searchQuery.toLowerCase()))
    .slice()
    .sort((a, b) => {
      if (sortMode === 'active-first') {
        if (a.active === b.active) return 0;
        return a.active ? -1 : 1;
      }
      // a-z
      return a.description.localeCompare(b.description);
    });

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
            {/* Frequency Picker */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Frequency</label>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                {(['minutes', 'hourly', 'daily', 'weekly', 'custom'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setFreqTab(tab)}
                    style={{
                      padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                      border: `1px solid ${freqTab === tab ? 'var(--accent-green)' : 'var(--border)'}`,
                      background: freqTab === tab ? 'var(--accent-green-dim)' : 'transparent',
                      color: freqTab === tab ? 'var(--accent-green)' : 'var(--text-secondary)',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {tab === 'minutes' ? 'Every N min' : tab === 'custom' ? 'Custom CRON' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {freqTab === 'minutes' && (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Every</span>
                    <input type="number" className="input-field" min={1} max={1440} value={freqMinutes} onChange={e => setFreqMinutes(e.target.value)} style={{ width: 70 }} />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>minutes</span>
                  </>
                )}
                {freqTab === 'hourly' && (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>At minute</span>
                    <input type="number" className="input-field" min={0} max={59} value={freqMinute} onChange={e => setFreqMinute(e.target.value)} style={{ width: 70 }} />
                  </>
                )}
                {freqTab === 'daily' && (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>At</span>
                    <input type="number" className="input-field" min={0} max={23} value={freqHour} onChange={e => setFreqHour(e.target.value)} style={{ width: 70 }} placeholder="Hour" />
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>:</span>
                    <input type="number" className="input-field" min={0} max={59} value={freqMinute} onChange={e => setFreqMinute(e.target.value)} style={{ width: 70 }} placeholder="Min" />
                  </>
                )}
                {freqTab === 'weekly' && (
                  <>
                    <select className="input-field" value={freqDay} onChange={e => setFreqDay(e.target.value)} style={{ cursor: 'pointer' }}>
                      {['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(d => <option key={d} value={d}>{d.charAt(0).toUpperCase()+d.slice(1)}</option>)}
                    </select>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>at hour</span>
                    <input type="number" className="input-field" min={0} max={23} value={freqDayHour} onChange={e => setFreqDayHour(e.target.value)} style={{ width: 70 }} />
                  </>
                )}
                {freqTab === 'custom' && (
                  <div style={{ flex: 1 }}>
                    <input className="input-field" placeholder="*/30 * * * *" value={freqCustom} onChange={e => setFreqCustom(e.target.value)} style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }} />
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>Standard CRON expression</div>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
                Schedule: {buildSchedule() || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
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

        {/* Search + Sort bar — only shown when there are crons */}
        {crons.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
              <input
                className="input-field"
                placeholder="Search jobs…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 32, paddingRight: searchQuery ? 32 : 10 }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {/* Sort toggle */}
            <div style={{ display: 'flex', gap: 0, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
              {(['active-first', 'a-z'] as const).map((mode, i) => (
                <button
                  key={mode}
                  onClick={() => setSortMode(mode)}
                  aria-pressed={sortMode === mode}
                  style={{
                    padding: '5px 11px',
                    fontSize: 11,
                    fontWeight: 600,
                    border: 'none',
                    borderRight: i === 0 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer',
                    background: sortMode === mode ? 'var(--bg4)' : 'var(--bg1)',
                    color: sortMode === mode ? 'var(--text-primary)' : 'var(--text-secondary)',
                    transition: 'background 0.15s, color 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {mode === 'active-first' ? 'Active first' : 'A–Z'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Cron List */}
        {crons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <Clock size={36} style={{ margin: '0 auto 14px', opacity: 0.15, display: 'block', color: 'var(--text-primary)' }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No scheduled jobs yet</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 18 }}>Automate recurring tasks and deliver them to any platform</div>
            <button
              className="btn btn-ghost"
              onClick={() => setShowForm(true)}
              style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 7 }}
            >
              <Plus size={14} /> Add your first cron job
            </button>
          </div>
        ) : filteredCrons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
            No jobs match "{searchQuery}"
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredCrons.map((c) => {
              const cWm = c as CronJobWithMode;
              const runState = rowRunState[c.id];
              return (
                <div key={c.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{c.description}</span>
                      <span className={`badge ${c.active ? 'badge-connected' : 'badge-muted'}`}>{c.active ? 'Active' : 'Paused'}</span>
                      {c.source === 'hermes' && (
                        <span className="badge badge-info" style={{ fontSize: 10, letterSpacing: '0.04em' }}>hermes</span>
                      )}
                      {cWm.mode && cWm.mode !== 'auto' && (
                        <span className="badge badge-muted" style={{ fontSize: 10, letterSpacing: '0.04em' }}>{MODE_LABELS[cWm.mode]}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span>🕐 {c.schedule}</span>
                      <span style={{ color: c.source === 'hermes' ? 'var(--accent-amber)' : 'var(--text-secondary)' }}>📡 {c.platform}</span>
                      <span>↩ Last: {formatLastRun(c.lastRun)}</span>
                      {c.active && (
                        <span style={{ color: 'var(--accent-green)' }}>⏭ Next: {estimateNextRun(c.schedule)}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    {/* Run now button */}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleRunNow(cWm)}
                      disabled={runState === 'running'}
                      style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, minWidth: 68 }}
                    >
                      {runState === 'running' && (
                        <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--text-secondary)', borderTopColor: 'var(--text-primary)', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                      )}
                      {runState === 'done' && '✓ Done'}
                      {runState === 'error' && '✗ Error'}
                      {!runState && <><Play size={11} /> Run</>}
                    </button>
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
