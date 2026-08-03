// AudioWorklet that forwards raw 16 kHz mono samples to the main thread.
// Registered by lib/oww.ts; kept as a plain served file so CSP stays strict.
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0]
    if (channel && channel.length > 0) {
      // Copy — the underlying buffer is reused by the audio thread.
      this.port.postMessage(new Float32Array(channel))
    }
    return true
  }
}
registerProcessor('capture-processor', CaptureProcessor)
