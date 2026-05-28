import type { HermesClient } from './client'
import type {
  HealthStatus, HermesInstallStatus, CommandResult, ChatMessage, StreamEvent,
  SessionMeta, ProfileMeta, ModelConfig, ApiKeyStatus, DoctorResult, UpdateInfo,
  SkillMeta, CronJobMeta, ConnectionConfig, MemoryFileMeta,
  DependencyStatus, TestResult, StateDbSession, StateDbMessage,
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
    signal?: AbortSignal,
  ): Promise<void> {
    const body = {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
      body: JSON.stringify(body),
      signal,
    });

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
          onEvent({ type: 'done' });
          return;
        }
        try {
          const chunk = JSON.parse(data);
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
              if (tc.function?.name) {
                onEvent({
                  type: 'tool_call',
                  id: tc.id || String(tc.index),
                  name: tc.function.name,
                  input: tc.function.arguments || '',
                });
              }
            }
          }
          if (choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') {
            const u = chunk.usage;
            onEvent({ type: 'done', usage: u ? { promptTokens: u.prompt_tokens, completionTokens: u.completion_tokens, totalTokens: u.total_tokens } : undefined });
          }
          if (chunk.error) {
            const msg = chunk.error?.message || JSON.stringify(chunk.error);
            throw new Error(msg);
          }
        } catch {
          // Skip malformed lines
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
      const res = await fetch(`${this.baseUrl}/v1/models`, { headers: this.authHeaders() })
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
  listSessions(): Promise<SessionMeta[]> { return this.unsupported('listSessions') }
  searchSessions(_q: string): Promise<SessionMeta[]> { return this.unsupported('searchSessions') }
  readSession(_n: string): Promise<string> { return this.unsupported('readSession') }
  writeSession(_n: string, _c: string): Promise<void> { return this.unsupported('writeSession') }
  deleteSession(_n: string): Promise<void> { return this.unsupported('deleteSession') }
  clearAllSessions(): Promise<number> { return this.unsupported('clearAllSessions') }
  listSessionsDb(_l?: number, _o?: number): Promise<StateDbSession[]> { return this.unsupported('listSessionsDb') }
  readSessionDb(_id: string): Promise<StateDbMessage[]> { return this.unsupported('readSessionDb') }
  searchSessionsDb(_q: string): Promise<StateDbSession[]> { return this.unsupported('searchSessionsDb') }
  deleteSessionDb(_id: string): Promise<void> { return this.unsupported('deleteSessionDb') }
  listProfiles(): Promise<ProfileMeta[]> { return this.unsupported('listProfiles') }
  listProfileNames(): Promise<string[]> { return this.unsupported('listProfileNames') }
  readProfile(_n: string): Promise<string> { return this.unsupported('readProfile') }
  writeProfile(_n: string, _c: string): Promise<void> { return this.unsupported('writeProfile') }
  createProfile(_n: string): Promise<CommandResult> { return this.unsupported('createProfile') }
  deleteProfile(_n: string): Promise<void> { return this.unsupported('deleteProfile') }
  renameProfile(_o: string, _n: string): Promise<CommandResult> { return this.unsupported('renameProfile') }
  async getActiveProfile(): Promise<string> { return 'default' }
  setActiveProfile(_name: string): Promise<void> { return this.unsupported('setActiveProfile') }
  readFile(_p: string): Promise<string> { return this.unsupported('readFile') }
  writeFile(_p: string, _c: string): Promise<void> { return this.unsupported('writeFile') }
  readConfig(): Promise<string> { return this.unsupported('readConfig') }
  writeConfig(_c: string): Promise<void> { return this.unsupported('writeConfig') }
  readEnv(): Promise<Record<string, string>> { return this.unsupported('readEnv') }
  writeEnv(_k: string, _v: string): Promise<void> { return this.unsupported('writeEnv') }
  getModelConfig(): Promise<ModelConfig> { return this.unsupported('getModelConfig') }
  setModelConfig(_p: string, _m: string, _b: string): Promise<void> { return this.unsupported('setModelConfig') }
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
  listOllamaModels(): Promise<string[]> { return this.unsupported('listOllamaModels') }
  listCronJobs(): Promise<CronJobMeta[]> { return this.unsupported('listCronJobs') }
  createCronJob(_j: Omit<CronJobMeta, 'id'>): Promise<CronJobMeta> { return this.unsupported('createCronJob') }
  updateCronJob(_id: string, _p: Partial<Omit<CronJobMeta, 'id'>>): Promise<void> { return this.unsupported('updateCronJob') }
  deleteCronJob(_id: string): Promise<void> { return this.unsupported('deleteCronJob') }
  enableCronJob(_id: string): Promise<void> { return this.unsupported('enableCronJob') }
  disableCronJob(_id: string): Promise<void> { return this.unsupported('disableCronJob') }
  getConnectionConfig(): Promise<ConnectionConfig> { return this.unsupported('getConnectionConfig') }
  setConnectionConfig(_m: string, _u: string, _k?: string): Promise<void> { return this.unsupported('setConnectionConfig') }

  getGatewayUrl(): string { return this.baseUrl }
  getGatewayHeaders(): Record<string, string> { return this.authHeaders() }
}
