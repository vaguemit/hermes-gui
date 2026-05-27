import type { HermesClient } from './client'
import type {
  HealthStatus, HermesInstallStatus, CommandResult, ChatMessage, StreamEvent,
  SessionMeta, ProfileMeta, ModelConfig, ApiKeyStatus, DoctorResult, UpdateInfo,
  SkillMeta, CronJobMeta, ConnectionConfig, MemoryFileMeta,
} from './types'
import { UnsupportedCapabilityError } from './errors'
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

// CLI mode: delegates file/config ops to IPC like LocalHermesClient,
// but chat goes through the hermes CLI process rather than the HTTP gateway.
export class CliHermesClient implements HermesClient {
  async getHealth(): Promise<HealthStatus> {
    const running = await ipcGetGatewayStatus()
    return { healthy: running }
  }

  async getInstallStatus(): Promise<HermesInstallStatus> { return getHermesInstallStatus() }
  async startGateway(): Promise<CommandResult> { return ipcStartGateway() }
  async stopGateway(): Promise<CommandResult> { return ipcStopGateway() }
  async getGatewayStatus(): Promise<boolean> { return ipcGetGatewayStatus() }

  async streamChat(
    messages: ChatMessage[],
    _model: string,
    onEvent: (e: StreamEvent) => void,
    _signal?: AbortSignal,
  ): Promise<void> {
    // CLI mode sends the last user message through `hermes chat -q`.
    // Multi-turn context is limited to the final message for now.
    const last = messages.filter(m => m.role === 'user').pop()
    if (!last) { onEvent({ type: 'done' }); return }

    const { listen } = await import('@tauri-apps/api/event')
    const eventId = `cli-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const { chatCli } = await import('../../api/desktop')

    await new Promise<void>((resolve, reject) => {
      listen<string>(`chat-chunk-${eventId}`, ev => {
        onEvent({ type: 'delta', content: ev.payload })
      }).then(unlistenChunk => {
        listen<string>(`chat-done-${eventId}`, () => {
          unlistenChunk()
          onEvent({ type: 'done' })
          resolve()
        }).then(unlistenDone => {
          listen<string>(`chat-error-${eventId}`, ev => {
            unlistenChunk()
            unlistenDone()
            onEvent({ type: 'error', message: ev.payload })
            reject(new Error(ev.payload))
          }).then(() => {
            chatCli(eventId, last.content, null).catch(reject)
          }).catch(reject)
        }).catch(reject)
      }).catch(reject)
    })
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

  async getSystemInfo(): Promise<{ ram_gb: number; cpu_count: number }> {
    const { getSystemInfo: ipcGetSystemInfo } = await import('../../api/desktop')
    return ipcGetSystemInfo()
  }

  async detectApiKeys(): Promise<ApiKeyStatus> { return ipcDetectApiKeys() }
  async runDoctor(): Promise<DoctorResult> { return runHermesDoctor() }
  async checkUpdate(): Promise<UpdateInfo> { return ipcCheckUpdate() }

  async getGatewayLatency(): Promise<number | null> { return null }

  async fetchModels(): Promise<string[]> {
    const result = await ipcRunHermesCommand(['models', 'list', '--json'], 10).catch(() => null)
    if (!result?.success) return []
    try {
      const parsed = JSON.parse(result.stdout)
      return Array.isArray(parsed) ? parsed.map((m: { id?: string; name?: string }) => m.id || m.name || '').filter(Boolean) : []
    } catch {
      return []
    }
  }

  async runHermesCommand(args: string[], timeoutSecs = 45): Promise<CommandResult> {
    return ipcRunHermesCommand(args, timeoutSecs)
  }

  async streamCommand(args: string[], onLine: (line: string) => void, timeoutSecs = 1800): Promise<CommandResult> {
    return ipcStreamHermesCommand(args, onLine, timeoutSecs)
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

  async listCronJobs(): Promise<CronJobMeta[]> {
    try {
      const raw = await ipcReadFile('cron/jobs.json')
      return JSON.parse(raw) as CronJobMeta[]
    } catch { return [] }
  }

  async createCronJob(job: Omit<CronJobMeta, 'id'>): Promise<CronJobMeta> {
    const jobs = await this.listCronJobs()
    const newJob: CronJobMeta = { id: `cron-${Date.now()}`, ...job }
    await ipcWriteFile('cron/jobs.json', JSON.stringify([...jobs, newJob], null, 2))
    return newJob
  }

  async updateCronJob(id: string, patch: Partial<Omit<CronJobMeta, 'id'>>): Promise<void> {
    const jobs = await this.listCronJobs()
    await ipcWriteFile('cron/jobs.json', JSON.stringify(jobs.map(j => j.id === id ? { ...j, ...patch } : j), null, 2))
  }

  async deleteCronJob(id: string): Promise<void> {
    const jobs = await this.listCronJobs()
    await ipcWriteFile('cron/jobs.json', JSON.stringify(jobs.filter(j => j.id !== id), null, 2))
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

  async getGatewayPort(): Promise<number> { return ipcGetGatewayPort() }
  async setGatewayPort(port: number): Promise<void> { return ipcSetGatewayPort(port) }

  getGatewayUrl(): string { return 'http://127.0.0.1:8642' }
  getGatewayHeaders(): Record<string, string> { return {} }
}
