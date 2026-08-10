# Hearth — Session Handover

*Written 2026-08-04 at the end of the original build sessions. Read this first: it replaces the
assistant memory from the previous Claude account, which does not transfer.*

## What this project is

**Hearth** is an Echo-Show-style smart display for a wall-mounted Windows touchscreen PC, built
for Ben Porter (ben@cre8ive.biz, GitHub **cre8ieguy**). Developed on Ben's Mac, packaged for
Windows, auto-updates from GitHub Releases. The user talks to it ("**Hey Jarvis…**"), and a
Claude agent plays Spotify, manages Google Calendar, controls Home Assistant, checks weather,
searches the web, runs timers, shows recipes/websites on screen, and runs photo/YouTube
screensavers.

- Repo: https://github.com/cre8ieguy/hearth (public — required so kiosks fetch updates keyless)
- Releases/installers: https://github.com/cre8ieguy/hearth/releases/latest
- **Current version: v0.1.13**, published (2026-08-08). The 0.1.8 clean reinstall worked;
  in-place updates confirmed installing on the kiosk.

## Stack & architecture

Electron 37 + electron-vite 3 + React 18 + Tailwind 4 + zustand. TypeScript throughout.
**Rule: no native Node modules** (keeps Mac→Windows cross-packaging clean). All runtime deps are
devDependencies (electron-vite bundles them; `dependencies` stays `{}` so the asar is lean).

```
src/main/                 Electron main (all privileged work)
  services/agent.ts       Claude agent loop (see "Agent" below)
  services/tools.ts       15+ tool definitions + dispatch
  services/spotify.ts     PKCE OAuth (loopback :8888) + Spotify Connect control
  services/google.ts      OAuth (loopback :8889) + Calendar v3 (multi-calendar)
  services/homeassistant.ts  REST via URL + long-lived token
  services/weather.ts     Open-Meteo (keyless), 10-min cache
  services/speech.ts      OpenAI STT (gpt-4o-transcribe) + TTS (gpt-4o-mini-tts)
  services/photos.ts      media:// protocol serving a local photos folder
  services/timers.ts      Countdown timers -> renderer chime/banner
  services/updater.ts     electron-updater: check 2h, silent download, install ~3:30am
                          or via Settings "Install now"; hardQuitAndInstall destroys windows first
  settings.ts             JSON at userData/settings.json (plaintext incl. tokens)
  ipc.ts / window.ts / oauth.ts / index.ts
src/preload/index.ts      contextBridge -> window.hearth (typed in index.d.ts)
src/renderer/src/
  lib/voice.ts            THE voice pipeline (see "Voice" below)
  lib/oww.ts              openWakeWord engine (ONNX in renderer, "Hey Jarvis")
  lib/wake.ts             engine lifecycle; lib/wakeBridge.ts avoids import cycle
  store.ts                zustand store + IPC event wiring
  views/                  Dashboard, AssistantView, SpotifyView, CalendarView, SettingsView
  components/             VoiceOrb, AssistantOverlay, ContentPanel, Screensaver, NowPlayingBar…
src/renderer/public/oww/  wake-word ONNX models + capture.worklet.js (committed)
src/renderer/public/ort/  onnxruntime-web WASM (GITIGNORED — scripts/copy-ort.mjs copies it,
                          runs automatically inside `npm run dev` / `npm run build`)
build/installer.nsh       NSIS hooks (critical — see "Installer saga")
scripts/publish-release.mjs  Deterministic GitHub publisher (replaces electron-builder's)
scripts/verify-oww.mjs    Offline shape-check of the wake-word ONNX pipeline
docs/                     Per-service setup guides + updates.md
```

## The agent (main/services/agent.ts)

- Model from settings, default `claude-fable-5` (dropdown offers opus-5 / sonnet-5 / haiku-4-5).
  Per-model guards: `output_config.effort` omitted for haiku; server-side refusal fallbacks
  (`betas: ['server-side-fallback-2026-06-01']`, `fallbacks: [{model:'claude-opus-4-8'}]`) only
  for fable. **No `thinking` param ever** (always-on for Fable).
- `client.beta.messages.stream` with manual tool loop (max 8 rounds), streaming text deltas to
  the renderer as `agent:event`.
- Web search: server tool `{type:'web_search_20260209', name:'web_search', max_uses:3}`.
  **CRITICAL:** its dynamic filtering opens a code-execution container; every follow-up request
  in the same turn must pass `container: <response.container.id>` or the API 400s
  ("container_id is required when there are pending tool uses"). Handled — don't regress it.
- Prompt caching: stable system block with `cache_control`, volatile context injected in each
  user turn's content, rolling `cache_control` breakpoint on the newest message.
- Cost controls: history trimmed (soft 30 / keep 20, cut only at real user turns), idle context
  reset after `assistant.resetAfterMinutes` (default 15), `pause_turn` and `refusal` handled.
- System prompt forbids reading long content aloud → `show_content` tool puts full markdown on
  screen, spoken reply stays to 1–2 sentences.

## Voice pipeline (renderer/lib/voice.ts — most debugged file, tread carefully)

- **Wake word:** openWakeWord "Hey Jarvis" — 3 ONNX models chained (mel [1,1280]→[1,1,5,32] with
  x/10+2 transform; embedding [1,76,32,1]→96-dim every 8 mel frames; classifier [1,16,96]→score).
  Runs in renderer via onnxruntime-web WASM (single-thread; CSP needs `'wasm-unsafe-eval'`).
  No account needed (Picovoice gated free signups — Porcupine remains a settings option if Ben's
  AccessKey ever arrives).
- **Instant capture:** the wake engine's 16kHz mic stays open; on detection, recording taps that
  same stream with ~640ms pre-roll, so speech overlapping the wake word is captured (no pause
  needed). Audio is WAV-encoded in the renderer → OpenAI STT. Wake-word tail is stripped from
  transcripts. MediaRecorder path remains as fallback when no engine is running.
- **Barge-in:** wake detection during speaking/thinking interrupts (stops TTS queue, cancels
  agent) and listens. Bare stop-phrases ("stop", "never mind") end the exchange without an API call.
- **Streaming TTS:** sentences are synthesized as they stream (serial, one-ahead prefetch) and
  played back-to-back — speech starts ~1s after the first sentence. All requests have hard
  timeouts, playback has a watchdog, a 45s post-turn failsafe recovers the orb, and failures set
  a visible on-screen error. **Never let this pipeline await anything unbounded.**

## Build / release workflow

```bash
npm run dev          # dev on the Mac (SHOT_DIR=/tmp/shots npm run dev → screenshots each view, quits)
npm run typecheck
# Ship a release (ORDER MATTERS — tag must be on GitHub before publishing):
npm version patch && git push --follow-tags && npm run release
```

- `npm run release` = build + `scripts/publish-release.mjs` (uses the **gh CLI**, which is authed
  on Ben's Mac — no GH_TOKEN). It creates the release, uploads all 4 assets, verifies them, and
  checks latest.yml freshness. **Do NOT use electron-builder's own publisher** — it double-creates
  the release with two Windows targets and half-uploads (bit v0.1.1 and v0.1.2).
- `latest.yml` is the load-bearing asset — a release without it is invisible to kiosks.
- Kiosks check every 2h, download silently, install ~3:30am / next restart / "Install now" button.

## The installer saga (hard-won — do not re-learn this)

Symptoms seen on the kiosk: "Failed to uninstall old application files.: 2" and "Hearth cannot
be closed". Fixes layered into `build/installer.nsh`:
1. customInit taskkills Hearth.exe, then **retries until the old exe is provably deletable**
   (AV/indexer hold locks briefly after process death).
2. customInit then **deletes the old uninstaller**, so electron-builder skips the fragile
   uninstall-old step entirely and overwrites in place (equivalent to Ben's manual folder-delete fix).
- **Root cause of the recurring failure:** an installer once run from an **elevated** terminal
  created admin-owned files that per-user auto-updates couldn't delete. **RULE: never advise
  running the installer elevated.** Elevation is fine for taskkill/rmdir during recovery; the
  install itself must be a normal Explorer double-click.
- Recovery one-liner if ever needed again: elevated `taskkill /f /im Hearth.exe /t` +
  `rmdir /s /q "%LocalAppData%\Programs\hearth"`, then non-elevated reinstall. Settings survive
  (they live in `%APPDATA%\hearth`, a different folder).
- The kiosk had **Smart App Control** blocking the unsigned exe → Ben turned it off (one-way
  switch). If Hearth ever spreads to more machines, wire code signing (Azure Trusted Signing
  ~US$10/mo) into electron-builder.

## Other gotchas encoded in the code

- `"type":"module"` → electron-vite emits the preload as **index.mjs**; main must load that exact
  path (a `.js` path fails silently → blank renderer).
- Packaged renderer is served over a custom **app:// protocol** (main/index.ts) because `fetch()`
  doesn't work on file:// — the wake engine needs to fetch its ONNX/WASM. Don't switch back to
  `loadFile`.
- The web content panel is an Electron `<webview>` (webviewTag enabled): separate persistent
  Chromium profile; **cannot** share desktop Chrome's cookies (app-bound encryption). It presents
  a plain-Chrome UA (Google logins reject "embedded" UAs) and has an "Open in Chrome ↗" button
  (shell.openExternal, http/https only).
- YouTube screensaver embeds (learned the hard way, verified by experiment):
  1. Requests from the app:// origin carry no Referer → YouTube error 153. main/index.ts injects
     one for /embed/ URLs only.
  2. The referer must be a *third-party* site — `https://www.youtube.com/` itself gets rejected
     with error 152-4 ("video unavailable").
  3. **Live streams cannot be embedded at all** — they fail ("live stream recording is not
     available") from any origin, even plain Chromium on localhost. YouTube-side restriction;
     no referer fixes it. Presets must be regular uploads (settings.ts migrates the two old
     live-radio default presets on load). Embedded players do show YouTube pre-roll ads.
- Subscriptions: Claude Pro/Max and ChatGPT plans **cannot** power the app — API keys only.
  Consumer OAuth is blocked server-side for third-party use; don't chase it. Ben chose to keep
  all-OpenAI voice after being offered free Edge-TTS/local-Whisper — don't re-propose unless
  cost becomes a complaint. Cost levers: model dropdown (Opus 5 = half of Fable; recommended),
  spend caps in both consoles.

## What changed after handover (sessions of 2026-08-07/08, v0.1.9 → v0.1.13)

- **Installer saga resolved:** 0.1.8 clean reinstall worked; subsequent versions install
  in place on the kiosk. "Install now" + the 3:30am install now run the NSIS installer
  **non-silent** (0.1.11+) because silent + force-run-after never relaunches the app
  (years-old electron-updater bug) — the visible one-click path always relaunches.
- **Voice:** new Settings → Voice "Speaking speed" (playbackRate, default 1.2×). Wake
  capture pre-roll 640ms → ~1.5s so no pause is needed after "Hey Jarvis"; transcript
  strip regex broadened for garbled wake-word fragments.
- **YouTube screensaver:** referer injection + live-stream findings (see gotchas above);
  default presets replaced with verified non-live uploads, saved live presets migrate.
- **Screensaver:** plays videos (muted, 2-min cap, skip-on-error); 5000-item cap (Ben has
  ~2,240 favourites); photos that don't fit the screen pan across instead of cropping;
  new **mix mode** alternates photos/YouTube presets (mixMinutes, default 15).
- **Photos pipeline (docs/setup-icloud-photos.md):** nightly iPhone Shortcut exports
  Favourites as JPEG (videos optional via Encode Media) to iCloud Drive, incrementally
  (skips already-exported names); iCloud for Windows mirrors to the kiosk. Ben was
  mid-setup: first big export + 3am automation still to finish.

## OPEN THREADS

1. **TTS hang (from original handover, unconfirmed either way):** if "Voice request timed
   out" appears repeatedly on the kiosk, prime suspect is Malwarebytes Web Protection
   stalling streamed binary responses → test with Web Protection off, then add an exclusion
   for `%LocalAppData%\Programs\hearth\Hearth.exe`. No report since 0.1.9; may be moot.
2. **Updater relaunch — watchdog approach (0.1.18), verification pending:** every
   electron-updater mechanism failed on the kiosk (silent --force-run; non-silent
   run-after; removing the pre-destroy of windows that forced the install-on-quit
   fallback). 0.1.18 spawns a detached PowerShell watchdog before quitAndInstall that
   waits for Hearth + installer processes to exit, then starts Hearth.exe if the
   installer didn't (single-instance lock guards double-start). Verify on the first
   update *from* ≥0.1.18 — remember the one-version lag: an update is installed by the
   code of the version being *left*.
3. **iCloud favourites pipeline:** Ben finishing the first big Shortcut export (needs
   Auto-Lock off + "Always Allow" prompts) and the 3am automation, then pointing Hearth
   at `iCloudDrive\Shortcuts\Hearth Photos` on the kiosk.
4. Untested on real hardware: wake-word accuracy across the room (sensitivity setting),
   continuous-conversation mode, Home Assistant + Spotify + Calendar flows end-to-end
   (connected and working per Ben, but lightly exercised).

## Deferred ideas

librespot as a dedicated Spotify Connect device · persistent timers across restarts · custom app
icon (still default Electron) · code signing · sentence-level TTS is done, but a local-TTS
fallback (Edge TTS) could remove the OpenAI dependency if the hang proves environmental.

## How Ben works (context for the assistant)

Ben tests on the real kiosk quickly and reports with phone photos of the screen — they've been
the primary debugging instrument and they're excellent. Voice-dictated messages (expect typos:
"thou"="though"). Prefers being asked concrete option questions over open-ended ones. Cost-aware
but happy to pay for quality (kept Fable 5 + OpenAI voice). Ship fixes as releases immediately —
the auto-update pipeline is the delivery mechanism and Ben expects it.
