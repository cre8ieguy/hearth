import { useEffect, useMemo, useState } from 'react'
import { useStore, type ScreensaverState } from '../store'
import Clock from './Clock'

function PhotoShow(): React.JSX.Element {
  const intervalSec = useStore((s) => s.settings?.screensaver.photoIntervalSec ?? 12)
  const [photos, setPhotos] = useState<string[] | null>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    void window.hearth.photos.list().then(setPhotos)
  }, [])

  useEffect(() => {
    if (!photos || photos.length < 2) return
    const handle = setInterval(
      () => setIndex((i) => (i + 1) % photos.length),
      Math.max(4, intervalSec) * 1000,
    )
    return () => clearInterval(handle)
  }, [photos, intervalSec])

  if (!photos) return <div />
  if (photos.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-white/50">
        <span className="text-5xl">🖼️</span>
        <p className="text-lg">No photos found.</p>
        <p className="text-sm">Pick a photos folder in Settings → Screensaver.</p>
      </div>
    )
  }

  const current = photos[index]
  const previous = photos[(index - 1 + photos.length) % photos.length]

  return (
    <div className="relative h-full w-full overflow-hidden">
      {photos.length > 1 && (
        <img key={previous + '-prev'} src={previous} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      <img
        key={current}
        src={current}
        alt=""
        className="animate-kenburns absolute inset-0 h-full w-full object-cover"
        style={{ animationDuration: `${Math.max(4, intervalSec) + 4}s` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
    </div>
  )
}

function YoutubeShow({ preset }: { preset?: string }): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const conf = settings?.screensaver

  const videoId = useMemo(() => {
    const presets = conf?.youtubePresets ?? []
    if (presets.length === 0) return null
    const wanted = (preset ?? conf?.activePreset ?? '').toLowerCase()
    const match = wanted
      ? presets.find((p) => p.name.toLowerCase().includes(wanted))
      : undefined
    return (match ?? presets[0]).videoId
  }, [conf, preset])

  if (!videoId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-white/50">
        <span className="text-5xl">📺</span>
        <p className="text-lg">No YouTube presets configured.</p>
        <p className="text-sm">Add ambient videos in Settings → Screensaver.</p>
      </div>
    )
  }

  const muted = conf?.youtubeMuted ? 1 : 0
  const src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=${muted}&controls=0&rel=0&iv_load_policy=3&modestbranding=1&playsinline=1&loop=1&playlist=${videoId}`

  return (
    <iframe
      src={src}
      title="Ambient video"
      className="pointer-events-none h-full w-full"
      allow="autoplay; encrypted-media"
      style={{ border: 0, transform: 'scale(1.15)' }}
    />
  )
}

export default function Screensaver({ state }: { state: ScreensaverState }): React.JSX.Element {
  const showClock = useStore((s) => s.settings?.screensaver.showClock ?? true)
  const setScreensaver = useStore((s) => s.setScreensaver)
  const [armed, setArmed] = useState(false)

  // Ignore the tap that opened the screensaver.
  useEffect(() => {
    const handle = setTimeout(() => setArmed(true), 600)
    return () => clearTimeout(handle)
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 bg-black"
      onPointerDown={() => {
        if (armed) setScreensaver(null)
      }}
    >
      {state.mode === 'photos' ? <PhotoShow /> : <YoutubeShow preset={state.preset} />}
      {showClock && (
        <div className="pointer-events-none absolute bottom-10 left-12 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
          <Clock size="lg" />
        </div>
      )}
    </div>
  )
}
