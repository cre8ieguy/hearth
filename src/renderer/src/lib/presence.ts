/**
 * Camera presence detection: turns the display off when nobody has moved for
 * a while, back on the moment motion returns. Frames are downscaled to 64×48
 * grayscale and diffed entirely on-device — nothing is recorded or uploaded.
 */

const SAMPLE_MS = 500
const W = 64
const H = 48
const PIXEL_DELTA = 28 // 0-255 luma change for a pixel to count as "moved"
const MIN_RATIO = 0.015 // below this it's sensor noise
const MAX_RATIO = 0.45 // above this it's a lighting/exposure shift, not a person

class PresenceMonitor {
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private prev: Uint8ClampedArray | null = null
  private timer: number | null = null
  private lastMotionAt = Date.now()
  private screenOff = false
  private offAfterMs = 10 * 60_000

  async start(offAfterMinutes: number): Promise<void> {
    this.offAfterMs = Math.max(1, offAfterMinutes) * 60_000
    if (this.timer !== null) return // running — only the timeout changed
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
    this.timer = window.setInterval(() => this.tick(), SAMPLE_MS)
    window.addEventListener('pointerdown', this.poke)
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    window.removeEventListener('pointerdown', this.poke)
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.video = null
    this.canvas = null
    this.prev = null
    if (this.screenOff) this.setPower(true)
  }

  /** External presence signal — touch or wake word means someone is here. */
  poke = (): void => {
    this.lastMotionAt = Date.now()
    if (this.screenOff) this.setPower(true)
  }

  private setPower(on: boolean): void {
    this.screenOff = !on
    void window.hearth.screen.setPower(on)
  }

  private tick(): void {
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
        if (this.screenOff) this.setPower(true)
      }
    }
    this.prev = gray
    if (!this.screenOff && Date.now() - this.lastMotionAt > this.offAfterMs) {
      this.setPower(false)
    }
  }
}

export const presence = new PresenceMonitor()
