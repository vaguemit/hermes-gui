import type { HermesClient } from './client'
import type {
  HealthStatus, HermesInstallStatus, CommandResult, ChatMessage, StreamEvent,
  SessionMeta, ProfileMeta, ModelConfig, ApiKeyStatus, DoctorResult, UpdateInfo,
} from './types'

// Placeholder — Phase 7 implements full remote mode.
export class RemoteHermesClient implements HermesClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private notImplemented(): never {
    throw new Error(`Remote mode not yet implemented. Configure a local gateway in Settings. (target: ${this.baseUrl})`)
  }

  getHealth(): Promise<HealthStatus> { return this.notImplemented() }
  getInstallStatus(): Promise<HermesInstallStatus> { return this.notImplemented() }
  startGateway(): Promise<CommandResult> { return this.notImplemented() }
  stopGateway(): Promise<CommandResult> { return this.notImplemented() }
  getGatewayStatus(): Promise<boolean> { return this.notImplemented() }
  streamChat(_m: ChatMessage[], _model: string, _cb: (e: StreamEvent) => void, _sig?: AbortSignal): Promise<void> { return this.notImplemented() }
  listSessions(): Promise<SessionMeta[]> { return this.notImplemented() }
  readSession(_n: string): Promise<string> { return this.notImplemented() }
  writeSession(_n: string, _c: string): Promise<void> { return this.notImplemented() }
  deleteSession(_n: string): Promise<void> { return this.notImplemented() }
  clearAllSessions(): Promise<number> { return this.notImplemented() }
  listProfiles(): Promise<ProfileMeta[]> { return this.notImplemented() }
  readProfile(_n: string): Promise<string> { return this.notImplemented() }
  writeProfile(_n: string, _c: string): Promise<void> { return this.notImplemented() }
  deleteProfile(_n: string): Promise<void> { return this.notImplemented() }
  readFile(_p: string): Promise<string> { return this.notImplemented() }
  writeFile(_p: string, _c: string): Promise<void> { return this.notImplemented() }
  readConfig(): Promise<string> { return this.notImplemented() }
  writeConfig(_c: string): Promise<void> { return this.notImplemented() }
  readEnv(): Promise<Record<string, string>> { return this.notImplemented() }
  writeEnv(_k: string, _v: string): Promise<void> { return this.notImplemented() }
  getModelConfig(): Promise<ModelConfig> { return this.notImplemented() }
  setModelConfig(_p: string, _m: string, _b: string): Promise<void> { return this.notImplemented() }
  detectApiKeys(): Promise<ApiKeyStatus> { return this.notImplemented() }
  runDoctor(): Promise<DoctorResult> { return this.notImplemented() }
  checkUpdate(): Promise<UpdateInfo> { return this.notImplemented() }
}
