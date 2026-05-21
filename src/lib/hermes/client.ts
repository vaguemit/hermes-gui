import type {
  HealthStatus, HermesInstallStatus, CommandResult,
  ChatMessage, StreamEvent, SessionMeta, ProfileMeta,
  ModelConfig, ApiKeyStatus, DoctorResult, UpdateInfo,
  SkillMeta, CronJobMeta, ConnectionConfig, MemoryFileMeta,
} from './types'

export interface HermesClient {
  // Health & install
  getHealth(): Promise<HealthStatus>
  getInstallStatus(): Promise<HermesInstallStatus>

  // Gateway lifecycle
  startGateway(): Promise<CommandResult>
  stopGateway(): Promise<CommandResult>
  getGatewayStatus(): Promise<boolean>

  // Chat (callback-based for streaming)
  streamChat(
    messages: ChatMessage[],
    model: string,
    onEvent: (event: StreamEvent) => void,
    signal?: AbortSignal
  ): Promise<void>

  // Sessions
  listSessions(): Promise<SessionMeta[]>
  readSession(name: string): Promise<string>
  writeSession(name: string, content: string): Promise<void>
  deleteSession(name: string): Promise<void>
  clearAllSessions(): Promise<number>

  // Profiles
  listProfiles(): Promise<ProfileMeta[]>
  readProfile(name: string): Promise<string>
  writeProfile(name: string, content: string): Promise<void>
  deleteProfile(name: string): Promise<void>

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

  // Diagnostics
  detectApiKeys(): Promise<ApiKeyStatus>
  runDoctor(): Promise<DoctorResult>
  checkUpdate(): Promise<UpdateInfo>

  // Gateway metrics
  getGatewayLatency(): Promise<number | null>
  fetchModels(): Promise<string[]>

  // CLI command execution
  runHermesCommand(args: string[], timeoutSecs?: number): Promise<CommandResult>

  // Memory files
  listMemoryFiles(): Promise<MemoryFileMeta[]>
  readMemoryFile(name: string): Promise<string>
  deleteMemoryFile(name: string): Promise<void>

  // Skills
  listSkills(): Promise<SkillMeta[]>

  // Cron jobs
  listCronJobs(): Promise<CronJobMeta[]>

  // Connection config
  getConnectionConfig(): Promise<ConnectionConfig>
  setConnectionConfig(mode: 'local' | 'remote', remoteUrl: string, apiKey?: string): Promise<void>
}
