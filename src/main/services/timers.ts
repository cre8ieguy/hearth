import crypto from 'crypto'
import type { Timer } from '@shared/types'
import { send } from '../window'

interface ActiveTimer {
  timer: Timer
  handle: NodeJS.Timeout
}

const active = new Map<string, ActiveTimer>()

function describeDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const parts: string[] = []
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`)
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`)
  if (s && !h) parts.push(`${s} second${s === 1 ? '' : 's'}`)
  return parts.join(' ') || '0 seconds'
}

export function setTimer(seconds: number, label?: string): Timer {
  const total = Math.max(1, Math.round(seconds))
  const timer: Timer = {
    id: crypto.randomUUID(),
    label: label?.trim() || `${describeDuration(total)} timer`,
    endsAt: Date.now() + total * 1000,
    totalSeconds: total,
  }
  const handle = setTimeout(() => {
    active.delete(timer.id)
    send('timers:fired', timer)
    send('timers:changed', listTimers())
  }, total * 1000)
  active.set(timer.id, { timer, handle })
  send('timers:changed', listTimers())
  return timer
}

export function listTimers(): Timer[] {
  return [...active.values()].map((a) => a.timer).sort((a, b) => a.endsAt - b.endsAt)
}

/** Cancel by exact id or fuzzy label match. Returns the cancelled timer, if any. */
export function cancelTimer(query: string): Timer | null {
  const q = query.trim().toLowerCase()
  const entry =
    active.get(query) ??
    [...active.values()].find((a) => a.timer.label.toLowerCase().includes(q)) ??
    (active.size === 1 ? [...active.values()][0] : undefined)
  if (!entry) return null
  clearTimeout(entry.handle)
  active.delete(entry.timer.id)
  send('timers:changed', listTimers())
  return entry.timer
}
