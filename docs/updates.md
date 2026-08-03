# Auto-updating the kiosk

Once set up, the loop is: **edit code on the Mac → run one release command → the Windows PC
updates itself.** The kiosk checks GitHub every 2 hours, downloads new versions silently, and
installs them at ~3:30am (or whenever the app next restarts) — it never interrupts the display
mid-use. Settings → About shows update status and has a manual "Check for updates" button.

## One-time setup (~5 minutes)

1. **Create a GitHub repository** named `hearth` under your account.
   **Make it public** — that lets the kiosk download updates with no credentials on the device.
   (The code contains no secrets; your API keys live only in `settings.json` on each device.
   A private repo would force you to embed a GitHub token on the kiosk — not recommended.)

2. **Point this project at it** (replace `YOURNAME` everywhere):

   ```bash
   git remote add origin https://github.com/YOURNAME/hearth.git
   git push -u origin main
   ```

3. **Edit [electron-builder.yml](../electron-builder.yml)** — set `publish.owner` to your GitHub
   username. Commit that change.

4. **Create a GitHub token for publishing releases** (stays on the Mac, never on the kiosk):
   GitHub → Settings → Developer settings → Personal access tokens → *Fine-grained token* →
   select only the `hearth` repo → Repository permissions → **Contents: Read and write**.
   Keep it somewhere safe (e.g. your shell profile as `GH_TOKEN`).

## Releasing an update (every time)

```bash
npm version patch
git push --follow-tags
GH_TOKEN=$(gh auth token) npm run release
```

- `npm version patch` bumps `0.1.0 → 0.1.1`, commits, and tags (use `minor` / `major` when it
  fits). It requires a clean git tree — commit your changes first.
- `git push --follow-tags` must run **before** the release — GitHub refuses to publish a
  (non-draft) release for a tag it doesn't have yet.
- `npm run release` builds the Windows installer and uploads it, plus the `latest.yml` update
  manifest, to the GitHub Release for that tag. (With the GitHub CLI signed in,
  `$(gh auth token)` saves you managing a separate token.)
- That's it. Kiosks pick it up within ~2 hours and install overnight.

## How the kiosk behaves

| Moment | Behavior |
|---|---|
| 30s after launch, then every 2h | Checks the GitHub Releases feed |
| Update found | Downloads in the background (progress in Settings → About) |
| Downloaded | Installs silently at ~3:30am and relaunches — or on the next app restart, whichever is first |
| Dev mode (`npm run dev`) | Updater is fully disabled |

## Notes

- **First install on the PC still happens by hand** (copy `release/Hearth-…-setup.exe` over once).
  Every version after that ships itself.
- The app is unsigned, which is fine for auto-update — electron-updater verifies the download
  against the release manifest. SmartScreen only warns on the very first manual install.
- To test the pipeline: bump the version, release, then on the kiosk press
  **Settings → About → Check for updates** — you should see it download and offer to install
  overnight; restart the app to apply immediately.
