import { shell } from 'electron'
import { getSettings, updateSettings } from '../settings'
import { postForm, waitForCode } from '../oauth'
import type { CalendarEvent, CalendarInfo, OAuthTokens } from '@shared/types'

export const GOOGLE_REDIRECT = 'http://127.0.0.1:8889/callback/google'
const SCOPE = 'https://www.googleapis.com/auth/calendar'

export function isConnected(): boolean {
  return !!getSettings().google.tokens
}

export async function connect(): Promise<void> {
  const { clientId, clientSecret } = getSettings().google
  if (!clientId || !clientSecret) {
    throw new Error('Enter your Google OAuth Client ID and Secret first (Settings → Calendar).')
  }
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', GOOGLE_REDIRECT)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', SCOPE)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')

  const codePromise = waitForCode(8889, '/callback/google')
  await shell.openExternal(url.toString())
  const code = await codePromise

  const json = await postForm('https://oauth2.googleapis.com/token', {
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: GOOGLE_REDIRECT,
    grant_type: 'authorization_code',
  })
  saveTokens(json)
}

export function disconnect(): void {
  updateSettings({ google: { tokens: null } })
}

function saveTokens(json: Record<string, unknown>): OAuthTokens {
  const tokens: OAuthTokens = {
    accessToken: String(json.access_token),
    refreshToken: String(json.refresh_token ?? getSettings().google.tokens?.refreshToken ?? ''),
    expiresAt: Date.now() + (Number(json.expires_in) || 3600) * 1000,
  }
  updateSettings({ google: { tokens } })
  return tokens
}

async function accessToken(force = false): Promise<string> {
  const { clientId, clientSecret, tokens } = getSettings().google
  if (!tokens) throw new Error('Google Calendar is not connected. Connect it in Settings → Calendar.')
  if (!force && Date.now() < tokens.expiresAt - 60_000) return tokens.accessToken
  try {
    const json = await postForm('https://oauth2.googleapis.com/token', {
      refresh_token: tokens.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    })
    return saveTokens(json).accessToken
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('invalid_grant')) {
      updateSettings({ google: { tokens: null } })
      throw new Error(
        'Google session expired — reconnect in Settings → Calendar. (If this keeps happening, publish your OAuth app to "In production" in Google Cloud Console.)',
      )
    }
    throw err
  }
}

async function api<T = unknown>(method: string, apiPath: string, body?: unknown, retried = false): Promise<T> {
  const token = await accessToken()
  const res = await fetch(`https://www.googleapis.com/calendar/v3${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401 && !retried) {
    await accessToken(true)
    return api(method, apiPath, body, true)
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message || `Google Calendar error (HTTP ${res.status})`)
  return json
}

interface RawCalendar {
  id: string
  summary: string
  summaryOverride?: string
  primary?: boolean
  backgroundColor?: string
  accessRole: string
  selected?: boolean
}

export async function listCalendars(): Promise<CalendarInfo[]> {
  const json = await api<{ items?: RawCalendar[] }>('GET', '/users/me/calendarList?maxResults=50')
  return (json.items ?? [])
    .filter((c) => c.selected !== false)
    .map((c) => ({
      id: c.id,
      name: c.summaryOverride || c.summary,
      primary: !!c.primary,
      color: c.backgroundColor ?? null,
    }))
}

interface RawEvent {
  id: string
  summary?: string
  location?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  status?: string
}

export async function listEvents(daysAhead = 7, calendarQuery?: string): Promise<CalendarEvent[]> {
  let calendars = await listCalendars()
  if (calendarQuery) {
    const q = calendarQuery.toLowerCase()
    const matched = calendars.filter((c) => c.name.toLowerCase().includes(q))
    if (matched.length > 0) calendars = matched
  }
  calendars = calendars.slice(0, 8)

  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const timeMin = startOfToday.toISOString()
  const timeMax = new Date(startOfToday.getTime() + daysAhead * 86_400_000).toISOString()

  const all = await Promise.all(
    calendars.map(async (cal) => {
      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '50',
      })
      try {
        const json = await api<{ items?: RawEvent[] }>(
          'GET',
          `/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
        )
        return (json.items ?? [])
          .filter((e) => e.status !== 'cancelled')
          .map<CalendarEvent>((e) => ({
            id: e.id,
            calendarId: cal.id,
            calendarName: cal.name,
            title: e.summary || '(no title)',
            start: e.start.dateTime ?? e.start.date ?? '',
            end: e.end.dateTime ?? e.end.date ?? '',
            allDay: !e.start.dateTime,
            location: e.location ?? null,
            color: cal.color,
          }))
      } catch {
        return []
      }
    }),
  )
  // User-configured exclusions ("Josh School Day" etc.) — matches event
  // titles and calendar names, applied everywhere events are consumed.
  const hide = getSettings()
    .google.hideTerms.split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
  return all
    .flat()
    .filter(
      (e) =>
        !hide.some(
          (t) => e.title.toLowerCase().includes(t) || e.calendarName.toLowerCase().includes(t),
        ),
    )
    .sort((a, b) => a.start.localeCompare(b.start))
}

export interface AddEventRequest {
  title: string
  date: string // YYYY-MM-DD
  startTime?: string // HH:MM (24h)
  endTime?: string
  allDay?: boolean
  description?: string
  calendar?: string
}

export async function addEvent(req: AddEventRequest): Promise<string> {
  const calendars = await listCalendars()
  let target = calendars.find((c) => c.primary) ?? calendars[0]
  if (req.calendar) {
    const q = req.calendar.toLowerCase()
    const matched = calendars.find((c) => c.name.toLowerCase().includes(q))
    if (matched) target = matched
  }
  if (!target) throw new Error('No writable Google calendar found.')

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  let start: Record<string, string>
  let end: Record<string, string>
  if (req.allDay || !req.startTime) {
    const next = new Date(`${req.date}T00:00:00`)
    next.setDate(next.getDate() + 1)
    start = { date: req.date }
    end = { date: next.toISOString().slice(0, 10) }
  } else {
    const endTime =
      req.endTime ??
      (() => {
        const [h, m] = req.startTime!.split(':').map(Number)
        return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      })()
    start = { dateTime: `${req.date}T${req.startTime}:00`, timeZone }
    end = { dateTime: `${req.date}T${endTime}:00`, timeZone }
  }

  await api('POST', `/calendars/${encodeURIComponent(target.id)}/events`, {
    summary: req.title,
    description: req.description,
    start,
    end,
  })
  return target.name
}
