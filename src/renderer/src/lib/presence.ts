/**
 * Screen power controller: two independent rules decide when the display
 * sleeps, sharing one wake path.
 *
 * - Camera presence (optional): frames downscaled to 64×48 grayscale and
 *   diffed on-device — nothing recorded or uploaded. No person-scale motion
 *   for N minutes → screen off; motion → back on.
 * - Night window (optional): between the configured hours the screen turns
 *   off regardless of motion (so a midnight kitchen run doesn't light the
 *   wall). Touch or "Hey Jarvis" still wakes it, for 10 minutes at a time.
 *   When the window ends, the screen comes back by itself.
 */

const CAM_SAMPLE_MS = 500
const RULE_TICK_MS = 10_000
const NIGHT_WAKE_GRACE_MS = 10 * 60_000 // stay awake this long after a night-time poke
const W = 64
const H = 48
const PIXEL_DELTA = 28 // 0-255 luma change for a pixel to count as "moved"
const MIN_RATIO = 0.015 // below this it's sensor noise
const MAX_RATIO = 0.45 // above this it's a lighting/exposure shift, not a person

export interface ScreenRules {
  camera: boolean
  offAfterMinutes: number
  night: boolean
  nightStartHour: number
  nightEndHour: number
}

type OffReason = 'idle' | 'night' | null

class ScreenController {
  private rules: ScreenRules | null = null
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private prev: Uint8ClampedArray | null = null
  private camTimer: number | null = null
  private ruleTimer: number | null = null
  private lastMotionAt = Date.now()
  private lastPokeAt = Date.now()
  private offReason: OffReason = null

  async configure(rules: ScreenRules): Promise<void> {
    const wasCamera = !!this.rules?.camera
    this.rules = rules

    if (rules.camera && !wasCamera) await this.startCamera()
    if (!rules.camera && wasCamera) this.stopCamera()

    const active = rules.camera || rules.night
    if (active && this.ruleTimer === null) {
      this.lastMotionAt = Date.now()
      this.lastPokeAt = Date.now()
      this.ruleTimer = window.setInterval(() => this.rulesTick(), RULE_TICK_MS)
      window.addEventListener('pointerdown', this.poke)
    }
    if (!active && this.ruleTimer !== null) {
      clearInterval(this.ruleTimer)
      this.ruleTimer = null
      window.removeEventListener('pointerdown', this.poke)
      if (this.offReason !== null) this.setPower(true)
    }
  }

  /** External presence signal — touch or wake word means someone is here. */
  poke = (): void => {
    this.lastPokeAt = Date.now()
    this.lastMotionAt = Date.now()
    if (this.offReason !== null) this.setPower(true)
  }

  private setPower(on: boolean, reason: OffReason = null): void {
    this.offReason = on ? null : reason
    void window.hearth.screen.setPower(on)
  }

  private inNightWindow(): boolean {
    if (!this.rules?.night) return false
    const h = new Date().getHours()
    const { nightStartHour: a, nightEndHour: b } = this.rules
    if (a === b) return false
    return a < b ? h >= a && h < b : h >= a || h < b
  }

  private rulesTick(): void {
    if (!this.rules) return
    const now = Date.now()
    const night = this.inNightWindow()
    if (this.offReason === null) {
      if (night && now - this.lastPokeAt > NIGHT_WAKE_GRACE_MS) {
        this.setPower(false, 'night')
      } else if (
        !night &&
        this.rules.camera &&
        now - this.lastMotionAt > this.rules.offAfterMinutes * 60_000
      ) {
        this.setPower(false, 'idle')
      }
    } else if (this.offReason === 'night' && !night) {
      this.setPower(true) // morning: the window ended, wake up
    } else if (this.offReason === 'idle' && night) {
      this.offReason = 'night' // idle-off rolled into the night window
    }
  }

  private async startCamera(): Promise<void> {
    if (this.camTimer !== null) return
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, frameRate: 4 },
      })
    } catch (err) {
      console.error('presence: camera unavailable', err)
      return
    }
    this.video = document.createElement('video')
    this.video.srcObject = this.stream
    this.video.muted = true
    await this.video.play().catch(() => undefined)
    this.canvas = document.createElement('canvas')
    this.canvas.width = W
    this.canvas.height = H
    this.lastMotionAt = Date.now()
    this.camTimer = window.setInterval(() => this.camTick(), CAM_SAMPLE_MS)
  }

  private stopCamera(): void {
    if (this.camTimer !== null) clearInterval(this.camTimer)
    this.camTimer = null
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.video = null
    this.canvas = null
    this.prev = null
    if (this.offReason === 'idle') this.setPower(true)
  }

  private camTick(): void {
    if (!this.video || !this.canvas || this.video.readyState < 2) return
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.drawImage(this.video, 0, 0, W, H)
    const rgba = ctx.getImageData(0, 0, W, H).data
    const gray = new Uint8ClampedArray(W * H)
    for (let i = 0; i < gray.length; i++) {
      gray[i] = (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3
    }
    if (this.prev) {
      let changed = 0
      for (let i = 0; i < gray.length; i++) {
        if (Math.abs(gray[i] - this.prev[i]) > PIXEL_DELTA) changed++
      }
      const ratio = changed / gray.length
      if (ratio > MIN_RATIO && ratio < MAX_RATIO) {
        this.lastMotionAt = Date.now()
        // Motion wakes an idle-off screen; a night-off screen needs touch or
        // the wake word, so passers-by don't light the wall at 3am.
        if (this.offReason === 'idle' && !this.inNightWindow()) this.setPower(true)
      }
    }
    this.prev = gray
  }
}

export const presence = new ScreenController()
