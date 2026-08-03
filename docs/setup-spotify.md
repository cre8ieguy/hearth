# Spotify setup

Hearth controls Spotify through the official Web API using **Spotify Connect** — it remote-controls
the Spotify app running on the PC (or any device on your account). This is the reliable, supported
way to do it and gives you full quality playback through the normal Spotify app.

**Requirements:** a **Spotify Premium** account (the API can't start playback on free accounts) and
the free Spotify desktop app installed on the kiosk PC.

## 1. Create a (free) Spotify developer app

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and log in
   with your normal Spotify account.
2. **Create app**:
   - Name: `Hearth`, description: anything.
   - **Redirect URI** — add exactly:
     ```
     http://127.0.0.1:8888/callback/spotify
     ```
   - Under "Which API/SDKs are you planning to use?" tick **Web API**.
3. Save, open the app's page, and copy the **Client ID**. (No client secret needed — Hearth uses
   the PKCE flow.)

## 2. Connect in Hearth

1. Hearth → **Settings → Spotify** → paste the Client ID.
2. Tap **Connect** — your browser opens Spotify's consent page; approve it.
3. Done. The status pill turns green.

## 3. Make sure there's a playback device

Spotify Connect needs a signed-in Spotify app to drive:

- On the kiosk PC: install the Spotify desktop app, sign in, and enable
  **Settings → Startup and window behaviour → Open Spotify automatically… (minimized)**.
- Optionally set that device's name in Hearth → Settings → Spotify → *Preferred playback device*
  so music always targets the kiosk's speakers (otherwise Hearth targets whichever device is
  active, then falls back to the first available one).

## Troubleshooting

- **"No Spotify device is available"** → the Spotify app isn't running/signed in anywhere. Open it.
- **403 errors right after connecting** → in the developer dashboard your app starts in
  *Development mode*, which works for the account that created it. If you connected a *different*
  Spotify account, add that account's email under **User Management** in the dashboard.
- **Playback starts on your phone** → set *Preferred playback device* to the PC's name.
