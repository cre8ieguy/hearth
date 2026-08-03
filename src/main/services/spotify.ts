import { shell } from 'electron'
import { getSettings, updateSettings } from '../settings'
import { pkcePair, postForm, waitForCode } from '../oauth'
import { send } from '../window'
import type { NowPlaying, OAuthTokens, SpotifySearchItem } from '@shared/types'

export const SPOTIFY_REDIRECT = 'http://127.0.0.1:8888/callback/spotify'
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-top-read',
].join(' ')

export function isConnected(): boolean {
  return !!getSettings().spotify.tokens
}

export async function connect(): Promise<void> {
  const { clientId } = getSettings().spotify
  if (!clientId) throw new Error('Enter your Spotify Client ID first (Settings → Spotify).')

  const { verifier, challenge } = pkcePair()
  const url = new URL('https://accounts.spotify.com/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', SPOTIFY_REDIRECT)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('scope', SCOPES)

  const codePromise = waitForCode(8888, '/callback/spotify')
  await shell.openExternal(url.toString())
  const code = await codePromise

  const json = await postForm('https://accounts.spotify.com/api/token', {
    grant_type: 'authorization_code',
    code,
    redirect_uri: SPOTIFY_REDIRECT,
    client_id: clientId,
    code_verifier: verifier,
  })
  saveTokens(json)
}

export function disconnect(): void {
  updateSettings({ spotify: { tokens: null } })
  send('spotify:now-playing', { active: false, isPlaying: false } satisfies NowPlaying)
}

function saveTokens(json: Record<string, unknown>): OAuthTokens {
  const tokens: OAuthTokens = {
    accessToken: String(json.access_token),
    refreshToken: String(json.refresh_token ?? getSettings().spotify.tokens?.refreshToken ?? ''),
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
  }
  updateSettings({ spotify: { tokens } })
  return tokens
}

async function accessToken(force = false): Promise<string> {
  const { clientId, tokens } = getSettings().spotify
  if (!tokens) throw new Error('Spotify is not connected. Connect it in Settings → Spotify.')
  if (!force && Date.now() < tokens.expiresAt - 60_000) return tokens.accessToken
  try {
    const json = await postForm('https://accounts.spotify.com/api/token', {
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: clientId,
    })
    return saveTokens(json).accessToken
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('invalid_grant') || msg.includes('Refresh token revoked')) {
      updateSettings({ spotify: { tokens: null } })
      throw new Error('Spotify session expired — reconnect in Settings → Spotify.')
    }
    throw err
  }
}

async function api<T = unknown>(
  method: string,
  apiPath: string,
  opts: { body?: unknown; retried?: boolean } = {},
): Promise<T | null> {
  const token = await accessToken()
  const res = await fetch(`https://api.spotify.com/v1${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  if (res.status === 401 && !opts.retried) {
    await accessToken(true)
    return api(method, apiPath, { ...opts, retried: true })
  }
  if (res.status === 204) return null
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message || `Spotify error (HTTP ${res.status})`)
  }
  const text = await res.text()
  return text ? (JSON.parse(text) as T) : null
}

interface RawDevice {
  id: string
  name: string
  is_active: boolean
  is_restricted: boolean
  volume_percent: number | null
}

export async function getDevices(): Promise<RawDevice[]> {
  const json = await api<{ devices: RawDevice[] }>('GET', '/me/player/devices')
  return json?.devices ?? []
}

/** Active device first, then the preferred name from settings, then any device. */
async function pickDeviceId(): Promise<string> {
  const devices = (await getDevices()).filter((d) => !d.is_restricted)
  if (devices.length === 0) {
    throw new Error(
      'No Spotify device is available. Open the Spotify app on this PC (or any device on the account), then try again.',
    )
  }
  const preferred = getSettings().spotify.preferredDeviceName.trim().toLowerCase()
  const device =
    devices.find((d) => d.is_active) ??
    (preferred ? devices.find((d) => d.name.toLowerCase().includes(preferred)) : undefined) ??
    devices[0]
  return device.id
}

interface RawTrack {
  name: string
  uri: string
  duration_ms: number
  album: { name: string; images?: { url: string }[] }
  artists: { name: string }[]
}

export async function nowPlaying(): Promise<NowPlaying> {
  if (!isConnected()) return { active: false, isPlaying: false }
  const json = await api<{
    is_playing: boolean
    progress_ms: number
    shuffle_state: boolean
    item: RawTrack | null
    device: { name: string; volume_percent: number | null } | null
  }>('GET', '/me/player')
  if (!json || !json.item) return { active: false, isPlaying: false }
  return {
    active: true,
    isPlaying: json.is_playing,
    shuffle: json.shuffle_state,
    track: {
      title: json.item.name,
      artists: json.item.artists.map((a) => a.name).join(', '),
      album: json.item.album.name,
      artUrl: json.item.album.images?.[0]?.url ?? null,
      durationMs: json.item.duration_ms,
      progressMs: json.progress_ms ?? 0,
      uri: json.item.uri,
    },
    device: json.device ? { name: json.device.name, volumePercent: json.device.volume_percent } : undefined,
  }
}

export async function search(
  query: string,
  type: 'track' | 'album' | 'playlist' | 'artist' = 'track',
  limit = 6,
): Promise<SpotifySearchItem[]> {
  const params = new URLSearchParams({ q: query, type, limit: String(limit) })
  const json = await api<Record<string, { items: unknown[] }>>('GET', `/search?${params}`)
  const items = (json?.[`${type}s`]?.items ?? []).filter(Boolean) as Record<string, unknown>[]
  return items.map((item) => {
    const images =
      (item.images as { url: string }[] | undefined) ??
      ((item.album as { images?: { url: string }[] } | undefined)?.images ?? [])
    let subtitle = ''
    if (type === 'track' || type === 'album') {
      subtitle = ((item.artists as { name: string }[]) ?? []).map((a) => a.name).join(', ')
    } else if (type === 'playlist') {
      subtitle = `Playlist · ${(item.owner as { display_name?: string })?.display_name ?? 'Spotify'}`
    } else {
      subtitle = 'Artist'
    }
    return {
      uri: String(item.uri),
      name: String(item.name),
      subtitle,
      artUrl: images?.[0]?.url ?? null,
      type,
    }
  })
}

export interface PlayRequest {
  query?: string
  uri?: string
  type?: 'track' | 'album' | 'playlist' | 'artist'
  shuffle?: boolean
}

/** Search (if needed) and start playback on the best available device. */
export async function play(req: PlayRequest): Promise<string> {
  let uri = req.uri
  let label = ''
  if (!uri) {
    if (!req.query) throw new Error('Nothing to play — provide a query or uri.')
    const results = await search(req.query, req.type ?? 'track', 3)
    if (results.length === 0) throw new Error(`No Spotify results for "${req.query}".`)
    uri = results[0].uri
    label = `${results[0].name}${results[0].subtitle ? ' — ' + results[0].subtitle : ''}`
  }
  const deviceId = await pickDeviceId()
  if (req.shuffle !== undefined) {
    await api('PUT', `/me/player/shuffle?state=${req.shuffle}&device_id=${deviceId}`).catch(() => null)
  }
  const body = uri.startsWith('spotify:track:') ? { uris: [uri] } : { context_uri: uri }
  await api('PUT', `/me/player/play?device_id=${deviceId}`, { body })
  refreshSoon()
  return label || uri
}

export async function control(
  action: 'pause' | 'resume' | 'next' | 'previous' | 'shuffle_on' | 'shuffle_off' | 'volume',
  volumePercent?: number,
): Promise<void> {
  switch (action) {
    case 'pause':
      await api('PUT', '/me/player/pause')
      break
    case 'resume': {
      const deviceId = await pickDeviceId()
      await api('PUT', `/me/player/play?device_id=${deviceId}`)
      break
    }
    case 'next':
      await api('POST', '/me/player/next')
      break
    case 'previous':
      await api('POST', '/me/player/previous')
      break
    case 'shuffle_on':
      await api('PUT', '/me/player/shuffle?state=true')
      break
    case 'shuffle_off':
      await api('PUT', '/me/player/shuffle?state=false')
      break
    case 'volume': {
      const v = Math.max(0, Math.min(100, Math.round(volumePercent ?? 50)))
      await api('PUT', `/me/player/volume?volume_percent=${v}`)
      break
    }
  }
  refreshSoon()
}

export async function queue(query: string): Promise<string> {
  const results = await search(query, 'track', 1)
  if (results.length === 0) throw new Error(`No Spotify results for "${query}".`)
  await api('POST', `/me/player/queue?uri=${encodeURIComponent(results[0].uri)}`)
  return `${results[0].name} — ${results[0].subtitle}`
}

export async function myPlaylists(limit = 24): Promise<SpotifySearchItem[]> {
  const json = await api<{ items: Record<string, unknown>[] }>(
    'GET',
    `/me/playlists?limit=${limit}`,
  )
  return (json?.items ?? []).filter(Boolean).map((p) => ({
    uri: String(p.uri),
    name: String(p.name),
    subtitle: `${(p.tracks as { total?: number })?.total ?? 0} songs`,
    artUrl: ((p.images as { url: string }[] | null) ?? [])[0]?.url ?? null,
    type: 'playlist' as const,
  }))
}

// ---------- polling ----------
let pollHandle: NodeJS.Timeout | null = null

function refreshSoon(): void {
  setTimeout(() => void pushNowPlaying(), 350)
}

async function pushNowPlaying(): Promise<void> {
  if (!isConnected()) return
  try {
    send('spotify:now-playing', await nowPlaying())
  } catch {
    // transient network/auth errors — keep last known UI state
  }
}

export function startPolling(): void {
  if (pollHandle) return
  pollHandle = setInterval(() => void pushNowPlaying(), 5000)
  void pushNowPlaying()
}
