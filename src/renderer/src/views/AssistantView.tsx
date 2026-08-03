import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

const SUGGESTIONS = [
  'What should I wear tomorrow?',
  'Play something mellow',
  'What’s on my calendar this week?',
  'Turn off the living room lights',
  'Set a timer for 20 minutes',
  'Show the aquarium',
]

export default function AssistantView(): React.JSX.Element {
  const chat = useStore((s) => s.chat)
  const turnActive = useStore((s) => s.turnActive)
  const liveAssistant = useStore((s) => s.liveAssistant)
  const liveActivity = useStore((s) => s.liveActivity)
  const liveError = useStore((s) => s.liveError)
  const name = useStore((s) => s.settings?.assistant.name ?? 'Jarvis')
  const ready = useStore((s) => !!s.status?.anthropic)
  const [draft, setDraft] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [chat, liveAssistant, turnActive])

  const sendText = (text: string): void => {
    const t = text.trim()
    if (!t || turnActive) return
    setDraft('')
    void window.hearth.agent.ask(t)
  }

  return (
    <div className="flex h-full flex-col p-8 pb-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-light">Chat with {name}</h1>
        <button
          onClick={() => void window.hearth.agent.reset()}
          className="rounded-xl bg-white/5 px-4 py-2 text-sm text-white/60 hover:bg-white/10"
        >
          New conversation
        </button>
      </div>

      <div ref={scrollRef} className="glass flex-1 overflow-y-auto p-6">
        {chat.length === 0 && !turnActive ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <span className="text-6xl">👋</span>
            <p className="max-w-md text-white/50">
              {ready
                ? `Say hi — tap the orb or type below. A few ideas:`
                : 'Add your Anthropic API key in Settings to start chatting.'}
            </p>
            {ready && (
              <div className="flex max-w-xl flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendText(s)}
                    className="rounded-full bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {chat.map((m, i) => (
              <div
                key={m.at + '-' + i}
                className={
                  m.role === 'user'
                    ? 'ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm bg-white/10 px-5 py-3'
                    : 'w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-accent/15 px-5 py-3'
                }
              >
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
            ))}
            {turnActive && (
              <div className="bg-accent/15 w-fit max-w-[85%] rounded-2xl rounded-bl-sm px-5 py-3">
                {liveAssistant ? (
                  <p className="whitespace-pre-wrap">{liveAssistant}</p>
                ) : (
                  <p className="text-white/50">{liveActivity ? liveActivity + '…' : 'Thinking…'}</p>
                )}
              </div>
            )}
            {liveError && <p className="text-sm text-rose-400">{liveError}</p>}
          </div>
        )}
      </div>

      <form
        className="mt-4 flex gap-3 pr-32"
        onSubmit={(e) => {
          e.preventDefault()
          sendText(draft)
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={ready ? `Message ${name}…` : 'Add API keys in Settings first'}
          disabled={!ready}
          className="focus:border-accent flex-1 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-lg outline-none placeholder:text-white/30"
        />
        <button
          type="submit"
          disabled={!ready || turnActive || !draft.trim()}
          className="bg-accent rounded-2xl px-7 py-4 text-lg font-medium disabled:opacity-30"
        >
          Send
        </button>
      </form>
    </div>
  )
}
