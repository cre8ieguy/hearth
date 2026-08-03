import { contextBridge, ipcRenderer } from 'electron'

const EVENT_CHANNELS = new Set([
  'agent:event',
  'agent:history',
  'settings:changed',
  'status:changed',
  'spotify:now-playing',
  'timers:fired',
  'timers:changed',
  'ui:navigate',
  'ui:screensaver',
  'calendar:changed',
])

const api = {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (patch: unknown) => ipcRenderer.invoke('settings:update', patch),
    pickFolder: () => ipcRenderer.invoke('settings:pick-folder'),
  },
  status: () => ipcRenderer.invoke('status:get'),
  agent: {
    ask: (text: string) => ipcRenderer.invoke('agent:ask', text),
    cancel: () => ipcRenderer.invoke('agent:cancel'),
    reset: () => ipcRenderer.invoke('agent:reset'),
    history: () => ipcRenderer.invoke('agent:history'),
  },
  speech: {
    transcribe: (bytes: Uint8Array, mime: string) =>
      ipcRenderer.invoke('speech:transcribe', bytes, mime),
    tts: (text: string) => ipcRenderer.invoke('speech:tts', text),
  },
  spotify: {
    connect: () => ipcRenderer.invoke('spotify:connect'),
    disconnect: () => ipcRenderer.invoke('spotify:disconnect'),
    nowPlaying: () => ipcRenderer.invoke('spotify:now-playing'),
    search: (q: string, type?: string) => ipcRenderer.invoke('spotify:search', q, type),
    play: (req: unknown) => ipcRenderer.invoke('spotify:play', req),
    control: (action: string, volume?: number) => ipcRenderer.invoke('spotify:control', action, volume),
    playlists: () => ipcRenderer.invoke('spotify:playlists'),
    devices: () => ipcRenderer.invoke('spotify:devices'),
  },
  google: {
    connect: () => ipcRenderer.invoke('google:connect'),
    disconnect: () => ipcRenderer.invoke('google:disconnect'),
    calendars: () => ipcRenderer.invoke('google:calendars'),
    events: (days?: number) => ipcRenderer.invoke('google:events', days),
    addEvent: (req: unknown) => ipcRenderer.invoke('google:add-event', req),
  },
  ha: {
    test: () => ipcRenderer.invoke('ha:test'),
    entities: (search?: string, domain?: string) => ipcRenderer.invoke('ha:entities', search, domain),
    call: (entityId: string, service: string, data?: unknown) =>
      ipcRenderer.invoke('ha:call', entityId, service, data),
  },
  weather: {
    get: (force?: boolean) => ipcRenderer.invoke('weather:get', force),
    geocode: (q: string) => ipcRenderer.invoke('weather:geocode', q),
  },
  photos: {
    list: () => ipcRenderer.invoke('photos:list'),
  },
  timers: {
    list: () => ipcRenderer.invoke('timers:list'),
    cancel: (query: string) => ipcRenderer.invoke('timers:cancel', query),
    set: (seconds: number, label?: string) => ipcRenderer.invoke('timers:set', seconds, label),
  },
  system: {
    version: () => ipcRenderer.invoke('system:version'),
    quit: () => ipcRenderer.invoke('system:quit'),
  },
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    if (!EVENT_CHANNELS.has(channel)) {
      throw new Error(`Unknown event channel: ${channel}`)
    }
    const wrapped = (_event: unknown, ...args: unknown[]) => listener(...args)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  },
}

contextBridge.exposeInMainWorld('hearth', api)

export type HearthPreloadApi = typeof api
