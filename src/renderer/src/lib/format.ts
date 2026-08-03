import type { CalendarEvent } from '@shared/types'

export function fmtTime(date: Date, clock24h: boolean): string {
  return date.toLocaleTimeString('en-US', {
    hour: clock24h ? '2-digit' : 'numeric',
    minute: '2-digit',
    hour12: !clock24h,
  })
}

export function fmtDateLong(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function fmtCountdown(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtClockMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export interface DayGroup {
  key: string
  label: string
  events: CalendarEvent[]
}

export function groupEventsByDay(events: CalendarEvent[], days: number): DayGroup[] {
  const groups: DayGroup[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = 0; i < days; i++) {
    const day = new Date(today.getTime() + i * 86_400_000)
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    const label =
      i === 0
        ? 'Today'
        : i === 1
          ? 'Tomorrow'
          : day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    const dayEvents = events.filter((e) => e.start.slice(0, 10) === key)
    groups.push({ key, label, events: dayEvents })
  }
  return groups
}

export function eventTimeLabel(e: CalendarEvent, clock24h: boolean): string {
  if (e.allDay) return 'All day'
  return fmtTime(new Date(e.start), clock24h)
}
