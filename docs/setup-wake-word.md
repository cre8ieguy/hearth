# Wake word — "Hey Jarvis"

Hearth supports hands-free activation like Alexa/Siri: say **"Hey Jarvis"** (or just "Jarvis") and
it starts listening — no tapping needed.

It uses [Picovoice Porcupine](https://picovoice.ai/platform/porcupine/), which runs **entirely
on-device** inside the app. The microphone audio for wake-word detection never leaves the PC;
audio is only sent to OpenAI for transcription *after* the wake word (or a tap) starts a request.

## Setup (2 minutes)

1. Go to [console.picovoice.ai](https://console.picovoice.ai) and sign up — the **free plan is
   fine for personal use**.
2. Copy your **AccessKey** from the console home page.
3. Hearth → **Settings → Voice → Wake word**:
   - Paste the AccessKey
   - Flip the toggle on
   - You should see 🟢 *Listening for "Jarvis"*

Say **"Hey Jarvis"** → soft blip → it's listening. It also wakes the screen out of the
screensaver.

## Options

- **Wake word** — "Jarvis" is the default; "Computer" (very Star Trek), "Bumblebee", "Porcupine"
  and others are available. (We deliberately don't offer "Alexa"/"Hey Siri" so you don't trigger
  real devices — and vice versa.)
- **Sensitivity** — raise it if it misses you across the room, lower it if it false-triggers from
  the TV.
- The assistant's *name* (what it calls itself) is separate — set it to match under
  Settings → Assistant brain. The default is Jarvis for both.

## Behavior details

- The wake word only triggers when the assistant is idle — it won't interrupt itself while
  listening, thinking, or speaking (tap the orb to barge in instead).
- While music plays from the same PC's speakers, detection still works but you may need to speak
  up or raise sensitivity.
- If you see *"Wake word error: … model version mismatch"* after a future update, re-download
  `porcupine_params.pv` from the matching version of the Porcupine GitHub repo into
  `src/renderer/public/` and rebuild.
