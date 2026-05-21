import type { HermesClient } from './client'
import type {
  HealthStatus, HermesInstallStatus, CommandResult, ChatMessage, StreamEvent,
  SessionMeta, ProfileMeta, ModelConfig, ApiKeyStatus, DoctorResult, UpdateInfo,
} from './types'

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

  // IPC-only methods — not available in remote mode
  getInstallStatus(): Promise<HermesInstallStatus> { throw new Error('Not available in remote mode') }
  startGateway(): Promise<CommandResult> { throw new Error('Not available in remote mode') }
  stopGateway(): Promise<CommandResult> { throw new Error('Not available in remote mode') }
  listSessions(): Promise<SessionMeta[]> { throw new Error('Not available in remote mode') }
  readSession(_n: string): Promise<string> { throw new Error('Not available in remote mode') }
  writeSession(_n: string, _c: string): Promise<void> { throw new Error('Not available in remote mode') }
  deleteSession(_n: string): Promise<void> { throw new Error('Not available in remote mode') }
  clearAllSessions(): Promise<number> { throw new Error('Not available in remote mode') }
  listProfiles(): Promise<ProfileMeta[]> { throw new Error('Not available in remote mode') }
  readProfile(_n: string): Promise<string> { throw new Error('Not available in remote mode') }
  writeProfile(_n: string, _c: string): Promise<void> { throw new Error('Not available in remote mode') }
  deleteProfile(_n: string): Promise<void> { throw new Error('Not available in remote mode') }
  readFile(_p: string): Promise<string> { throw new Error('Not available in remote mode') }
  writeFile(_p: string, _c: string): Promise<void> { throw new Error('Not available in remote mode') }
  readConfig(): Promise<string> { throw new Error('Not available in remote mode') }
  writeConfig(_c: string): Promise<void> { throw new Error('Not available in remote mode') }
  readEnv(): Promise<Record<string, string>> { throw new Error('Not available in remote mode') }
  writeEnv(_k: string, _v: string): Promise<void> { throw new Error('Not available in remote mode') }
  getModelConfig(): Promise<ModelConfig> { throw new Error('Not available in remote mode') }
  setModelConfig(_p: string, _m: string, _b: string): Promise<void> { throw new Error('Not available in remote mode') }
  detectApiKeys(): Promise<ApiKeyStatus> { throw new Error('Not available in remote mode') }
  runDoctor(): Promise<DoctorResult> { throw new Error('Not available in remote mode') }
  checkUpdate(): Promise<UpdateInfo> { throw new Error('Not available in remote mode') }
}
