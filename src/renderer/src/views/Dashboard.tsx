import { useEffect, useState } from 'react'
import { useStore } from '../store'
import Clock from '../components/Clock'
import { eventTimeLabel, fmtCountdown } from '../lib/format'
import { weatherInfo, type CalendarEvent, type WeatherReport } from '@shared/types'

function WeatherCard(): React.JSX.Element {
  const status = useStore((s) => s.status)
  const hasLocation = useStore((s) => s.settings?.location.lat != null)
  const [report, setReport] = useState<WeatherReport | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!hasLocation) return
    let alive = true
    const load = () =>
      window.hearth.weather.get().then(
        (r) => alive && (setReport(r), setError('')),
        (e: Error) => alive && setError(e.message),
      )
    void load()
    const handle = setInterval(load, 15 * 60 * 1000)
    return () => {
      alive = false
      clearInterval(handle)
    }
  }, [hasLocation, status])

  if (!hasLocation) {
    return (
      <div className="glass p-6 text-white/50">
        <p className="text-lg">🌤️ Weather</p>
        <p className="mt-2 text-sm">Set your city in Settings → Location to see the forecast.</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="glass p-6 text-white/50">
        <p className="text-lg">🌤️ Weather</p>
        <p className="mt-2 text-sm text-rose-400/80">{error}</p>
      </div>
    )
  }
  if (!report) return <div className="glass p-6 text-white/40">Loading weather…</div>

  const unit = report.unit === 'fahrenheit' ? '°' : '°'
  const info = weatherInfo(report.now.code)
  return (
    <div className="glass p-6">
      <div className="flex items-center gap-5">
        <span className="text-6xl">{info.icon}</span>
        <div>
          <div className="text-5xl font-light">
            {report.now.temp}
            {unit}
          </div>
          <div className="text-white/60">
            {info.label} · feels {report.now.feelsLike}
            {unit}
          </div>
        </div>
        <div className="ml-auto text-right text-sm text-white/40">
          <div>{report.location}</div>
          <div>💧 {report.now.humidity}%</div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-5 gap-2">
        {report.daily.slice(0, 5).map((d, i) => (
          <div key={d.date} className="rounded-xl bg-white/5 p-3 text-center">
            <div className="text-xs text-white/50">
              {i === 0 ? 'Today' : new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
            </div>
            <div className="my-1 text-2xl">{weatherInfo(d.code).icon}</div>
            <div className="text-sm">
              {d.tempMax}° <span className="text-white/40">{d.tempMin}°</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgendaCard(): React.JSX.Element {
  const status = useStore((s) => s.status)
  const clock24h = useStore((s) => s.settings?.display.clock24h ?? false)
  const setView = useStore((s) => s.setView)
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)

  useEffect(() => {
    if (!status?.google) return
    let alive = true
    const load = () =>
      window.hearth.google.events(2).then(
        (e) => alive && setEvents(e),
        () => alive && setEvents([]),
      )
    void load()
    const off = window.hearth.on('calendar:changed', load)
    const handle = setInterval(load, 10 * 60 * 1000)
    return () => {
      alive = false
      off()
      clearInterval(handle)
    }
  }, [status?.google])

  if (!status?.google) {
    return (
      <div className="glass p-6 text-white/50">
        <p className="text-lg">📅 Up next</p>
        <p className="mt-2 text-sm">Connect Google Calendar in Settings to see your agenda.</p>
      </div>
    )
  }

  const upcoming = (events ?? []).filter((e) => e.allDay || new Date(e.end) > new Date()).slice(0, 6)

  return (
    <div className="glass p-6">
      <button onClick={() => setView('calendar')} className="mb-3 text-lg">
        📅 Up next
      </button>
      {events === null ? (
        <p className="text-sm text-white/40">Loading agenda…</p>
      ) : upcoming.length === 0 ? (
        <p className="text-sm text-white/40">Nothing scheduled — enjoy the quiet.</p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((e) => (
            <li key={e.calendarId + e.id} className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: e.color ?? '#8b7cf6' }}
              />
              <span className="w-24 shrink-0 text-sm text-white/50 tabular-nums">
                {eventTimeLabel(e, clock24h)}
              </span>
              <span className="truncate">{e.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TimersCard(): React.JSX.Element | null {
  const timers = useStore((s) => s.timers)
  const [, setTick] = useState(0)

  useEffect(() => {
    if (timers.length === 0) return
    const handle = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(handle)
  }, [timers.length])

  if (timers.length === 0) return null
  return (
    <div className="glass p-6">
      <p className="mb-3 text-lg">⏱️ Timers</p>
      <div className="flex flex-wrap gap-3">
        {timers.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
            <span className="text-2xl font-light tabular-nums">{fmtCountdown(t.endsAt - Date.now())}</span>
            <span className="max-w-40 truncate text-sm text-white/50">{t.label}</span>
            <button
              onClick={() => void window.hearth.timers.cancel(t.id)}
              className="rounded-full px-2 text-white/30 hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Dashboard(): React.JSX.Element {
  const name = useStore((s) => s.settings?.assistant.name ?? 'Jarvis')
  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="h-full overflow-y-auto p-10 pb-36">
      <div className="grid h-full grid-cols-[1.1fr_1fr] gap-8">
        <div className="flex flex-col gap-8">
          <div>
            <p className="text-accent mb-1 text-sm font-semibold tracking-widest uppercase">
              {greeting}
            </p>
            <Clock />
            <p className="mt-4 text-white/40">
              Tap the orb and ask {name} anything — music, lights, weather, your day.
            </p>
          </div>
          <WeatherCard />
        </div>
        <div className="flex flex-col gap-8">
          <AgendaCard />
          <TimersCard />
        </div>
      </div>
    </div>
  )
}
