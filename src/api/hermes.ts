import { useStore, GatewayStatus } from '../store';

const API_BASE = 'http://localhost:8642/v1';

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:8642/health', { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchModels(): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/models`);
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

  const res = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    onEvent({ type: 'error', error: `API error ${res.status}: ${text}` });
    return;
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
      } catch {
        // Skip malformed lines
      }
    }
  }
  onEvent({ type: 'done' });
}

let healthInterval: ReturnType<typeof setInterval> | null = null;

export function startHealthPolling() {
  if (healthInterval) return;
  healthInterval = setInterval(async () => {
    const { setGatewayStatus, gatewayStatus } = useStore.getState();
    const healthy = await checkHealth();
    if (healthy && gatewayStatus !== 'connected') {
      setGatewayStatus('connected');
    } else if (!healthy && gatewayStatus === 'connected') {
      setGatewayStatus('disconnected');
    }
  }, 5000);
}

export function stopHealthPolling() {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
}
