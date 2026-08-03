import { useEffect } from 'react'
import { useStore } from '../store'

export default function TimerAlert(): React.JSX.Element | null {
  const firedTimer = useStore((s) => s.firedTimer)
  const clearFiredTimer = useStore((s) => s.clearFiredTimer)

  useEffect(() => {
    if (!firedTimer) return
    const handle = setTimeout(clearFiredTimer, 60_000)
    return () => clearTimeout(handle)
  }, [firedTimer, clearFiredTimer])

  if (!firedTimer) return null

  return (
    <div className="absolute inset-x-0 top-8 z-40 flex justify-center">
      <div className="animate-fadein glass flex items-center gap-5 border-amber-400/30 bg-amber-500/10 px-8 py-5">
        <span className="text-4xl">⏰</span>
        <div>
          <div className="text-lg font-semibold">{firedTimer.label}</div>
          <div className="text-sm text-white/60">Timer finished</div>
        </div>
        <button
          onClick={clearFiredTimer}
          className="ml-4 rounded-xl bg-white/10 px-5 py-3 font-medium hover:bg-white/20"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
