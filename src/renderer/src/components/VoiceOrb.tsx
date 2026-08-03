import { useStore } from '../store'
import { voice } from '../lib/voice'

function MicIcon(): React.JSX.Element {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="2.5" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3.5" />
    </svg>
  )
}

export default function VoiceOrb(): React.JSX.Element {
  const voiceState = useStore((s) => s.voiceState)
  const micLevel = useStore((s) => s.micLevel)
  const status = useStore((s) => s.status)
  const assistantName = useStore((s) => s.settings?.assistant.name ?? 'the assistant')

  const ready = !!status?.anthropic && !!status?.openai

  const onTap = (): void => {
    if (!ready) {
      useStore.setState({
        liveError: `Add your Anthropic and OpenAI API keys in Settings to talk to ${assistantName}.`,
        lastTurnEndedAt: Date.now(),
      })
      return
    }
    void voice.toggle()
  }

  const base =
    'fixed bottom-7 right-7 z-40 flex h-22 w-22 items-center justify-center rounded-full text-white shadow-2xl shadow-black/50 transition-transform active:scale-95'
  const style: React.CSSProperties = { width: 88, height: 88 }

  let cls = 'bg-gradient-to-br from-accent to-accent-soft animate-breathe'
  let content: React.ReactNode = <MicIcon />

  if (voiceState === 'listening') {
    cls = 'bg-gradient-to-br from-rose-500 to-red-600 animate-pulse-ring'
    style.transform = `scale(${1 + micLevel * 0.18})`
    content = <MicIcon />
  } else if (voiceState === 'transcribing' || voiceState === 'thinking') {
    cls = 'bg-gradient-to-br from-accent to-accent-soft'
    content = <div className="spinner h-8 w-8" />
  } else if (voiceState === 'speaking') {
    cls = 'bg-gradient-to-br from-emerald-500 to-teal-600'
    content = (
      <div className="flex h-8 items-center gap-1">
        <div className="eq-bar" />
        <div className="eq-bar" />
        <div className="eq-bar" />
        <div className="eq-bar" />
      </div>
    )
  } else if (!ready) {
    cls = 'bg-white/10'
  }

  return (
    <button onPointerDown={onTap} className={`${base} ${cls}`} style={style} title="Talk">
      {content}
    </button>
  )
}
