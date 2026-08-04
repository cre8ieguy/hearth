import { app, dialog, ipcMain } from 'electron'
import { getSettings, updateSettings, onSettingsChange, type DeepPartial } from './settings'
import type { Settings, ServiceStatus } from '@shared/types'
import { getMainWindow, send } from './window'
import * as agent from './services/agent'
import * as speech from './services/speech'
import * as spotify from './services/spotify'
import * as google from './services/google'
import * as ha from './services/homeassistant'
import * as weather from './services/weather'
import * as photos from './services/photos'
import * as timers from './services/timers'
import { checkForUpdatesNow, getUpdateStatus, installUpdateNow, isUpdateReady } from './services/updater'

export function serviceStatus(): ServiceStatus {
  const s = getSettings()
  return {
    anthropic: !!s.anthropic.apiKey,
    openai: !!s.openai.apiKey,
    spotify: spotify.isConnected(),
    google: google.isConnected(),
    homeAssistant: ha.isConfigured(),
  }
}

export function registerIpc(): void {
  // ---------- settings ----------
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:update', (_e, patch: DeepPartial<Settings>) => updateSettings(patch))
  ipcMain.handle('settings:pick-folder', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })
  ipcMain.handle('status:get', () => serviceStatus())

  // ---------- agent ----------
  ipcMain.handle('agent:ask', (_e, text: string) => agent.ask(text))
  ipcMain.handle('agent:cancel', () => agent.cancel())
  ipcMain.handle('agent:reset', () => agent.resetConversation())
  ipcMain.handle('agent:history', () => agent.getChatLog())

  // ---------- speech ----------
  ipcMain.handle('speech:transcribe', (_e, bytes: Uint8Array, mime: string) =>
    speech.transcribe(bytes, mime),
  )
  ipcMain.handle('speech:tts', (_e, text: string) => speech.speak(text))

  // ---------- spotify ----------
  ipcMain.handle('spotify:connect', () => spotify.connect())
  ipcMain.handle('spotify:disconnect', () => spotify.disconnect())
  ipcMain.handle('spotify:now-playing', () => spotify.nowPlaying())
  ipcMain.handle('spotify:search', (_e, q: string, type?: 'track' | 'album' | 'playlist' | 'artist') =>
    spotify.search(q, type ?? 'track', 8),
  )
  ipcMain.handle('spotify:play', (_e, req: spotify.PlayRequest) => spotify.play(req))
  ipcMain.handle('spotify:control', (_e, action: Parameters<typeof spotify.control>[0], volume?: number) =>
    spotify.control(action, volume),
  )
  ipcMain.handle('spotify:playlists', () => spotify.myPlaylists())
  ipcMain.handle('spotify:devices', () => spotify.getDevices())

  // ---------- google calendar ----------
  ipcMain.handle('google:connect', () => google.connect())
  ipcMain.handle('google:disconnect', () => google.disconnect())
  ipcMain.handle('google:calendars', () => google.listCalendars())
  ipcMain.handle('google:events', (_e, days?: number) => google.listEvents(days ?? 7))
  ipcMain.handle('google:add-event', (_e, req: google.AddEventRequest) => google.addEvent(req))

  // ---------- home assistant ----------
  ipcMain.handle('ha:test', () => ha.test())
  ipcMain.handle('ha:entities', (_e, search?: string, domain?: string) => ha.listEntities(search, domain))
  ipcMain.handle('ha:call', (_e, entityId: string, service: string, data?: Record<string, unknown>) =>
    ha.callService(entityId, service, data),
  )

  // ---------- weather / photos / timers ----------
  ipcMain.handle('weather:get', (_e, force?: boolean) => weather.getWeather(!!force))
  ipcMain.handle('weather:geocode', (_e, q: string) => weather.geocode(q))
  ipcMain.handle('photos:list', () => photos.listPhotos())
  ipcMain.handle('timers:list', () => timers.listTimers())
  ipcMain.handle('timers:cancel', (_e, query: string) => timers.cancelTimer(query))
  ipcMain.handle('timers:set', (_e, seconds: number, label?: string) => timers.setTimer(seconds, label))

  // ---------- system ----------
  ipcMain.handle('system:version', () => app.getVersion())
  ipcMain.handle('system:quit', () => app.quit())
  ipcMain.handle('updater:check', () => checkForUpdatesNow())
  ipcMain.handle('updater:status', () => getUpdateStatus())
  ipcMain.handle('updater:ready', () => isUpdateReady())
  ipcMain.handle('updater:install-now', () => installUpdateNow())

  // Broadcast settings changes so every view stays in sync.
  onSettingsChange((s) => {
    send('settings:changed', s)
    send('status:changed', serviceStatus())
  })
}
