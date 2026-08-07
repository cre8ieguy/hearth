# Hearth (WindowsApp)

Electron smart-display/voice-assistant kiosk for a Windows touchscreen PC, developed on macOS.

**Before doing anything else, read [HANDOVER.md](HANDOVER.md)** — it carries the full project
state, architecture, release workflow, hard-won installer/voice gotchas, and the open bugs from
the original build sessions.

Quick facts:
- Dev: `npm run dev` · Check: `npm run typecheck`
- Release: `npm version patch && git push --follow-tags && npm run release`
  (publishes via gh CLI + scripts/publish-release.mjs — never electron-builder's own publisher)
- Repo: github.com/cre8ieguy/hearth · Kiosks auto-update from GitHub Releases; `latest.yml` is
  the load-bearing asset
- No native Node modules; runtime deps live in devDependencies (bundled)
- Never advise running the Windows installer elevated (see HANDOVER.md → installer saga)
