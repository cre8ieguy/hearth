import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { fmtClockMs } from '../lib/format'
import type { SpotifySearchItem } from '@shared/types'

type SearchType = 'track' | 'album' | 'playlist' | 'artist'

function Tile({ item, onPlay }: { item: SpotifySearchItem; onPlay: () => void }): React.JSX.Element {
  return (
    <button
      onClick={onPlay}
      className="group flex flex-col gap-2 rounded-2xl bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
    >
      {item.artUrl ? (
        <img src={item.artUrl} alt="" className="aspect-square w-full rounded-xl object-cover" />
      ) : (
        <div className="flex aspect-square w-full items-center justify-center rounded-xl bg-white/10 text-4xl">
          🎵
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate font-medium">{item.name}</div>
        <div className="truncate text-xs text-white/50">{item.subtitle}</div>
      </div>
    </button>
  )
}

export default function SpotifyView(): React.JSX.Element {
  const status = useStore((s) => s.status)
  const np = useStore((s) => s.nowPlaying)
  const setView = useStore((s) => s.setView)
  const [playlists, setPlaylists] = useState<SpotifySearchItem[]>([])
  const [query, setQuery] = useState('')
  const [searchType, setSearchType] = useState<SearchType>('track')
  const [results, setResults] = useState<SpotifySearchItem[] | null>(null)
  const [error, setError] = useState('')
  const [volume, setVolume] = useState<number | null>(null)

  const connected = !!status?.spotify

  useEffect(() => {
    if (!connected) return
    void window.hearth.spotify.playlists().then(setPlaylists, () => setPlaylists([]))
  }, [connected])

  useEffect(() => {
    if (np.device?.volumePercent != null) setVolume(np.device.volumePercent)
  }, [np.device?.volumePercent])

  if (!connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-10 text-center">
        <span className="text-7xl">🎧</span>
        <h1 className="text-3xl font-light">Spotify isn’t connected yet</h1>
        <p className="max-w-md text-white/50">
          Add your Spotify Client ID and connect your Premium account, then ask for any song by
          voice.
        </p>
        <button
          onClick={() => setView('settings')}
          className="bg-accent rounded-2xl px-8 py-4 text-lg font-medium"
        >
          Open Settings
        </button>
      </div>
    )
  }

  const runSearch = async (): Promise<void> => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      return
    }
    try {
      setError('')
      setResults(await window.hearth.spotify.search(q, searchType))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const playItem = (item: SpotifySearchItem): void => {
    setError('')
    window.hearth.spotify.play({ uri: item.uri }).catch((e: Error) => setError(e.message))
  }

  return (
    <div className="h-full overflow-y-auto p-8 pb-36">
      {/* Now playing hero */}
      {np.active && np.track && (
        <div className="glass mb-8 flex items-center gap-6 p-6">
          {np.track.artUrl ? (
            <img src={np.track.artUrl} alt="" className="h-36 w-36 rounded-2xl object-cover shadow-xl" />
          ) : (
            <div className="flex h-36 w-36 items-center justify-center rounded-2xl bg-white/10 text-5xl">🎵</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-3xl font-medium">{np.track.title}</div>
            <div className="truncate text-lg text-white/50">{np.track.artists}</div>
            <div className="mt-1 text-sm text-white/30">
              {np.device?.name ? `Playing on ${np.device.name} · ` : ''}
              {fmtClockMs(np.track.progressMs)} / {fmtClockMs(np.track.durationMs)}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => void window.hearth.spotify.control('previous')}
                className="rounded-full bg-white/10 p-4 text-2xl hover:bg-white/20"
              >
                ⏮
              </button>
              <button
                onClick={() => void window.hearth.spotify.control(np.isPlaying ? 'pause' : 'resume')}
                className="bg-accent rounded-full p-4 px-6 text-2xl"
              >
                {np.isPlaying ? '⏸' : '▶️'}
              </button>
              <button
                onClick={() => void window.hearth.spotify.control('next')}
                className="rounded-full bg-white/10 p-4 text-2xl hover:bg-white/20"
              >
                ⏭
              </button>
              <button
                onClick={() => void window.hearth.spotify.control(np.shuffle ? 'shuffle_off' : 'shuffle_on')}
                className={`rounded-full p-4 text-2xl ${np.shuffle ? 'bg-accent/40' : 'bg-white/10 hover:bg-white/20'}`}
                title="Shuffle"
              >
                🔀
              </button>
              {volume !== null && (
                <div className="ml-4 flex items-center gap-2">
                  <span className="text-white/40">🔊</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    onPointerUp={() => volume !== null && void window.hearth.spotify.control('volume', volume)}
                    className="accent-accent w-36"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <form
        className="mb-4 flex gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void runSearch()
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Spotify…"
          className="focus:border-accent flex-1 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-lg outline-none placeholder:text-white/30"
        />
        <button type="submit" className="bg-accent rounded-2xl px-7 py-4 text-lg font-medium">
          Search
        </button>
      </form>
      <div className="mb-6 flex gap-2">
        {(['track', 'album', 'playlist', 'artist'] as SearchType[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setSearchType(t)
              if (results) void runSearch()
            }}
            className={`rounded-full px-4 py-2 text-sm capitalize ${
              searchType === t ? 'bg-accent text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            {t}s
          </button>
        ))}
        {results && (
          <button
            onClick={() => {
              setResults(null)
              setQuery('')
            }}
            className="ml-auto rounded-full bg-white/5 px-4 py-2 text-sm text-white/60"
          >
            Clear
          </button>
        )}
      </div>
      {error && <p className="mb-4 text-sm text-rose-400">{error}</p>}

      {/* Results or playlists */}
      <h2 className="mb-3 text-lg text-white/60">{results ? 'Results' : 'Your playlists'}</h2>
      <div className="grid grid-cols-4 gap-4 xl:grid-cols-6">
        {(results ?? playlists).map((item) => (
          <Tile key={item.uri} item={item} onPlay={() => playItem(item)} />
        ))}
      </div>
      {!results && playlists.length === 0 && (
        <p className="text-white/40">No playlists found on this account yet.</p>
      )}
    </div>
  )
}
