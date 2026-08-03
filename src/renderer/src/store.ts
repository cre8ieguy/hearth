import { create } from 'zustand'
import type {
  AgentEvent,
  ChatMessage,
  ContentPanel,
  NowPlaying,
  ServiceStatus,
  Settings,
  Timer,
  ViewName,
} from '@shared/types'

export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'

export interface ScreensaverState {
  mode: 'photos' | 'youtube'
  preset?: string
}

interface HearthStore {
  settings: Settings | null
  status: ServiceStatus | null
  view: ViewName
  nowPlaying: NowPlaying
  timers: Timer[]
  firedTimer: Timer | null
  chat: ChatMessage[]

  voiceState: VoiceState
  micLevel: number
  liveUser: string
  liveAssistant: string
  liveActivity: string
  liveError: string
  turnActive: boolean
  lastTurnEndedAt: number
  wakeStatus: string
  updateStatus: string

  screensaver: ScreensaverState | null
  contentPanel: ContentPanel | null

  setView: (v: ViewName) => void
  setContentPanel: (c: ContentPanel | null) => void
  setVoiceState: (v: VoiceState) => void
  setMicLevel: (level: number) => void
  setScreensaver: (s: ScreensaverState | null) => void
  clearFiredTimer: () => void
  updateSettings: (patch: unknown) => Promise<void>
}

export const useStore = create<HearthStore>((set) => ({
  settings: null,
  status: null,
  view: 'dashboard',
  nowPlaying: { active: false, isPlaying: false },
  timers: [],
  firedTimer: null,
  chat: [],

  voiceState: 'idle',
  micLevel: 0,
  liveUser: '',
  liveAssistant: '',
  liveActivity: '',
  liveError: '',
  turnActive: false,
  lastTurnEndedAt: 0,
  wakeStatus: 'off',
  updateStatus: '',

  screensaver: null,
  contentPanel: null,

  setView: (view) => set({ view }),
  setContentPanel: (contentPanel) => set({ contentPanel }),
  setVoiceState: (voiceState) => set({ voiceState }),
  setMicLevel: (micLevel) => set({ micLevel }),
  setScreensaver: (screensaver) => set({ screensaver }),
  clearFiredTimer: () => set({ firedTimer: null }),
  updateSettings: async (patch) => {
    const settings = await window.hearth.settings.update(patch)
    set({ settings })
  },
}))

function handleAgentEvent(event: AgentEvent): void {
  const set = useStore.setState
  switch (event.type) {
    case 'turn-start':
      set({
        turnActive: true,
        liveUser: event.userText,
        liveAssistant: '',
        liveActivity: '',
        liveError: '',
      })
      break
    case 'text-delta':
      set((s) => ({ liveAssistant: s.liveAssistant + event.text, liveActivity: '' }))
      break
    case 'tool-start':
      set({ liveActivity: event.label })
      break
    case 'tool-end':
      set({ liveActivity: '' })
      break
    case 'assistant-done':
      set({ liveAssistant: event.text, liveActivity: '' })
      break
    case 'refusal':
      set({ liveAssistant: event.text, liveActivity: '' })
      break
    case 'error':
      set({ liveError: event.message, liveActivity: '' })
      break
    case 'turn-end':
      set({ turnActive: false, lastTurnEndedAt: Date.now() })
      break
  }
}

let initialized = false

export function initStore(): void {
  if (initialized) return
  initialized = true
  const set = useStore.setState

  void window.hearth.settings.get().then((settings) => set({ settings }))
  void window.hearth.status().then((status) => set({ status }))
  void window.hearth.agent.history().then((chat) => set({ chat }))
  void window.hearth.timers.list().then((timers) => set({ timers }))
  void window.hearth.spotify.nowPlaying().then(
    (nowPlaying) => set({ nowPlaying }),
    () => undefined,
  )
  void window.hearth.system.updateStatus().then((updateStatus) => set({ updateStatus }))

  window.hearth.on('settings:changed', (settings) => set({ settings: settings as Settings }))
  window.hearth.on('status:changed', (status) => set({ status: status as ServiceStatus }))
  window.hearth.on('spotify:now-playing', (np) => set({ nowPlaying: np as NowPlaying }))
  window.hearth.on('timers:changed', (timers) => set({ timers: timers as Timer[] }))
  window.hearth.on('timers:fired', (timer) => set({ firedTimer: timer as Timer }))
  window.hearth.on('agent:history', (chat) => set({ chat: chat as ChatMessage[] }))
  window.hearth.on('agent:event', (event) => handleAgentEvent(event as AgentEvent))
  window.hearth.on('ui:navigate', (view) => {
    set({ view: view as ViewName, screensaver: null, contentPanel: null })
  })
  window.hearth.on('ui:content', (panel) => {
    set({ contentPanel: panel as ContentPanel | null, screensaver: null })
  })
  window.hearth.on('updater:status', (updateStatus) => set({ updateStatus: updateStatus as string }))
  window.hearth.on('ui:screensaver', (payload) => {
    const p = payload as { mode: 'photos' | 'youtube' | 'off'; preset?: string }
    if (p.mode === 'off') set({ screensaver: null })
    else set({ screensaver: { mode: p.mode, preset: p.preset } })
  })
}
