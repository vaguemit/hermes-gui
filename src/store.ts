import { create } from 'zustand';

export type GatewayStatus = 'unchecked' | 'connecting' | 'connected' | 'disconnected' | 'error';
export type AgentState = 'idle' | 'thinking' | 'running_tool' | 'error';
export type NavSection = 'chat' | 'install' | 'commands' | 'agents' | 'gateway' | 'crons' | 'skills' | 'settings' | 'dashboard' | 'profiles';
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';
export type MessageType = 'prose' | 'tool_call' | 'tool_output' | 'error' | 'info' | 'reasoning' | 'system';

export interface ToolCall {
  id: string;
  name: string;
  input: string;
  output?: string;
  status: 'pending' | 'running' | 'done' | 'error';
  timestamp: number;
}

export interface Message {
  id: string;
  role: MessageRole;
  type: MessageType;
  content: string;
  timestamp: number;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

export interface Session {
  id: string;
  title: string;
  timestamp: number;
  messages: Message[];
}

export interface Platform {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  icon: string;
}

export interface CronJob {
  id: string;
  schedule: string;
  description: string;
  platform: string;
  lastRun?: string;
  active: boolean;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  source: 'builtin' | 'user' | 'imported';
  content: string;
}

interface AppState {
  // Gateway
  gatewayStatus: GatewayStatus;
  agentState: AgentState;
  activeModel: string;
  setGatewayStatus: (s: GatewayStatus) => void;
  setAgentState: (s: AgentState) => void;
  setActiveModel: (m: string) => void;

  // Navigation
  activeSection: NavSection;
  setActiveSection: (s: NavSection) => void;
  rightPanelOpen: boolean;
  setRightPanelOpen: (v: boolean) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (v: boolean) => void;

  // Conversations
  sessions: Session[];
  activeSessionId: string | null;
  addSession: () => void;
  setActiveSession: (id: string) => void;
  addMessage: (msg: Message) => void;
  updateLastMessage: (patch: Partial<Message>) => void;
  updateToolCall: (sessionId: string, toolId: string, patch: Partial<ToolCall>) => void;
  clearActiveSession: () => void;

  // Command palette
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  paletteQuery: string;
  setPaletteQuery: (q: string) => void;

  // Model switcher
  modelSwitcherOpen: boolean;
  setModelSwitcherOpen: (v: boolean) => void;

  // Token usage
  tokensUsed: number;
  contextWindow: number;
  setTokenUsage: (used: number, total: number) => void;

  // Tools (live activity)
  activeToolCalls: ToolCall[];
  addToolCall: (tc: ToolCall) => void;
  updateToolCallGlobal: (id: string, patch: Partial<ToolCall>) => void;
  clearToolCalls: () => void;

  // Platforms
  platforms: Platform[];

  // Crons
  crons: CronJob[];
  addCron: (c: CronJob) => void;
  toggleCron: (id: string) => void;
  deleteCron: (id: string) => void;

  // Skills
  skills: Skill[];
  addSkill: (s: Skill) => void;
  updateSkill: (id: string, patch: Partial<Skill>) => void;
  deleteSkill: (id: string) => void;

  // Settings modal
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;
}

const generateId = () => Math.random().toString(36).slice(2);

const initialSession: Session = {
  id: generateId(),
  title: 'New Conversation',
  timestamp: Date.now(),
  messages: [],
};

export const useStore = create<AppState>((set, get) => ({
  // Gateway
  gatewayStatus: 'unchecked',
  agentState: 'idle',
  activeModel: 'hermes-agent',
  setGatewayStatus: (s) => set({ gatewayStatus: s }),
  setAgentState: (s) => set({ agentState: s }),
  setActiveModel: (m) => set({ activeModel: m }),

  // Navigation
  activeSection: 'dashboard',
  setActiveSection: (s) => set({ activeSection: s }),
  rightPanelOpen: true,
  setRightPanelOpen: (v) => set({ rightPanelOpen: v }),
  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),

  // Conversations
  sessions: [initialSession],
  activeSessionId: initialSession.id,
  addSession: () => {
    const s: Session = {
      id: generateId(),
      title: 'New Conversation',
      timestamp: Date.now(),
      messages: [],
    };
    set((state) => ({
      sessions: [s, ...state.sessions],
      activeSessionId: s.id,
    }));
    get().clearToolCalls();
  },
  setActiveSession: (id) => set({ activeSessionId: id }),
  addMessage: (msg) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === state.activeSessionId
          ? { ...s, messages: [...s.messages, msg], title: s.messages.length === 0 && msg.role === 'user' ? msg.content.slice(0, 60) : s.title }
          : s
      ),
    })),
  updateLastMessage: (patch) =>
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== state.activeSessionId) return s;
        const msgs = [...s.messages];
        if (msgs.length === 0) return s;
        const last = { ...msgs[msgs.length - 1], ...patch };
        msgs[msgs.length - 1] = last;
        return { ...s, messages: msgs };
      }),
    })),
  updateToolCall: (sessionId, toolId, patch) =>
    set((state) => ({
      sessions: state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          messages: s.messages.map((m) => {
            if (!m.toolCalls) return m;
            return {
              ...m,
              toolCalls: m.toolCalls.map((tc) =>
                tc.id === toolId ? { ...tc, ...patch } : tc
              ),
            };
          }),
        };
      }),
    })),
  clearActiveSession: () =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === state.activeSessionId ? { ...s, messages: [] } : s
      ),
    })),

  // Command palette
  paletteOpen: false,
  setPaletteOpen: (v) => set({ paletteOpen: v }),
  paletteQuery: '',
  setPaletteQuery: (q) => set({ paletteQuery: q }),

  // Model switcher
  modelSwitcherOpen: false,
  setModelSwitcherOpen: (v) => set({ modelSwitcherOpen: v }),

  // Token usage
  tokensUsed: 0,
  contextWindow: 200000,
  setTokenUsage: (used, total) => set({ tokensUsed: used, contextWindow: total }),

  // Tool calls
  activeToolCalls: [],
  addToolCall: (tc) =>
    set((state) => ({ activeToolCalls: [...state.activeToolCalls, tc] })),
  updateToolCallGlobal: (id, patch) =>
    set((state) => ({
      activeToolCalls: state.activeToolCalls.map((tc) =>
        tc.id === id ? { ...tc, ...patch } : tc
      ),
    })),
  clearToolCalls: () => set({ activeToolCalls: [] }),

  // Platforms
  platforms: [
    { name: 'Telegram', status: 'disconnected', icon: 'TG' },
    { name: 'Discord', status: 'disconnected', icon: 'DC' },
    { name: 'Slack', status: 'disconnected', icon: 'SL' },
    { name: 'WhatsApp', status: 'disconnected', icon: 'WA' },
    { name: 'Signal', status: 'disconnected', icon: 'SG' },
    { name: 'Email', status: 'disconnected', icon: 'EM' },
  ],

  // Crons
  crons: [
    { id: '1', schedule: 'Daily at 09:00', description: 'Morning briefing digest', platform: 'Telegram', lastRun: '2026-05-12', active: true },
    { id: '2', schedule: 'Every Monday', description: 'Weekly goals review', platform: 'Discord', lastRun: '2026-05-11', active: false },
  ],
  addCron: (c) => set((state) => ({ crons: [...state.crons, c] })),
  toggleCron: (id) =>
    set((state) => ({
      crons: state.crons.map((c) => (c.id === id ? { ...c, active: !c.active } : c)),
    })),
  deleteCron: (id) => set((state) => ({ crons: state.crons.filter((c) => c.id !== id) })),

  // Skills
  skills: [
    { id: '1', name: 'summarize', description: 'Summarize any text, document, or URL', source: 'builtin', content: '# Summarize\nSummarize the provided content concisely.' },
    { id: '2', name: 'code-review', description: 'Review code for bugs, style, and security', source: 'builtin', content: '# Code Review\nReview the provided code.' },
    { id: '3', name: 'translate', description: 'Translate text to any language', source: 'user', content: '# Translate\nTranslate the text to the specified language.' },
  ],
  addSkill: (s) => set((state) => ({ skills: [...state.skills, s] })),
  updateSkill: (id, patch) =>
    set((state) => ({ skills: state.skills.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
  deleteSkill: (id) => set((state) => ({ skills: state.skills.filter((s) => s.id !== id) })),

  // Settings
  settingsOpen: false,
  setSettingsOpen: (v) => set({ settingsOpen: v }),
}));
