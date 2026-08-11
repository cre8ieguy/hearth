import { useEffect, useRef } from 'react'
import { useStore } from './store'
import { playChime, voice } from './lib/voice'
import { syncWakeWord } from './lib/wake'
import { presence } from './lib/presence'
import NavRail from './components/NavRail'
import VoiceOrb from './components/VoiceOrb'
import AssistantOverlay from './components/AssistantOverlay'
import NowPlayingBar from './components/NowPlayingBar'
import TimerAlert from './components/TimerAlert'
import Screensaver from './components/Screensaver'
import ContentPanel from './components/ContentPanel'
import Dashboard from './views/Dashboard'
import AssistantView from './views/AssistantView'
import SpotifyView from './views/SpotifyView'
import CalendarView from './views/CalendarView'
import SettingsView from './views/SettingsView'

export default function App(): React.JSX.Element {
  const view = useStore((s) => s.view)
  const screensaver = useStore((s) => s.screensaver)
  const settings = useStore((s) => s.settings)
  const firedTimer = useStore((s) => s.firedTimer)
  const voiceState = useStore((s) => s.voiceState)
  const turnActive = useStore((s) => s.turnActive)
  const setScreensaver = useStore((s) => s.setScreensaver)

  // Camera presence + night window -> display power
  const presenceConf = settings?.presence
  useEffect(() => {
    if (!presenceConf) return
    void presence.configure({
      camera: presenceConf.enabled,
      offAfterMinutes: presenceConf.offAfterMinutes,
      night: presenceConf.nightEnabled,
      nightStartHour: presenceConf.nightStartHour,
      nightEndHour: presenceConf.nightEndHour,
    })
  }, [presenceConf])

  // Idle -> screensaver
  const idleHandle = useRef<number | null>(null)
  useEffect(() => {
    const arm = () => {
      if (idleHandle.current !== null) window.clearTimeout(idleHandle.current)
      const s = useStore.getState()
      const conf = s.settings?.screensaver
      if (!conf || conf.mode === 'off') return
      idleHandle.current = window.setTimeout(
        () => {
          const st = useStore.getState()
          if (st.voiceState === 'idle' && !st.turnActive && !st.screensaver) {
            setScreensaver({ mode: conf.mode as 'photos' | 'youtube' | 'mix', preset: conf.activePreset })
          }
        },
        Math.max(1, conf.idleMinutes) * 60_000,
      )
    }
    arm()
    window.addEventListener('pointerdown', arm)
    window.addEventListener('keydown', arm)
    return () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
      if (idleHandle.current !== null) window.clearTimeout(idleHandle.current)
    }
    // re-arm when settings or activity change
  }, [settings, voiceState, turnActive, setScreensaver])

  // Keep the wake-word engine in sync with settings ("Hey Jarvis…").
  useEffect(() => {
    void syncWakeWord()
  }, [settings?.wakeWord])

  // Timer fired: un-ignorable — wake the screen and chime on repeat until
  // dismissed (banner tap, or "Hey Jarvis, stop").
  useEffect(() => {
    if (!firedTimer) return
    presence.poke()
    playChime(2)
    const chimeLoop = window.setInterval(() => playChime(2), 4200)
    const s = useStore.getState()
    if (s.settings?.assistant.speakReplies && s.status?.openai && s.voiceState === 'idle') {
      void voice.playTts(`Your ${firedTimer.label.replace(/ timer$/, '')} timer is done.`)
    }
    setScreensaver(null)
    return () => clearInterval(chimeLoop)
  }, [firedTimer, setScreensaver])

  return (
    <div className="bg-hearth flex h-full">
      <NavRail />
      <main className="relative flex-1 overflow-hidden">
        {view === 'dashboard' && <Dashboard />}
        {view === 'assistant' && <AssistantView />}
        {view === 'spotify' && <SpotifyView />}
        {view === 'calendar' && <CalendarView />}
        {view === 'settings' && <SettingsView />}
        <ContentPanel />
        <NowPlayingBar />
        <AssistantOverlay />
        <VoiceOrb />
        <TimerAlert />
      </main>
      {screensaver && <Screensaver state={screensaver} />}
    </div>
  )
}
