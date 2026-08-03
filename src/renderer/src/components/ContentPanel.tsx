import { useStore } from '../store'

/**
 * Agent-driven "second screen": recipes/lists/articles as rendered markdown,
 * or a live website in an Electron <webview>. Closes via ✕, voice
 * ("close that"), or navigating anywhere.
 */

// Minimal markdown renderer (headings, lists, bold/italic, code) — enough for
// recipes and instructions without pulling in a full parser.
function renderInline(text: string, key: number): React.JSX.Element {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('**')) parts.push(<strong key={i++}>{token.slice(2, -2)}</strong>)
    else if (token.startsWith('`'))
      parts.push(
        <code key={i++} className="rounded bg-white/10 px-1.5 py-0.5 text-[0.9em]">
          {token.slice(1, -1)}
        </code>,
      )
    else parts.push(<em key={i++}>{token.slice(1, -1)}</em>)
    last = m.index + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <span key={key}>{parts}</span>
}

function Markdown({ source }: { source: string }): React.JSX.Element {
  const blocks: React.ReactNode[] = []
  const lines = source.split('\n')
  let list: { ordered: boolean; items: string[] } | null = null
  let key = 0

  const flushList = (): void => {
    if (!list) return
    const items = list.items.map((item, i) => (
      <li key={i} className="mb-1.5">
        {renderInline(item, i)}
      </li>
    ))
    blocks.push(
      list.ordered ? (
        <ol key={key++} className="mb-4 ml-6 list-decimal marker:text-white/40">
          {items}
        </ol>
      ) : (
        <ul key={key++} className="mb-4 ml-6 list-disc marker:text-white/40">
          {items}
        </ul>
      ),
    )
    list = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = line.match(/^(#{1,4})\s+(.*)/)
    const bullet = line.match(/^\s*[-*•]\s+(.*)/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)/)

    if (heading) {
      flushList()
      const level = heading[1].length
      const cls =
        level === 1
          ? 'mb-3 mt-5 text-3xl font-semibold'
          : level === 2
            ? 'mb-2.5 mt-5 text-2xl font-semibold'
            : 'mb-2 mt-4 text-xl font-medium'
      blocks.push(
        <div key={key++} className={cls}>
          {renderInline(heading[2], key)}
        </div>,
      )
    } else if (bullet) {
      if (!list || list.ordered) {
        flushList()
        list = { ordered: false, items: [] }
      }
      list.items.push(bullet[1])
    } else if (numbered) {
      if (!list || !list.ordered) {
        flushList()
        list = { ordered: true, items: [] }
      }
      list.items.push(numbered[1])
    } else if (line.trim() === '') {
      flushList()
    } else {
      flushList()
      blocks.push(
        <p key={key++} className="mb-3 leading-relaxed">
          {renderInline(line, key)}
        </p>,
      )
    }
  }
  flushList()
  return <div className="text-lg text-white/90">{blocks}</div>
}

export default function ContentPanel(): React.JSX.Element | null {
  const panel = useStore((s) => s.contentPanel)
  const setContentPanel = useStore((s) => s.setContentPanel)
  if (!panel) return null

  return (
    <div className="animate-fadein absolute inset-6 bottom-8 z-20 flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#101018] shadow-2xl shadow-black/60">
      <div className="flex items-center gap-3 border-b border-white/10 px-6 py-3.5">
        <span className="text-lg">{panel.kind === 'web' ? '🌐' : '📖'}</span>
        <span className="min-w-0 flex-1 truncate text-lg font-medium">{panel.title}</span>
        {panel.kind === 'web' && (
          <span className="max-w-[40%] truncate text-xs text-white/35">{panel.url}</span>
        )}
        <button
          onClick={() => setContentPanel(null)}
          className="rounded-full bg-white/10 px-4 py-2 text-white/70 hover:bg-white/20 hover:text-white"
        >
          ✕ Close
        </button>
      </div>
      {panel.kind === 'markdown' ? (
        <div className="flex-1 overflow-y-auto px-10 py-6">
          <Markdown source={panel.markdown} />
        </div>
      ) : (
        <webview src={panel.url} className="flex-1" style={{ display: 'flex' }} />
      )}
    </div>
  )
}
