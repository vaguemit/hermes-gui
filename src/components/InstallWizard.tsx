import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, CheckCircle2, Clipboard, Download, ExternalLink, Eye, EyeOff,
  Loader2, RefreshCw, XCircle, ChevronLeft,
} from 'lucide-react';
import { streamInstallHermes } from '../api/desktop';
import { useHermesClient } from '../lib/hermes';
import type { ApiKeyStatus, HermesInstallStatus } from '../lib/hermes';

// ── Provider catalogue (mirrored from reference app constants.ts) ─────────────

interface ProviderDef {
  id: string;
  name: string;
  desc: string;
  tag?: string;
  envKey: string;
  url: string;
  placeholder: string;
  configProvider: string;
  baseUrl: string;
  needsKey: boolean;
  keyPrefix?: string;
  steps?: { text: string; url?: string }[];
}

const PROVIDERS: ProviderDef[] = [
  {
    id: 'openrouter', name: 'OpenRouter', tag: '⭐ Recommended — 200+ models',
    desc: 'One key, hundreds of models. Best starting point.',
    envKey: 'OPENROUTER_API_KEY', url: 'https://openrouter.ai/keys',
    placeholder: 'sk-or-v1-...', configProvider: 'openrouter', keyPrefix: 'sk-or-v1-',
    baseUrl: 'https://openrouter.ai/api/v1', needsKey: true,
    steps: [
      { text: 'Go to openrouter.ai and create a free account', url: 'https://openrouter.ai' },
      { text: 'Click "Keys" in the top-right menu', url: 'https://openrouter.ai/keys' },
      { text: 'Click "Create Key", give it a name, and copy it' },
      { text: 'Paste the key (starts with sk-or-v1-) below' },
    ],
  },
  {
    id: 'nous', name: 'Nous Portal', tag: '🆓 Free tier available',
    desc: 'Nous Research subscription. Free tier included.',
    envKey: '', url: 'https://hermes-agent.nousresearch.com', placeholder: '', configProvider: 'nous', baseUrl: '', needsKey: false,
    steps: [
      { text: 'Sign in at hermes-agent.nousresearch.com', url: 'https://hermes-agent.nousresearch.com' },
      { text: 'Your credentials are stored via hermes login — no key needed here' },
      { text: 'Click Save & Continue to proceed' },
    ],
  },
  {
    id: 'anthropic', name: 'Anthropic', desc: 'Claude Opus, Sonnet, Haiku. Best reasoning.',
    envKey: 'ANTHROPIC_API_KEY', url: 'https://console.anthropic.com/settings/keys',
    placeholder: 'sk-ant-...', configProvider: 'anthropic', keyPrefix: 'sk-ant-', baseUrl: '', needsKey: true,
    steps: [
      { text: 'Go to console.anthropic.com and sign in', url: 'https://console.anthropic.com' },
      { text: 'Click "API Keys" in the left sidebar', url: 'https://console.anthropic.com/settings/keys' },
      { text: 'Click "Create Key", name it, copy the sk-ant-... key' },
      { text: 'Paste the key below' },
    ],
  },
  {
    id: 'openai', name: 'OpenAI', desc: 'GPT-4o, o1, o3, Codex. Most widely supported.',
    envKey: 'OPENAI_API_KEY', url: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-...', configProvider: 'openai', keyPrefix: 'sk-', baseUrl: '', needsKey: true,
    steps: [
      { text: 'Go to platform.openai.com and sign in', url: 'https://platform.openai.com' },
      { text: 'Click your profile → "API keys"', url: 'https://platform.openai.com/api-keys' },
      { text: 'Click "Create new secret key" and copy it' },
      { text: 'Paste the key (starts with sk-) below' },
    ],
  },
  {
    id: 'google', name: 'Google Gemini', desc: 'Gemini 2.5 Flash/Pro. Free tier available.',
    envKey: 'GOOGLE_API_KEY', url: 'https://aistudio.google.com/app/apikey',
    placeholder: 'AIza...', configProvider: 'google', keyPrefix: 'AIza', baseUrl: '', needsKey: true,
    steps: [
      { text: 'Go to Google AI Studio and sign in', url: 'https://aistudio.google.com' },
      { text: 'Click "Get API key" on the left', url: 'https://aistudio.google.com/app/apikey' },
      { text: 'Click "Create API key in new project"' },
      { text: 'Copy the AIza... key and paste it below' },
    ],
  },
  {
    id: 'deepseek', name: 'DeepSeek', desc: 'DeepSeek-V3, R1, Coder. Very affordable.',
    envKey: 'DEEPSEEK_API_KEY', url: 'https://platform.deepseek.com/api_keys',
    placeholder: 'sk-...', configProvider: 'deepseek', baseUrl: 'https://api.deepseek.com/v1', needsKey: true,
    steps: [
      { text: 'Go to platform.deepseek.com and sign up', url: 'https://platform.deepseek.com' },
      { text: 'Click "API Keys" in the sidebar', url: 'https://platform.deepseek.com/api_keys' },
      { text: 'Create a new key and copy it' },
      { text: 'Paste the key below' },
    ],
  },
  {
    id: 'xai', name: 'xAI (Grok)', desc: 'Grok 3, Grok Vision.',
    envKey: 'XAI_API_KEY', url: 'https://console.x.ai',
    placeholder: 'xai-...', configProvider: 'xai', keyPrefix: 'xai-', baseUrl: '', needsKey: true,
    steps: [
      { text: 'Go to console.x.ai and sign in with your X account', url: 'https://console.x.ai' },
      { text: 'Click "API Keys" → "Create API Key"' },
      { text: 'Copy the xai-... key and paste it below' },
    ],
  },
  {
    id: 'github-copilot', name: 'GitHub Copilot', desc: 'Uses GITHUB_TOKEN or gh auth token.',
    envKey: 'GITHUB_TOKEN', url: 'https://github.com/settings/tokens',
    placeholder: 'ghp_...', configProvider: 'github-copilot', keyPrefix: 'ghp_', baseUrl: '', needsKey: true,
    steps: [
      { text: 'Go to GitHub Settings → Developer settings → Tokens', url: 'https://github.com/settings/tokens' },
      { text: 'Generate a new token with copilot scope' },
      { text: 'Or run "gh auth token" in terminal to get your current token' },
      { text: 'Paste the token below' },
    ],
  },
  {
    id: 'huggingface', name: 'Hugging Face', desc: '20+ open models via Inference Providers.',
    envKey: 'HF_TOKEN', url: 'https://huggingface.co/settings/tokens',
    placeholder: 'hf_...', configProvider: 'huggingface', keyPrefix: 'hf_', baseUrl: '', needsKey: true,
    steps: [
      { text: 'Go to huggingface.co and sign in', url: 'https://huggingface.co' },
      { text: 'Click your profile → "Access Tokens"', url: 'https://huggingface.co/settings/tokens' },
      { text: 'Create a new token with inference permission' },
      { text: 'Paste the hf_... token below' },
    ],
  },
  {
    id: 'nvidia', name: 'NVIDIA NIM', desc: 'Nemotron models via build.nvidia.com.',
    envKey: 'NVIDIA_API_KEY', url: 'https://build.nvidia.com',
    placeholder: 'nvapi-...', configProvider: 'nvidia', keyPrefix: 'nvapi-', baseUrl: '', needsKey: true,
    steps: [
      { text: 'Go to build.nvidia.com and sign in', url: 'https://build.nvidia.com' },
      { text: 'Navigate to any model → "Get API Key"' },
      { text: 'Copy the nvapi-... key and paste it below' },
    ],
  },
  {
    id: 'aws-bedrock', name: 'AWS Bedrock', desc: 'Claude, Nova, Llama, DeepSeek on AWS.',
    envKey: 'AWS_ACCESS_KEY_ID', url: 'https://console.aws.amazon.com/bedrock',
    placeholder: 'AKIA...', configProvider: 'aws-bedrock', baseUrl: '', needsKey: true,
    steps: [
      { text: 'Go to AWS Console → Bedrock', url: 'https://console.aws.amazon.com/bedrock' },
      { text: 'Enable model access for your desired models' },
      { text: 'Create an IAM user with Bedrock permissions' },
      { text: 'Paste the Access Key ID below (also set AWS_SECRET_ACCESS_KEY in .env)' },
    ],
  },
  {
    id: 'azure', name: 'Azure AI Foundry', desc: 'OpenAI or Anthropic via Azure deployment.',
    envKey: 'AZURE_API_KEY', url: 'https://ai.azure.com',
    placeholder: '', configProvider: 'azure', baseUrl: '', needsKey: true,
    steps: [
      { text: 'Go to Azure AI Foundry and sign in', url: 'https://ai.azure.com' },
      { text: 'Deploy a model (GPT-4o, Claude, etc.)' },
      { text: 'Copy the API key from your deployment' },
      { text: 'Paste the key below and set your endpoint in base URL' },
    ],
  },
  {
    id: 'ollama-cloud', name: 'Ollama Cloud', desc: 'Cloud-hosted open models via ollama.com.',
    envKey: 'OLLAMA_API_KEY', url: 'https://ollama.com',
    placeholder: '', configProvider: 'ollama-cloud', baseUrl: '', needsKey: true,
    steps: [
      { text: 'Go to ollama.com and create an account', url: 'https://ollama.com' },
      { text: 'Get your API key from account settings' },
      { text: 'Paste the key below' },
    ],
  },
  {
    id: 'qwen', name: 'Qwen / DashScope', desc: 'Qwen models + multi-provider coding tier.',
    envKey: 'DASHSCOPE_API_KEY', url: 'https://dashscope.console.aliyun.com',
    placeholder: 'sk-...', configProvider: 'qwen', baseUrl: '', needsKey: true,
    steps: [
      { text: 'Go to DashScope console and sign in', url: 'https://dashscope.console.aliyun.com' },
      { text: 'Navigate to API Key management' },
      { text: 'Create a new key and copy it' },
      { text: 'Paste the key below' },
    ],
  },
  {
    id: 'lmstudio', name: 'LM Studio', tag: '🔒 Local — no key needed',
    desc: 'Local desktop app with built-in model server.',
    envKey: '', url: 'https://lmstudio.ai', placeholder: '',
    configProvider: 'lmstudio', baseUrl: 'http://localhost:1234/v1', needsKey: false,
    steps: [
      { text: 'Download and install LM Studio', url: 'https://lmstudio.ai' },
      { text: 'Open it and download a model (e.g. Llama 3.3 70B)' },
      { text: 'Click "Start Server" in the Local Server tab' },
      { text: 'Click Save & Continue — default URL is pre-filled' },
    ],
  },
  {
    id: 'local', name: 'Custom Endpoint', tag: '🔒 Advanced',
    desc: 'Ollama, vLLM, llama.cpp, or any OpenAI-compatible server.',
    envKey: '', url: '', placeholder: 'sk-...',
    configProvider: 'custom', baseUrl: 'http://localhost:1234/v1', needsKey: false,
    steps: [
      { text: 'Start your local server (Ollama, vLLM, etc.)' },
      { text: 'Select a preset below or enter your custom server URL' },
      { text: 'Click Save & Continue to finish setup' },
    ],
  },
];

// Matches Hermes Desktop STAGE_MARKERS — used to show progress during install
const INSTALL_STAGES: { pattern: RegExp; label: string }[] = [
  { pattern: /checking prerequisites|checking.*requirement/i, label: 'Checking prerequisites…' },
  { pattern: /setting up package manager|installing uv|uv.*install/i, label: 'Setting up package manager…' },
  { pattern: /setting up python|python.*install/i, label: 'Setting up Python…' },
  { pattern: /downloading hermes|cloning|git clone/i, label: 'Downloading Hermes Agent…' },
  { pattern: /creating.*environment|virtualenv|venv/i, label: 'Creating Python environment…' },
  { pattern: /installing.*dep|pip install|uv pip/i, label: 'Installing dependencies…' },
  { pattern: /finishing|finaliz|setup complete|done/i, label: 'Finishing setup…' },
];

function detectStage(lines: string[]): string {
  const last = lines.slice(-8).join('\n');
  for (let i = INSTALL_STAGES.length - 1; i >= 0; i--) {
    if (INSTALL_STAGES[i].pattern.test(last)) return INSTALL_STAGES[i].label;
  }
  return '';
}

const PROVIDER_MODELS: Record<string, { id: string; label: string }[]> = {
  openrouter: [
    { id: 'anthropic/claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'openai/gpt-4o', label: 'GPT-4o' },
    { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
    { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3' },
    { id: 'google/gemini-2.5-flash-preview', label: 'Gemini 2.5 Flash' },
  ],
  anthropic: [
    { id: 'claude-opus-4-5', label: 'Claude Opus 4.5' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
    { id: 'o3', label: 'o3' },
    { id: 'o4-mini', label: 'o4-mini' },
  ],
  google: [
    { id: 'gemini-2.5-pro-preview', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash-preview', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
  deepseek: [
    { id: 'deepseek-chat', label: 'DeepSeek V3' },
    { id: 'deepseek-reasoner', label: 'DeepSeek R1' },
  ],
  xai: [
    { id: 'grok-3', label: 'Grok 3' },
    { id: 'grok-3-mini', label: 'Grok 3 mini' },
  ],
  huggingface: [
    { id: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B' },
    { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen 2.5 72B' },
    { id: 'mistralai/Mistral-7B-Instruct-v0.3', label: 'Mistral 7B' },
  ],
  nvidia: [
    { id: 'nvidia/llama-3.3-nemotron-super-49b-v1', label: 'Nemotron Super 49B' },
    { id: 'nvidia/llama-3.1-nemotron-ultra-253b-v1', label: 'Nemotron Ultra 253B' },
  ],
};

const LOCAL_PRESETS = [
  { id: 'lmstudio', name: 'LM Studio', baseUrl: 'http://localhost:1234/v1' },
  { id: 'ollama', name: 'Ollama', baseUrl: 'http://localhost:11434/v1' },
  { id: 'vllm', name: 'vLLM', baseUrl: 'http://localhost:8000/v1' },
  { id: 'llamacpp', name: 'llama.cpp', baseUrl: 'http://localhost:8080/v1' },
];



// ── Step identifiers ──────────────────────────────────────────────────────────
type Step = 'detect' | 'install' | 'provider' | 'apikey' | 'model' | 'done';

const STEP_ORDER: Step[] = ['install', 'provider', 'apikey', 'model', 'done'];
const STEP_LABELS: Record<string, string> = {
  install: 'Install', provider: 'Provider', apikey: 'API Key', model: 'Model', done: 'Done',
};

function StepDots({ current }: { current: Step }) {
  const idx = STEP_ORDER.indexOf(current);
  if (idx === -1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, marginBottom: 28 }}>
      {STEP_ORDER.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <React.Fragment key={s}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, transition: 'all 0.2s',
                background: done ? 'var(--accent-green)' : active ? '#7c6af7' : 'var(--bg3)',
                color: done || active ? '#fff' : 'var(--text-tertiary)',
                border: active ? '2px solid rgba(124,106,247,0.4)' : '2px solid transparent',
              }}>
                {done ? '✓' : i + 1}
              </div>
              <div style={{ fontSize: 9, color: active ? '#a78bfa' : done ? 'var(--accent-green)' : 'var(--text-tertiary)', fontWeight: active ? 700 : 400 }}>
                {STEP_LABELS[s]}
              </div>
            </div>
            {i < STEP_ORDER.length - 1 && (
              <div style={{ width: 28, height: 2, background: i < idx ? 'var(--accent-green)' : 'var(--bg3)', margin: '0 2px', marginBottom: 16, transition: 'background 0.3s' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Persisted state ───────────────────────────────────────────────────────────
const SETUP_STATE_FILE = 'gui-setup-state.json';
interface PersistedState { step: Step; provider: string; model?: string }

// ── Component ─────────────────────────────────────────────────────────────────
interface Props { onComplete: () => void }

export default function InstallWizard({ onComplete }: Props) {
  const client = useHermesClient();

  const [step, setStep] = useState<Step>('detect');
  const [status, setStatus] = useState<HermesInstallStatus | null>(null);
  const [detectMsg, setDetectMsg] = useState('');
  const [installLines, setInstallLines] = useState<string[]>([]);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState('');
  const [installElapsed, setInstallElapsed] = useState(0);
  const [installTotalTime, setInstallTotalTime] = useState(0);
  const installLogRef = useRef<HTMLPreElement>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [logCopied, setLogCopied] = useState(false);
  const [existingKeys, setExistingKeys] = useState<ApiKeyStatus | null>(null);

  const [selectedProvider, setSelectedProvider] = useState('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState('http://localhost:1234/v1');
  const [modelName, setModelName] = useState('');

  // Load persisted wizard state from hermes home on mount
  useEffect(() => {
    client.readFile(SETUP_STATE_FILE).then(raw => {
      try {
        const s = JSON.parse(raw) as Partial<PersistedState>;
        if (s.step) setStep(s.step);
        if (s.provider) setSelectedProvider(s.provider);
        if (s.model) setModelName(s.model);
      } catch { /* ignore malformed state */ }
    }).catch(() => { /* no saved state */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function saveState(s: PersistedState) {
    client.writeFile(SETUP_STATE_FILE, JSON.stringify(s)).catch(() => {});
  }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const provider = PROVIDERS.find((p) => p.id === selectedProvider) ?? PROVIDERS[0];
  const isLocal = selectedProvider === 'local' || selectedProvider === 'lmstudio';

  // Pre-select first suggested model when entering model step
  useEffect(() => {
    if (step === 'model' && !modelName) {
      const suggested = PROVIDER_MODELS[provider.id]?.[0]?.id ?? '';
      if (suggested) setModelName(suggested);
    }
  }, [step, selectedProvider]);

  // Global keyboard shortcuts: Enter to advance, Escape to go back
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape') {
        if (step === 'provider') return; // no back from provider (first step after install)
        if (step === 'apikey') goTo('provider');
        if (step === 'model') goTo('apikey');
        if (step === 'done') onComplete();
      }
      if (e.key === 'Enter' && !isInput) {
        if (step === 'provider') goTo('apikey');
        if (step === 'done') onComplete();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step]);

  // ── Step 1: detect existing install ──────────────────────────────────────
  useEffect(() => {
    if (step !== 'detect') return;
    client.getInstallStatus().then(async (s) => {
      setStatus(s);
      if (s.installed) {
        setDetectMsg(`Found Hermes ${s.version ?? ''} at ${s.hermes_home}`);
      }
      if (!s.installed) {
        setTimeout(() => goTo('install'), 600);
        return;
      }
      // Check for existing API keys — if any found, skip to done or pre-populate hints
      try {
        const keys = await client.detectApiKeys();
        setExistingKeys(keys);
        const hasAnyKey = Object.values(keys).some(Boolean);
        if (hasAnyKey && s.model_configured) {
          setTimeout(() => goTo('done'), 600);
          return;
        }
      } catch { /* non-fatal */ }
      setTimeout(() => goTo('provider'), 600);
    }).catch(() => goTo('install'));
  }, []);

  function goTo(s: Step) {
    setStep(s);
    saveState({ step: s, provider: selectedProvider, model: modelName });
  }

  // ── Step 2: run installer ────────────────────────────────────────────────
  async function runInstall() {
    setInstalling(true);
    setInstallError('');
    setInstallLines([]);
    setInstallElapsed(0);
    elapsedRef.current = setInterval(() => setInstallElapsed(s => s + 1), 1000);
    try {
      const result = await streamInstallHermes((line) => {
        setInstallLines((prev) => [...prev, line]);
        // Auto-scroll log to bottom
        if (installLogRef.current) {
          installLogRef.current.scrollTop = installLogRef.current.scrollHeight;
        }
      });
      if (result.success || result.stdout.toLowerCase().includes('installed')) {
        goTo('provider');
      } else {
        setInstallError(result.stderr || 'Installation failed. Check the log above.');
      }
    } catch (e) {
      setInstallError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current);
        elapsedRef.current = null;
        setInstallTotalTime(installElapsed);
      }
    }
  }

  // ── Step 4: save API key + model config ──────────────────────────────────
  async function handleSave() {
    const hasExisting = existingKeys?.providers.includes(provider.id) ?? false;
    if (provider.needsKey && !apiKey.trim() && !hasExisting) {
      setSaveError('Please enter your API key.');
      return;
    }
    if (isLocal && !baseUrl.trim()) {
      setSaveError('Please enter the server URL.');
      return;
    }

    // For local providers: verify the server is actually reachable before saving
    if (isLocal) {
      setSaving(true);
      setSaveError('');
      try {
        const url = baseUrl.trim().replace(/\/$/, '');
        const res = await fetch(`${url}/models`, { signal: AbortSignal.timeout(4000) });
        if (!res.ok && res.status !== 404) {
          setSaveError(`Server responded with ${res.status}. Make sure your local server is running at ${url}.`);
          setSaving(false);
          return;
        }
      } catch {
        setSaveError(`Cannot reach ${baseUrl.trim()} — make sure your local server (LM Studio, Ollama, etc.) is running first.`);
        setSaving(false);
        return;
      }
    }

    setSaving(true);
    setSaveError('');
    try {
      if (provider.needsKey && provider.envKey && apiKey.trim()) {
        await client.writeEnv(provider.envKey, apiKey.trim());
      } else if (isLocal && apiKey.trim()) {
        await client.writeEnv('CUSTOM_API_KEY', apiKey.trim());
      }
      // Pre-set provider config without model — model step will call setModelConfig with chosen model
      const configProvider = isLocal ? 'custom' : provider.configProvider;
      const configBase = isLocal ? baseUrl.trim() : provider.baseUrl;
      await client.setModelConfig(configProvider, '', configBase);
      goTo('model');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  // ── Step 5: pick model ────────────────────────────────────────────────────
  const [localPing, setLocalPing] = useState<'idle' | 'ok' | 'fail'>('idle');

  // Ping local server whenever baseUrl changes in local mode
  useEffect(() => {
    if (!isLocal) { setLocalPing('idle'); return; }
    setLocalPing('idle');
    const timer = setTimeout(async () => {
      try {
        const url = baseUrl.trim().replace(/\/$/, '');
        const res = await fetch(`${url}/models`, { signal: AbortSignal.timeout(2500) });
        setLocalPing(res.ok || res.status === 404 ? 'ok' : 'fail');
      } catch {
        setLocalPing('fail');
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [baseUrl, isLocal]);

  const [modelSaving, setModelSaving] = useState(false);
  const [modelSaveError, setModelSaveError] = useState('');

  async function handleModelSave() {
    setModelSaving(true);
    setModelSaveError('');
    try {
      const configProvider = isLocal ? 'custom' : provider.configProvider;
      const configBase = isLocal ? baseUrl.trim() : provider.baseUrl;
      await client.setModelConfig(configProvider, modelName.trim(), configBase);
      client.writeFile(SETUP_STATE_FILE, '{}').catch(() => {});
      goTo('done');
    } catch (e) {
      setModelSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setModelSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--bg0)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        width: '100%', maxWidth: 560, background: 'var(--bg1)',
        border: '1px solid var(--border)', borderRadius: 16, padding: '36px 40px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Logo + title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: '0 auto 14px',
            background: 'linear-gradient(135deg, #7c6af7 0%, #3b9eff 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, boxShadow: '0 8px 24px rgba(124,106,247,0.4)',
          }}>🤖</div>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Hermes GUI</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>
            {step === 'detect' && 'Checking environment…'}
            {step === 'install' && 'Install Hermes Agent'}
            {step === 'provider' && 'Choose your AI provider'}
            {step === 'apikey' && 'Enter your API key'}
            {step === 'model' && 'Choose a model'}
            {step === 'done' && 'All set!'}
          </div>
        </div>

        {/* Step progress dots (hidden during detect) */}
        <StepDots current={step} />

        {/* ── detect ── */}
        {step === 'detect' && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <div>Checking for existing Hermes installation…</div>
            {detectMsg && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--accent-green)', fontFamily: 'var(--font-mono)' }}>
                {detectMsg}
              </div>
            )}
          </div>
        )}

        {/* ── install ── */}
        {step === 'install' && (
          <>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              Hermes Agent is not yet installed. Click below to run the official Nous Research installer — it handles Python, dependencies, and the agent itself automatically.
            </div>
            {installLines.length > 0 && (
              <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: '#a78bfa', fontWeight: 600 }}>
                  {installing ? (detectStage(installLines) || 'Installing…') : 'Install log'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {installing && (
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                      {installElapsed}s
                    </span>
                  )}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(installLines.join('\n')).then(() => {
                        setLogCopied(true);
                        setTimeout(() => setLogCopied(false), 1500);
                      }).catch(() => {});
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: logCopied ? 'var(--accent-green)' : 'var(--text-secondary)' }}
                  >
                    <Clipboard size={11} />{logCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
            {installLines.length > 0 && (
              <pre ref={installLogRef} style={{
                background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '10px 12px', fontSize: 11.5, lineHeight: 1.55, maxHeight: 200,
                overflow: 'auto', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap',
                marginBottom: 16,
              }}>
                {installLines.join('\n')}
              </pre>
            )}
            {installError && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <XCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  {installError}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={runInstall}
                    disabled={installing}
                    style={{ flex: 1, justifyContent: 'center', gap: 7, fontSize: 13 }}
                  >
                    <RefreshCw size={13} /> Retry
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => goTo('provider')}
                    style={{ flex: 1, justifyContent: 'center', gap: 7, fontSize: 13 }}
                  >
                    Skip install <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )}
            {!installError && (
              <button
                className="btn btn-primary"
                onClick={runInstall}
                disabled={installing}
                style={{ width: '100%', justifyContent: 'center', gap: 8, fontSize: 14 }}
              >
                {installing
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Installing…</>
                  : <><Download size={14} />Install Hermes Agent</>
                }
              </button>
            )}
            {!installing && (
              <button
                onClick={() => goTo('provider')}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12.5, marginTop: 12, textDecoration: 'underline', display: 'block', textAlign: 'center', width: '100%' }}
              >
                Already installed? Skip to provider setup
              </button>
            )}
          </>
        )}

        {/* ── provider ── */}
        {step === 'provider' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
              {PROVIDERS.map((p) => {
                const hasKey = existingKeys?.providers.includes(p.id) ?? false;
                return (
                <button
                  key={p.id}
                  onClick={() => { setSelectedProvider(p.id); saveState({ step: 'provider', provider: p.id, model: modelName }); }}
                  style={{
                    background: selectedProvider === p.id ? 'rgba(124,106,247,0.18)' : 'var(--bg2)',
                    border: `1.5px solid ${selectedProvider === p.id ? '#7c6af7' : hasKey ? 'rgba(34,197,94,0.4)' : 'var(--border)'}`,
                    borderRadius: 10, padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }}>{p.desc}</div>
                  {p.tag && (
                    <div style={{
                      marginTop: 6, display: 'inline-block', fontSize: 10, fontWeight: 600,
                      background: 'rgba(124,106,247,0.2)', color: '#a78bfa', borderRadius: 4, padding: '2px 6px',
                    }}>{p.tag}</div>
                  )}
                  {hasKey && (
                    <div style={{ marginTop: 5, fontSize: 10, color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={10} /> Key saved
                    </div>
                  )}
                </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={() => goTo('apikey')}
                style={{ flex: 1, justifyContent: 'center', gap: 8, fontSize: 14 }}
              >
                Continue <ArrowRight size={14} />
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => { client.writeFile(SETUP_STATE_FILE, '{}').catch(() => {}); onComplete(); }}
                style={{ fontSize: 13, whiteSpace: 'nowrap' }}
              >
                Skip for now
              </button>
            </div>
          </>
        )}

        {/* ── apikey ── */}
        {step === 'apikey' && (
          <>
            <button
              onClick={() => goTo('provider')}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 20 }}
            >
              <ChevronLeft size={14} /> Back
            </button>

            {/* Setup steps */}
            {provider.steps && provider.steps.length > 0 && (
              <div style={{ marginBottom: 20, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 10 }}>How to get your {provider.name} key</div>
                <ol style={{ margin: 0, paddingLeft: 18, listStyle: 'none', counterReset: 'steps' }}>
                  {provider.steps.map((s, i) => (
                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8, fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      <span style={{ minWidth: 20, height: 20, borderRadius: '50%', background: 'rgba(124,106,247,0.2)', color: '#a78bfa', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>{s.text} ↗</a>
                      ) : (
                        <span>{s.text}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {isLocal ? (
              <>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Quick presets</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {LOCAL_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        onClick={() => setBaseUrl(preset.baseUrl)}
                        style={{
                          background: baseUrl === preset.baseUrl ? 'rgba(124,106,247,0.18)' : 'var(--bg2)',
                          border: `1px solid ${baseUrl === preset.baseUrl ? '#7c6af7' : 'var(--border)'}`,
                          borderRadius: 7, padding: '5px 12px', fontSize: 12.5, cursor: 'pointer', color: 'var(--text-primary)',
                        }}
                      >{preset.name}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <label style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Server URL</label>
                  {localPing === 'ok' && <span className="badge badge-success" style={{ fontSize: 10 }}>Reachable</span>}
                  {localPing === 'fail' && <span className="badge badge-error" style={{ fontSize: 10 }}>Unreachable</span>}
                </div>
                <input
                  className="input"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:1234/v1"
                  style={{ width: '100%', marginBottom: 14 }}
                />
                <label style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Model name <span style={{ opacity: 0.5 }}>(optional)</span>
                </label>
                <input
                  className="input"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="e.g. llama-3.3-70b-instruct"
                  style={{ width: '100%', marginBottom: 20 }}
                />
              </>
            ) : provider.id === 'nous' ? (
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Nous Portal login</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
                  Nous Portal uses a browser-based login flow. Run the command below in a terminal, then return here and click Save & Continue.
                </div>
                <pre style={{ background: 'var(--bg0)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-green)', marginBottom: 0 }}>
                  hermes login
                </pre>
              </div>
            ) : (
              <>
                {existingKeys?.providers.includes(provider.id) && (
                  <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12.5, color: 'var(--accent-green)', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <CheckCircle2 size={13} />
                    A key for {provider.name} is already saved — you can update it below or click Save & Continue to keep the existing one.
                  </div>
                )}
                <label style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {provider.name} API Key
                </label>
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  <input
                    className="input"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setSaveError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                    placeholder={provider.placeholder}
                    autoFocus
                    style={{ width: '100%', paddingRight: 44 }}
                  />
                  {provider.keyPrefix && apiKey.length > 4 && !apiKey.startsWith(provider.keyPrefix) && (
                    <div style={{ position: 'absolute', right: 40, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, color: 'var(--accent-amber)', whiteSpace: 'nowrap' }}>
                      should start with {provider.keyPrefix}
                    </div>
                  )}
                  <button
                    onClick={() => setShowKey(!showKey)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                  >
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {provider.url && (
                  <a href={provider.url} target="_blank" rel="noreferrer"
                    style={{ fontSize: 12.5, color: 'var(--accent-blue)', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 20, textDecoration: 'none' }}
                  >
                    Get your {provider.name} API key <ExternalLink size={11} />
                  </a>
                )}
              </>
            )}

            {saveError && (
              <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <XCircle size={14} />{saveError}
              </div>
            )}
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || (provider.needsKey && !apiKey.trim() && !(existingKeys?.providers.includes(provider.id))) || (isLocal && !baseUrl.trim())}
              style={{ width: '100%', justifyContent: 'center', gap: 8, fontSize: 14 }}
            >
              {saving
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Saving…</>
                : <>Save & Continue <ArrowRight size={14} /></>
              }
            </button>
          </>
        )}

        {/* ── model ── */}
        {step === 'model' && (
          <>
            <button
              onClick={() => goTo('apikey')}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 20 }}
            >
              <ChevronLeft size={14} /> Back
            </button>
            {(PROVIDER_MODELS[provider.id] ?? []).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {(PROVIDER_MODELS[provider.id] ?? []).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModelName(m.id)}
                    style={{
                      background: modelName === m.id ? 'rgba(124,106,247,0.18)' : 'var(--bg2)',
                      border: `1.5px solid ${modelName === m.id ? '#7c6af7' : 'var(--border)'}`,
                      borderRadius: 8, padding: '10px 14px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{m.label}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-tertiary)' }}>{m.id}</span>
                  </button>
                ))}
              </div>
            )}
            <label style={{ display: 'block', fontSize: 12.5, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Custom model ID <span style={{ opacity: 0.5 }}>(or leave blank for provider default)</span>
            </label>
            <input
              className="input"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="e.g. anthropic/claude-sonnet-4-5"
              onKeyDown={(e) => e.key === 'Enter' && handleModelSave()}
              style={{ width: '100%', marginBottom: 16 }}
            />
            {modelSaveError && (
              <div style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                <XCircle size={14} />{modelSaveError}
              </div>
            )}
            <button
              className="btn btn-primary"
              onClick={handleModelSave}
              disabled={modelSaving}
              style={{ width: '100%', justifyContent: 'center', gap: 8, fontSize: 14 }}
            >
              {modelSaving
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Saving…</>
                : <>Finish Setup <ArrowRight size={14} /></>
              }
            </button>
          </>
        )}

        {/* ── done ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center' }}>
            <CheckCircle2 size={48} style={{ color: 'var(--accent-green)', margin: '0 auto 16px' }} />
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Hermes is ready!</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.6 }}>
              Your provider and model have been saved. Start the Gateway from the Gateway tab, then head to Chat.
            </div>

            {/* Setup summary */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 24, textAlign: 'left' }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Setup summary</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Provider</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{provider.name}</span>
                </div>
                {modelName && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Model</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{modelName}</span>
                  </div>
                )}
                {installTotalTime > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Install time</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{installTotalTime}s</span>
                  </div>
                )}
              </div>
            </div>

            {/* Next steps checklist */}
            <div style={{ textAlign: 'left', marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Next steps</div>
              {[
                { label: 'Go to the Gateway tab and click Start', done: false },
                { label: 'Open the Chat tab and send a message', done: false },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)' }}>
                    {i + 1}
                  </div>
                  {item.label}
                </div>
              ))}
            </div>

            <button
              className="btn btn-primary"
              onClick={onComplete}
              style={{ width: '100%', justifyContent: 'center', gap: 8, fontSize: 14 }}
            >
              Open Hermes <ArrowRight size={14} />
            </button>
            <button
              onClick={() => goTo('provider')}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, marginTop: 10, textDecoration: 'underline', display: 'block', textAlign: 'center', width: '100%' }}
            >
              Change provider or model
            </button>
          </div>
        )}
        {/* Keyboard hint */}
        {step !== 'detect' && step !== 'done' && (
          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)' }}>
            <span className="kbd" style={{ fontSize: 10 }}>Esc</span> go back
            {' · '}
            <span className="kbd" style={{ fontSize: 10 }}>Enter</span> continue
          </div>
        )}
      </div>
    </div>
  );
}
