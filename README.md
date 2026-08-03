# Hearth 🔥

A touchscreen smart-home display for a Windows PC — like building your own Echo Show, but with
**Claude Fable 5** as the brain. Talk to it, and it plays your Spotify, manages your Google
Calendar, controls your Home Assistant devices, checks the weather, searches the web, and runs
timers. When idle, it turns into a photo frame or an ambient YouTube screen (aquariums, live cams,
lofi radio).

Built with Electron + React + TypeScript. Developed on macOS, deployed to Windows.

## What it does

- 🎙️ **Voice assistant** — say **"Hey Jarvis"** (on-device wake word, no account needed) or tap
  the orb. Say "Hey Jarvis" mid-answer to **interrupt it**, Alexa-style; "stop" / "never mind"
  just ends the exchange. Streaming responses, optional continuous conversation mode.
- 📖 **Screen content** — ask for a recipe or an article and it puts the full thing **on the
  display** (rendered, scrollable, or a live website) while speaking only a short summary.
- 🧠 **Claude Fable 5 agent** — tool-calling loop with built-in web search, plus automatic
  server-side fallback to Claude Opus 4.8 if a request is declined by safety filters.
- 🎧 **Spotify** — "play some jazz", "skip", "turn it down", "queue up Bohemian Rhapsody". Controls
  the Spotify app on the PC via Spotify Connect (Premium required). Full touch UI too: playlists,
  search, now-playing.
- 📅 **Google Calendar** — "what's on tomorrow?", "add dentist Thursday at 2". Reads all your
  calendars, writes to any of them. Agenda view + quick-add form.
- 🏡 **Home Assistant** — "turn off the living room lights", "set the thermostat to 70", "run the
  movie scene". Works with everything your HA hub controls.
- 🌤️ **Weather** — Open-Meteo, no API key needed.
- ⏱️ **Timers** — chime + on-screen alert + spoken announcement.
- 🌙 **Screensavers** — photo slideshow (Ken Burns, from any local folder) or ambient YouTube
  presets you can edit. Starts on idle; also on demand ("show the aquarium").

## Requirements

| Service | Needed for | Cost |
|---|---|---|
| [Anthropic API key](docs/setup-anthropic.md) | The assistant brain (Claude Fable 5) | Pay-per-use (see doc) |
| [OpenAI API key](docs/setup-openai.md) | Speech-to-text + the assistant's voice | Pennies/day of normal use |
| [Spotify app + Client ID](docs/setup-spotify.md) | Music | Free dev app; **Premium account required** |
| [Google OAuth client](docs/setup-google.md) | Calendar | Free |
| [Home Assistant token](docs/setup-home-assistant.md) | Smart home | Free (needs an HA install) |

The **"Hey Jarvis" wake word needs nothing** — it's built in and on-device
([details](docs/setup-wake-word.md)).

Everything is optional except the two API keys — the app degrades gracefully and its Settings
screen shows what's connected.

## Develop (on the Mac)

```bash
npm install
npm run dev
```

The app opens in a desktop window. Configure everything in **Settings** inside the app. Useful:

```bash
npm run typecheck   # TS check both processes
SHOT_DIR=/tmp/shots npm run dev   # boots, screenshots every view, quits
```

## Build for Windows

```bash
npm run dist:win
```

Cross-compiles from macOS. Output lands in `release/`:

- `Hearth-<version>-x64.exe` — one-click installer (recommended)
- `Hearth-<version>-x64.exe` (portable) — no-install version

Copy the installer to the Windows PC and run it. The binary is unsigned, so SmartScreen will warn
once — click **More info → Run anyway**.

### Updating it later — automatically

You only ever install by hand once. After the one-time GitHub setup in
[docs/updates.md](docs/updates.md), shipping a change from the Mac is:

```bash
npm version patch && git push --follow-tags && GH_TOKEN=$(gh auth token) npm run release
```

The kiosk checks every 2 hours, downloads silently, and installs overnight (~3:30am) or on its
next restart. Status lives in Settings → About.

## Setting up the wall PC (Windows)

1. **Install Hearth** from the installer above and launch it.
2. **Install the Spotify app**, sign in, and set it to start with Windows minimized
   (Spotify → Settings → Startup). Hearth remote-controls it.
3. In Hearth **Settings**: paste your API keys, connect Spotify + Google, add your HA token, set
   your city, pick a photos folder.
4. Turn on **Kiosk mode**, **Launch when the PC starts**, and **Keep the screen awake**
   (Settings → Display & startup).
5. In Windows **Settings → System → Power**: set screen and sleep to **Never**.
6. Optional: Windows **Settings → Personalization → Taskbar** — enable the touch keyboard icon so
   the on-screen keyboard is easy to summon for the one-time setup typing.

`Esc` exits kiosk fullscreen if you ever plug in a keyboard.

## Talking to it

- **Say "Hey Jarvis"** — a soft blip means it's listening. Works from the screensaver too, no
  keys or accounts needed (on by default).
- **Interrupt it** by saying "Hey Jarvis" while it's talking (or tap the orb). Follow with a new
  question, or just "stop" / "never mind" to end it.
- Or **tap the orb** → it listens → stops automatically when you stop talking (or tap again).
- **Continuous conversation** (Settings → Voice): it re-opens the mic after each answer.
- Everything also works by typing in the **Chat** view.
- By default it forgets the conversation after 15 quiet minutes (Settings → Assistant brain) —
  fresh context, lower token bills.

Try: *"What should I wear tomorrow?" · "Play the new Beyoncé album" · "Add soccer practice
Saturday at 9am to the family calendar" · "Turn the kitchen lights blue" · "Set a pasta timer for
11 minutes" · "Who won the game last night?" · "Show the jellyfish cam"*

## Where things are stored

Settings — including API keys and OAuth tokens — live in plain JSON at:

- Windows: `%APPDATA%/hearth/settings.json`
- macOS (dev): `~/Library/Application Support/hearth/settings.json`

They never leave the device except to call the services you configured. Treat that file like a
password.

## Architecture (short version)

```
src/main            Electron main process (all privileged work)
  services/agent.ts    Claude Fable 5 streaming tool-loop (web search, fallbacks, prompt caching)
  services/tools.ts    Tool definitions + dispatch to the services below
  services/spotify.ts  PKCE OAuth + Spotify Connect control
  services/google.ts   OAuth + Google Calendar v3
  services/homeassistant.ts, weather.ts, speech.ts (OpenAI STT/TTS), photos.ts, timers.ts
src/preload         contextBridge API (window.hearth)
src/renderer        React touch UI (dashboard, chat, music, agenda, settings, screensaver)
```

The renderer never touches the network or secrets directly; everything goes through IPC to the
main process. No native Node modules, so the Mac → Windows cross-build stays simple.

## Troubleshooting

- **"No Spotify device is available"** — open the Spotify app on the PC (it must be running and
  signed in to the same Premium account).
- **Google disconnects after a week** — publish your OAuth app to *In production*
  (see [docs/setup-google.md](docs/setup-google.md)).
- **Voice orb does nothing** — both API keys must be set (Settings shows status pills); check
  Windows microphone privacy settings if transcription errors mention the mic.
- **A YouTube preset shows "video unavailable"** — that stream went offline; paste a new URL in
  Settings → Screensaver.
- **Anthropic 400 about data retention** — Claude Fable 5 requires 30-day data retention; if your
  org uses zero-data-retention, switch the model to `claude-opus-5` in Settings.
