import type {
  Settings,
  ServiceStatus,
  ChatMessage,
  NowPlaying,
  SpotifySearchItem,
  CalendarInfo,
  CalendarEvent,
  HaEntity,
  WeatherReport,
  GeocodeResult,
  Timer,
} from '@shared/types'

// Typed view of the API exposed by src/preload/index.ts via contextBridge.
export interface HearthApi {
  settings: {
    get(): Promise<Settings>
    update(patch: unknown): Promise<Settings>
    pickFolder(): Promise<string | null>
  }
  status(): Promise<ServiceStatus>
  agent: {
    ask(text: string): Promise<string>
    cancel(): Promise<void>
    reset(): Promise<void>
    history(): Promise<ChatMessage[]>
  }
  speech: {
    transcribe(bytes: Uint8Array, mime: string): Promise<string>
    tts(text: string): Promise<Uint8Array>
  }
  spotify: {
    connect(): Promise<void>
    disconnect(): Promise<void>
    nowPlaying(): Promise<NowPlaying>
    search(q: string, type?: 'track' | 'album' | 'playlist' | 'artist'): Promise<SpotifySearchItem[]>
    play(req: {
      query?: string
      uri?: string
      type?: 'track' | 'album' | 'playlist' | 'artist'
      shuffle?: boolean
    }): Promise<string>
    control(
      action: 'pause' | 'resume' | 'next' | 'previous' | 'shuffle_on' | 'shuffle_off' | 'volume',
      volume?: number,
    ): Promise<void>
    playlists(): Promise<SpotifySearchItem[]>
    devices(): Promise<{ id: string; name: string; is_active: boolean }[]>
  }
  google: {
    connect(): Promise<void>
    disconnect(): Promise<void>
    calendars(): Promise<CalendarInfo[]>
    events(days?: number): Promise<CalendarEvent[]>
    addEvent(req: {
      title: string
      date: string
      startTime?: string
      endTime?: string
      allDay?: boolean
      description?: string
      calendar?: string
    }): Promise<string>
  }
  ha: {
    test(): Promise<string>
    entities(search?: string, domain?: string): Promise<HaEntity[]>
    call(entityId: string, service: string, data?: unknown): Promise<string>
  }
  weather: {
    get(force?: boolean): Promise<WeatherReport>
    geocode(q: string): Promise<GeocodeResult[]>
  }
  photos: { list(): Promise<string[]> }
  timers: {
    list(): Promise<Timer[]>
    cancel(query: string): Promise<Timer | null>
    set(seconds: number, label?: string): Promise<Timer>
  }
  screen: {
    setPower(on: boolean): Promise<void>
  }
  system: {
    version(): Promise<string>
    quit(): Promise<void>
    checkUpdates(): Promise<string>
    updateStatus(): Promise<string>
    updateReady(): Promise<boolean>
    installUpdateNow(): Promise<void>
    openExternal(url: string): Promise<void>
  }
  on(channel: string, listener: (...args: unknown[]) => void): () => void
}

declare global {
  interface Window {
    hearth: HearthApi
  }
}

export {}
