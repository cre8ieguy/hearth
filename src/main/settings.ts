import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { DEFAULT_SETTINGS, type Settings, type YoutubePreset } from '@shared/types'

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (infer U)[]
    ? U[]
    : T[K] extends object | null
      ? DeepPartial<NonNullable<T[K]>> | null
      : T[K]
}

let cached: Settings | null = null
const listeners = new Set<(s: Settings) => void>()

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Objects merge recursively; arrays and scalars (including null) replace.
function deepMerge<T>(base: T, patch: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return (patch === undefined ? base : patch) as T
  }
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const baseVal = (base as Record<string, unknown>)[key]
    out[key] = isPlainObject(baseVal) && isPlainObject(value) ? deepMerge(baseVal, value) : value
  }
  return out as T
}

// Presets we shipped as defaults that were live streams; YouTube no longer
// plays live streams in embedded players, so saved copies get swapped for
// equivalent regular uploads.
const LIVE_PRESET_SWAPS: Record<string, YoutubePreset> = {
  jfKfPfyJRdk: { name: 'Lofi study session', videoId: 'lTRiuFIWV54' },
  '4xDzrJKXOOY': { name: 'Synthwave mix', videoId: 'Td0iFptEmo0' },
}

function migrate(s: Settings): void {
  s.screensaver.youtubePresets = s.screensaver.youtubePresets.map((p) => {
    const swap = LIVE_PRESET_SWAPS[p.videoId]
    if (!swap) return p
    if (s.screensaver.activePreset === p.name) s.screensaver.activePreset = swap.name
    return swap
  })
}

export function getSettings(): Settings {
  if (cached) return cached
  try {
    const raw = fs.readFileSync(settingsFile(), 'utf8')
    cached = deepMerge(structuredClone(DEFAULT_SETTINGS), JSON.parse(raw))
  } catch {
    cached = structuredClone(DEFAULT_SETTINGS)
  }
  migrate(cached)
  return cached
}

export function updateSettings(patch: DeepPartial<Settings>): Settings {
  cached = deepMerge(getSettings(), patch)
  const file = settingsFile()
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify(cached, null, 2), 'utf8')
    fs.renameSync(tmp, file)
  } catch (err) {
    console.error('Failed to persist settings:', err)
  }
  for (const fn of listeners) fn(cached)
  return cached
}

export function onSettingsChange(fn: (s: Settings) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
