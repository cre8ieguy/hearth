import { useStore } from '../store'
import { getActiveWakeEngine } from './wakeBridge'
import type { AgentEvent } from '@shared/types'

const SILENCE_STOP_MS = 1400 // stop this long after speech ends
const NO_SPEECH_TIMEOUT_MS = 8000 // give up if nothing was said
const MAX_RECORD_MS = 30_000
const MIN_RECORD_MS = 500
const SPEECH_RMS = 0.022
const FIRST_SENTENCE_MIN = 1 // speak the very first sentence immediately
const SENTENCE_MIN_CHARS = 40 // batch later short sentences together

const STOP_PHRASE =
  /^(stop|cancel|be quiet|quiet|silence|shut up|never ?mind|nothing|no thanks?|that's (all|enough)|ok(ay)?,? thanks?|thank you)[.!,\s]*$/i

function pickMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return 'audio/webm'
}

/** 16 kHz mono Float32 chunks -> 16-bit PCM WAV bytes. */
function encodeWav(chunks: Float32Array[], sampleRate = 16000): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const buffer = new ArrayBuffer(44 + total * 2)
  const view = new DataView(buffer)
  const writeStr = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + total * 2, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, total * 2, true)
  let offset = 44
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Uint8Array(buffer)
}

class VoiceController {
  // --- capture state (two paths: wake-engine PCM tap, or MediaRecorder) ---
  private captureMode: 'pcm' | 'recorder' | null = null
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private audioCtx: AudioContext | null = null
  private vadHandle: number | null = null
  private cancelled = false
  private speechDetected = false
  private startedAt = 0
  private lastVoiceAt = 0

  // --- speech-output state (streaming sentence queue) ---
  private ttsAudio: HTMLAudioElement | null = null
  private ttsUrl: string | null = null
  private voiceTurn = false // current agent turn was voice-initiated
  private generationDone = true
  private pending = '' // streamed text not yet sent to TTS
  private firstFlushDone = false
  private speechQueue: Promise<Uint8Array | null>[] = []
  private queuePlaying = false
  private queueStopped = false

  constructor() {
    if (typeof window !== 'undefined' && window.hearth) {
      window.hearth.on('agent:event', (e) => this.onAgentEvent(e as AgentEvent))
    }
  }

  get state() {
    return useStore.getState().voiceState
  }

  private setState(v: ReturnType<typeof useStore.getState>['voiceState']): void {
    useStore.getState().setVoiceState(v)
  }

  private speakEnabled(): boolean {
    return !!useStore.getState().settings?.assistant.speakReplies
  }

  // ======================== listening ========================

  /** Wake-word barge-in: whatever the assistant is doing, stop it and listen. */
  async interruptAndListen(): Promise<void> {
    switch (this.state) {
      case 'idle':
      case 'speaking':
        await this.startListening()
        break
      case 'thinking': {
        void window.hearth.agent.cancel()
        this.stopSpeaking()
        this.setState('idle')
        await this.startListening()
        break
      }
      default:
        break // listening / transcribing — already on it
    }
  }

  /** Main entry — wired to the mic orb. */
  async toggle(): Promise<void> {
    switch (this.state) {
      case 'idle':
        await this.startListening()
        break
      case 'listening':
        this.finishRecording()
        break
      case 'transcribing':
        break
      case 'thinking':
        void window.hearth.agent.cancel()
        this.stopSpeaking()
        this.setState('idle')
        break
      case 'speaking':
        this.stopSpeaking()
        await this.startListening()
        break
    }
  }

  async startListening(): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'speaking') return
    this.stopSpeaking()
    this.cancelled = false
    this.speechDetected = false
    this.startedAt = Date.now()
    this.lastVoiceAt = 0
    useStore.setState({ liveUser: '', liveAssistant: '', liveError: '' })

    // Fast path: the wake engine's mic is already open — record from it and
    // include pre-roll, so speech overlapping "Hey Jarvis" is captured.
    const engine = getActiveWakeEngine()
    if (engine?.isAlive()) {
      this.captureMode = 'pcm'
      engine.startPcmCapture(640, (rms) => {
        useStore.getState().setMicLevel(Math.min(1, rms * 14))
        if (rms > SPEECH_RMS) {
          this.speechDetected = true
          this.lastVoiceAt = Date.now()
        }
      })
      this.setState('listening')
      this.vadTick()
      return
    }

    // Fallback: fresh mic + MediaRecorder (tap-to-talk without a wake engine).
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch {
      useStore.setState({ liveError: 'Microphone unavailable — check system permissions.' })
      this.setState('idle')
      return
    }
    this.captureMode = 'recorder'
    const mime = pickMime()
    this.chunks = []
    this.recorder = new MediaRecorder(this.stream, { mimeType: mime })
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: mime })
      this.chunks = []
      this.teardownRecorder()
      if (this.cancelled) return
      if (blob.size < 2000 || !this.speechDetected) {
        this.setState('idle')
        return
      }
      void blob.arrayBuffer().then((ab) => this.processAudio(new Uint8Array(ab), mime.split(';')[0]))
    }
    this.recorder.start(150)
    this.setState('listening')

    this.audioCtx = new AudioContext()
    const source = this.audioCtx.createMediaStreamSource(this.stream)
    const analyser = this.audioCtx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    const buf = new Float32Array(analyser.fftSize)
    const poll = (): void => {
      if (this.state !== 'listening' || this.captureMode !== 'recorder') return
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      useStore.getState().setMicLevel(Math.min(1, rms * 14))
      if (rms > SPEECH_RMS) {
        this.speechDetected = true
        this.lastVoiceAt = Date.now()
      }
      window.setTimeout(poll, 90)
    }
    poll()
    this.vadTick()
  }

  /** Shared auto-stop logic for both capture paths. */
  private vadTick(): void {
    if (this.vadHandle !== null) clearTimeout(this.vadHandle)
    const tick = (): void => {
      if (this.state !== 'listening') return
      const now = Date.now()
      const elapsed = now - this.startedAt
      if (
        (this.speechDetected && now - this.lastVoiceAt > SILENCE_STOP_MS && elapsed > MIN_RECORD_MS) ||
        elapsed > MAX_RECORD_MS
      ) {
        this.finishRecording()
        return
      }
      if (!this.speechDetected && elapsed > NO_SPEECH_TIMEOUT_MS) {
        this.cancelRecording()
        return
      }
      this.vadHandle = window.setTimeout(tick, 90)
    }
    this.vadHandle = window.setTimeout(tick, 90)
  }

  finishRecording(): void {
    if (this.state !== 'listening') return
    this.setState('transcribing')
    useStore.getState().setMicLevel(0)
    if (this.captureMode === 'pcm') {
      const engine = getActiveWakeEngine()
      const pcm = engine?.stopPcmCapture() ?? []
      this.captureMode = null
      if (!this.speechDetected || pcm.length < 4) {
        this.setState('idle')
        return
      }
      void this.processAudio(encodeWav(pcm), 'audio/wav')
    } else {
      this.recorder?.stop() // continues in onstop
    }
  }

  cancelRecording(): void {
    this.cancelled = true
    useStore.getState().setMicLevel(0)
    if (this.captureMode === 'pcm') {
      getActiveWakeEngine()?.stopPcmCapture()
      this.captureMode = null
    } else {
      this.recorder?.stop()
    }
    this.setState('idle')
  }

  private teardownRecorder(): void {
    if (this.vadHandle !== null) {
      clearTimeout(this.vadHandle)
      this.vadHandle = null
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    void this.audioCtx?.close().catch(() => undefined)
    this.audioCtx = null
    this.captureMode = null
    useStore.getState().setMicLevel(0)
  }

  // ======================== transcribe -> ask ========================

  private async processAudio(bytes: Uint8Array, mime: string): Promise<void> {
    try {
      let text = await window.hearth.speech.transcribe(bytes, mime)
      // Drop the wake word itself if the pre-roll caught its tail.
      text = text.replace(/^\s*(hey|ok|okay)?[,.!\s]*jarvis[,.!?\s]+/i, '').trim()
      if (!text || STOP_PHRASE.test(text)) {
        this.setState('idle')
        return
      }
      useStore.setState({ liveUser: text })
      this.setState('thinking')
      this.voiceTurn = true
      const answer = await window.hearth.agent.ask(text)
      // Streaming TTS handles speech; here we only tidy up edge cases.
      if (!answer && this.state === 'thinking') this.setState('idle')
    } catch (err) {
      useStore.setState({ liveError: err instanceof Error ? err.message : String(err) })
      if (this.state === 'thinking' || this.state === 'transcribing') this.setState('idle')
    }
  }

  // ======================== streaming speech output ========================

  private onAgentEvent(event: AgentEvent): void {
    if (!this.voiceTurn) return
    switch (event.type) {
      case 'turn-start':
        this.pending = ''
        this.firstFlushDone = false
        this.generationDone = false
        this.queueStopped = false
        this.speechQueue = []
        break
      case 'text-delta':
        if (!this.speakEnabled()) return
        this.pending += event.text
        this.flushSentences(false)
        break
      case 'refusal':
        if (!this.speakEnabled()) return
        this.pending += event.text
        this.flushSentences(true)
        break
      case 'assistant-done':
        if (!this.speakEnabled()) return
        this.flushSentences(true)
        break
      case 'error':
        this.stopSpeaking()
        this.voiceTurn = false
        if (this.state === 'thinking') this.setState('idle')
        break
      case 'turn-end':
        this.generationDone = true
        if (!this.speakEnabled() || (this.speechQueue.length === 0 && !this.queuePlaying)) {
          this.voiceTurn = false
          if (this.state === 'thinking') this.afterSpeech()
        }
        break
    }
  }

  /** Send completed sentences to TTS as they arrive; batch tiny ones. */
  private flushSentences(force: boolean): void {
    if (this.queueStopped) return
    // Split on sentence enders followed by whitespace (keep trailing partial).
    const parts = this.pending.split(/(?<=[.!?…][")\]]?)\s+/)
    let complete = ''
    let rest = parts[parts.length - 1]
    if (/[.!?…][")\]]?$/.test(rest)) rest = '' // buffer itself ends a sentence
    complete = this.pending.slice(0, this.pending.length - rest.length).trim()

    const min = this.firstFlushDone ? SENTENCE_MIN_CHARS : FIRST_SENTENCE_MIN
    if (complete && (complete.length >= min || force)) {
      this.enqueueSpeech(complete)
      this.pending = rest
      this.firstFlushDone = true
    }
    if (force && this.pending.trim()) {
      this.enqueueSpeech(this.pending.trim())
      this.pending = ''
    }
  }

  private enqueueSpeech(text: string): void {
    // Fire the TTS request immediately (overlaps with generation + playback).
    const fetchPromise = window.hearth.speech.tts(text).catch(() => null)
    this.speechQueue.push(fetchPromise)
    void this.pumpQueue()
  }

  private async pumpQueue(): Promise<void> {
    if (this.queuePlaying) return
    this.queuePlaying = true
    try {
      while (this.speechQueue.length > 0 && !this.queueStopped) {
        const bytes = await this.speechQueue.shift()!
        if (this.queueStopped) break
        if (bytes) {
          this.setState('speaking')
          await this.playOne(bytes)
        }
      }
    } finally {
      this.queuePlaying = false
    }
    if (!this.queueStopped && this.generationDone && this.speechQueue.length === 0) {
      this.voiceTurn = false
      this.afterSpeech()
    }
  }

  private afterSpeech(): void {
    const continuous = useStore.getState().settings?.assistant.continuousConversation
    if (this.state === 'speaking' || this.state === 'thinking') this.setState('idle')
    if (continuous) void this.startListening()
  }

  private playOne(bytes: Uint8Array): Promise<void> {
    return new Promise((resolve) => {
      this.cleanupTts()
      const blob = new Blob([bytes.slice().buffer], { type: 'audio/mpeg' })
      this.ttsUrl = URL.createObjectURL(blob)
      this.ttsAudio = new Audio(this.ttsUrl)
      const done = (): void => {
        this.cleanupTts()
        resolve()
      }
      this.ttsAudio.onended = done
      this.ttsAudio.onerror = done
      void this.ttsAudio.play().catch(done)
    })
  }

  /** Speak arbitrary text now (voice test, timer announcements). */
  async playTts(text: string): Promise<void> {
    try {
      const bytes = await window.hearth.speech.tts(text)
      this.setState('speaking')
      await this.playOne(bytes)
      if (this.state === 'speaking') this.setState('idle')
    } catch {
      if (this.state === 'speaking') this.setState('idle')
    }
  }

  stopSpeaking(): void {
    this.queueStopped = true
    this.voiceTurn = false
    this.speechQueue = []
    this.pending = ''
    if (this.ttsAudio) {
      this.ttsAudio.onended = null
      this.ttsAudio.onerror = null
      this.ttsAudio.pause()
    }
    this.cleanupTts()
    if (this.state === 'speaking') this.setState('idle')
  }

  private cleanupTts(): void {
    if (this.ttsUrl) URL.revokeObjectURL(this.ttsUrl)
    this.ttsAudio = null
    this.ttsUrl = null
  }
}

export const voice = new VoiceController()

/** Soft two-tone chime for timers, generated with WebAudio (no asset needed). */
export function playChime(times = 3): void {
  const ctx = new AudioContext()
  const note = (freq: number, at: number, dur = 0.28): void => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(ctx.currentTime + at)
    osc.stop(ctx.currentTime + at + dur + 0.05)
  }
  for (let i = 0; i < times; i++) {
    note(880, i * 0.9)
    note(659.25, i * 0.9 + 0.32)
  }
  setTimeout(() => void ctx.close().catch(() => undefined), times * 900 + 800)
}
