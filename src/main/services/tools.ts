import * as spotify from './spotify'
import * as google from './google'
import * as ha from './homeassistant'
import * as weather from './weather'
import * as timers from './timers'
import { getSettings, updateSettings } from '../settings'
import { send } from '../window'
import { weatherInfo } from '@shared/types'

/**
 * Custom tool definitions for the Claude agent (plus the Anthropic-hosted
 * web_search server tool, appended in buildTools). Descriptions state *when*
 * to call each tool — recent Claude models weight trigger conditions heavily.
 */
const CUSTOM_TOOLS = [
  {
    name: 'get_weather',
    description:
      "Get current conditions and the daily forecast for the home's configured location. Call this whenever the user asks about weather, temperature, rain, or what to wear.",
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'How many forecast days to include (1-7). Default 3.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'spotify_play',
    description:
      'Search Spotify and start playback. Call this when the user asks to play a song, album, artist, playlist, or a vibe (e.g. "play some jazz"). Prefer type=playlist for genre/mood requests.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to search for.' },
        type: { type: 'string', enum: ['track', 'album', 'playlist', 'artist'] },
        shuffle: { type: 'boolean', description: 'Turn shuffle on before playing.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'spotify_control',
    description:
      'Control active Spotify playback: pause, resume, skip, shuffle, or set volume. Call for "pause", "skip this", "turn it up/down", "volume 30 percent", etc.',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['pause', 'resume', 'next', 'previous', 'shuffle_on', 'shuffle_off', 'volume'],
        },
        volume_percent: { type: 'integer', description: '0-100, required when action=volume.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'spotify_queue',
    description: 'Add a song to the Spotify queue without interrupting the current track. Call for "queue up X" or "play X next".',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'spotify_status',
    description: 'Get what is currently playing on Spotify. Call when the user asks "what song is this?" or before adjusting playback if state is unclear.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'calendar_events',
    description:
      "List upcoming Google Calendar events across the user's calendars. Call whenever the user asks about their schedule, agenda, meetings, or what's happening on a given day.",
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'integer', description: 'How many days ahead to look (default 7, max 60).' },
        calendar: { type: 'string', description: 'Optional calendar name filter, e.g. "Work".' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'calendar_add_event',
    description:
      'Create a Google Calendar event. Call when the user asks to add, schedule, or book something. Resolve relative dates ("tomorrow", "next Friday") to YYYY-MM-DD yourself using the current date from context.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD' },
        start_time: { type: 'string', description: 'HH:MM 24-hour. Omit for an all-day event.' },
        end_time: { type: 'string', description: 'HH:MM 24-hour. Defaults to one hour after start.' },
        all_day: { type: 'boolean' },
        description: { type: 'string' },
        calendar: { type: 'string', description: 'Calendar name, e.g. "Family". Defaults to primary.' },
      },
      required: ['title', 'date'],
      additionalProperties: false,
    },
  },
  {
    name: 'home_devices',
    description:
      'List smart-home devices/entities from Home Assistant with their current states. Call before controlling a device you have not seen this conversation, or when the user asks what devices exist / whether something is on.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Filter by name, e.g. "kitchen".' },
        domain: { type: 'string', description: 'Filter by domain: light, switch, climate, scene, media_player, cover, lock, fan...' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'home_control',
    description:
      'Control a Home Assistant device by calling a service on an entity. Call for "turn on the lights", "set the thermostat to 70", "lock the door", "run movie night scene". Common services: turn_on, turn_off, toggle. Climate: set_temperature with data {"temperature": 70}. Lights support data like {"brightness_pct": 50, "color_name": "red"}.',
    input_schema: {
      type: 'object',
      properties: {
        entity_id: { type: 'string', description: 'e.g. light.kitchen — get it from home_devices if unsure.' },
        service: { type: 'string', description: 'Bare service name, e.g. turn_on.' },
        data: { type: 'object', description: 'Extra service data fields.' },
      },
      required: ['entity_id', 'service'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_timer',
    description: 'Start a countdown timer that chimes on this device. Call for "set a timer for 10 minutes", cooking timers, reminders measured in minutes/hours.',
    input_schema: {
      type: 'object',
      properties: {
        seconds: { type: 'integer', description: 'Duration in seconds.' },
        label: { type: 'string', description: 'Short label, e.g. "pasta".' },
      },
      required: ['seconds'],
      additionalProperties: false,
    },
  },
  {
    name: 'cancel_timer',
    description: 'Cancel a running timer by label or id. Call for "cancel the pasta timer" or "stop the timer".',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Timer label or id.' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_timers',
    description: 'List running timers and how long each has left. Call when the user asks how much time is left.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'show_screensaver',
    description:
      'Start or stop the ambient screensaver on this display. mode=photos shows the photo slideshow; mode=youtube shows an ambient video (pass preset to pick one, e.g. "aquarium"); mode=off wakes the screen. Call for "show the aquarium", "start the slideshow", "wake up".',
    input_schema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['photos', 'youtube', 'off'] },
        preset: { type: 'string', description: 'YouTube preset name (fuzzy matched).' },
      },
      required: ['mode'],
      additionalProperties: false,
    },
  },
  {
    name: 'show_view',
    description: 'Navigate this display to a screen. Call for "show my calendar", "open spotify", "go home".',
    input_schema: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: ['dashboard', 'assistant', 'spotify', 'calendar', 'settings'] },
      },
      required: ['view'],
      additionalProperties: false,
    },
  },
]

/** Human-readable activity labels shown in the UI while a tool runs. */
export const TOOL_LABELS: Record<string, string> = {
  web_search: 'Searching the web',
  get_weather: 'Checking the weather',
  spotify_play: 'Starting music',
  spotify_control: 'Adjusting playback',
  spotify_queue: 'Adding to queue',
  spotify_status: 'Checking Spotify',
  calendar_events: 'Reading your calendar',
  calendar_add_event: 'Adding to your calendar',
  home_devices: 'Checking your devices',
  home_control: 'Controlling your home',
  set_timer: 'Setting a timer',
  cancel_timer: 'Cancelling timer',
  list_timers: 'Checking timers',
  show_screensaver: 'Changing the display',
  show_view: 'Navigating',
}

export function buildTools(): unknown[] {
  return [
    { type: 'web_search_20260209', name: 'web_search', max_uses: 3 },
    ...CUSTOM_TOOLS,
  ]
}

function fmtClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

type Input = Record<string, unknown>

export async function dispatchTool(name: string, input: Input): Promise<string> {
  switch (name) {
    case 'get_weather': {
      const report = await weather.getWeather()
      const days = Math.max(1, Math.min(7, Number(input.days) || 3))
      const unit = report.unit === 'fahrenheit' ? '°F' : '°C'
      const lines = [
        `Now in ${report.location}: ${report.now.temp}${unit} (feels ${report.now.feelsLike}${unit}), ${weatherInfo(report.now.code).label}, humidity ${report.now.humidity}%, wind ${report.now.windSpeed}${report.unit === 'fahrenheit' ? ' mph' : ' km/h'}.`,
        ...report.daily
          .slice(0, days)
          .map(
            (d) =>
              `${d.date}: ${weatherInfo(d.code).label}, high ${d.tempMax}${unit} / low ${d.tempMin}${unit}, precip ${d.precipChance}%`,
          ),
      ]
      return lines.join('\n')
    }

    case 'spotify_play': {
      const label = await spotify.play({
        query: String(input.query),
        type: input.type as 'track' | 'album' | 'playlist' | 'artist' | undefined,
        shuffle: input.shuffle as boolean | undefined,
      })
      return `Now playing: ${label}`
    }

    case 'spotify_control': {
      await spotify.control(
        input.action as Parameters<typeof spotify.control>[0],
        input.volume_percent as number | undefined,
      )
      return `Done (${String(input.action)}).`
    }

    case 'spotify_queue':
      return `Queued: ${await spotify.queue(String(input.query))}`

    case 'spotify_status': {
      const np = await spotify.nowPlaying()
      if (!np.active || !np.track) return 'Nothing is playing right now.'
      return `${np.isPlaying ? 'Playing' : 'Paused'}: "${np.track.title}" by ${np.track.artists} (album: ${np.track.album}), ${fmtClock(np.track.progressMs)} of ${fmtClock(np.track.durationMs)}${np.device ? ` on ${np.device.name}` : ''}${np.device?.volumePercent != null ? `, volume ${np.device.volumePercent}%` : ''}.`
    }

    case 'calendar_events': {
      const days = Math.max(1, Math.min(60, Number(input.days) || 7))
      const events = await google.listEvents(days, input.calendar as string | undefined)
      if (events.length === 0) return `No events in the next ${days} day(s).`
      return events
        .slice(0, 40)
        .map((e) => {
          const when = e.allDay
            ? `${e.start} (all day)`
            : `${new Date(e.start).toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}`
          return `- ${when}: ${e.title} [${e.calendarName}]${e.location ? ` @ ${e.location}` : ''}`
        })
        .join('\n')
    }

    case 'calendar_add_event': {
      const calendarName = await google.addEvent({
        title: String(input.title),
        date: String(input.date),
        startTime: input.start_time as string | undefined,
        endTime: input.end_time as string | undefined,
        allDay: input.all_day as boolean | undefined,
        description: input.description as string | undefined,
        calendar: input.calendar as string | undefined,
      })
      send('calendar:changed')
      return `Added "${String(input.title)}" on ${String(input.date)}${input.start_time ? ` at ${String(input.start_time)}` : ''} to the ${calendarName} calendar.`
    }

    case 'home_devices': {
      const entities = await ha.listEntities(
        input.search as string | undefined,
        input.domain as string | undefined,
      )
      if (entities.length === 0) return 'No matching devices found.'
      return entities.map((e) => `${e.entityId} ("${e.name}"): ${e.state}`).join('\n')
    }

    case 'home_control':
      return await ha.callService(
        String(input.entity_id),
        String(input.service),
        input.data as Record<string, unknown> | undefined,
      )

    case 'set_timer': {
      const timer = timers.setTimer(Number(input.seconds), input.label as string | undefined)
      return `Timer set: "${timer.label}" — done at ${new Date(timer.endsAt).toLocaleTimeString()}.`
    }

    case 'cancel_timer': {
      const cancelled = timers.cancelTimer(String(input.query))
      return cancelled ? `Cancelled "${cancelled.label}".` : 'No matching timer found.'
    }

    case 'list_timers': {
      const list = timers.listTimers()
      if (list.length === 0) return 'No timers running.'
      return list.map((t) => `"${t.label}": ${fmtClock(t.endsAt - Date.now())} left`).join('\n')
    }

    case 'show_screensaver': {
      const mode = String(input.mode) as 'photos' | 'youtube' | 'off'
      let presetName: string | undefined
      if (mode === 'youtube') {
        const presets = getSettings().screensaver.youtubePresets
        if (presets.length === 0) return 'No YouTube presets configured yet — add some in Settings → Screensaver.'
        const q = String(input.preset ?? '').toLowerCase()
        const preset = (q && presets.find((p) => p.name.toLowerCase().includes(q))) || presets[0]
        presetName = preset.name
        updateSettings({ screensaver: { activePreset: preset.name } })
      }
      send('ui:screensaver', { mode, preset: presetName })
      if (mode === 'off') return 'Screensaver off.'
      return mode === 'photos' ? 'Photo slideshow started.' : `Playing ambient video: ${presetName}.`
    }

    case 'show_view':
      send('ui:navigate', String(input.view))
      return `Showing the ${String(input.view)} screen.`

    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
