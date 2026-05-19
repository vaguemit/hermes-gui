import React, { useState, useEffect, useRef } from 'react';
import { useStore, CronJob } from '../store';
import { runHermesCommand, readFile, writeFile, isTauriApp } from '../api/desktop';
import { getBaseUrl, getAuthHeaders } from '../api/hermes';
import { Clock, Plus, Trash2, Play } from 'lucide-react';

const generateId = () => Math.random().toString(36).slice(2);

export default function CronPanel() {
  const { crons, addCron, toggleCron, deleteCron, updateCronLastRun, platforms } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ schedule: '', description: '', platform: 'Telegram' });

  // Load crons from disk on mount
  useEffect(() => {
    if (!isTauriApp()) return;

    // Load GUI-created crons
    readFile('gui-crons.json').then(raw => {
      const loaded: CronJob[] = JSON.parse(raw);
      if (Array.isArray(loaded) && loaded.length > 0) {
        useStore.setState({ crons: loaded });
      }
    }).catch(() => {}); // file may not exist yet

    // Load hermes-native cron jobs from cron/jobs.json
    readFile('cron/jobs.json').then(raw => {
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
        schedule: j.schedule_display || j.schedule || 'Unknown',
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

  // Persist crons to disk whenever they change
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isTauriApp()) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      writeFile('gui-crons.json', JSON.stringify(crons)).catch(() => {});
    }, 800);
  }, [crons]);

  // Live scheduler: check every 60 seconds whether any active cron should fire
  useEffect(() => {
    function shouldFire(cron: CronJob): boolean {
      const now = new Date();
      const schedule = cron.schedule.trim().toLowerCase();

      // "Daily at HH:MM" — fire once per day at that time (within the current minute)
      const dailyMatch = schedule.match(/^daily at (\d{1,2}):(\d{2})$/);
      if (dailyMatch) {
        const h = parseInt(dailyMatch[1], 10);
        const m = parseInt(dailyMatch[2], 10);
        if (now.getHours() === h && now.getMinutes() === m) {
          // Only fire once per day: check lastRun date
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

    async function tick() {
      const { crons: current } = useStore.getState();
      for (const cron of current) {
        if (!cron.active) continue;
        if (!shouldFire(cron)) continue;
        const now = new Date();
        const lastRun = now.toISOString().slice(0, 10);
        updateCronLastRun(cron.id, lastRun);
        // Fire-and-forget via gateway API; falls back to CLI if gateway is not running
        (async () => {
          try {
            const res = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
              body: JSON.stringify({
                model: 'auto',
                messages: [{ role: 'user', content: cron.description }],
                stream: false,
              }),
              signal: AbortSignal.timeout(120_000),
            });
            if (!res.ok) {
              await runHermesCommand(['chat', '-q', cron.description], 120).catch(() => {});
            }
          } catch {
            await runHermesCommand(['chat', '-q', cron.description], 120).catch(() => {});
          }
        })();
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
    addCron({ id, ...form, active: true });
    setForm({ schedule: '', description: '', platform: 'Telegram' });
    setShowForm(false);
  };

  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleTestRun = async () => {
    if (!form.description || testRunning) return;
    setTestRunning(true);
    setTestResult(null);
    try {
      const res = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
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
        setTestResult(data.choices?.[0]?.message?.content ?? '(no response)');
      } else {
        // Fallback to CLI if gateway returns error
        const result = await runHermesCommand(['chat', '-q', form.description], 60);
        setTestResult(result.success ? (result.stdout.trim() || 'Done.') : (result.stderr.trim() || 'Task failed.'));
      }
    } catch {
      // Fallback to CLI if fetch fails (gateway not running)
      try {
        const result = await runHermesCommand(['chat', '-q', form.description], 60);
        setTestResult(result.success ? (result.stdout.trim() || 'Done.') : (result.stderr.trim() || 'Task failed.'));
      } catch (e) {
        setTestResult(e instanceof Error ? e.message : 'Error running task');
      }
    } finally {
      setTestRunning(false);
    }
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
                style={{ fontSize: 13, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, opacity: testRunning ? 0.6 : 1 }}
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
            {crons.map((c) => (
              <div key={c.id} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.description}</span>
                    <span className={`badge ${c.active ? 'badge-connected' : 'badge-muted'}`}>{c.active ? 'Active' : 'Paused'}</span>
                    {c.source === 'hermes' && (
                      <span className="badge badge-info" style={{ fontSize: 10, letterSpacing: '0.04em' }}>hermes</span>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
