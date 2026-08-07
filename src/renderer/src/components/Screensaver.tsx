import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore, type ScreensaverState } from '../store'
import Clock from './Clock'

const MAX_VIDEO_SEC = 120 // a video slide plays to its end, but never longer

function isVideoUrl(url: string): boolean {
  return url.includes('?video=1')
}

type SlideMode = 'zoom' | { from: string; to: string }

/** Photos whose shape roughly matches the screen get the classic Ken Burns
 *  zoom; anything that would be badly cropped pans slowly across its long
 *  axis instead, so the whole photo is seen over the slide's duration. */
function SlideImage({ src, seconds }: { src: string; seconds: number }): React.JSX.Element {
  const [mode, setMode] = useState<SlideMode | null>(null)
  const [go, setGo] = useState(false)

  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>): void => {
    const img = e.currentTarget
    const imgAR = img.naturalWidth / Math.max(1, img.naturalHeight)
    const screenAR = window.innerWidth / Math.max(1, window.innerHeight)
    const excess = imgAR / screenAR
    if (excess > 1.15) setMode({ from: '0% 50%', to: '100% 50%' }) // wide: pan across
    else if (excess < 0.87) setMode({ from: '50% 0%', to: '50% 100%' }) // tall: pan down
    else setMode('zoom')
  }

  const pan = mode !== null && mode !== 'zoom' ? mode : null

  // Two frames between setting the start position and the end position, so
  // the object-position transition actually animates instead of jumping.
  useEffect(() => {
    if (!pan) return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)))
    return () => cancelAnimationFrame(raf)
  }, [pan])

  return (
    <img
      src={src}
      alt=""
      onLoad={onLoad}
      className={`absolute inset-0 h-full w-full object-cover ${mode === 'zoom' ? 'animate-kenburns' : ''}`}
      style={
        pan
          ? {
              objectPosition: go ? pan.to : pan.from,
              transition: `object-position ${seconds}s ease-in-out`,
            }
          : {
              animationDuration: `${seconds + 4}s`,
              // Hidden until measured, so panning photos don't flash centered
              // first; the previous slide stays visible underneath meanwhile.
              visibility: mode === null ? 'hidden' : 'visible',
            }
      }
    />
  )
}

function PhotoShow(): React.JSX.Element {
  const intervalSec = useStore((s) => s.settings?.screensaver.photoIntervalSec ?? 12)
  const [photos, setPhotos] = useState<string[] | null>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    void window.hearth.photos.list().then(setPhotos)
  }, [])

  const advance = useCallback(() => {
    setIndex((i) => (photos && photos.length > 0 ? (i + 1) % photos.length : 0))
  }, [photos])

  const isVideo = !!photos?.length && isVideoUrl(photos[index])

  // Photos advance on the interval; videos play through to onEnded, with a
  // hard cap so one wedged file can't freeze the show.
  useEffect(() => {
    if (!photos || photos.length < 2) return
    const seconds = isVideo ? MAX_VIDEO_SEC : Math.max(4, intervalSec)
    const handle = setTimeout(advance, seconds * 1000)
    return () => clearTimeout(handle)
  }, [photos, index, intervalSec, isVideo, advance])

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
      {photos.length > 1 && !isVideoUrl(previous) && (
        <img key={previous + '-prev'} src={previous} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {isVideo ? (
        <video
          key={current}
          src={current}
          autoPlay
          muted
          playsInline
          onEnded={advance}
          onError={advance} // undecodable file -> skip rather than hang
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <SlideImage key={current} src={current} seconds={Math.max(4, intervalSec)} />
      )}
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

/** Alternates photos and ambient video, rotating through the YouTube presets
 *  on each video phase. With no presets configured it's just the slideshow. */
function MixShow(): React.JSX.Element {
  const minutes = useStore((s) => s.settings?.screensaver.mixMinutes ?? 15)
  const presets = useStore((s) => s.settings?.screensaver.youtubePresets ?? [])
  const [phase, setPhase] = useState<'photos' | 'youtube'>('photos')
  const [ytIndex, setYtIndex] = useState(0)

  useEffect(() => {
    if (presets.length === 0) return
    const handle = setTimeout(
      () => {
        if (phase === 'photos') {
          setPhase('youtube')
        } else {
          setPhase('photos')
          setYtIndex((i) => i + 1) // next preset on the next video phase
        }
      },
      Math.max(1, minutes) * 60_000,
    )
    return () => clearTimeout(handle)
  }, [phase, minutes, presets.length])

  if (phase === 'youtube' && presets.length > 0) {
    return <YoutubeShow preset={presets[ytIndex % presets.length].name} />
  }
  return <PhotoShow />
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
      {state.mode === 'photos' ? (
        <PhotoShow />
      ) : state.mode === 'mix' ? (
        <MixShow />
      ) : (
        <YoutubeShow preset={state.preset} />
      )}
      {showClock && (
        <div className="pointer-events-none absolute bottom-10 left-12 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
          <Clock size="lg" />
        </div>
      )}
    </div>
  )
}
