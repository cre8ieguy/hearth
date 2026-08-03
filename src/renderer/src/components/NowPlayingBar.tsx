import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { fmtClockMs } from '../lib/format'

export default function NowPlayingBar(): React.JSX.Element | null {
  const np = useStore((s) => s.nowPlaying)
  const view = useStore((s) => s.view)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!np.active || !np.track) return
    setProgress(np.track.progressMs)
    if (!np.isPlaying) return
    const started = Date.now()
    const base = np.track.progressMs
    const handle = setInterval(() => {
      setProgress(Math.min(np.track!.durationMs, base + (Date.now() - started)))
    }, 1000)
    return () => clearInterval(handle)
  }, [np])

  if (!np.active || !np.track || view === 'spotify') return null

  const pct = np.track.durationMs ? (progress / np.track.durationMs) * 100 : 0

  return (
    <div className="glass absolute bottom-6 left-1/2 z-20 w-[min(640px,70%)] -translate-x-1/2 overflow-hidden">
      <div className="h-1 bg-white/10">
        <div className="bg-accent h-full transition-[width] duration-1000" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-4 p-3 pr-5">
        {np.track.artUrl ? (
          <img src={np.track.artUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/10 text-2xl">🎵</div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{np.track.title}</div>
          <div className="truncate text-sm text-white/50">{np.track.artists}</div>
        </div>
        <div className="text-xs text-white/40 tabular-nums">
          {fmtClockMs(progress)} / {fmtClockMs(np.track.durationMs)}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void window.hearth.spotify.control('previous')}
            className="rounded-full p-3 text-xl hover:bg-white/10"
          >
            ⏮
          </button>
          <button
            onClick={() => void window.hearth.spotify.control(np.isPlaying ? 'pause' : 'resume')}
            className="rounded-full bg-white/10 p-3 text-xl hover:bg-white/20"
          >
            {np.isPlaying ? '⏸' : '▶️'}
          </button>
          <button
            onClick={() => void window.hearth.spotify.control('next')}
            className="rounded-full p-3 text-xl hover:bg-white/10"
          >
            ⏭
          </button>
        </div>
      </div>
    </div>
  )
}
