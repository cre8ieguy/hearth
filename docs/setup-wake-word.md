# Wake word — "Hey Jarvis"

Hearth activates hands-free like Alexa/Siri: say **"Hey Jarvis"** and it listens. Saying it while
the assistant is talking **interrupts it** (barge-in) — and if you follow up with just "stop" or
"never mind", it simply goes quiet.

## Zero setup required

As of v0.1.1 the default engine is **openWakeWord** — an open-source, on-device model that ships
inside the app. **No account, no key, no sign-up.** Flip it on under
**Settings → Voice → Wake word** (on by default) and you should see 🟢 *Listening for "Hey Jarvis"*.

Detection runs entirely on the PC (a small neural net over the mic stream); audio only ever
leaves the machine *after* the wake word, when your actual request goes to OpenAI for
transcription.

## Tuning

- **Sensitivity** — raise it if it misses you across the room or over music; lower it if the TV
  false-triggers it. It's a live setting; changes apply in a second or two.
- The built-in engine listens for "Hey Jarvis" specifically. The assistant's *name* (what it calls
  itself) is separate — Settings → Assistant brain.

## Optional: Picovoice Porcupine engine

The Settings panel still offers Porcupine as an alternative engine (slightly stronger detection,
more keyword choices like "Computer"). It requires a Picovoice AccessKey — which, as of mid-2026,
means going through their sales queue rather than instant free signup. If your key ever comes
through, switch **Engine → Picovoice Porcupine** and paste it. Otherwise the built-in engine is
plenty.

## Troubleshooting

- **Status shows a wake-word error** — usually the mic is blocked: check Windows Settings →
  Privacy & security → Microphone.
- **It hears "Jarvis" from the assistant's own voice** — echo cancellation should prevent this;
  if it happens with external speakers turned way up, lower the sensitivity a notch.
- **High CPU on very old hardware** — the detector runs a small model ~12×/second. On anything
  from the last decade it's a few percent of one core; if your kiosk struggles, disable the wake
  word and use tap-to-talk.
