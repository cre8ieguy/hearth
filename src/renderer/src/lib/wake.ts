import { useStore } from '../store'
import { voice } from './voice'
import { OpenWakeWordEngine } from './oww'
import type { PorcupineWorker } from '@picovoice/porcupine-web'

/**
 * Always-on wake-word detection with two engines:
 *  - openwakeword (default): free "Hey Jarvis" model, fully on-device, no account.
 *  - porcupine: Picovoice engine, more keyword choices, needs an AccessKey.
 *
 * Detection also acts as barge-in — saying the wake word while the assistant is
 * speaking (or thinking) interrupts it and starts listening, Alexa-style.
 */

let porcupine: PorcupineWorker | null = null
let oww: OpenWakeWordEngine | null = null
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
  // Already capturing the user's voice — nothing to do.
  if (s.voiceState === 'listening' || s.voiceState === 'transcribing') return
  wakeBlip()
  s.setScreensaver(null)
  // Interrupts speaking/thinking states internally, then starts listening.
  void voice.interruptAndListen()
}

async function stopEngines(): Promise<void> {
  const p = porcupine
  porcupine = null
  if (p) {
    try {
      const { WebVoiceProcessor } = await import('@picovoice/web-voice-processor')
      await WebVoiceProcessor.unsubscribe(p)
    } catch {
      // already gone
    }
    try {
      p.terminate()
    } catch {
      // already terminated
    }
  }
  oww?.dispose()
  oww = null
}

/** Reconcile the engine with current settings. Cheap to call repeatedly. */
export async function syncWakeWord(): Promise<void> {
  const conf = useStore.getState().settings?.wakeWord
  const sig = conf
    ? `${conf.enabled}|${conf.engine}|${conf.accessKey}|${conf.keyword}|${conf.sensitivity}`
    : ''
  if (sig === signature || starting) return
  starting = true
  signature = sig
  await stopEngines()

  try {
    if (!conf?.enabled) {
      setStatus('off')
      return
    }

    if (conf.engine === 'porcupine') {
      if (!conf.accessKey) {
        setStatus('Porcupine needs a Picovoice AccessKey — or switch to the built-in engine.')
        return
      }
      const { PorcupineWorker } = await import('@picovoice/porcupine-web')
      const { WebVoiceProcessor } = await import('@picovoice/web-voice-processor')
      porcupine = await PorcupineWorker.create(
        conf.accessKey,
        [{ builtin: conf.keyword as never, sensitivity: conf.sensitivity }],
        onDetection,
        { publicPath: 'porcupine_params.pv' },
      )
      await WebVoiceProcessor.subscribe(porcupine)
      setStatus(`Listening for “${conf.keyword}” (Porcupine)`)
      return
    }

    // Default: openWakeWord — sensitivity 0.4-0.8 maps to score threshold 0.7-0.3.
    const threshold = Math.min(0.7, Math.max(0.3, 1.1 - conf.sensitivity))
    oww = await OpenWakeWordEngine.create(threshold, onDetection)
    setStatus('Listening for “Hey Jarvis”')
  } catch (err) {
    await stopEngines()
    const msg = err instanceof Error ? err.message : String(err)
    setStatus(`Wake word error: ${msg.slice(0, 200)}`)
  } finally {
    starting = false
  }
}
