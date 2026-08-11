import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore, type ScreensaverState } from '../store'
import Clock from './Clock'
import type { CalendarEvent } from '@shared/types'

const MAX_VIDEO_SEC = 120 // a video slide plays to its end, but never longer
const FADE_MS = 700 // fade-to-black transition between slides

function isVideoUrl(url: string): boolean {
  return url.includes('?video=1')
}

const MAX_OFFSCREEN = 0.3 // at most this fraction of a photo may hang off-screen

type SlideLayout =
  | { kind: 'zoom' }
  | { kind: 'pan'; w: number; h: number; x0: number; y0: number; x1: number; y1: number }

/** Photos whose shape roughly matches the screen get the classic Ken Burns
 *  zoom. Mismatched photos are shrunk at display time until at most 30% hangs
 *  off-screen (slim bars on the other axis), then that overflow is panned
 *  gently over the slide's duration — the whole photo gets seen. */
function SlideImage({ src, seconds }: { src: string; seconds: number }): React.JSX.Element {
  const [layout, setLayout] = useState<SlideLayout | null>(null)
  const [go, setGo] = useState(false)

  const onLoad = (e: React.SyntheticEvent<HTMLImageElement>): void => {
    const { naturalWidth: nw, naturalHeight: nh } = e.currentTarget
    const sw = window.innerWidth
    const sh = window.innerHeight
    if (!nw || !nh) return setLayout({ kind: 'zoom' })
    const sCover = Math.max(sw / nw, sh / nh) // scale that fills the screen
    const tall = nh * sCover - sh > nw * sCover - sw // which axis overflows
    const coverOverflow = tall ? 1 - sh / (nh * sCover) : 1 - sw / (nw * sCover)
    if (coverOverflow <= 0.12) return setLayout({ kind: 'zoom' }) // minor crop is fine
    const s = tall
      ? Math.min(sCover, sh / ((1 - MAX_OFFSCREEN) * nh))
      : Math.min(sCover, sw / ((1 - MAX_OFFSCREEN) * nw))
    const w = nw * s
    const h = nh * s
    setLayout(
      tall
        ? { kind: 'pan', w, h, x0: (sw - w) / 2, y0: 0, x1: (sw - w) / 2, y1: sh - h }
        : { kind: 'pan', w, h, x0: 0, y0: (sh - h) / 2, x1: sw - w, y1: (sh - h) / 2 },
    )
  }

  const pan = layout?.kind === 'pan' ? layout : null

  // Two frames between start and end positions so the transform transition
  // actually animates instead of jumping straight to the end.
  useEffect(() => {
    if (!pan) return
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setGo(true)))
    return () => cancelAnimationFrame(raf)
  }, [pan])

  if (pan) {
    return (
      <img
        src={src}
        alt=""
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: pan.w,
          height: pan.h,
          maxWidth: 'none',
          transform: `translate3d(${go ? pan.x1 : pan.x0}px, ${go ? pan.y1 : pan.y0}px, 0)`,
          transition: `transform ${seconds}s ease-in-out`,
        }}
      />
    )
  }
  return (
    <img
      src={src}
      alt=""
      onLoad={onLoad}
      className={`absolute inset-0 h-full w-full object-cover ${layout ? 'animate-kenburns' : ''}`}
      style={{
        animationDuration: `${seconds + 4}s`,
        // Hidden until measured, so mismatched photos don't flash cropped
        // first; the previous slide stays visible underneath meanwhile.
        visibility: layout === null ? 'hidden' : 'visible',
      }}
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

  // Fade the outgoing slide to black, then swap and fade the next one up —
  // no more old photo showing through around the new one.
  const fadingRef = useRef(false)
  const [fading, setFading] = useState(false)
  const fadeAdvance = useCallback(() => {
    if (fadingRef.current) return // e.g. video onEnded racing the cap timer
    fadingRef.current = true
    setFading(true)
    window.setTimeout(() => {
      advance()
      fadingRef.current = false
      setFading(false)
    }, FADE_MS)
  }, [advance])

  const isVideo = !!photos?.length && isVideoUrl(photos[index])

  // Photos advance on the interval; videos play through to onEnded, with a
  // hard cap so one wedged file can't freeze the show.
  useEffect(() => {
    if (!photos || photos.length < 2) return
    const seconds = isVideo ? MAX_VIDEO_SEC : Math.max(4, intervalSec)
    const handle = setTimeout(fadeAdvance, seconds * 1000)
    return () => clearTimeout(handle)
  }, [photos, index, intervalSec, isVideo, fadeAdvance])

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

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div
        key={current}
        className="absolute inset-0"
        style={{
          opacity: fading ? 0 : 1,
          transition: `opacity ${FADE_MS}ms ease-in-out`,
          animation: `slidefade ${FADE_MS}ms ease-in-out`, // fade up from black on mount
        }}
      >
        {isVideo ? (
          <video
            src={current}
            autoPlay
            muted
            playsInline
            onEnded={fadeAdvance}
            onError={fadeAdvance} // undecodable file -> skip rather than hang
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <SlideImage src={current} seconds={Math.max(4, intervalSec)} />
        )}
      </div>
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

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

function fmtEventWhen(e: CalendarEvent, clock24h: boolean): string {
  const d = e.allDay
    ? new Date(Number(e.start.slice(0, 4)), Number(e.start.slice(5, 7)) - 1, Number(e.start.slice(8, 10)))
    : new Date(e.start)
  const day = d.toLocaleDateString(undefined, { weekday: 'short' })
  if (e.allDay) return `${day} · all day`
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: !clock24h })
  return `${day} ${time}`
}

/** Glanceable info on the ambient screen: running timers, music controls,
 *  and the next few calendar events. Taps inside it don't wake the UI. */
function AmbientInfo(): React.JSX.Element | null {
  const timers = useStore((s) => s.timers)
  const nowPlaying = useStore((s) => s.nowPlaying)
  const clock24h = useStore((s) => s.settings?.display.clock24h ?? false)
  const googleOk = useStore((s) => s.status?.google ?? false)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [, setTick] = useState(0)

  // 1s tick keeps timer countdowns live.
  useEffect(() => {
    if (timers.length === 0) return
    const h = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(h)
  }, [timers.length])

  useEffect(() => {
    if (!googleOk) return
    let alive = true
    const load = (): void => {
      window.hearth.google.events(7).then(
        (ev) => {
          if (alive) setEvents(ev)
        },
        () => undefined,
      )
    }
    load()
    const h = window.setInterval(load, 5 * 60_000)
    return () => {
      alive = false
      clearInterval(h)
    }
  }, [googleOk])

  const now = Date.now()
  const upcoming = events
    .filter((e) => {
      const end = e.allDay ? new Date(e.end + 'T23:59').getTime() : new Date(e.end).getTime()
      return end > now
    })
    .slice(0, 3)
  const track = nowPlaying.active ? nowPlaying.track : undefined

  if (timers.length === 0 && !track && upcoming.length === 0) return null

  return (
    <div
      className="absolute right-10 bottom-10 z-10 flex w-96 flex-col gap-3"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {timers.map((t) => (
        <div
          key={t.id}
          className="flex items-center justify-between rounded-2xl bg-black/50 px-5 py-3 backdrop-blur-md"
        >
          <span className="truncate text-sm text-white/70">⏱ {t.label}</span>
          <span className="text-2xl font-semibold tabular-nums">{fmtCountdown(t.endsAt - now)}</span>
        </div>
      ))}
      {track && (
        <div className="flex items-center gap-4 rounded-2xl bg-black/50 px-5 py-3 backdrop-blur-md">
          {track.artUrl && <img src={track.artUrl} alt="" className="h-12 w-12 rounded-lg" />}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{track.title}</div>
            <div className="truncate text-xs text-white/50">{track.artists}</div>
          </div>
          <button
            onClick={() => void window.hearth.spotify.control(nowPlaying.isPlaying ? 'pause' : 'resume')}
            className="rounded-full bg-white/10 px-4 py-2.5 text-lg hover:bg-white/20"
          >
            {nowPlaying.isPlaying ? '⏸' : '▶'}
          </button>
          <button
            onClick={() => void window.hearth.spotify.control('next')}
            className="rounded-full bg-white/10 px-4 py-2.5 text-lg hover:bg-white/20"
          >
            ⏭
          </button>
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="rounded-2xl bg-black/50 px-5 py-3 backdrop-blur-md">
          <p className="mb-1.5 text-[10px] font-semibold tracking-widest text-white/40 uppercase">
            Coming up
          </p>
          {upcoming.map((e) => (
            <div key={e.calendarId + e.id} className="flex items-baseline justify-between gap-3 py-0.5">
              <span className="truncate text-sm">{e.title}</span>
              <span className="shrink-0 text-xs text-white/50">{fmtEventWhen(e, clock24h)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
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
      <AmbientInfo />
    </div>
  )
}
