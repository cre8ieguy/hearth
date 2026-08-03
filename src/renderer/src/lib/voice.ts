import { useStore } from '../store'

const SILENCE_STOP_MS = 1400 // stop this long after speech ends
const NO_SPEECH_TIMEOUT_MS = 8000 // give up if nothing was said
const MAX_RECORD_MS = 30_000
const MIN_RECORD_MS = 500
const SPEECH_RMS = 0.022

function pickMime(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  for (const m of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
  }
  return 'audio/webm'
}

class VoiceController {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private audioCtx: AudioContext | null = null
  private vadHandle: number | null = null
  private cancelled = false
  private speechDetected = false
  private startedAt = 0
  private lastVoiceAt = 0
  private ttsAudio: HTMLAudioElement | null = null
  private ttsUrl: string | null = null

  get state() {
    return useStore.getState().voiceState
  }

  private setState(v: ReturnType<typeof useStore.getState>['voiceState']): void {
    useStore.getState().setVoiceState(v)
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
        // nothing sensible to interrupt; ignore
        break
      case 'thinking':
        void window.hearth.agent.cancel()
        this.setState('idle')
        break
      case 'speaking':
        this.stopSpeaking()
        await this.startListening() // barge in: talk again immediately
        break
    }
  }

  async startListening(): Promise<void> {
    if (this.state !== 'idle' && this.state !== 'speaking') return
    this.stopSpeaking()
    this.cancelled = false
    this.speechDetected = false
    this.chunks = []
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch {
      useStore.setState({ liveError: 'Microphone unavailable — check system permissions.' })
      this.setState('idle')
      return
    }

    const mime = pickMime()
    this.recorder = new MediaRecorder(this.stream, { mimeType: mime })
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.recorder.onstop = () => void this.handleRecordingDone(mime)
    this.recorder.start(150)
    this.startedAt = Date.now()
    this.lastVoiceAt = 0
    this.setState('listening')
    useStore.setState({ liveUser: '', liveAssistant: '', liveError: '' })

    // Simple RMS voice-activity detection for auto-stop.
    this.audioCtx = new AudioContext()
    const source = this.audioCtx.createMediaStreamSource(this.stream)
    const analyser = this.audioCtx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    const buf = new Float32Array(analyser.fftSize)

    const tick = () => {
      if (this.state !== 'listening') return
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      useStore.getState().setMicLevel(Math.min(1, rms * 14))

      const now = Date.now()
      if (rms > SPEECH_RMS) {
        this.speechDetected = true
        this.lastVoiceAt = now
      }
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
    tick()
  }

  private teardownCapture(): void {
    if (this.vadHandle !== null) {
      clearTimeout(this.vadHandle)
      this.vadHandle = null
    }
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    void this.audioCtx?.close().catch(() => undefined)
    this.audioCtx = null
    useStore.getState().setMicLevel(0)
  }

  finishRecording(): void {
    if (this.state !== 'listening') return
    this.setState('transcribing')
    this.recorder?.stop()
  }

  cancelRecording(): void {
    this.cancelled = true
    this.setState('idle')
    this.recorder?.stop()
  }

  private async handleRecordingDone(mime: string): Promise<void> {
    this.teardownCapture()
    if (this.cancelled) return
    const blob = new Blob(this.chunks, { type: mime })
    this.chunks = []
    if (blob.size < 2000 || !this.speechDetected) {
      this.setState('idle')
      return
    }
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const text = await window.hearth.speech.transcribe(bytes, mime.split(';')[0])
      if (!text) {
        this.setState('idle')
        return
      }
      useStore.setState({ liveUser: text })
      this.setState('thinking')
      const answer = await window.hearth.agent.ask(text)
      if (!answer) {
        this.setState('idle')
        return
      }
      const settings = useStore.getState().settings
      if (settings?.assistant.speakReplies) {
        await this.playTts(answer)
        if (useStore.getState().settings?.assistant.continuousConversation) {
          await this.startListening()
          return
        }
      }
      this.setState('idle')
    } catch (err) {
      useStore.setState({ liveError: err instanceof Error ? err.message : String(err) })
      this.setState('idle')
    }
  }

  /** Speak arbitrary text (used for replies and timer announcements). */
  async playTts(text: string): Promise<void> {
    try {
      const bytes = await window.hearth.speech.tts(text)
      await this.playBytes(bytes)
    } catch {
      // TTS failure shouldn't break the interaction — text is on screen.
    }
  }

  private playBytes(bytes: Uint8Array): Promise<void> {
    return new Promise((resolve) => {
      this.stopSpeaking()
      const blob = new Blob([bytes.slice().buffer], { type: 'audio/mpeg' })
      this.ttsUrl = URL.createObjectURL(blob)
      this.ttsAudio = new Audio(this.ttsUrl)
      this.setState('speaking')
      const done = () => {
        this.cleanupTts()
        if (this.state === 'speaking') this.setState('idle')
        resolve()
      }
      this.ttsAudio.onended = done
      this.ttsAudio.onerror = done
      void this.ttsAudio.play().catch(done)
    })
  }

  stopSpeaking(): void {
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
