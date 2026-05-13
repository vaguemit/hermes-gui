import { invoke } from '@tauri-apps/api/core';

export interface SystemInfo {
  ram_gb: number;
  cpu_count: number;
}

export interface ProfileMeta {
  name: string;
  modified: string;
}

export interface MemoryFileMeta {
  name: string;
  size: number;
  modified: string;
}

export interface SessionMeta {
  name: string;
  modified: string;
}

export interface HermesInstallStatus {
  installed: boolean;
  configured: boolean;
  api_healthy: boolean;
  version: string | null;
  hermes_home: string;
  repo_path: string | null;
  binary_path: string | null;
  platform: string;
  last_error: string | null;
  model_configured: boolean;
}

export interface ModelConfig {
  provider: string;
  model: string;
  base_url: string;
}

export interface CommandResult {
  success: boolean;
  code: number | null;
  command: string;
  stdout: string;
  stderr: string;
}

export interface ApiKeyStatus {
  has_keys: boolean;
  providers: string[];
}

export interface DoctorCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface DoctorResult {
  ok: boolean;
  checks: DoctorCheck[];
  raw: string;
}

export interface UpdateInfo {
  current_version: string | null;
  latest_version: string | null;
  update_available: boolean;
  release_url: string | null;
}

export function isTauriApp(): boolean {
  return typeof window !== 'undefined' && Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function browserOnlyResult(command: string): CommandResult {
  return {
    success: false,
    code: null,
    command,
    stdout: '',
    stderr: 'Native Hermes controls are available in the Tauri desktop runtime. Start the app with npm run tauri dev.',
  };
}

export async function getHermesInstallStatus(): Promise<HermesInstallStatus> {
  if (!isTauriApp()) {
    return {
      installed: false,
      configured: false,
      api_healthy: false,
      version: null,
      hermes_home: '~/.hermes',
      repo_path: null,
      binary_path: null,
      platform: navigator.platform || 'browser',
      last_error: 'Running in browser preview mode.',
      model_configured: false,
    };
  }

  return invoke<HermesInstallStatus>('hermes_install_status');
}

export async function runHermesCommand(args: string[], timeoutSecs = 45): Promise<CommandResult> {
  if (!isTauriApp()) return browserOnlyResult(['hermes', ...args].join(' '));
  return invoke<CommandResult>('hermes_run_command', { args, timeout_secs: timeoutSecs });
}

export async function installHermes(): Promise<CommandResult> {
  if (!isTauriApp()) return browserOnlyResult('official Hermes installer');
  return invoke<CommandResult>('hermes_install', { timeout_secs: 1800 });
}

export async function startGateway(): Promise<CommandResult> {
  if (!isTauriApp()) return browserOnlyResult('hermes gateway run');
  return invoke<CommandResult>('hermes_start_gateway');
}

export async function stopGateway(): Promise<CommandResult> {
  if (!isTauriApp()) return browserOnlyResult('hermes gateway stop');
  return invoke<CommandResult>('hermes_stop_gateway');
}

export async function getGatewayStatus(): Promise<boolean> {
  if (!isTauriApp()) return false;
  return invoke<boolean>('hermes_gateway_status');
}

export async function detectApiKeys(): Promise<ApiKeyStatus> {
  if (!isTauriApp()) return { has_keys: false, providers: [] };
  return invoke<ApiKeyStatus>('detect_api_keys');
}

export async function readEnv(): Promise<Record<string, string>> {
  if (!isTauriApp()) return {};
  return invoke<Record<string, string>>('read_env');
}

export async function writeEnv(key: string, value: string): Promise<void> {
  if (!isTauriApp()) return;
  return invoke<void>('write_env', { key, value });
}

export async function readConfig(): Promise<string> {
  if (!isTauriApp()) return '';
  return invoke<string>('read_config');
}

export async function writeConfig(content: string): Promise<void> {
  if (!isTauriApp()) return;
  return invoke<void>('write_config', { content });
}

export async function readFile(relPath: string): Promise<string> {
  if (!isTauriApp()) return '';
  return invoke<string>('read_file', { rel_path: relPath });
}

export async function writeFile(relPath: string, content: string): Promise<void> {
  if (!isTauriApp()) return;
  return invoke<void>('write_file', { rel_path: relPath, content });
}

export async function runHermesDoctor(): Promise<DoctorResult> {
  if (!isTauriApp()) return { ok: false, checks: [], raw: 'Tauri not available' };
  return invoke<DoctorResult>('run_hermes_doctor');
}

export async function getModelConfig(): Promise<ModelConfig> {
  if (!isTauriApp()) return { provider: 'auto', model: '', base_url: '' };
  return invoke<ModelConfig>('get_model_config');
}

export async function setModelConfig(provider: string, model: string, baseUrl: string): Promise<void> {
  if (!isTauriApp()) return;
  return invoke<void>('set_model_config', { provider, model, base_url: baseUrl });
}

export async function checkUpdate(): Promise<UpdateInfo> {
  if (!isTauriApp()) return { current_version: null, latest_version: null, update_available: false, release_url: null };
  return invoke<UpdateInfo>('check_update');
}

export async function toggleAutostart(enable: boolean): Promise<void> {
  if (!isTauriApp()) return;
  return invoke<void>(enable ? 'plugin:autostart|enable' : 'plugin:autostart|disable');
}

export async function getAutostartEnabled(): Promise<boolean> {
  if (!isTauriApp()) return false;
  return invoke<boolean>('plugin:autostart|is_enabled');
}

async function _streamViaEvent<T>(
  commandName: string,
  commandArgs: Record<string, unknown>,
  onLine: (line: string) => void,
  fallback: T,
): Promise<T> {
  if (!isTauriApp()) return fallback;
  const { listen } = await import('@tauri-apps/api/event');
  const eventId = `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve, reject) => {
    listen<string>(eventId, (ev) => {
      if (ev.payload !== '__DONE__' && ev.payload !== '__TIMEOUT__') onLine(ev.payload);
    }).then((unlisten) => {
      // Tauri v2: JS must use camelCase keys — the framework converts them to snake_case for Rust
      invoke<T>(commandName, { ...commandArgs, eventId })
        .then((r) => { unlisten(); resolve(r); })
        .catch((e) => { unlisten(); reject(e); });
    }).catch(reject);
  });
}

export async function streamHermesCommand(
  args: string[],
  onLine: (line: string) => void,
  timeoutSecs = 1800,
): Promise<CommandResult> {
  return _streamViaEvent<CommandResult>(
    'hermes_stream_command',
    { args, timeoutSecs },
    onLine,
    browserOnlyResult(['hermes', ...args].join(' ')),
  );
}

export async function streamInstallHermes(
  onLine: (line: string) => void,
): Promise<CommandResult> {
  return _streamViaEvent<CommandResult>(
    'hermes_stream_install',
    {},
    onLine,
    browserOnlyResult('official Hermes installer'),
  );
}

export async function updateTrayStatus(status: string): Promise<void> {
  if (!isTauriApp()) return;
  return invoke<void>('update_tray_status', { status });
}

export async function getSystemInfo(): Promise<SystemInfo> {
  if (!isTauriApp()) return { ram_gb: 16, cpu_count: 8 };
  return invoke<SystemInfo>('get_system_info');
}

export async function listOllamaModels(): Promise<string[]> {
  if (!isTauriApp()) return [];
  return invoke<string[]>('ollama_list_models');
}

export async function streamOllamaPull(
  model: string,
  onLine: (line: string) => void,
): Promise<CommandResult> {
  return _streamViaEvent<CommandResult>(
    'ollama_pull_stream',
    { model },
    onLine,
    browserOnlyResult(`ollama pull ${model}`),
  );
}

export async function listProfiles(): Promise<ProfileMeta[]> {
  if (!isTauriApp()) return [];
  return invoke<ProfileMeta[]>('list_profiles');
}

export async function readProfile(name: string): Promise<string> {
  if (!isTauriApp()) return '';
  return invoke<string>('read_profile', { name });
}

export async function writeProfile(name: string, content: string): Promise<void> {
  if (!isTauriApp()) return;
  return invoke<void>('write_profile', { name, content });
}

export async function deleteProfile(name: string): Promise<void> {
  if (!isTauriApp()) return;
  return invoke<void>('delete_profile', { name });
}

export async function listMemoryFiles(): Promise<MemoryFileMeta[]> {
  if (!isTauriApp()) return [];
  return invoke<MemoryFileMeta[]>('list_memory_files');
}

export async function readMemoryFile(name: string): Promise<string> {
  if (!isTauriApp()) return '';
  return invoke<string>('read_memory_file', { name });
}

export async function deleteMemoryFile(name: string): Promise<void> {
  if (!isTauriApp()) return;
  return invoke<void>('delete_memory_file', { name });
}

export async function listSessionsDisk(): Promise<SessionMeta[]> {
  if (!isTauriApp()) return [];
  return invoke<SessionMeta[]>('list_sessions_disk');
}

export async function readSessionDisk(name: string): Promise<string> {
  if (!isTauriApp()) return '';
  return invoke<string>('read_session_disk', { name });
}

export async function writeSessionDisk(name: string, content: string): Promise<void> {
  if (!isTauriApp()) return;
  return invoke<void>('write_session_disk', { name, content });
}

export async function deleteSessionDisk(name: string): Promise<void> {
  if (!isTauriApp()) return;
  return invoke<void>('delete_session_disk', { name });
}

export async function ptySpawn(
  program: string,
  args: string[],
  rows: number,
  cols: number,
  eventId: string,
): Promise<string> {
  if (!isTauriApp()) return '';
  return invoke<string>('pty_spawn', { program, args, rows, cols, event_id: eventId });
}

export async function ptyWrite(ptyId: string, data: string): Promise<void> {
  if (!isTauriApp()) return;
  return invoke<void>('pty_write', { pty_id: ptyId, data });
}

export async function ptyResize(ptyId: string, rows: number, cols: number): Promise<void> {
  if (!isTauriApp()) return;
  return invoke<void>('pty_resize', { pty_id: ptyId, rows, cols });
}

export async function ptyKill(ptyId: string): Promise<void> {
  if (!isTauriApp()) return;
  return invoke<void>('pty_kill', { pty_id: ptyId });
}
