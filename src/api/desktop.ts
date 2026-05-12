import { invoke } from '@tauri-apps/api/core';

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
}

export interface CommandResult {
  success: boolean;
  code: number | null;
  command: string;
  stdout: string;
  stderr: string;
}

function hasTauriBridge(): boolean {
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
  if (!hasTauriBridge()) {
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
    };
  }

  return invoke<HermesInstallStatus>('hermes_install_status');
}

export async function runHermesCommand(args: string[], timeoutSecs = 45): Promise<CommandResult> {
  if (!hasTauriBridge()) return browserOnlyResult(['hermes', ...args].join(' '));
  return invoke<CommandResult>('hermes_run_command', { args, timeout_secs: timeoutSecs });
}

export async function installHermes(): Promise<CommandResult> {
  if (!hasTauriBridge()) return browserOnlyResult('official Hermes installer');
  return invoke<CommandResult>('hermes_install', { timeout_secs: 1800 });
}

export async function startGateway(): Promise<CommandResult> {
  if (!hasTauriBridge()) return browserOnlyResult('hermes gateway run');
  return invoke<CommandResult>('hermes_start_gateway');
}

export async function stopGateway(): Promise<CommandResult> {
  if (!hasTauriBridge()) return browserOnlyResult('hermes gateway stop');
  return invoke<CommandResult>('hermes_stop_gateway');
}

export async function getGatewayStatus(): Promise<boolean> {
  if (!hasTauriBridge()) return false;
  return invoke<boolean>('hermes_gateway_status');
}
