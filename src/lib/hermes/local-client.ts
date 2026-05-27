import type { HermesClient } from './client'
import type {
  HealthStatus, HermesInstallStatus, CommandResult, ChatMessage, StreamEvent,
  SessionMeta, ProfileMeta, ModelConfig, ApiKeyStatus, DoctorResult, UpdateInfo,
  SkillMeta, CronJobMeta, ConnectionConfig, MemoryFileMeta,
} from './types'
import {
  getHermesInstallStatus,
  startGateway as ipcStartGateway,
  stopGateway as ipcStopGateway,
  getGatewayStatus as ipcGetGatewayStatus,
  listSessionsDisk, searchSessionsDisk, readSessionDisk, writeSessionDisk, deleteSessionDisk, clearAllSessionsDisk,
  listProfiles as ipcListProfiles, listProfilesDisk, readProfile as ipcReadProfile,
  writeProfile as ipcWriteProfile, createProfileDisk, deleteProfile as ipcDeleteProfile, renameProfileDisk,
  readFile as ipcReadFile, writeFile as ipcWriteFile,
  readConfig as ipcReadConfig, writeConfig as ipcWriteConfig,
  readEnv as ipcReadEnv, writeEnv as ipcWriteEnv,
  getModelConfig as ipcGetModelConfig, setModelConfig as ipcSetModelConfig,
  getSystemInfo as ipcGetSystemInfo,
  detectApiKeys as ipcDetectApiKeys, runHermesDoctor, checkUpdate as ipcCheckUpdate,
  runHermesCommand as ipcRunHermesCommand,
  streamHermesCommand as ipcStreamHermesCommand,
  streamInstallHermes as ipcStreamInstallHermes,
  listMemoryFiles as ipcListMemoryFiles, readMemoryFile as ipcReadMemoryFile,
  deleteMemoryFile as ipcDeleteMemoryFile,
  listHermesSkillsDir,
  getConnectionConfig as ipcGetConnectionConfig, setConnectionConfig as ipcSetConnectionConfig,
  getGatewayPort as ipcGetGatewayPort, setGatewayPort as ipcSetGatewayPort,
} from '../../api/desktop'
import { checkHealth, checkGatewayHealth, fetchModels as gatewayFetchModels, streamChat as gatewayStreamChat, setInMemoryGatewayPort, getBaseUrl, getAuthHeaders } from '../../api/hermes'
import { useStore } from '../../store'

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
  async searchSessions(query: string): Promise<SessionMeta[]> { return searchSessionsDisk(query) }
  async readSession(name: string): Promise<string> { return readSessionDisk(name) }
  async writeSession(name: string, content: string): Promise<void> { return writeSessionDisk(name, content) }
  async deleteSession(name: string): Promise<void> { return deleteSessionDisk(name) }
  async clearAllSessions(): Promise<number> { return clearAllSessionsDisk() }

  async listProfiles(): Promise<ProfileMeta[]> { return ipcListProfiles() }
  async listProfileNames(): Promise<string[]> { return listProfilesDisk() }
  async readProfile(name: string): Promise<string> { return ipcReadProfile(name) }
  async writeProfile(name: string, content: string): Promise<void> { return ipcWriteProfile(name, content) }
  async createProfile(name: string): Promise<CommandResult> { return createProfileDisk(name) }
  async deleteProfile(name: string): Promise<void> { return ipcDeleteProfile(name) }
  async renameProfile(oldName: string, newName: string): Promise<CommandResult> { return renameProfileDisk(oldName, newName) }

  async readFile(path: string): Promise<string> { return ipcReadFile(path) }
  async writeFile(path: string, content: string): Promise<void> { return ipcWriteFile(path, content) }

  async readConfig(): Promise<string> { return ipcReadConfig() }
  async writeConfig(content: string): Promise<void> { return ipcWriteConfig(content) }
  async readEnv(): Promise<Record<string, string>> { return ipcReadEnv() }
  async writeEnv(key: string, value: string): Promise<void> { return ipcWriteEnv(key, value) }

  async getModelConfig(): Promise<ModelConfig> { return ipcGetModelConfig() }
  async setModelConfig(provider: string, model: string, baseUrl: string): Promise<void> {
    return ipcSetModelConfig(provider, model, baseUrl)
  }

  async getAutostartEnabled(): Promise<boolean> {
    const { getAutostartEnabled: ipcGetAutostart } = await import('../../api/desktop')
    return ipcGetAutostart()
  }

  async toggleAutostart(enabled: boolean): Promise<void> {
    const { toggleAutostart: ipcToggleAutostart } = await import('../../api/desktop')
    return ipcToggleAutostart(enabled)
  }

  async getSystemInfo(): Promise<{ ram_gb: number; cpu_count: number }> {
    return ipcGetSystemInfo()
  }

  async detectApiKeys(): Promise<ApiKeyStatus> { return ipcDetectApiKeys() }
  async runDoctor(): Promise<DoctorResult> { return runHermesDoctor() }
  async checkUpdate(): Promise<UpdateInfo> { return ipcCheckUpdate() }

  async getGatewayLatency(): Promise<number | null> {
    const { healthy, latencyMs } = await checkGatewayHealth()
    return healthy ? latencyMs : null
  }

  async fetchModels(): Promise<string[]> {
    return gatewayFetchModels()
  }

  async listOllamaModels(): Promise<string[]> {
    const { listOllamaModels: ipcListOllamaModels } = await import('../../api/desktop')
    return ipcListOllamaModels()
  }

  private withProfile(args: string[]): string[] {
    const profile = useStore.getState().activeProfile
    return profile && profile !== 'default' ? ['--profile', profile, ...args] : args
  }

  async runHermesCommand(args: string[], timeoutSecs = 45): Promise<CommandResult> {
    return ipcRunHermesCommand(this.withProfile(args), timeoutSecs)
  }

  async streamCommand(args: string[], onLine: (line: string) => void, timeoutSecs = 1800): Promise<CommandResult> {
    return ipcStreamHermesCommand(this.withProfile(args), onLine, timeoutSecs)
  }

  async installHermes(onLine: (line: string) => void): Promise<CommandResult> {
    return ipcStreamInstallHermes(onLine)
  }

  async listMemoryFiles(): Promise<MemoryFileMeta[]> { return ipcListMemoryFiles() }
  async readMemoryFile(name: string): Promise<string> { return ipcReadMemoryFile(name) }
  async deleteMemoryFile(name: string): Promise<void> { return ipcDeleteMemoryFile(name) }

  async listSkills(): Promise<SkillMeta[]> {
    const raw = await listHermesSkillsDir()
    return raw.map(s => ({ name: s.name, description: s.description, has_skill_md: s.has_skill_md }))
  }

  private async _readCronJobs(): Promise<CronJobMeta[]> {
    try {
      const raw = await ipcReadFile('cron/jobs.json')
      return JSON.parse(raw) as CronJobMeta[]
    } catch {
      return []
    }
  }

  private async _writeCronJobs(jobs: CronJobMeta[]): Promise<void> {
    await ipcWriteFile('cron/jobs.json', JSON.stringify(jobs, null, 2))
  }

  async listCronJobs(): Promise<CronJobMeta[]> { return this._readCronJobs() }

  async createCronJob(job: Omit<CronJobMeta, 'id'>): Promise<CronJobMeta> {
    const jobs = await this._readCronJobs()
    const newJob: CronJobMeta = { id: `cron-${Date.now()}`, ...job }
    await this._writeCronJobs([...jobs, newJob])
    return newJob
  }

  async updateCronJob(id: string, patch: Partial<Omit<CronJobMeta, 'id'>>): Promise<void> {
    const jobs = await this._readCronJobs()
    await this._writeCronJobs(jobs.map(j => j.id === id ? { ...j, ...patch } : j))
  }

  async deleteCronJob(id: string): Promise<void> {
    const jobs = await this._readCronJobs()
    await this._writeCronJobs(jobs.filter(j => j.id !== id))
  }

  async enableCronJob(id: string): Promise<void> { return this.updateCronJob(id, { enabled: true }) }
  async disableCronJob(id: string): Promise<void> { return this.updateCronJob(id, { enabled: false }) }

  async getConnectionConfig(): Promise<ConnectionConfig> {
    const raw = await ipcGetConnectionConfig()
    return { mode: raw.mode, remoteUrl: raw.remoteUrl, hasApiKey: raw.hasApiKey, apiKeyLength: raw.apiKeyLength }
  }

  async setConnectionConfig(mode: 'local' | 'remote', remoteUrl: string, apiKey?: string): Promise<void> {
    return ipcSetConnectionConfig(mode, remoteUrl, apiKey)
  }

  async getGatewayPort(): Promise<number> {
    const port = await ipcGetGatewayPort()
    setInMemoryGatewayPort(port)
    return port
  }
  async setGatewayPort(port: number): Promise<void> {
    await ipcSetGatewayPort(port)
    setInMemoryGatewayPort(port)
  }

  getGatewayUrl(): string { return getBaseUrl() }
  getGatewayHeaders(): Record<string, string> { return getAuthHeaders() }
}
