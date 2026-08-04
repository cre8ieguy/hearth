/**
 * openWakeWord "Hey Jarvis" detection — fully on-device, no account needed.
 *
 * Pipeline (verified against the shipped models in scripts/verify-oww.mjs):
 *   16 kHz mono audio, 1280-sample chunks (80 ms)
 *     → melspectrogram.onnx  [1,1280] → [1,1,5,32]   (5 mel frames / chunk, then x/10+2)
 *     → embedding_model.onnx [1,76,32,1] → 96-dim    (every 8 new mel frames)
 *     → hey_jarvis_v0.1.onnx [1,16,96] → sigmoid score
 */

const CHUNK = 1280
const MEL_WINDOW = 76
const MEL_STRIDE = 8
const EMB_WINDOW = 16
const REFRACTORY_MS = 2500

type Ort = typeof import('onnxruntime-web')

export class OpenWakeWordEngine {
  private ort!: Ort
  private mel!: import('onnxruntime-web').InferenceSession
  private emb!: import('onnxruntime-web').InferenceSession
  private cls!: import('onnxruntime-web').InferenceSession

  private audioCtx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: AudioWorkletNode | null = null

  private sampleBuf = new Float32Array(CHUNK)
  private sampleLen = 0
  private melFrames: Float32Array[] = []
  private newMelFrames = 0
  private embeddings: Float32Array[] = []
  private lastFireAt = 0
  private disposed = false
  private busy = false
  private queue: Float32Array[] = []

  // Rolling pre-roll so speech that overlaps the wake word isn't lost, plus
  // a capture tap that lets the voice controller record from this already-open
  // mic instead of paying getUserMedia latency on every wake.
  private preRoll: Float32Array[] = []
  private capture: { chunks: Float32Array[]; onChunk: (rms: number) => void } | null = null

  private constructor(
    private threshold: number,
    private onDetect: () => void,
  ) {}

  static async create(threshold: number, onDetect: () => void): Promise<OpenWakeWordEngine> {
    const engine = new OpenWakeWordEngine(threshold, onDetect)
    await engine.init()
    return engine
  }

  private async init(): Promise<void> {
    const ort = await import('onnxruntime-web')
    this.ort = ort
    ort.env.wasm.numThreads = 1
    ort.env.wasm.wasmPaths = new URL('ort/', window.location.href).toString()

    const load = async (name: string) => {
      const res = await fetch(`oww/${name}`)
      if (!res.ok) throw new Error(`Failed to load ${name} (HTTP ${res.status})`)
      return ort.InferenceSession.create(await res.arrayBuffer())
    }
    ;[this.mel, this.emb, this.cls] = await Promise.all([
      load('melspectrogram.onnx'),
      load('embedding_model.onnx'),
      load('hey_jarvis_v0.1.onnx'),
    ])

    // 16 kHz context + worklet capture (echo-cancelled so TTS doesn't self-trigger).
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    })
    this.audioCtx = new AudioContext({ sampleRate: 16000 })
    await this.audioCtx.audioWorklet.addModule('oww/capture.worklet.js')
    const source = this.audioCtx.createMediaStreamSource(this.stream)
    this.node = new AudioWorkletNode(this.audioCtx, 'capture-processor')
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.ingest(e.data)
    source.connect(this.node)
  }

  setThreshold(threshold: number): void {
    this.threshold = threshold
  }

  private ingest(samples: Float32Array): void {
    if (this.disposed) return
    let offset = 0
    while (offset < samples.length) {
      const take = Math.min(CHUNK - this.sampleLen, samples.length - offset)
      this.sampleBuf.set(samples.subarray(offset, offset + take), this.sampleLen)
      this.sampleLen += take
      offset += take
      if (this.sampleLen === CHUNK) {
        const chunk = this.sampleBuf.slice()
        this.sampleLen = 0

        this.preRoll.push(chunk)
        if (this.preRoll.length > 12) this.preRoll.shift() // ~1s of context

        if (this.capture) {
          this.capture.chunks.push(chunk)
          let sum = 0
          for (let i = 0; i < chunk.length; i++) sum += chunk[i] * chunk[i]
          this.capture.onChunk(Math.sqrt(sum / chunk.length))
        }

        this.queue.push(chunk)
        if (this.queue.length > 25) this.queue.splice(0, this.queue.length - 25)
        void this.drain()
      }
    }
  }

  private async drain(): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      while (this.queue.length > 0 && !this.disposed) {
        const chunk = this.queue.shift()!
        await this.processChunk(chunk)
      }
    } catch (err) {
      console.error('openWakeWord inference error:', err)
    } finally {
      this.busy = false
    }
  }

  private async processChunk(chunk: Float32Array): Promise<void> {
    const { Tensor } = this.ort
    const melOut = await this.mel.run({
      [this.mel.inputNames[0]]: new Tensor('float32', chunk, [1, CHUNK]),
    })
    const t = melOut[this.mel.outputNames[0]]
    const dims = t.dims
    const frames = dims[dims.length - 2]
    const data = t.data as Float32Array
    for (let f = 0; f < frames; f++) {
      const row = new Float32Array(32)
      for (let b = 0; b < 32; b++) row[b] = data[f * 32 + b] / 10 + 2
      this.melFrames.push(row)
      this.newMelFrames++
    }
    if (this.melFrames.length > 200) this.melFrames.splice(0, this.melFrames.length - 200)

    while (this.newMelFrames >= MEL_STRIDE && this.melFrames.length >= MEL_WINDOW) {
      this.newMelFrames -= MEL_STRIDE
      const window = this.melFrames.slice(-MEL_WINDOW)
      const embIn = new Float32Array(MEL_WINDOW * 32)
      window.forEach((row, i) => embIn.set(row, i * 32))
      const embOut = await this.emb.run({
        [this.emb.inputNames[0]]: new Tensor('float32', embIn, [1, MEL_WINDOW, 32, 1]),
      })
      const embedding = (embOut[this.emb.outputNames[0]].data as Float32Array).slice()
      this.embeddings.push(embedding)
      if (this.embeddings.length > EMB_WINDOW) this.embeddings.shift()
      if (this.embeddings.length === EMB_WINDOW) await this.classify()
    }
  }

  private async classify(): Promise<void> {
    const { Tensor } = this.ort
    const embSize = this.embeddings[0].length
    const clsIn = new Float32Array(EMB_WINDOW * embSize)
    this.embeddings.forEach((e, i) => clsIn.set(e, i * embSize))
    const out = await this.cls.run({
      [this.cls.inputNames[0]]: new Tensor('float32', clsIn, [1, EMB_WINDOW, embSize]),
    })
    const score = (out[this.cls.outputNames[0]].data as Float32Array)[0]
    if (score > this.threshold && Date.now() - this.lastFireAt > REFRACTORY_MS) {
      this.lastFireAt = Date.now()
      this.embeddings = [] // reset so it doesn't re-fire on the tail of the phrase
      this.onDetect()
    }
  }

  /** Record from the engine's open mic. Seeds with pre-roll so speech that
   *  started during/right after the wake word is included. */
  startPcmCapture(preRollMs: number, onChunk: (rms: number) => void): void {
    const preChunks = Math.min(this.preRoll.length, Math.round(preRollMs / 80))
    this.capture = { chunks: this.preRoll.slice(this.preRoll.length - preChunks), onChunk }
  }

  /** Stop recording and return all captured 16 kHz mono chunks. */
  stopPcmCapture(): Float32Array[] {
    const chunks = this.capture?.chunks ?? []
    this.capture = null
    return chunks
  }

  isAlive(): boolean {
    return !this.disposed && this.audioCtx !== null
  }

  dispose(): void {
    this.disposed = true
    this.capture = null
    this.node?.port.close()
    this.node?.disconnect()
    this.stream?.getTracks().forEach((track) => track.stop())
    void this.audioCtx?.close().catch(() => undefined)
    this.audioCtx = null
    this.stream = null
    this.node = null
  }
}
