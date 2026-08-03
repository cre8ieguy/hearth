import { useStore } from '../store'
import type { ViewName } from '@shared/types'

const ITEMS: { view: ViewName; icon: string; label: string }[] = [
  { view: 'dashboard', icon: '🏠', label: 'Home' },
  { view: 'assistant', icon: '💬', label: 'Chat' },
  { view: 'spotify', icon: '🎵', label: 'Music' },
  { view: 'calendar', icon: '📅', label: 'Agenda' },
  { view: 'settings', icon: '⚙️', label: 'Setup' },
]

export default function NavRail(): React.JSX.Element {
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const setScreensaver = useStore((s) => s.setScreensaver)
  const settings = useStore((s) => s.settings)

  return (
    <nav className="flex w-24 shrink-0 flex-col items-center gap-2 py-6">
      <div className="from-accent to-ember mb-4 h-10 w-10 rounded-2xl bg-gradient-to-br shadow-lg shadow-black/40" />
      {ITEMS.map((item) => (
        <button
          key={item.view}
          onClick={() => setView(item.view)}
          className={`flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors ${
            view === item.view ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5'
          }`}
        >
          <span className="text-2xl leading-none">{item.icon}</span>
          <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
        </button>
      ))}
      <div className="flex-1" />
      <button
        onClick={() => {
          const conf = settings?.screensaver
          const mode = conf && conf.mode !== 'off' ? conf.mode : 'photos'
          setScreensaver({ mode, preset: conf?.activePreset })
        }}
        className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl text-white/50 hover:bg-white/5"
        title="Start screensaver"
      >
        <span className="text-2xl leading-none">🌙</span>
        <span className="text-[10px] font-medium tracking-wide">Ambient</span>
      </button>
    </nav>
  )
}
