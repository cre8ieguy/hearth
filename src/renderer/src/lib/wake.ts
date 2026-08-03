import { useStore } from '../store'
import { voice } from './voice'
import type { PorcupineWorker } from '@picovoice/porcupine-web'

/**
 * Always-on wake-word detection ("Hey Jarvis…") using Picovoice Porcupine.
 * Runs fully on-device (WASM in the renderer); nothing is streamed anywhere.
 * The engine only *triggers* when the assistant is idle, so it can't
 * interrupt itself mid-answer or re-trigger while listening.
 */

let worker: PorcupineWorker | null = null
let signature = ''
let starting = false

function setStatus(wakeStatus: string): void {
  useStore.setState({ wakeStatus })
}

function wakeBlip(): void {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 1046
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.22)
    setTimeout(() => void ctx.close().catch(() => undefined), 400)
  } catch {
    // audio context unavailable — skip the blip
  }
}

function onDetection(): void {
  const s = useStore.getState()
  if (s.voiceState !== 'idle' || s.turnActive) return
  wakeBlip()
  s.setScreensaver(null)
  void voice.startListening()
}

async function stop(): Promise<void> {
  const current = worker
  worker = null
  if (!current) return
  try {
    const { WebVoiceProcessor } = await import('@picovoice/web-voice-processor')
    await WebVoiceProcessor.unsubscribe(current)
  } catch {
    // already gone
  }
  try {
    current.terminate()
  } catch {
    // already terminated
  }
}

/** Reconcile the engine with current settings. Cheap to call repeatedly. */
export async function syncWakeWord(): Promise<void> {
  const conf = useStore.getState().settings?.wakeWord
  const sig = conf ? `${conf.enabled}|${conf.accessKey}|${conf.keyword}|${conf.sensitivity}` : ''
  if (sig === signature || starting) return
  starting = true
  signature = sig
  await stop()

  if (!conf?.enabled) {
    setStatus('off')
    starting = false
    return
  }
  if (!conf.accessKey) {
    setStatus('Add a free Picovoice AccessKey to enable the wake word.')
    starting = false
    return
  }

  try {
    const { PorcupineWorker } = await import('@picovoice/porcupine-web')
    const { WebVoiceProcessor } = await import('@picovoice/web-voice-processor')
    worker = await PorcupineWorker.create(
      conf.accessKey,
      [{ builtin: conf.keyword as never, sensitivity: conf.sensitivity }],
      onDetection,
      { publicPath: '/porcupine_params.pv' },
    )
    await WebVoiceProcessor.subscribe(worker)
    setStatus(`Listening for “${conf.keyword}”`)
  } catch (err) {
    await stop()
    const msg = err instanceof Error ? err.message : String(err)
    setStatus(`Wake word error: ${msg.slice(0, 200)}`)
  } finally {
    starting = false
  }
}
