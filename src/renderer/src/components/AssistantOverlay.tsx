import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { voice } from '../lib/voice'

const LINGER_MS = 7000

export default function AssistantOverlay(): React.JSX.Element | null {
  const voiceState = useStore((s) => s.voiceState)
  const turnActive = useStore((s) => s.turnActive)
  const liveUser = useStore((s) => s.liveUser)
  const liveAssistant = useStore((s) => s.liveAssistant)
  const liveActivity = useStore((s) => s.liveActivity)
  const liveError = useStore((s) => s.liveError)
  const lastTurnEndedAt = useStore((s) => s.lastTurnEndedAt)
  const view = useStore((s) => s.view)
  const [, forceTick] = useState(0)

  // Re-render shortly after a turn ends so the panel can fade away.
  useEffect(() => {
    if (!lastTurnEndedAt) return
    const handle = setTimeout(() => forceTick((n) => n + 1), LINGER_MS + 100)
    return () => clearTimeout(handle)
  }, [lastTurnEndedAt])

  if (view === 'assistant') return null // the chat view already shows everything

  const lingering =
    lastTurnEndedAt > 0 && Date.now() - lastTurnEndedAt < LINGER_MS && (liveAssistant || liveError)
  const visible = turnActive || voiceState !== 'idle' || lingering || !!liveError
  if (!visible) return null

  const statusLabel =
    voiceState === 'listening'
      ? 'Listening…'
      : voiceState === 'transcribing'
        ? 'Heard you — writing it down…'
        : liveActivity
          ? liveActivity + '…'
          : voiceState === 'thinking' || turnActive
            ? 'Thinking…'
            : voiceState === 'speaking'
              ? 'Speaking'
              : ''

  const dismiss = (): void => {
    voice.stopSpeaking()
    void window.hearth.agent.cancel()
    useStore.setState({
      liveError: '',
      liveAssistant: '',
      liveUser: '',
      lastTurnEndedAt: 0,
      turnActive: false,
    })
  }

  return (
    <div className="animate-fadein glass absolute right-7 bottom-36 z-30 flex max-h-[55vh] w-[520px] max-w-[calc(100%-4rem)] flex-col p-5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-accent text-xs font-semibold tracking-widest uppercase">
          {statusLabel || 'Assistant'}
        </span>
        <button
          onClick={dismiss}
          className="rounded-full px-3 py-1 text-white/40 hover:bg-white/10 hover:text-white"
        >
          ✕
        </button>
      </div>
      <div className="space-y-3 overflow-y-auto">
        {liveUser && (
          <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-white/10 px-4 py-2 text-[15px]">
            {liveUser}
          </div>
        )}
        {liveAssistant && (
          <p className="text-[17px] leading-relaxed whitespace-pre-wrap text-white/95">
            {liveAssistant}
          </p>
        )}
        {liveError && <p className="text-sm text-rose-400">{liveError}</p>}
      </div>
    </div>
  )
}
