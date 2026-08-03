import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { eventTimeLabel, groupEventsByDay } from '../lib/format'
import type { CalendarEvent, CalendarInfo } from '@shared/types'

function AddEventForm({ calendars, onAdded }: { calendars: CalendarInfo[]; onAdded: () => void }): React.JSX.Element {
  const today = new Date().toISOString().slice(0, 10)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('12:00')
  const [allDay, setAllDay] = useState(false)
  const [durationMin, setDurationMin] = useState(60)
  const [calendarId, setCalendarId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setMessage('')
    try {
      const [h, m] = time.split(':').map(Number)
      const endMinutes = h * 60 + m + durationMin
      const endTime = `${String(Math.min(23, Math.floor(endMinutes / 60))).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
      const calName = calendars.find((c) => c.id === calendarId)?.name
      await window.hearth.google.addEvent({
        title: title.trim(),
        date,
        startTime: allDay ? undefined : time,
        endTime: allDay ? undefined : endTime,
        allDay,
        calendar: calName,
      })
      setTitle('')
      setMessage('Added ✓')
      onAdded()
      setTimeout(() => setMessage(''), 3000)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="glass mb-6 flex flex-wrap items-end gap-3 p-5">
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs text-white/50">
        Event
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Dinner with friends"
          className="focus:border-accent rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-white/50">
        Date
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
        />
      </label>
      {!allDay && (
        <>
          <label className="flex flex-col gap-1 text-xs text-white/50">
            Time
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-white/50">
            Length
            <select
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
            >
              <option value={30}>30 min</option>
              <option value={60}>1 hour</option>
              <option value={90}>1.5 hours</option>
              <option value={120}>2 hours</option>
            </select>
          </label>
        </>
      )}
      <label className="flex flex-col gap-1 text-xs text-white/50">
        Calendar
        <select
          value={calendarId}
          onChange={(e) => setCalendarId(e.target.value)}
          className="max-w-44 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none"
        >
          <option value="">Primary</option>
          {calendars.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-3 flex items-center gap-2 text-sm text-white/60">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="accent-accent h-5 w-5" />
        All day
      </label>
      <button type="submit" disabled={busy || !title.trim()} className="bg-accent rounded-xl px-6 py-3 font-medium disabled:opacity-30">
        Add
      </button>
      {message && <span className="text-sm text-white/60">{message}</span>}
    </form>
  )
}

export default function CalendarView(): React.JSX.Element {
  const status = useStore((s) => s.status)
  const clock24h = useStore((s) => s.settings?.display.clock24h ?? false)
  const setView = useStore((s) => s.setView)
  const [events, setEvents] = useState<CalendarEvent[] | null>(null)
  const [calendars, setCalendars] = useState<CalendarInfo[]>([])
  const [error, setError] = useState('')

  const connected = !!status?.google

  const load = useCallback((): void => {
    if (!connected) return
    window.hearth.google.events(7).then(
      (e) => {
        setEvents(e)
        setError('')
      },
      (err: Error) => setError(err.message),
    )
    window.hearth.google.calendars().then(setCalendars, () => setCalendars([]))
  }, [connected])

  useEffect(() => {
    load()
    const off = window.hearth.on('calendar:changed', load)
    const handle = setInterval(load, 10 * 60 * 1000)
    return () => {
      off()
      clearInterval(handle)
    }
  }, [load])

  if (!connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-10 text-center">
        <span className="text-7xl">📅</span>
        <h1 className="text-3xl font-light">Google Calendar isn’t connected</h1>
        <p className="max-w-md text-white/50">
          Connect your Google account and this screen becomes your household agenda — and you can
          add events by voice.
        </p>
        <button onClick={() => setView('settings')} className="bg-accent rounded-2xl px-8 py-4 text-lg font-medium">
          Open Settings
        </button>
      </div>
    )
  }

  const groups = events ? groupEventsByDay(events, 7) : []

  return (
    <div className="h-full overflow-y-auto p-8 pb-36">
      <h1 className="mb-5 text-2xl font-light">Next 7 days</h1>
      <AddEventForm calendars={calendars} onAdded={load} />
      {error && <p className="mb-4 text-sm text-rose-400">{error}</p>}
      {events === null ? (
        <p className="text-white/40">Loading events…</p>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {groups.map((g) => (
            <div key={g.key} className="glass p-5">
              <h2 className="mb-3 text-sm font-semibold tracking-widest text-white/50 uppercase">
                {g.label}
              </h2>
              {g.events.length === 0 ? (
                <p className="text-sm text-white/30">Free</p>
              ) : (
                <ul className="space-y-2.5">
                  {g.events.map((e) => (
                    <li key={e.calendarId + e.id} className="flex items-center gap-3">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.color ?? '#8b7cf6' }} />
                      <span className="w-20 shrink-0 text-sm text-white/50 tabular-nums">
                        {eventTimeLabel(e, clock24h)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate">{e.title}</div>
                        {e.location && <div className="truncate text-xs text-white/40">{e.location}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
