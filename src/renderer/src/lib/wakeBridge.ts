// Tiny registry so voice.ts can reach the live wake engine's microphone
// without a circular import (wake.ts ↔ voice.ts).
import type { OpenWakeWordEngine } from './oww'

let active: OpenWakeWordEngine | null = null

export function setActiveWakeEngine(engine: OpenWakeWordEngine | null): void {
  active = engine
}

export function getActiveWakeEngine(): OpenWakeWordEngine | null {
  return active
}
