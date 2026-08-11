import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { voice } from '../lib/voice'
import { MODEL_CHOICES, type GeocodeResult, type Settings } from '@shared/types'

// ---------- small form primitives ----------

function Section({
  title,
  pill,
  children,
}: {
  title: string
  pill?: { ok: boolean; label: string }
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="glass p-6">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-medium">{title}</h2>
        {pill && (
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              pill.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-white/40'
            }`}
          >
            {pill.label}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

function TextField({
  label,
  value,
  onCommit,
  placeholder,
  secret,
  hint,
  width,
}: {
  label: string
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  secret?: boolean
  hint?: string
  width?: string
}): React.JSX.Element {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <label className={`flex flex-col gap-1 ${width ?? 'w-full'}`}>
      <span className="text-xs text-white/50">{label}</span>
      <input
        type={secret ? 'password' : 'text'}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(draft.trim())}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="focus:border-accent rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none placeholder:text-white/25"
      />
      {hint && <span className="text-xs text-white/35">{hint}</span>}
    </label>
  )
}

function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
}): React.JSX.Element {
  return (
    <button onClick={() => onChange(!checked)} className="flex items-center justify-between gap-4 text-left">
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-white/35">{hint}</span>}
      </span>
      <span
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-white/15'}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${checked ? 'left-6' : 'left-1'}`}
        />
      </span>
    </button>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
  width,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
  width?: string
}): React.JSX.Element {
  return (
    <label className={`flex flex-col gap-1 ${width ?? 'w-full'}`}>
      <span className="text-xs text-white/50">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none [&>option]:bg-neutral-900"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function ConnectButton({
  connected,
  onConnect,
  onDisconnect,
}: {
  connected: boolean
  onConnect: () => Promise<void>
  onDisconnect: () => Promise<void>
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const click = async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await (connected ? onDisconnect() : onConnect())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => void click()}
        disabled={busy}
        className={`rounded-xl px-6 py-3 font-medium disabled:opacity-40 ${
          connected ? 'bg-white/10 hover:bg-white/15' : 'bg-accent'
        }`}
      >
        {busy ? 'Waiting for browser…' : connected ? 'Disconnect' : 'Connect'}
      </button>
      {error && <span className="text-sm text-rose-400">{error}</span>}
    </div>
  )
}

function UpdateRow(): React.JSX.Element {
  const updateStatus = useStore((s) => s.updateStatus)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void window.hearth.system.updateReady().then(setReady)
  }, [updateStatus])
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => void window.hearth.system.checkUpdates()}
        className="rounded-xl bg-white/10 px-5 py-3 text-sm hover:bg-white/15"
      >
        Check for updates
      </button>
      {ready && (
        <button
          onClick={() => void window.hearth.system.installUpdateNow()}
          className="bg-accent rounded-xl px-5 py-3 text-sm font-medium"
        >
          Install now (restarts app)
        </button>
      )}
      {updateStatus && <span className="text-xs text-white/45">{updateStatus}</span>}
    </div>
  )
}

function WakeStatusLine(): React.JSX.Element {
  const wakeStatus = useStore((s) => s.wakeStatus)
  const listening = wakeStatus.startsWith('Listening')
  return (
    <p className={`text-xs ${listening ? 'text-emerald-300' : 'text-white/40'}`}>
      {listening ? '🟢 ' : ''}
      {wakeStatus === 'off' ? 'Wake word is off.' : wakeStatus}
    </p>
  )
}

function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim()
  const urlMatch = trimmed.match(/(?:v=|youtu\.be\/|\/embed\/|\/live\/|\/shorts\/)([\w-]{6,})/)
  if (urlMatch) return urlMatch[1]
  if (/^[\w-]{6,}$/.test(trimmed)) return trimmed
  return null
}

// ---------- main view ----------

export default function SettingsView(): React.JSX.Element {
  const settings = useStore((s) => s.settings)
  const status = useStore((s) => s.status)
  const update = useStore((s) => s.updateSettings)
  const [geoQuery, setGeoQuery] = useState('')
  const [geoResults, setGeoResults] = useState<GeocodeResult[]>([])
  const [haResult, setHaResult] = useState('')
  const [presetName, setPresetName] = useState('')
  const [presetUrl, setPresetUrl] = useState('')
  const [version, setVersion] = useState('')

  useEffect(() => {
    void window.hearth.system.version().then(setVersion)
  }, [])

  if (!settings || !status) return <div className="p-10 text-white/40">Loading…</div>
  const s: Settings = settings

  const searchLocation = async (): Promise<void> => {
    if (!geoQuery.trim()) return
    setGeoResults(await window.hearth.weather.geocode(geoQuery.trim()).catch(() => []))
  }

  const addPreset = (): void => {
    const id = extractYoutubeId(presetUrl)
    if (!id || !presetName.trim()) return
    void update({
      screensaver: {
        youtubePresets: [...s.screensaver.youtubePresets, { name: presetName.trim(), videoId: id }],
      },
    })
    setPresetName('')
    setPresetUrl('')
  }

  return (
    <div className="h-full overflow-y-auto p-8 pb-40">
      <h1 className="mb-6 text-2xl font-light">Settings</h1>
      <div className="grid grid-cols-2 gap-6">
        {/* Assistant brain */}
        <Section title="🧠 Assistant brain" pill={{ ok: status.anthropic, label: status.anthropic ? 'Ready' : 'Needs API key' }}>
          <TextField
            label="Anthropic API key"
            secret
            value={s.anthropic.apiKey}
            onCommit={(v) => void update({ anthropic: { apiKey: v } })}
            placeholder="sk-ant-…"
            hint="Create one at console.anthropic.com → API keys. See docs/setup-anthropic.md."
          />
          <SelectField
            label="Model"
            value={
              MODEL_CHOICES.some((m) => m.id === s.anthropic.model)
                ? s.anthropic.model
                : MODEL_CHOICES[0].id
            }
            onChange={(v) => void update({ anthropic: { model: v } })}
            options={MODEL_CHOICES.map((m) => ({ value: m.id, label: m.label }))}
          />
          <div className="flex gap-4">
            <SelectField
              label="Effort (speed ↔ depth)"
              value={s.anthropic.effort}
              onChange={(v) => void update({ anthropic: { effort: v as Settings['anthropic']['effort'] } })}
              options={[
                { value: 'low', label: 'Low — snappy (recommended)' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High — most thorough' },
              ]}
              width="flex-1"
            />
            <SelectField
              label="Forget conversation after"
              value={String(s.assistant.resetAfterMinutes)}
              onChange={(v) => void update({ assistant: { resetAfterMinutes: Number(v) } })}
              options={[
                { value: '5', label: '5 min idle' },
                { value: '15', label: '15 min idle (recommended)' },
                { value: '30', label: '30 min idle' },
                { value: '60', label: '1 hour idle' },
                { value: '0', label: 'Never (costs more)' },
              ]}
              width="flex-1"
            />
          </div>
          <TextField
            label="Assistant name"
            value={s.assistant.name}
            onCommit={(v) => void update({ assistant: { name: v || 'Jarvis' } })}
            width="w-1/2"
          />
        </Section>

        {/* Voice */}
        <Section title="🎙️ Voice" pill={{ ok: status.openai, label: status.openai ? 'Ready' : 'Needs API key' }}>
          <TextField
            label="OpenAI API key (speech-to-text + voice)"
            secret
            value={s.openai.apiKey}
            onCommit={(v) => void update({ openai: { apiKey: v } })}
            placeholder="sk-…"
            hint="Used only for transcription and text-to-speech. See docs/setup-openai.md."
          />
          <div className="flex gap-4">
            <SelectField
              label="Voice"
              value={s.openai.ttsVoice}
              onChange={(v) => void update({ openai: { ttsVoice: v } })}
              options={['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse'].map(
                (v) => ({ value: v, label: v }),
              )}
              width="flex-1"
            />
            <SelectField
              label="Transcription model"
              value={s.openai.sttModel}
              onChange={(v) => void update({ openai: { sttModel: v } })}
              options={[
                { value: 'gpt-4o-transcribe', label: 'gpt-4o-transcribe (best)' },
                { value: 'gpt-4o-mini-transcribe', label: 'gpt-4o-mini-transcribe' },
                { value: 'whisper-1', label: 'whisper-1' },
              ]}
              width="flex-1"
            />
            <SelectField
              label="Speaking speed"
              value={String(s.openai.ttsSpeed)}
              onChange={(v) => void update({ openai: { ttsSpeed: Number(v) } })}
              options={[
                { value: '1', label: 'Normal' },
                { value: '1.1', label: 'Brisk (1.1×)' },
                { value: '1.2', label: 'Quick (1.2×)' },
                { value: '1.35', label: 'Fast (1.35×)' },
                { value: '1.5', label: 'Very fast (1.5×)' },
              ]}
              width="flex-1"
            />
          </div>
          <Toggle
            label="Speak replies out loud"
            checked={s.assistant.speakReplies}
            onChange={(v) => void update({ assistant: { speakReplies: v } })}
          />
          <Toggle
            label="Continuous conversation"
            hint="After the assistant answers, it listens again automatically."
            checked={s.assistant.continuousConversation}
            onChange={(v) => void update({ assistant: { continuousConversation: v } })}
          />
          <button
            onClick={() => void voice.playTts(`Hi, I'm ${s.assistant.name}. This is how I sound.`)}
            disabled={!status.openai}
            className="w-fit rounded-xl bg-white/10 px-5 py-3 text-sm hover:bg-white/15 disabled:opacity-30"
          >
            ▶ Test voice
          </button>

          <div className="mt-2 flex flex-col gap-4 rounded-xl bg-white/5 p-4">
            <Toggle
              label='Wake word — hands-free "Hey Jarvis"'
              hint="Listens on-device; nothing is streamed anywhere. Also interrupts the assistant mid-answer."
              checked={s.wakeWord.enabled}
              onChange={(v) => void update({ wakeWord: { enabled: v } })}
            />
            <div className="flex gap-4">
              <SelectField
                label="Engine"
                value={s.wakeWord.engine}
                onChange={(v) =>
                  void update({ wakeWord: { engine: v as Settings['wakeWord']['engine'] } })
                }
                options={[
                  { value: 'openwakeword', label: 'Built-in "Hey Jarvis" — free, no account' },
                  { value: 'porcupine', label: 'Picovoice Porcupine — needs AccessKey' },
                ]}
                width="flex-1"
              />
              <SelectField
                label="Sensitivity"
                value={String(s.wakeWord.sensitivity)}
                onChange={(v) => void update({ wakeWord: { sensitivity: Number(v) } })}
                options={[
                  { value: '0.4', label: 'Low (fewer false triggers)' },
                  { value: '0.5', label: 'Medium-low' },
                  { value: '0.6', label: 'Balanced' },
                  { value: '0.7', label: 'High' },
                  { value: '0.8', label: 'Very high (across the room)' },
                ]}
                width="flex-1"
              />
            </div>
            {s.wakeWord.engine === 'porcupine' && (
              <>
                <TextField
                  label="Picovoice AccessKey"
                  secret
                  value={s.wakeWord.accessKey}
                  onCommit={(v) => void update({ wakeWord: { accessKey: v } })}
                  hint="From console.picovoice.ai (if they approve an account) — otherwise use the built-in engine."
                />
                <SelectField
                  label="Wake word (Porcupine)"
                  value={s.wakeWord.keyword}
                  onChange={(v) => void update({ wakeWord: { keyword: v } })}
                  options={[
                    'Jarvis',
                    'Computer',
                    'Porcupine',
                    'Bumblebee',
                    'Terminator',
                    'Grasshopper',
                    'Blueberry',
                    'Grapefruit',
                    'Americano',
                    'Picovoice',
                  ].map((k) => ({ value: k, label: k }))}
                  width="w-1/2"
                />
              </>
            )}
            <WakeStatusLine />
          </div>
        </Section>

        {/* Spotify */}
        <Section title="🎧 Spotify" pill={{ ok: status.spotify, label: status.spotify ? 'Connected' : 'Not connected' }}>
          <TextField
            label="Client ID (from developer.spotify.com)"
            value={s.spotify.clientId}
            onCommit={(v) => void update({ spotify: { clientId: v } })}
            hint="Redirect URI to register: http://127.0.0.1:8888/callback/spotify — see docs/setup-spotify.md. Premium account required."
          />
          <ConnectButton
            connected={status.spotify}
            onConnect={() => window.hearth.spotify.connect()}
            onDisconnect={() => window.hearth.spotify.disconnect()}
          />
          <TextField
            label="Preferred playback device (optional)"
            value={s.spotify.preferredDeviceName}
            onCommit={(v) => void update({ spotify: { preferredDeviceName: v } })}
            placeholder="e.g. the name of this PC in the Spotify app"
            hint="Playback targets the active device first, then this one. Keep the Spotify app running on this PC."
          />
        </Section>

        {/* Google Calendar */}
        <Section title="📅 Google Calendar" pill={{ ok: status.google, label: status.google ? 'Connected' : 'Not connected' }}>
          <div className="flex gap-4">
            <TextField
              label="OAuth Client ID"
              value={s.google.clientId}
              onCommit={(v) => void update({ google: { clientId: v } })}
              width="flex-1"
            />
            <TextField
              label="OAuth Client Secret"
              secret
              value={s.google.clientSecret}
              onCommit={(v) => void update({ google: { clientSecret: v } })}
              width="flex-1"
            />
          </div>
          <p className="text-xs text-white/35">
            Create a “Desktop app” OAuth client in Google Cloud Console — full walkthrough in
            docs/setup-google.md.
          </p>
          <TextField
            label="Hide events containing"
            value={s.google.hideTerms}
            onCommit={(v) => void update({ google: { hideTerms: v } })}
            placeholder="e.g. Josh School Day"
            hint="Comma-separated. Matches event titles and calendar names; hidden everywhere (agenda, ambient screen, voice)."
          />
          <ConnectButton
            connected={status.google}
            onConnect={() => window.hearth.google.connect()}
            onDisconnect={() => window.hearth.google.disconnect()}
          />
        </Section>

        {/* Home Assistant */}
        <Section
          title="🏡 Home Assistant"
          pill={{ ok: status.homeAssistant, label: status.homeAssistant ? 'Configured' : 'Not configured' }}
        >
          <TextField
            label="Home Assistant URL"
            value={s.homeAssistant.url}
            onCommit={(v) => void update({ homeAssistant: { url: v } })}
            placeholder="http://homeassistant.local:8123"
          />
          <TextField
            label="Long-lived access token"
            secret
            value={s.homeAssistant.token}
            onCommit={(v) => void update({ homeAssistant: { token: v } })}
            hint="Home Assistant → your profile → Security → Long-lived access tokens. See docs/setup-home-assistant.md."
          />
          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                void window.hearth.ha.test().then(
                  (r) => setHaResult(`✓ ${r}`),
                  (e: Error) => setHaResult(`✕ ${e.message}`),
                )
              }
              disabled={!status.homeAssistant}
              className="w-fit rounded-xl bg-white/10 px-5 py-3 text-sm hover:bg-white/15 disabled:opacity-30"
            >
              Test connection
            </button>
            {haResult && <span className="text-sm text-white/60">{haResult}</span>}
          </div>
        </Section>

        {/* Location */}
        <Section title="📍 Location & units" pill={{ ok: s.location.lat != null, label: s.location.name || 'Not set' }}>
          <div className="flex gap-3">
            <input
              value={geoQuery}
              onChange={(e) => setGeoQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void searchLocation()}
              placeholder="Search city…"
              className="focus:border-accent flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 outline-none placeholder:text-white/25"
            />
            <button onClick={() => void searchLocation()} className="rounded-xl bg-white/10 px-5 hover:bg-white/15">
              Search
            </button>
          </div>
          {geoResults.length > 0 && (
            <div className="flex flex-col gap-1">
              {geoResults.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    void update({ location: { name: r.name, lat: r.lat, lon: r.lon } })
                    setGeoResults([])
                    setGeoQuery('')
                  }}
                  className="rounded-lg bg-white/5 px-4 py-2 text-left text-sm hover:bg-white/10"
                >
                  {r.name}
                  {r.admin1 ? `, ${r.admin1}` : ''} {r.country ? `(${r.country})` : ''}
                </button>
              ))}
            </div>
          )}
          <SelectField
            label="Temperature unit"
            value={s.location.unit}
            onChange={(v) => void update({ location: { unit: v as 'fahrenheit' | 'celsius' } })}
            options={[
              { value: 'fahrenheit', label: 'Fahrenheit' },
              { value: 'celsius', label: 'Celsius' },
            ]}
            width="w-1/2"
          />
        </Section>

        {/* Screensaver */}
        <Section title="🌙 Screensaver">
          <div className="flex gap-4">
            <SelectField
              label="Idle mode"
              value={s.screensaver.mode}
              onChange={(v) => void update({ screensaver: { mode: v as Settings['screensaver']['mode'] } })}
              options={[
                { value: 'photos', label: 'Photo slideshow' },
                { value: 'youtube', label: 'Ambient YouTube' },
                { value: 'mix', label: 'Mix — photos & YouTube take turns' },
                { value: 'off', label: 'Off' },
              ]}
              width="flex-1"
            />
            <SelectField
              label="Start after (minutes idle)"
              value={String(s.screensaver.idleMinutes)}
              onChange={(v) => void update({ screensaver: { idleMinutes: Number(v) } })}
              options={['1', '2', '5', '10', '15', '30'].map((v) => ({ value: v, label: `${v} min` }))}
              width="flex-1"
            />
          </div>
          {s.screensaver.mode === 'mix' && (
            <SelectField
              label="Mix: switch every"
              value={String(s.screensaver.mixMinutes)}
              onChange={(v) => void update({ screensaver: { mixMinutes: Number(v) } })}
              options={['5', '10', '15', '30', '60'].map((v) => ({ value: v, label: `${v} min` }))}
              width="w-1/2"
            />
          )}
          <div className="flex items-end gap-3">
            <TextField
              label="Photos folder"
              value={s.screensaver.photosDir}
              onCommit={(v) => void update({ screensaver: { photosDir: v } })}
              placeholder="Pick a folder of pictures"
              width="flex-1"
            />
            <button
              onClick={() =>
                void window.hearth.settings.pickFolder().then((dir) => {
                  if (dir) void update({ screensaver: { photosDir: dir } })
                })
              }
              className="mb-0.5 rounded-xl bg-white/10 px-5 py-3 hover:bg-white/15"
            >
              Browse…
            </button>
          </div>
          <div className="flex gap-4">
            <SelectField
              label="Photo interval"
              value={String(s.screensaver.photoIntervalSec)}
              onChange={(v) => void update({ screensaver: { photoIntervalSec: Number(v) } })}
              options={['8', '12', '20', '30', '60'].map((v) => ({ value: v, label: `${v} sec` }))}
              width="flex-1"
            />
            <SelectField
              label="Active YouTube preset"
              value={s.screensaver.activePreset}
              onChange={(v) => void update({ screensaver: { activePreset: v } })}
              options={s.screensaver.youtubePresets.map((p) => ({ value: p.name, label: p.name }))}
              width="flex-1"
            />
          </div>
          <div className="rounded-xl bg-white/5 p-4">
            <p className="mb-2 text-xs font-semibold tracking-widest text-white/40 uppercase">YouTube presets</p>
            {s.screensaver.youtubePresets.map((p) => (
              <div key={p.name} className="flex items-center justify-between py-1.5">
                <span className="text-sm">
                  {p.name} <span className="text-white/30">({p.videoId})</span>
                </span>
                <button
                  onClick={() =>
                    void update({
                      screensaver: {
                        youtubePresets: s.screensaver.youtubePresets.filter((x) => x.name !== p.name),
                      },
                    })
                  }
                  className="rounded-full px-2 text-white/30 hover:bg-white/10 hover:text-white"
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="mt-2 flex gap-2">
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Name (e.g. Aquarium)"
                className="w-40 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/25"
              />
              <input
                value={presetUrl}
                onChange={(e) => setPresetUrl(e.target.value)}
                placeholder="YouTube URL or video ID"
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none placeholder:text-white/25"
              />
              <button onClick={addPreset} className="rounded-lg bg-white/10 px-4 text-sm hover:bg-white/15">
                Add
              </button>
            </div>
            <p className="mt-2 text-xs text-white/30">
              Search YouTube for “10 hour aquarium 4k”, “fireplace 10 hours”, “lofi study mix”…
              then paste the link here. Live streams won’t play (YouTube blocks them in embedded
              players) — pick regular uploads, the longer the better.
            </p>
          </div>
          <div className="flex gap-6">
            <Toggle
              label="Sound on"
              checked={!s.screensaver.youtubeMuted}
              onChange={(v) => void update({ screensaver: { youtubeMuted: !v } })}
            />
            <Toggle
              label="Show clock"
              checked={s.screensaver.showClock}
              onChange={(v) => void update({ screensaver: { showClock: v } })}
            />
          </div>
        </Section>

        {/* Display */}
        <Section title="🖥️ Display & startup">
          <Toggle
            label="24-hour clock"
            checked={s.display.clock24h}
            onChange={(v) => void update({ display: { clock24h: v } })}
          />
          <Toggle
            label="Kiosk mode (fullscreen, no window chrome)"
            hint="Esc exits. Recommended on the wall-mounted PC."
            checked={s.display.kiosk}
            onChange={(v) => void update({ display: { kiosk: v } })}
          />
          <Toggle
            label="Launch when the PC starts"
            checked={s.display.launchAtLogin}
            onChange={(v) => void update({ display: { launchAtLogin: v } })}
          />
          <Toggle
            label="Keep the screen awake"
            checked={s.display.keepAwake}
            onChange={(v) => void update({ display: { keepAwake: v } })}
          />
          <div className="mt-2 flex flex-col gap-4 rounded-xl bg-white/5 p-4">
            <Toggle
              label="Presence detection — screen off when nobody's around"
              hint="Uses the camera for simple motion detection, entirely on this device; nothing is recorded or uploaded. The screen comes back on for motion, touch, or “Hey Jarvis”."
              checked={s.presence.enabled}
              onChange={(v) => void update({ presence: { enabled: v } })}
            />
            {s.presence.enabled && (
              <SelectField
                label="Screen off after"
                value={String(s.presence.offAfterMinutes)}
                onChange={(v) => void update({ presence: { offAfterMinutes: Number(v) } })}
                options={['2', '5', '10', '20', '30'].map((v) => ({ value: v, label: `${v} min of no motion` }))}
                width="w-1/2"
              />
            )}
            <Toggle
              label="Night hours — screen off on a schedule"
              hint="The display sleeps between these hours. Touch or “Hey Jarvis” wakes it for 10 minutes; it comes back on by itself when the window ends."
              checked={s.presence.nightEnabled}
              onChange={(v) => void update({ presence: { nightEnabled: v } })}
            />
            {s.presence.nightEnabled && (
              <div className="flex gap-4">
                <SelectField
                  label="Off from"
                  value={String(s.presence.nightStartHour)}
                  onChange={(v) => void update({ presence: { nightStartHour: Number(v) } })}
                  options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${h}:00` }))}
                  width="flex-1"
                />
                <SelectField
                  label="Until"
                  value={String(s.presence.nightEndHour)}
                  onChange={(v) => void update({ presence: { nightEndHour: Number(v) } })}
                  options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${h}:00` }))}
                  width="flex-1"
                />
              </div>
            )}
          </div>
        </Section>

        {/* About */}
        <Section title="ℹ️ About">
          <p className="text-sm text-white/50">
            Hearth v{version} — a Claude-powered home display. Settings and sign-ins are stored
            locally on this device.
          </p>
          <UpdateRow />
          <div className="flex gap-3">
            <button
              onClick={() => void window.hearth.agent.reset()}
              className="rounded-xl bg-white/10 px-5 py-3 text-sm hover:bg-white/15"
            >
              Clear conversation memory
            </button>
            <button
              onClick={() => void window.hearth.system.quit()}
              className="rounded-xl bg-rose-500/20 px-5 py-3 text-sm text-rose-300 hover:bg-rose-500/30"
            >
              Quit app
            </button>
          </div>
        </Section>
      </div>
    </div>
  )
}
