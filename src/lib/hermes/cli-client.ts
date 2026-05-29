import type { HermesClient } from './client'
import type {
  HealthStatus, HermesInstallStatus, CommandResult, ChatMessage, StreamEvent,
  SessionMeta, ProfileMeta, ModelConfig, ApiKeyStatus, DoctorResult, UpdateInfo,
  SkillMeta, CronJobMeta, ConnectionConfig, MemoryFileMeta,
  DependencyStatus, TestResult, StateDbSession, StateDbMessage, SavedModel,
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
  listSessionsStateDb, readSessionStateDb, searchSessionsStateDb, deleteSessionStateDb,
  readCronJobsIpc, writeCronJobsIpc, runCronJobNowIpc,
  getEnabledToolsets as ipcGetEnabledToolsets, setEnabledToolsets as ipcSetEnabledToolsets,
  readModelsJson, writeModelsJson,
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

  async listSessionsDb(limit?: number, offset?: number): Promise<StateDbSession[]> { return listSessionsStateDb(limit, offset) }
  async readSessionDb(sessionId: string): Promise<StateDbMessage[]> { return readSessionStateDb(sessionId) }
  async searchSessionsDb(query: string): Promise<StateDbSession[]> { return searchSessionsStateDb(query) }
  async deleteSessionDb(sessionId: string): Promise<void> { return deleteSessionStateDb(sessionId) }

  async listProfiles(): Promise<ProfileMeta[]> { return ipcListProfiles() }
  async listProfileNames(): Promise<string[]> { return listProfilesDisk() }
  async readProfile(name: string): Promise<string> { return ipcReadProfile(name) }
  async writeProfile(name: string, content: string): Promise<void> { return ipcWriteProfile(name, content) }
  async createProfile(name: string): Promise<CommandResult> { return createProfileDisk(name) }
  async deleteProfile(name: string): Promise<void> { return ipcDeleteProfile(name) }
  async renameProfile(oldName: string, newName: string): Promise<CommandResult> { return renameProfileDisk(oldName, newName) }

  async getActiveProfile(): Promise<string> {
    const { getActiveProfile: ipcGetActiveProfile } = await import('../../api/desktop')
    return ipcGetActiveProfile()
  }

  async setActiveProfile(name: string): Promise<void> {
    const { setActiveProfile: ipcSetActiveProfile } = await import('../../api/desktop')
    return ipcSetActiveProfile(name)
  }

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

  async listSavedModels(): Promise<SavedModel[]> {
    const raw = await readModelsJson()
    try { return JSON.parse(raw) as SavedModel[] } catch { return [] }
  }
  async addSavedModel(m: Omit<SavedModel, 'id' | 'createdAt'>): Promise<SavedModel> {
    const list = await this.listSavedModels()
    const entry: SavedModel = { ...m, id: `model-${Date.now()}`, createdAt: Date.now() }
    await writeModelsJson(JSON.stringify([...list, entry], null, 2))
    return entry
  }
  async removeSavedModel(id: string): Promise<void> {
    const list = await this.listSavedModels()
    await writeModelsJson(JSON.stringify(list.filter(m => m.id !== id), null, 2))
  }
  async updateSavedModel(id: string, patch: Partial<Omit<SavedModel, 'id' | 'createdAt'>>): Promise<void> {
    const list = await this.listSavedModels()
    await writeModelsJson(JSON.stringify(list.map(m => m.id === id ? { ...m, ...patch } : m), null, 2))
  }

  async getEnabledToolsets(): Promise<string[]> { return ipcGetEnabledToolsets() }
  async setEnabledToolsets(toolsets: string[]): Promise<void> { return ipcSetEnabledToolsets(toolsets) }

  async getAutostartEnabled(): Promise<boolean> {
    const { getAutostartEnabled: ipcGetAutostart } = await import('../../api/desktop')
    return ipcGetAutostart()
  }

  async toggleAutostart(enabled: boolean): Promise<void> {
    const { toggleAutostart: ipcToggleAutostart } = await import('../../api/desktop')
    return ipcToggleAutostart(enabled)
  }

  async getSystemInfo(): Promise<{ ram_gb: number; cpu_count: number }> {
    const { getSystemInfo: ipcGetSystemInfo } = await import('../../api/desktop')
    return ipcGetSystemInfo()
  }

  async detectApiKeys(): Promise<ApiKeyStatus> { return ipcDetectApiKeys() }
  async runDoctor(): Promise<DoctorResult> { return runHermesDoctor() }
  async checkUpdate(): Promise<UpdateInfo> { return ipcCheckUpdate() }

  async checkDependencies(): Promise<DependencyStatus> {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('check_dependencies')
  }

  async testGateway(): Promise<TestResult> {
    const port = await ipcGetGatewayPort()
    const url = `http://127.0.0.1:${port}/health`
    const t0 = Date.now()
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
      return { success: res.ok, latency_ms: Date.now() - t0, error: res.ok ? null : `HTTP ${res.status}` }
    } catch (e) {
      return { success: false, latency_ms: null, error: (e as Error).message }
    }
  }

  async getGatewayLatency(): Promise<number | null> { return null }

  async listOllamaModels(): Promise<string[]> {
    const { listOllamaModels: ipcListOllamaModels } = await import('../../api/desktop')
    return ipcListOllamaModels()
  }

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

  async searchMemory(query: string): Promise<MemoryFileMeta[]> {
    const all = await this.listMemoryFiles()
    const q = query.toLowerCase()
    return all.filter(f => f.name.toLowerCase().includes(q))
  }

  async listSkills(): Promise<SkillMeta[]> {
    const raw = await listHermesSkillsDir()
    return raw.map(s => ({ name: s.name, description: s.description, has_skill_md: s.has_skill_md }))
  }

  async getSkillDetail(name: string): Promise<string> {
    return ipcReadFile(`skills/${name}/SKILL.md`)
  }

  async installSkill(nameOrUrl: string): Promise<CommandResult> {
    return ipcRunHermesCommand(['skill', 'install', nameOrUrl], 120)
  }

  async uninstallSkill(name: string): Promise<CommandResult> {
    return ipcRunHermesCommand(['skill', 'uninstall', name], 60)
  }

  async listCronJobs(): Promise<CronJobMeta[]> {
    try {
      const raw = await readCronJobsIpc()
      return JSON.parse(raw) as CronJobMeta[]
    } catch { return [] }
  }

  async createCronJob(job: Omit<CronJobMeta, 'id'>): Promise<CronJobMeta> {
    const jobs = await this.listCronJobs()
    const newJob: CronJobMeta = { id: `cron-${Date.now()}`, ...job }
    await writeCronJobsIpc(JSON.stringify([...jobs, newJob], null, 2))
    return newJob
  }

  async updateCronJob(id: string, patch: Partial<Omit<CronJobMeta, 'id'>>): Promise<void> {
    const jobs = await this.listCronJobs()
    await writeCronJobsIpc(JSON.stringify(jobs.map(j => j.id === id ? { ...j, ...patch } : j), null, 2))
  }

  async deleteCronJob(id: string): Promise<void> {
    const jobs = await this.listCronJobs()
    await writeCronJobsIpc(JSON.stringify(jobs.filter(j => j.id !== id), null, 2))
  }

  async enableCronJob(id: string): Promise<void> { return this.updateCronJob(id, { enabled: true }) }
  async disableCronJob(id: string): Promise<void> { return this.updateCronJob(id, { enabled: false }) }

  async runCronJob(id: string): Promise<CommandResult> {
    return runCronJobNowIpc(id)
  }

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
