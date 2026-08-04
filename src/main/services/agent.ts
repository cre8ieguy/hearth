import Anthropic from '@anthropic-ai/sdk'
import { getSettings } from '../settings'
import { send } from '../window'
import { buildTools, dispatchTool, TOOL_LABELS } from './tools'
import * as spotifyService from './spotify'
import * as googleService from './google'
import * as haService from './homeassistant'
import * as timersService from './timers'
import type { AgentEvent, ChatMessage } from '@shared/types'

type BetaMessageParam = Anthropic.Beta.BetaMessageParam
type BetaMessage = Anthropic.Beta.BetaMessage

const MAX_TOOL_ROUNDS = 8
const HISTORY_SOFT_LIMIT = 30
const HISTORY_KEEP = 20

let history: BetaMessageParam[] = []
let chatLog: ChatMessage[] = []
let lastAskAt = 0
let busy = false
let currentStream: { abort: () => void } | null = null
let client: Anthropic | null = null
let clientKey = ''

function emit(event: AgentEvent): void {
  send('agent:event', event)
}

function getClient(): Anthropic {
  const key = getSettings().anthropic.apiKey
  if (!key) {
    throw new Error('No Anthropic API key configured. Add one in Settings → Assistant brain.')
  }
  if (!client || clientKey !== key) {
    client = new Anthropic({ apiKey: key })
    clientKey = key
  }
  return client
}

/**
 * Stable system prompt — only changes when settings change, so it stays
 * prompt-cache friendly (cache_control breakpoint on this block).
 */
function buildSystem(): { type: 'text'; text: string; cache_control: { type: 'ephemeral' } }[] {
  const s = getSettings()
  const capabilities: string[] = ['web search (built in)', 'weather', 'timers', 'screensaver and screen navigation']
  capabilities.push(
    spotifyService.isConnected() ? 'Spotify (connected)' : 'Spotify (NOT connected — direct the user to Settings)',
  )
  capabilities.push(
    googleService.isConnected()
      ? 'Google Calendar (connected)'
      : 'Google Calendar (NOT connected — direct the user to Settings)',
  )
  capabilities.push(
    haService.isConfigured()
      ? 'Home Assistant smart home (configured)'
      : 'Home Assistant (NOT configured — direct the user to Settings)',
  )
  const presets = s.screensaver.youtubePresets.map((p) => p.name).join(', ') || 'none'

  const text = `You are ${s.assistant.name}, the voice assistant living on a wall-mounted touchscreen smart display in the user's home. You are warm, capable, and brief.

Environment:
- Home location: ${s.location.name || 'not set'}
- Time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}
- Capabilities via tools: ${capabilities.join('; ')}
- Ambient YouTube presets available: ${presets}

How to respond:
- Your replies are spoken aloud through text-to-speech AND shown on screen. Write plain conversational prose: no markdown, no headers, no bullet lists, no emoji, no URLs unless the user asks for one.
- Lead with the answer. One to three short sentences for most requests. Only go longer when the user asks for detail.
- NEVER read long content aloud. Anything list-like or longer than a few sentences — recipes, instructions, itineraries, comparisons, articles, search summaries — goes on the display via show_content (full details there, in markdown), while your spoken reply stays to one or two sentences about it. To show a live website instead, use show_webpage.
- When you finish an action, confirm it in a few words ("Done — lights are off.") rather than narrating steps.
- Numbers and times should be easy to hear: say "3:30" not "15:30" unless the user prefers 24-hour time.
- If a tool fails, relay the useful part of the error in one plain sentence and suggest the fix (usually a Settings page).
- For date math ("tomorrow", "next Friday"), compute the concrete date yourself from the current date given in context.
- Act on the user's request without asking permission for routine actions. Ask only when genuinely ambiguous (e.g. two devices match).
- Do only what was asked — don't add extra actions, suggestions, or follow-up offers unless they're clearly useful.

Tool guidance:
- Prefer tools over guessing. Use web_search for anything about current events, facts you're unsure of, sports, news, or prices.
- For music vibes/genres use spotify_play with type=playlist. For a specific song, type=track.
- Before controlling an unfamiliar smart-home device, look it up with home_devices to get its exact entity_id.`

  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }]
}

/** Small volatile context block injected into each user turn (keeps the cached prefix stable). */
function contextBlock(): string {
  const s = getSettings()
  const now = new Date()
  const parts = [
    `Current date/time: ${now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })} (ISO date ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')})`,
  ]
  const activeTimers = timersService.listTimers()
  if (activeTimers.length > 0) {
    parts.push(`Active timers: ${activeTimers.map((t) => t.label).join(', ')}`)
  }
  if (!s.assistant.speakReplies) parts.push('Replies are shown on screen only (TTS off).')
  return `<context>\n${parts.join('\n')}\n</context>`
}

function textOf(message: BetaMessage): string {
  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}

/** Trim old turns, cutting only at real user turns (never between tool_use/tool_result). */
function trimHistory(): void {
  if (history.length <= HISTORY_SOFT_LIMIT) return
  const from = history.length - HISTORY_KEEP
  for (let i = from; i < history.length; i++) {
    const msg = history[i]
    if (msg.role !== 'user') continue
    const content = msg.content
    const isRealUserTurn =
      typeof content === 'string' ||
      (Array.isArray(content) && content.length > 0 && content[0].type === 'text')
    if (isRealUserTurn) {
      history = history.slice(i)
      return
    }
  }
}

export function getChatLog(): ChatMessage[] {
  return chatLog
}

export function resetConversation(): void {
  cancel()
  history = []
  chatLog = []
  send('agent:history', chatLog)
}

export function cancel(): void {
  try {
    currentStream?.abort()
  } catch {
    // already finished
  }
  currentStream = null
}

export async function ask(userText: string): Promise<string> {
  const text = userText.trim()
  if (!text) return ''
  if (busy) {
    cancel()
    // Give the aborted stream a moment to unwind before starting fresh.
    await new Promise((r) => setTimeout(r, 150))
  }
  const settings = getSettings()

  // Appliance behavior: after a quiet stretch, start a fresh model context.
  // Old turns re-sent each request are the main cost driver, and a wall display
  // shouldn't drag this morning's chat into tonight's question anyway.
  const resetMin = settings.assistant.resetAfterMinutes
  if (resetMin > 0 && lastAskAt > 0 && Date.now() - lastAskAt > resetMin * 60_000) {
    history = []
  }
  lastAskAt = Date.now()

  busy = true
  emit({ type: 'turn-start', userText: text })
  chatLog.push({ role: 'user', text, at: Date.now() })
  send('agent:history', chatLog)
  history.push({
    role: 'user',
    content: [
      { type: 'text', text: contextBlock() },
      { type: 'text', text },
    ],
  })

  let finalText = ''
  // Web search's dynamic filtering runs in a server-side code-execution
  // container; once a turn opens one, every follow-up request in the same
  // turn must resume it via `container`, or the API 400s with
  // "container_id is required when there are pending tool uses…".
  let containerId: string | undefined
  try {
    const anthropic = getClient()
    const system = buildSystem()
    const tools = buildTools()

    const model = settings.anthropic.model
    // Per-model request shape: effort isn't accepted on Haiku 4.5, and the
    // server-side refusal fallback (-> Opus 4.8) is a Fable 5 feature.
    const supportsEffort = !model.includes('haiku')
    const supportsFallbacks = model.startsWith('claude-fable')

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // Rolling prompt-cache breakpoint on the newest message so the next
      // request reads the whole conversation prefix at ~0.1x price.
      const messages = history.map((m, i) => {
        if (i !== history.length - 1 || !Array.isArray(m.content) || m.content.length === 0) return m
        const content = m.content.map((block, j) =>
          j === m.content.length - 1 && (block.type === 'text' || block.type === 'tool_result')
            ? { ...block, cache_control: { type: 'ephemeral' } }
            : block,
        )
        return { ...m, content } as BetaMessageParam
      })

      // Thinking param is omitted on purpose (always-on for Fable, adaptive
      // default elsewhere). Cast: fallbacks/output_config typings can lag the API.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stream: any = anthropic.beta.messages.stream({
        model,
        max_tokens: 32000,
        ...(containerId ? { container: containerId } : {}),
        system,
        messages,
        tools,
        ...(supportsEffort ? { output_config: { effort: settings.anthropic.effort } } : {}),
        ...(supportsFallbacks
          ? { betas: ['server-side-fallback-2026-06-01'], fallbacks: [{ model: 'claude-opus-4-8' }] }
          : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)

      currentStream = stream
      stream.on('text', (delta: string) => emit({ type: 'text-delta', text: delta }))

      const message: BetaMessage = await stream.finalMessage()
      currentStream = null
      const container = (message as unknown as { container?: { id?: string } | null }).container
      if (container?.id) containerId = container.id
      history.push({ role: 'assistant', content: message.content })

      if (message.stop_reason === 'refusal') {
        finalText = "Sorry — that's not something I can help with."
        emit({ type: 'refusal', text: finalText })
        break
      }

      if (message.stop_reason === 'pause_turn') {
        // Server-side tool (web search) paused mid-turn — re-send to resume.
        continue
      }

      if (message.stop_reason === 'tool_use') {
        const toolUses = message.content.filter(
          (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
        )
        const results = await Promise.all(
          toolUses.map(async (tu) => {
            emit({ type: 'tool-start', name: tu.name, label: TOOL_LABELS[tu.name] ?? 'Working' })
            let content: string
            let isError = false
            try {
              content = await dispatchTool(tu.name, (tu.input ?? {}) as Record<string, unknown>)
            } catch (err) {
              content = err instanceof Error ? err.message : String(err)
              isError = true
            }
            emit({ type: 'tool-end', name: tu.name })
            return {
              type: 'tool_result' as const,
              tool_use_id: tu.id,
              content,
              ...(isError ? { is_error: true } : {}),
            }
          }),
        )
        history.push({ role: 'user', content: results })
        continue
      }

      // end_turn (or max_tokens) — we have the final answer.
      finalText = textOf(message)
      break
    }

    if (!finalText) finalText = textOf(lastAssistant()) || 'Sorry, I lost my train of thought — try again?'
  } catch (err) {
    currentStream = null
    if (err instanceof Anthropic.APIUserAbortError) {
      emit({ type: 'turn-end' })
      busy = false
      return ''
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error('Agent error:', err)
    emit({ type: 'error', message })
    busy = false
    emit({ type: 'turn-end' })
    return ''
  }

  chatLog.push({ role: 'assistant', text: finalText, at: Date.now() })
  if (chatLog.length > 200) chatLog = chatLog.slice(-120)
  send('agent:history', chatLog)
  trimHistory()
  emit({ type: 'assistant-done', text: finalText })
  emit({ type: 'turn-end' })
  busy = false
  return finalText
}

function lastAssistant(): BetaMessage {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i]
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      return { content: msg.content } as BetaMessage
    }
  }
  return { content: [] } as unknown as BetaMessage
}
