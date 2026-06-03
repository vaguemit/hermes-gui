import type {
  HealthStatus, HermesInstallStatus, CommandResult,
  ChatMessage, StreamEvent, SessionMeta, ProfileMeta,
  ModelConfig, ApiKeyStatus, DoctorResult, UpdateInfo,
  SkillMeta, CronJobMeta, ConnectionConfig, MemoryFileMeta,
  DependencyStatus, TestResult, StateDbSession, StateDbMessage,
  SavedModel,
} from './types'

export interface HermesClient {
  // Health & install
  getHealth(): Promise<HealthStatus>
  getInstallStatus(): Promise<HermesInstallStatus>
  checkDependencies(): Promise<DependencyStatus>
  testGateway(): Promise<TestResult>

  // Gateway lifecycle
  startGateway(): Promise<CommandResult>
  stopGateway(): Promise<CommandResult>
  getGatewayStatus(): Promise<boolean>

  // Chat (callback-based for streaming)
  streamChat(
    messages: ChatMessage[],
    model: string,
    onEvent: (event: StreamEvent) => void,
    sessionId?: string | null,
    signal?: AbortSignal
  ): Promise<void>

  // Sessions
  listSessions(): Promise<SessionMeta[]>
  searchSessions(query: string): Promise<SessionMeta[]>
  readSession(name: string): Promise<string>
  writeSession(name: string, content: string): Promise<void>
  deleteSession(name: string): Promise<void>
  clearAllSessions(): Promise<number>

  // State DB sessions (read from ~/.hermes/state.db — shared with CLI and Desktop)
  listSessionsDb(limit?: number, offset?: number): Promise<StateDbSession[]>
  readSessionDb(sessionId: string): Promise<StateDbMessage[]>
  searchSessionsDb(query: string): Promise<StateDbSession[]>
  deleteSessionDb(sessionId: string): Promise<void>

  // Profiles
  listProfiles(): Promise<ProfileMeta[]>
  listProfileNames(): Promise<string[]>
  readProfile(name: string): Promise<string>
  writeProfile(name: string, content: string): Promise<void>
  createProfile(name: string): Promise<CommandResult>
  deleteProfile(name: string): Promise<void>
  renameProfile(oldName: string, newName: string): Promise<CommandResult>
  getActiveProfile(): Promise<string>
  setActiveProfile(name: string): Promise<void>

  // Arbitrary file access (relative to hermes home)
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>

  // Config & env
  readConfig(): Promise<string>
  writeConfig(content: string): Promise<void>
  readEnv(): Promise<Record<string, string>>
  writeEnv(key: string, value: string): Promise<void>

  // Model
  getModelConfig(): Promise<ModelConfig>
  setModelConfig(provider: string, model: string, baseUrl: string): Promise<void>
  listSavedModels(): Promise<SavedModel[]>
  addSavedModel(m: Omit<SavedModel, 'id' | 'createdAt'>): Promise<SavedModel>
  removeSavedModel(id: string): Promise<void>
  updateSavedModel(id: string, patch: Partial<Omit<SavedModel, 'id' | 'createdAt'>>): Promise<void>

  // Toolsets
  getEnabledToolsets(): Promise<string[]>
  setEnabledToolsets(toolsets: string[]): Promise<void>

  // System
  getAutostartEnabled(): Promise<boolean>
  toggleAutostart(enabled: boolean): Promise<void>

  // Diagnostics
  getSystemInfo(): Promise<{ ram_gb: number; cpu_count: number }>
  detectApiKeys(): Promise<ApiKeyStatus>
  runDoctor(): Promise<DoctorResult>
  checkUpdate(): Promise<UpdateInfo>

  // Gateway metrics
  getGatewayLatency(): Promise<number | null>
  fetchModels(): Promise<string[]>
  listOllamaModels(): Promise<string[]>

  // CLI command execution
  runHermesCommand(args: string[], timeoutSecs?: number): Promise<CommandResult>
  streamCommand(args: string[], onLine: (line: string) => void, timeoutSecs?: number): Promise<CommandResult>
  installHermes(onLine: (line: string) => void): Promise<CommandResult>

  // Memory files
  listMemoryFiles(): Promise<MemoryFileMeta[]>
  readMemoryFile(name: string): Promise<string>
  deleteMemoryFile(name: string): Promise<void>

  // Skills
  listSkills(): Promise<SkillMeta[]>
  getSkillDetail(name: string): Promise<string>
  installSkill(nameOrUrl: string): Promise<CommandResult>
  uninstallSkill(name: string): Promise<CommandResult>

  // Memory search
  searchMemory(query: string): Promise<MemoryFileMeta[]>

  // Cron jobs
  listCronJobs(): Promise<CronJobMeta[]>
  createCronJob(job: Omit<CronJobMeta, 'id'>): Promise<CronJobMeta>
  updateCronJob(id: string, patch: Partial<Omit<CronJobMeta, 'id'>>): Promise<void>
  deleteCronJob(id: string): Promise<void>
  enableCronJob(id: string): Promise<void>
  disableCronJob(id: string): Promise<void>
  runCronJob(id: string): Promise<CommandResult>

  // Connection config
  getConnectionConfig(): Promise<ConnectionConfig>
  setConnectionConfig(mode: 'local' | 'remote', remoteUrl: string, apiKey?: string): Promise<void>

  // Gateway port
  getGatewayPort(): Promise<number>
  setGatewayPort(port: number): Promise<void>

  // Remote API key (secure store)
  getRemoteApiKey(): Promise<string | null>
  setRemoteApiKey(key: string): Promise<void>
  deleteRemoteApiKey(): Promise<void>
  getRemoteApiKeyLength(): Promise<number>

  // SSH health
  isSshTunnelHealthy(url: string): Promise<boolean>
  waitForPort(host: string, port: number, timeoutMs: number): Promise<boolean>
  getSshTunnelStatus(): Promise<{ is_running: boolean; local_port: number | null }>

  // Raw HTTP access helpers (for panels making direct fetch calls)
  getGatewayUrl(): string
  getGatewayHeaders(): Record<string, string>
}
