import type { HermesClient } from './client'
import type {
  HealthStatus, HermesInstallStatus, CommandResult, ChatMessage, StreamEvent,
  SessionMeta, ProfileMeta, ModelConfig, ApiKeyStatus, DoctorResult, UpdateInfo,
  SkillMeta, CronJobMeta, ConnectionConfig, MemoryFileMeta,
  DependencyStatus, TestResult, StateDbSession, StateDbMessage, SavedModel,
} from './types'
import { UnsupportedCapabilityError } from './errors'

export class RemoteHermesClient implements HermesClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private authHeaders(): Record<string, string> {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    let key = this.apiKey
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const stored = await invoke<string | null>('get_remote_api_key')
      if (stored) key = stored
    } catch { /* not in Tauri context */ }
    if (!key) throw new Error('No remote API key configured. Go to Settings > Connection.')
    return { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  }

  async getHealth(): Promise<HealthStatus> {
    const t0 = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
        headers: this.authHeaders(),
      });
      return { healthy: res.ok, latencyMs: Date.now() - t0 };
    } catch {
      return { healthy: false, latencyMs: Date.now() - t0 };
    }
  }

  async getGatewayStatus(): Promise<boolean> {
    const h = await this.getHealth();
    return h.healthy;
  }

  async streamChat(
    messages: ChatMessage[],
    model: string,
    onEvent: (e: StreamEvent) => void,
    sessionId?: string | null,
    signal?: AbortSignal,
  ): Promise<void> {
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (sessionId) body['session_id'] = sessionId;

    const authHeaders = await this.getAuthHeaders().catch(() => this.authHeaders())
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(body),
      signal,
    });

    // Emit session ID from response header if present
    const sid = res.headers.get('x-hermes-session-id');
    if (sid) onEvent({ type: 'session_id', id: sid });

    if (!res.ok) {
      const text = await res.text();
      try {
        const parsed = JSON.parse(text);
        const msg = parsed?.error?.message || parsed?.message || text;
        throw new Error(msg);
      } catch (jsonErr) {
        if (jsonErr instanceof Error && jsonErr.message !== text) throw jsonErr;
        throw new Error(`API error ${res.status}: ${text.slice(0, 300)}`);
      }
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    // Accumulate tool call arguments across streaming chunks keyed by index
    const toolCallAccum: Record<number, { id: string; name: string; args: string }> = {};

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          // Emit any fully-accumulated tool calls before done
          for (const tc of Object.values(toolCallAccum)) {
            onEvent({ type: 'tool_call', id: tc.id, name: tc.name, input: tc.args });
          }
          onEvent({ type: 'done' });
          return;
        }
        try {
          const chunk = JSON.parse(data);
          if (chunk.error) {
            const msg = chunk.error?.message || JSON.stringify(chunk.error);
            throw new Error(msg);
          }
          const choice = chunk.choices?.[0];
          if (!choice) {
            if (chunk.usage) {
              const u = chunk.usage;
              onEvent({ type: 'done', usage: { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, totalTokens: u.total_tokens } });
            }
            continue;
          }
          const delta = choice.delta;
          if (delta?.content) {
            onEvent({ type: 'delta', content: delta.content });
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallAccum[idx]) {
                toolCallAccum[idx] = { id: tc.id || String(idx), name: tc.function?.name || '', args: '' };
              }
              if (tc.function?.name) toolCallAccum[idx].name = tc.function.name;
              if (tc.id) toolCallAccum[idx].id = tc.id;
              if (tc.function?.arguments) toolCallAccum[idx].args += tc.function.arguments;
            }
          }
          if (choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') {
            for (const tc of Object.values(toolCallAccum)) {
              onEvent({ type: 'tool_call', id: tc.id, name: tc.name, input: tc.args });
            }
            const u = chunk.usage;
            onEvent({ type: 'done', usage: u ? { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, totalTokens: u.total_tokens } : undefined });
          }
        } catch (e) {
          if (e instanceof Error && e.message !== 'Skip') throw e;
        }
      }
    }
    onEvent({ type: 'done' });
  }

  async getGatewayLatency(): Promise<number | null> {
    const t0 = Date.now()
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000), headers: this.authHeaders() })
      return res.ok ? Date.now() - t0 : null
    } catch {
      return null
    }
  }

  async fetchModels(): Promise<string[]> {
    try {
      const headers = await this.getAuthHeaders().catch(() => this.authHeaders())
      const res = await fetch(`${this.baseUrl}/v1/models`, { headers })
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []).map((m: { id: string }) => m.id)
    } catch {
      return []
    }
  }

  checkDependencies(): Promise<DependencyStatus> {
    throw new UnsupportedCapabilityError('checkDependencies', 'remote')
  }

  async testGateway(): Promise<TestResult> {
    const t0 = Date.now()
    try {
      const res = await fetch(`${this.baseUrl}/health`, { signal: AbortSignal.timeout(3000), headers: this.authHeaders() })
      return { success: res.ok, latency_ms: Date.now() - t0, error: res.ok ? null : `HTTP ${res.status}` }
    } catch (e) {
      return { success: false, latency_ms: null, error: (e as Error).message }
    }
  }

  // IPC-only methods — not available in remote mode
  private unsupported(cap: string): never { throw new UnsupportedCapabilityError(cap, 'remote') }
  getInstallStatus(): Promise<HermesInstallStatus> { return this.unsupported('getInstallStatus') }
  startGateway(): Promise<CommandResult> { return this.unsupported('startGateway') }
  stopGateway(): Promise<CommandResult> { return this.unsupported('stopGateway') }
  getAutostartEnabled(): Promise<boolean> { return this.unsupported('getAutostartEnabled') }
  toggleAutostart(_e: boolean): Promise<void> { return this.unsupported('toggleAutostart') }
  getSystemInfo(): Promise<{ ram_gb: number; cpu_count: number }> { return this.unsupported('getSystemInfo') }
  async listSessions(limit = 50, offset = 0): Promise<SessionMeta[]> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/sessions?limit=${limit}&offset=${offset}`, { headers })
    if (!res.ok) throw new Error(`listSessions failed: ${res.status}`)
    const data = await res.json()
    return Array.isArray(data) ? data : (data.sessions ?? [])
  }
  async searchSessions(q: string): Promise<SessionMeta[]> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/sessions/search?q=${encodeURIComponent(q)}`, { headers })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : (data.sessions ?? [])
  }
  readSession(_n: string): Promise<string> { return this.unsupported('readSession') }
  writeSession(_n: string, _c: string): Promise<void> { return this.unsupported('writeSession') }
  async deleteSession(id: string): Promise<void> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', headers })
    if (!res.ok) throw new Error(`deleteSession failed: ${res.status}`)
  }
  clearAllSessions(): Promise<number> { return this.unsupported('clearAllSessions') }
  async listSessionsDb(limit = 50, offset = 0): Promise<StateDbSession[]> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/sessions?limit=${limit}&offset=${offset}`, { headers })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : (data.sessions ?? [])
  }
  async readSessionDb(id: string): Promise<StateDbMessage[]> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/sessions/${encodeURIComponent(id)}/messages`, { headers })
    if (!res.ok) throw new Error(`readSessionDb failed: ${res.status}`)
    const data = await res.json()
    return Array.isArray(data) ? data : (data.messages ?? [])
  }
  async searchSessionsDb(q: string): Promise<StateDbSession[]> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/sessions/search?q=${encodeURIComponent(q)}`, { headers })
    if (!res.ok) return []
    const data = await res.json()
    return Array.isArray(data) ? data : (data.sessions ?? [])
  }
  async deleteSessionDb(id: string): Promise<void> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE', headers })
    if (!res.ok) throw new Error(`deleteSessionDb failed: ${res.status}`)
  }
  async listProfiles(): Promise<ProfileMeta[]> {
    try {
      const headers = await this.getAuthHeaders()
      const res = await fetch(`${this.baseUrl}/api/profiles`, { headers })
      if (!res.ok) return []
      return res.json()
    } catch { return [] }
  }
  async listProfileNames(): Promise<string[]> {
    const profiles = await this.listProfiles()
    return profiles.map((p: ProfileMeta) => p.name)
  }
  readProfile(_n: string): Promise<string> { return this.unsupported('readProfile') }
  writeProfile(_n: string, _c: string): Promise<void> { return this.unsupported('writeProfile') }
  createProfile(_n: string): Promise<CommandResult> { return this.unsupported('createProfile') }
  deleteProfile(_n: string): Promise<void> { return this.unsupported('deleteProfile') }
  renameProfile(_o: string, _n: string): Promise<CommandResult> { return this.unsupported('renameProfile') }
  async getActiveProfile(): Promise<string> {
    try {
      const headers = await this.getAuthHeaders()
      const res = await fetch(`${this.baseUrl}/api/profiles/active`, { headers })
      if (!res.ok) return 'default'
      const data = await res.json()
      return data.name ?? 'default'
    } catch { return 'default' }
  }
  async setActiveProfile(name: string): Promise<void> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/profiles/active`, {
      method: 'PUT', headers, body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error(`setActiveProfile failed: ${res.status}`)
  }
  readFile(_p: string): Promise<string> { return this.unsupported('readFile') }
  writeFile(_p: string, _c: string): Promise<void> { return this.unsupported('writeFile') }
  readConfig(): Promise<string> { return this.unsupported('readConfig') }
  writeConfig(_c: string): Promise<void> { return this.unsupported('writeConfig') }
  async readEnv(): Promise<Record<string, string>> {
    try {
      const headers = await this.getAuthHeaders()
      const res = await fetch(`${this.baseUrl}/api/env`, { headers })
      if (!res.ok) return {}
      return res.json()
    } catch { return {} }
  }
  async writeEnv(key: string, value: string): Promise<void> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/env/${encodeURIComponent(key)}`, {
      method: 'PUT', headers, body: JSON.stringify({ value }),
    })
    if (!res.ok) throw new Error(`writeEnv failed: ${res.status}`)
  }
  getModelConfig(): Promise<ModelConfig> { return this.unsupported('getModelConfig') }
  setModelConfig(_p: string, _m: string, _b: string): Promise<void> { return this.unsupported('setModelConfig') }
  async listSavedModels(): Promise<SavedModel[]> {
    try {
      const headers = await this.getAuthHeaders()
      const res = await fetch(`${this.baseUrl}/api/models/saved`, { headers })
      if (!res.ok) return []
      return res.json()
    } catch { return [] }
  }
  async addSavedModel(m: Omit<SavedModel, 'id' | 'createdAt'>): Promise<SavedModel> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/models/saved`, {
      method: 'POST', headers, body: JSON.stringify(m),
    })
    if (!res.ok) throw new Error(`addSavedModel failed: ${res.status}`)
    return res.json()
  }
  async removeSavedModel(id: string): Promise<void> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/models/saved/${encodeURIComponent(id)}`, { method: 'DELETE', headers })
    if (!res.ok) throw new Error(`removeSavedModel failed: ${res.status}`)
  }
  updateSavedModel(_id: string, _p: Partial<Omit<SavedModel, 'id' | 'createdAt'>>): Promise<void> { return this.unsupported('updateSavedModel') }
  getEnabledToolsets(): Promise<string[]> { return this.unsupported('getEnabledToolsets') }
  setEnabledToolsets(_t: string[]): Promise<void> { return this.unsupported('setEnabledToolsets') }
  detectApiKeys(): Promise<ApiKeyStatus> { return this.unsupported('detectApiKeys') }
  runDoctor(): Promise<DoctorResult> { return this.unsupported('runDoctor') }
  checkUpdate(): Promise<UpdateInfo> { return this.unsupported('checkUpdate') }
  runHermesCommand(_a: string[], _t?: number): Promise<CommandResult> { return this.unsupported('runHermesCommand') }
  streamCommand(_a: string[], _cb: (l: string) => void, _t?: number): Promise<CommandResult> { return this.unsupported('streamCommand') }
  installHermes(_cb: (l: string) => void): Promise<CommandResult> { return this.unsupported('installHermes') }
  getGatewayPort(): Promise<number> { return this.unsupported('getGatewayPort') }
  setGatewayPort(_p: number): Promise<void> { return this.unsupported('setGatewayPort') }
  listMemoryFiles(): Promise<MemoryFileMeta[]> { return this.unsupported('listMemoryFiles') }
  readMemoryFile(_n: string): Promise<string> { return this.unsupported('readMemoryFile') }
  deleteMemoryFile(_n: string): Promise<void> { return this.unsupported('deleteMemoryFile') }
  listSkills(): Promise<SkillMeta[]> { return this.unsupported('listSkills') }
  getSkillDetail(_n: string): Promise<string> { return this.unsupported('getSkillDetail') }
  installSkill(_n: string): Promise<CommandResult> { return this.unsupported('installSkill') }
  uninstallSkill(_n: string): Promise<CommandResult> { return this.unsupported('uninstallSkill') }
  searchMemory(_q: string): Promise<MemoryFileMeta[]> { return this.unsupported('searchMemory') }
  listOllamaModels(): Promise<string[]> { return this.unsupported('listOllamaModels') }
  async listCronJobs(): Promise<CronJobMeta[]> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/jobs?include_disabled=true`, { headers })
    if (!res.ok) throw new Error(`listCronJobs failed: ${res.status}`)
    const data = await res.json()
    return Array.isArray(data) ? data : (data.jobs ?? [])
  }
  async createCronJob(j: Omit<CronJobMeta, 'id'>): Promise<CronJobMeta> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/jobs`, {
      method: 'POST', headers,
      body: JSON.stringify({ description: j.description, schedule: j.schedule, enabled: j.enabled }),
    })
    if (!res.ok) throw new Error(`createCronJob failed: ${res.status}`)
    return res.json()
  }
  updateCronJob(_id: string, _p: Partial<Omit<CronJobMeta, 'id'>>): Promise<void> { return this.unsupported('updateCronJob') }
  async deleteCronJob(id: string): Promise<void> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/jobs/${encodeURIComponent(id)}`, { method: 'DELETE', headers })
    if (!res.ok) throw new Error(`deleteCronJob failed: ${res.status}`)
  }
  async enableCronJob(id: string): Promise<void> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/jobs/${encodeURIComponent(id)}/resume`, { method: 'POST', headers })
    if (!res.ok) throw new Error(`enableCronJob failed: ${res.status}`)
  }
  async disableCronJob(id: string): Promise<void> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/jobs/${encodeURIComponent(id)}/pause`, { method: 'POST', headers })
    if (!res.ok) throw new Error(`disableCronJob failed: ${res.status}`)
  }
  async runCronJob(id: string): Promise<CommandResult> {
    const headers = await this.getAuthHeaders()
    const res = await fetch(`${this.baseUrl}/api/jobs/${encodeURIComponent(id)}/run`, { method: 'POST', headers })
    if (!res.ok) throw new Error(`runCronJob failed: ${res.status}`)
    return { command: 'cron run', stdout: `Job ${id} triggered`, stderr: '', success: true, code: 0 }
  }
  getConnectionConfig(): Promise<ConnectionConfig> { return this.unsupported('getConnectionConfig') }
  setConnectionConfig(_m: string, _u: string, _k?: string): Promise<void> { return this.unsupported('setConnectionConfig') }

  getGatewayUrl(): string { return this.baseUrl }
  getGatewayHeaders(): Record<string, string> { return this.authHeaders() }

  // Secret management — stored in Rust plugin-store, not exposed here
  async getRemoteApiKey(): Promise<string | null> { return null }
  async setRemoteApiKey(_key: string): Promise<void> { /* stored via Rust plugin-store */ }
  async deleteRemoteApiKey(): Promise<void> { /* stored via Rust plugin-store */ }
  async getRemoteApiKeyLength(): Promise<number> { return this.apiKey ? this.apiKey.length : 0 }
  async isSshTunnelHealthy(url: string): Promise<boolean> {
    try { const r = await fetch(`${url}/health`); return r.ok } catch { return false }
  }
  async waitForPort(_host: string, _port: number, _timeoutMs: number): Promise<boolean> { return false }
  async getSshTunnelStatus(): Promise<{ is_running: boolean; local_port: number | null }> {
    return { is_running: false, local_port: null }
  }
}
