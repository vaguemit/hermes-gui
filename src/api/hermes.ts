import { useStore } from '../store';
import { getGatewayStatus as getGatewayStatusIpc, isTauriApp } from './desktop';

const LOCAL_BASE = 'http://localhost:8642';

/** Returns the active gateway base URL — remote if configured, else localhost. */
export function getBaseUrl(): string {
  return localStorage.getItem('hermes_remote_url') || LOCAL_BASE;
}

export function getAuthHeaders(): Record<string, string> {
  const key = localStorage.getItem('hermes_remote_api_key');
  return key ? { 'Authorization': `Bearer ${key}` } : {};
}

/** HTTP health check — used only to verify the API is actually serving (e.g. before chat). */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${getBaseUrl()}/health`, { signal: AbortSignal.timeout(3000), headers: getAuthHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchModels(): Promise<string[]> {
  try {
    const res = await fetch(`${getBaseUrl()}/v1/models`, { headers: { ...getAuthHeaders() } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).map((m: { id: string }) => m.id);
  } catch {
    return [];
  }
}

export interface StreamMessage {
  type: 'delta' | 'tool_call' | 'tool_result' | 'done' | 'error';
  content?: string;
  toolName?: string;
  toolInput?: string;
  toolOutput?: string;
  toolCallId?: string;
  error?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export async function* streamChat(
  messages: Array<{ role: string; content: string }>,
  model: string,
  onEvent: (event: StreamMessage) => void,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const body = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };

  const res = await fetch(`${getBaseUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    // Try to extract a human-readable error message from JSON
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
            onEvent({ type: 'done', usage: chunk.usage });
          }
          continue;
        }

        const delta = choice.delta;

        // Text delta
        if (delta?.content) {
          onEvent({ type: 'delta', content: delta.content });
          yield delta.content;
        }

        // Tool call
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.function?.name) {
              onEvent({
                type: 'tool_call',
                toolName: tc.function.name,
                toolInput: tc.function.arguments || '',
                toolCallId: tc.id || String(tc.index),
              });
            }
          }
        }

        // Stop reason
        if (choice.finish_reason === 'stop' || choice.finish_reason === 'tool_calls') {
          onEvent({ type: 'done', usage: chunk.usage });
        }
        // Embedded error in SSE stream (e.g. provider error forwarded through streaming)
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

let healthInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Poll gateway liveness using IPC PID-probe — the same authoritative check as
 * the reference Electron app's isGatewayRunning() / process.kill(pid, 0).
 *
 * HTTP health (checkHealth) is NOT used here because it can fail even when the
 * gateway process is alive and the port is bound, causing false "disconnected"
 * flips that fight with the IPC-based status updates from GatewayPanel.
 *
 * Falls back to checkHealth() in browser preview mode where Tauri IPC is absent.
 */
export function startHealthPolling() {
  if (healthInterval) return;
  healthInterval = setInterval(async () => {
    const { setGatewayStatus, gatewayStatus } = useStore.getState();
    const running = isTauriApp()
      ? await getGatewayStatusIpc().catch(() => false)
      : await checkHealth();

    if (running) {
      if (gatewayStatus !== 'connected') {
        setGatewayStatus('connected');
      }
    } else {
      // Only flip away from connected — never override 'connecting' state
      if (gatewayStatus === 'connected') {
        setGatewayStatus('disconnected');
      }
    }
  }, 5000);
}

export function stopHealthPolling() {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
}
