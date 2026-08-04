import { app } from 'electron'
import { send } from '../window'

/**
 * Kiosk auto-update via electron-updater + GitHub Releases.
 *
 * Flow: checks shortly after launch and every 2 hours; downloads silently;
 * installs either at ~3:30am (quiet hours for a wall display) or on the next
 * restart, whichever comes first. Only active in the packaged app —
 * `npm run dev` never tries to update.
 */

let started = false
let installTimer: NodeJS.Timeout | null = null
let lastStatus = 'Auto-update runs in the installed app.'
let downloadedVersion: string | null = null

function status(message: string): void {
  lastStatus = message
  send('updater:status', message)
}

export function getUpdateStatus(): string {
  return lastStatus
}

async function updater() {
  const { autoUpdater } = await import('electron-updater')
  return autoUpdater
}

export async function startAutoUpdater(): Promise<void> {
  if (started || !app.isPackaged) return
  started = true
  try {
    const auto = await updater()
    auto.autoDownload = true
    auto.autoInstallOnAppQuit = true

    auto.on('checking-for-update', () => status('Checking for updates…'))
    auto.on('update-not-available', () => status(`Up to date (v${app.getVersion()})`))
    auto.on('download-progress', (p) => status(`Downloading update… ${Math.round(p.percent)}%`))
    auto.on('error', (err) =>
      status(`Update check failed: ${(err?.message ?? String(err)).slice(0, 140)}`),
    )
    auto.on('update-downloaded', (info) => {
      downloadedVersion = info.version
      status(`v${info.version} ready — use "Install now", or it installs overnight`)
      scheduleQuietInstall()
    })

    const check = (): void => {
      void auto.checkForUpdates().catch(() => undefined)
    }
    setTimeout(check, 30_000)
    setInterval(check, 2 * 60 * 60 * 1000)
    status(`Up to date (v${app.getVersion()}) — auto-update armed`)
  } catch (err) {
    status(`Auto-update unavailable: ${err instanceof Error ? err.message : String(err)}`)
  }
}

/** Install at ~3:30am local time so the kiosk never restarts mid-use. */
function scheduleQuietInstall(): void {
  if (installTimer) return
  const now = new Date()
  const target = new Date(now)
  target.setHours(3, 30, 0, 0)
  if (target <= now) target.setDate(target.getDate() + 1)
  installTimer = setTimeout(
    () => {
      void updater().then((auto) => auto.quitAndInstall(true, true))
    },
    target.getTime() - now.getTime(),
  )
}

export function isUpdateReady(): boolean {
  return downloadedVersion !== null
}

/** "Install now" from Settings — quits, installs silently, relaunches. */
export async function installUpdateNow(): Promise<void> {
  if (!app.isPackaged || !downloadedVersion) return
  const auto = await updater()
  status(`Installing v${downloadedVersion}…`)
  // Let the IPC response flush before the app quits out from under it.
  setTimeout(() => auto.quitAndInstall(true, true), 300)
}

/** Manual "Check for updates" from Settings. */
export async function checkForUpdatesNow(): Promise<string> {
  if (!app.isPackaged) {
    status('Auto-update only runs in the installed app (not in dev).')
    return lastStatus
  }
  try {
    const auto = await updater()
    await auto.checkForUpdates()
  } catch (err) {
    status(`Update check failed: ${err instanceof Error ? err.message : String(err)}`)
  }
  return lastStatus
}
