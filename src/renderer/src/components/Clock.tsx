import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { fmtDateLong, fmtTime } from '../lib/format'

export default function Clock({ size = 'lg' }: { size?: 'lg' | 'sm' }): React.JSX.Element {
  const clock24h = useStore((s) => s.settings?.display.clock24h ?? false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const handle = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(handle)
  }, [])

  const time = fmtTime(now, clock24h)
  if (size === 'sm') {
    return (
      <div>
        <div className="text-4xl font-light tracking-tight">{time}</div>
        <div className="text-sm text-white/50">{fmtDateLong(now)}</div>
      </div>
    )
  }
  return (
    <div>
      <div className="text-[92px] leading-none font-extralight tracking-tight tabular-nums">
        {time}
      </div>
      <div className="mt-2 text-xl font-light text-white/60">{fmtDateLong(now)}</div>
    </div>
  )
}
