import type { HermesClient } from './client'
import type {
  HealthStatus, HermesInstallStatus, CommandResult, ChatMessage, StreamEvent,
  SessionMeta, ProfileMeta, ModelConfig, ApiKeyStatus, DoctorResult, UpdateInfo,
  SkillMeta, CronJobMeta, ConnectionConfig, MemoryFileMeta,
  DependencyStatus, TestResult, StateDbSession, StateDbMessage, SavedModel,
} from './types'
import {
  getHermesInstallStatus,
  startGateway as ipcStartGateway,
  stopGateway as ipcStopGateway,
  getGatewayStatus as ipcGetGatewayStatus,
  listSessionsDisk, searchSessionsDisk, readSessionDisk, writeSessionDisk, deleteSessionDisk, clearAllSessionsDisk,
  listSessionsStateDb, readSessionStateDb, searchSessionsStateDb, deleteSessionStateDb,
  listProfiles as ipcListProfiles, listProfilesDisk, readProfile as ipcReadProfile,
  writeProfile as ipcWriteProfile, createProfileDisk, deleteProfile as ipcDeleteProfile, renameProfileDisk,
  getActiveProfile as ipcGetActiveProfile, setActiveProfile as ipcSetActiveProfile,
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
  readCronJobsIpc, writeCronJobsIpc, runCronJobNowIpc,
  getEnabledToolsets as ipcGetEnabledToolsets, setEnabledToolsets as ipcSetEnabledToolsets,
  readModelsJson, writeModelsJson,
  getRemoteApiKey as ipcGetRemoteApiKey,
  setRemoteApiKey as ipcSetRemoteApiKey,
  deleteRemoteApiKey as ipcDeleteRemoteApiKey,
  getRemoteApiKeyLength as ipcGetRemoteApiKeyLength,
  isSshTunnelHealthy as ipcIsSshTunnelHealthy,
  waitForPort as ipcWaitForPort,
  getSshTunnelStatus as ipcGetSshTunnelStatus,
} from '../../api/desktop'
import { checkHealth, checkGatewayHealth, fetchModels as gatewayFetchModels, setInMemoryGatewayPort, getBaseUrl, getAuthHeaders } from '../../api/hermes'
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

  async checkDependencies(): Promise<DependencyStatus> {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke('check_dependencies')
  }

  async testGateway(): Promise<TestResult> {
    const port = await this.getGatewayPort()
    const url = `http://127.0.0.1:${port}/health`
    const t0 = Date.now()
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) })
      return { success: res.ok, latency_ms: Date.now() - t0, error: res.ok ? null : `HTTP ${res.status}` }
    } catch (e) {
      return { success: false, latency_ms: null, error: (e as Error).message }
    }
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
    sessionId?: string | null,
    signal?: AbortSignal
  ): Promise<void> {
    const { chatStream } = await import('../../api/desktop')
    const { listen } = await import('@tauri-apps/api/event')
    const eventId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`

    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) { reject(new Error('Aborted')); return }

      let cleanupFns: Array<() => void> = []
      const cleanup = () => { cleanupFns.forEach(fn => fn()); cleanupFns = [] }
      signal?.addEventListener('abort', () => { cleanup(); reject(new Error('Aborted')) })

      Promise.all([
        listen<string>(`chat-chunk-${eventId}`, ev => onEvent({ type: 'delta', content: ev.payload })),
        listen<string>(`chat-done-${eventId}`, () => { cleanup(); onEvent({ type: 'done' }); resolve() }),
        listen<string>(`chat-error-${eventId}`, ev => { cleanup(); onEvent({ type: 'error', message: ev.payload }); reject(new Error(ev.payload)) }),
        listen<string>(`chat-session-${eventId}`, ev => { if (ev.payload) onEvent({ type: 'session_id', id: ev.payload }) }),
        listen<string>(`tool-progress-${eventId}`, ev => onEvent({ type: 'tool_progress', tool: ev.payload })),
        listen<{ id: string; name: string; input: string }>(`tool-call-${eventId}`, ev => onEvent({ type: 'tool_call', id: ev.payload.id, name: ev.payload.name, input: ev.payload.input })),
      ]).then(unlisteners => {
        cleanupFns = unlisteners
        if (signal?.aborted) { cleanup(); reject(new Error('Aborted')); return }
        chatStream(eventId, messages, model, sessionId).catch(e => { cleanup(); reject(e) })
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
  async getActiveProfile(): Promise<string> { return ipcGetActiveProfile() }
  async setActiveProfile(name: string): Promise<void> { return ipcSetActiveProfile(name) }

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
    return ipcRunHermesCommand(this.withProfile(['skill', 'install', nameOrUrl]), 120)
  }

  async uninstallSkill(name: string): Promise<CommandResult> {
    return ipcRunHermesCommand(this.withProfile(['skill', 'uninstall', name]), 60)
  }

  private get _profile(): string | null {
    const p = useStore.getState().activeProfile
    return p && p !== 'default' ? p : null
  }

  private async _readCronJobs(): Promise<CronJobMeta[]> {
    try {
      const raw = await readCronJobsIpc(this._profile)
      return JSON.parse(raw) as CronJobMeta[]
    } catch {
      return []
    }
  }

  private async _writeCronJobs(jobs: CronJobMeta[]): Promise<void> {
    await writeCronJobsIpc(JSON.stringify(jobs, null, 2), this._profile)
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

  async runCronJob(id: string): Promise<CommandResult> {
    return runCronJobNowIpc(id, this._profile)
  }

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

  async getRemoteApiKey(): Promise<string | null> { return ipcGetRemoteApiKey() }
  async setRemoteApiKey(key: string): Promise<void> { return ipcSetRemoteApiKey(key) }
  async deleteRemoteApiKey(): Promise<void> { return ipcDeleteRemoteApiKey() }
  async getRemoteApiKeyLength(): Promise<number> { return ipcGetRemoteApiKeyLength() }

  async isSshTunnelHealthy(url: string): Promise<boolean> { return ipcIsSshTunnelHealthy(url) }
  async waitForPort(host: string, port: number, timeoutMs: number): Promise<boolean> { return ipcWaitForPort(host, port, timeoutMs) }
  async getSshTunnelStatus() { return ipcGetSshTunnelStatus() }

  getGatewayUrl(): string { return getBaseUrl() }
  getGatewayHeaders(): Record<string, string> { return getAuthHeaders() }
}
