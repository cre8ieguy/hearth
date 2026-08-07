// Shared contracts between main, preload, and renderer.

export interface YoutubePreset {
  name: string
  videoId: string
}

export interface Settings {
  anthropic: {
    apiKey: string
    model: string
    effort: 'low' | 'medium' | 'high'
  }
  openai: {
    apiKey: string
    sttModel: string
    ttsModel: string
    ttsVoice: string
    ttsSpeed: number // playback rate, pitch-preserved (1 = as synthesized)
  }
  assistant: {
    name: string
    speakReplies: boolean
    continuousConversation: boolean
    resetAfterMinutes: number // clear model context after idle (0 = never)
  }
  wakeWord: {
    enabled: boolean
    engine: 'openwakeword' | 'porcupine'
    accessKey: string
    keyword: string
    sensitivity: number
  }
  spotify: {
    clientId: string
    preferredDeviceName: string
    tokens: OAuthTokens | null
  }
  google: {
    clientId: string
    clientSecret: string
    tokens: OAuthTokens | null
  }
  homeAssistant: {
    url: string
    token: string
  }
  location: {
    name: string
    lat: number | null
    lon: number | null
    unit: 'fahrenheit' | 'celsius'
  }
  display: {
    clock24h: boolean
    kiosk: boolean
    launchAtLogin: boolean
    keepAwake: boolean
  }
  presence: {
    enabled: boolean // camera motion detection drives display power
    offAfterMinutes: number
  }
  screensaver: {
    mode: 'photos' | 'youtube' | 'mix' | 'off'
    mixMinutes: number // in mix mode, minutes per phase before switching
    idleMinutes: number
    photosDir: string
    photoIntervalSec: number
    youtubePresets: YoutubePreset[]
    activePreset: string
    youtubeMuted: boolean
    showClock: boolean
  }
}

export interface OAuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // epoch ms
}

// ---------- Weather ----------
export interface WeatherNow {
  temp: number
  feelsLike: number
  humidity: number
  windSpeed: number
  code: number
  isDay: boolean
}

export interface WeatherDay {
  date: string // YYYY-MM-DD
  code: number
  tempMax: number
  tempMin: number
  precipChance: number
}

export interface WeatherReport {
  location: string
  unit: 'fahrenheit' | 'celsius'
  now: WeatherNow
  daily: WeatherDay[]
  fetchedAt: number
}

export interface GeocodeResult {
  name: string
  admin1?: string
  country?: string
  lat: number
  lon: number
}

// ---------- Spotify ----------
export interface NowPlaying {
  active: boolean
  isPlaying: boolean
  track?: {
    title: string
    artists: string
    album: string
    artUrl: string | null
    durationMs: number
    progressMs: number
    uri: string
  }
  device?: { name: string; volumePercent: number | null }
  shuffle?: boolean
}

export interface SpotifySearchItem {
  uri: string
  name: string
  subtitle: string
  artUrl: string | null
  type: 'track' | 'album' | 'playlist' | 'artist'
}

// ---------- Calendar ----------
export interface CalendarInfo {
  id: string
  name: string
  primary: boolean
  color: string | null
}

export interface CalendarEvent {
  id: string
  calendarId: string
  calendarName: string
  title: string
  start: string // ISO datetime or date
  end: string
  allDay: boolean
  location: string | null
  color: string | null
}

// ---------- Home Assistant ----------
export interface HaEntity {
  entityId: string
  name: string
  state: string
  domain: string
}

// ---------- Timers ----------
export interface Timer {
  id: string
  label: string
  endsAt: number // epoch ms
  totalSeconds: number
}

// ---------- Agent stream events (main -> renderer) ----------
export type AgentEvent =
  | { type: 'turn-start'; userText: string }
  | { type: 'text-delta'; text: string }
  | { type: 'tool-start'; name: string; label: string }
  | { type: 'tool-end'; name: string }
  | { type: 'assistant-done'; text: string }
  | { type: 'refusal'; text: string }
  | { type: 'turn-end' }
  | { type: 'error'; message: string }

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  at: number
}

// ---------- Connection status ----------
export interface ServiceStatus {
  anthropic: boolean
  openai: boolean
  spotify: boolean
  google: boolean
  homeAssistant: boolean
}

export type ViewName = 'dashboard' | 'assistant' | 'spotify' | 'calendar' | 'settings'

// ---------- On-screen content panel (agent-driven) ----------
export type ContentPanel =
  | { kind: 'markdown'; title: string; markdown: string }
  | { kind: 'web'; title: string; url: string }

// Curated model choices for the Settings dropdown (exact API ids).
export const MODEL_CHOICES: { id: string; label: string }[] = [
  { id: 'claude-fable-5', label: 'Fable 5 — smartest, premium price ($10/$50 per MTok)' },
  { id: 'claude-opus-5', label: 'Opus 5 — excellent, half the price ($5/$25)' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5 — fast & cheap, still great ($3/$15)' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5 — cheapest, simple tasks ($1/$5)' },
]

export const DEFAULT_SETTINGS: Settings = {
  anthropic: { apiKey: '', model: 'claude-fable-5', effort: 'low' },
  openai: {
    apiKey: '',
    sttModel: 'gpt-4o-transcribe',
    ttsModel: 'gpt-4o-mini-tts',
    ttsVoice: 'nova',
    ttsSpeed: 1.2,
  },
  assistant: { name: 'Jarvis', speakReplies: true, continuousConversation: false, resetAfterMinutes: 15 },
  wakeWord: { enabled: true, engine: 'openwakeword', accessKey: '', keyword: 'Jarvis', sensitivity: 0.6 },
  spotify: { clientId: '', preferredDeviceName: '', tokens: null },
  google: { clientId: '', clientSecret: '', tokens: null },
  homeAssistant: { url: '', token: '' },
  location: { name: '', lat: null, lon: null, unit: 'fahrenheit' },
  display: { clock24h: false, kiosk: false, launchAtLogin: false, keepAwake: true },
  presence: { enabled: false, offAfterMinutes: 10 },
  screensaver: {
    mode: 'photos',
    mixMinutes: 15,
    idleMinutes: 5,
    photosDir: '',
    photoIntervalSec: 12,
    // Non-live uploads only: YouTube refuses live streams in embedded players.
    youtubePresets: [
      { name: 'Lofi study session', videoId: 'lTRiuFIWV54' },
      { name: 'Synthwave mix', videoId: 'Td0iFptEmo0' },
      { name: 'Aquarium 4K', videoId: 'Gw4bRy4SoK0' },
    ],
    activePreset: 'Lofi study session',
    youtubeMuted: false,
    showClock: true,
  },
}

// WMO weather interpretation codes -> label + emoji
export const WEATHER_CODES: Record<number, { label: string; icon: string }> = {
  0: { label: 'Clear sky', icon: '☀️' },
  1: { label: 'Mostly clear', icon: '🌤️' },
  2: { label: 'Partly cloudy', icon: '⛅' },
  3: { label: 'Overcast', icon: '☁️' },
  45: { label: 'Fog', icon: '🌫️' },
  48: { label: 'Icy fog', icon: '🌫️' },
  51: { label: 'Light drizzle', icon: '🌦️' },
  53: { label: 'Drizzle', icon: '🌦️' },
  55: { label: 'Heavy drizzle', icon: '🌧️' },
  56: { label: 'Freezing drizzle', icon: '🌧️' },
  57: { label: 'Freezing drizzle', icon: '🌧️' },
  61: { label: 'Light rain', icon: '🌦️' },
  63: { label: 'Rain', icon: '🌧️' },
  65: { label: 'Heavy rain', icon: '🌧️' },
  66: { label: 'Freezing rain', icon: '🌧️' },
  67: { label: 'Freezing rain', icon: '🌧️' },
  71: { label: 'Light snow', icon: '🌨️' },
  73: { label: 'Snow', icon: '❄️' },
  75: { label: 'Heavy snow', icon: '❄️' },
  77: { label: 'Snow grains', icon: '❄️' },
  80: { label: 'Light showers', icon: '🌦️' },
  81: { label: 'Showers', icon: '🌧️' },
  82: { label: 'Heavy showers', icon: '⛈️' },
  85: { label: 'Snow showers', icon: '🌨️' },
  86: { label: 'Snow showers', icon: '🌨️' },
  95: { label: 'Thunderstorm', icon: '⛈️' },
  96: { label: 'Thunderstorm w/ hail', icon: '⛈️' },
  99: { label: 'Thunderstorm w/ hail', icon: '⛈️' },
}

export function weatherInfo(code: number): { label: string; icon: string } {
  return WEATHER_CODES[code] ?? { label: 'Unknown', icon: '🌡️' }
}
