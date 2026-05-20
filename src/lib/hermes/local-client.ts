import type { HermesClient } from './client'
import type {
  HealthStatus, HermesInstallStatus, CommandResult, ChatMessage, StreamEvent,
  SessionMeta, ProfileMeta, ModelConfig, ApiKeyStatus, DoctorResult, UpdateInfo,
} from './types'
import {
  getHermesInstallStatus,
  startGateway as ipcStartGateway,
  stopGateway as ipcStopGateway,
  getGatewayStatus as ipcGetGatewayStatus,
  listSessionsDisk, readSessionDisk, writeSessionDisk, deleteSessionDisk, clearAllSessionsDisk,
  listProfiles as ipcListProfiles, readProfile as ipcReadProfile,
  writeProfile as ipcWriteProfile, deleteProfile as ipcDeleteProfile,
  readConfig as ipcReadConfig, writeConfig as ipcWriteConfig,
  readEnv as ipcReadEnv, writeEnv as ipcWriteEnv,
  getModelConfig as ipcGetModelConfig, setModelConfig as ipcSetModelConfig,
  detectApiKeys as ipcDetectApiKeys, runHermesDoctor, checkUpdate as ipcCheckUpdate,
} from '../../api/desktop'
import { checkHealth, streamChat as gatewayStreamChat } from '../../api/hermes'

export class LocalHermesClient implements HermesClient {
  async getHealth(): Promise<HealthStatus> {
    const t0 = Date.now()
    const healthy = await checkHealth()
    return { healthy, latencyMs: Date.now() - t0 }
  }

  async getInstallStatus(): Promise<HermesInstallStatus> {
    return getHermesInstallStatus()
  }

  async startGateway(): Promise<CommandResult> {
    return ipcStartGateway()
  }

  async stopGateway(): Promise<CommandResult> {
    return ipcStopGateway()
  }

  async getGatewayStatus(): Promise<boolean> {
    return ipcGetGatewayStatus()
  }

  async streamChat(
    messages: ChatMessage[],
    model: string,
    onEvent: (event: StreamEvent) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const gen = gatewayStreamChat(
      messages,
      model,
      (msg) => {
        if (msg.type === 'delta' && msg.content) {
          onEvent({ type: 'delta', content: msg.content })
        } else if (msg.type === 'tool_call') {
          onEvent({ type: 'tool_call', id: msg.toolCallId ?? '', name: msg.toolName ?? '', input: msg.toolInput ?? '' })
        } else if (msg.type === 'tool_result') {
          onEvent({ type: 'tool_result', id: msg.toolCallId ?? '', output: msg.toolOutput ?? '' })
        } else if (msg.type === 'done') {
          onEvent({
            type: 'done',
            usage: msg.usage ? {
              promptTokens: msg.usage.prompt_tokens,
              completionTokens: msg.usage.completion_tokens,
              totalTokens: msg.usage.total_tokens,
            } : undefined,
          })
        } else if (msg.type === 'error') {
          onEvent({ type: 'error', message: msg.error ?? 'Unknown error' })
        }
      },
      signal
    )
    // Drain the generator — side effects happen via the onEvent callback above
    for await (const _ of gen) { /* consumed */ }
  }

  async listSessions(): Promise<SessionMeta[]> { return listSessionsDisk() }
  async readSession(name: string): Promise<string> { return readSessionDisk(name) }
  async writeSession(name: string, content: string): Promise<void> { return writeSessionDisk(name, content) }
  async deleteSession(name: string): Promise<void> { return deleteSessionDisk(name) }
  async clearAllSessions(): Promise<number> { return clearAllSessionsDisk() }

  async listProfiles(): Promise<ProfileMeta[]> { return ipcListProfiles() }
  async readProfile(name: string): Promise<string> { return ipcReadProfile(name) }
  async writeProfile(name: string, content: string): Promise<void> { return ipcWriteProfile(name, content) }
  async deleteProfile(name: string): Promise<void> { return ipcDeleteProfile(name) }

  async readConfig(): Promise<string> { return ipcReadConfig() }
  async writeConfig(content: string): Promise<void> { return ipcWriteConfig(content) }
  async readEnv(): Promise<Record<string, string>> { return ipcReadEnv() }
  async writeEnv(key: string, value: string): Promise<void> { return ipcWriteEnv(key, value) }

  async getModelConfig(): Promise<ModelConfig> { return ipcGetModelConfig() }
  async setModelConfig(provider: string, model: string, baseUrl: string): Promise<void> {
    return ipcSetModelConfig(provider, model, baseUrl)
  }

  async detectApiKeys(): Promise<ApiKeyStatus> { return ipcDetectApiKeys() }
  async runDoctor(): Promise<DoctorResult> { return runHermesDoctor() }
  async checkUpdate(): Promise<UpdateInfo> { return ipcCheckUpdate() }
}
