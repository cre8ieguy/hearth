import { app, BrowserWindow, net, powerSaveBlocker, protocol, session } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'
import { getSettings, onSettingsChange } from './settings'
import { registerIpc, serviceStatus } from './ipc'
import { setMainWindow, send } from './window'
import { serveMedia } from './services/photos'
import * as spotify from './services/spotify'
import { startAutoUpdater } from './services/updater'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Ambient YouTube screensavers should start without a user gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

// media:// streams photos from the configured folder; app:// serves the packaged
// renderer (fetch() doesn't work over file://, and the wake-word engine needs to
// fetch its ONNX models and WASM runtime).
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { supportFetchAPI: true, stream: true } },
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
])

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let win: BrowserWindow | null = null
let blockerId: number | null = null

function applyKeepAwake(): void {
  const wanted = getSettings().display.keepAwake
  if (wanted && blockerId === null) {
    blockerId = powerSaveBlocker.start('prevent-display-sleep')
  } else if (!wanted && blockerId !== null) {
    powerSaveBlocker.stop(blockerId)
    blockerId = null
  }
}

function applyLoginItem(): void {
  try {
    app.setLoginItemSettings({ openAtLogin: getSettings().display.launchAtLogin })
  } catch {
    // not supported on this platform/build — ignore
  }
}

function createWindow(): void {
  const settings = getSettings()
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#0a0a10',
    autoHideMenuBar: true,
    kiosk: settings.display.kiosk && !process.env.SHOT_DIR,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      // The assistant can open live websites in a guest <webview> panel.
      webviewTag: true,
    },
  })
  setMainWindow(win)

  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    setMainWindow(null)
    win = null
  })

  // Escape exits kiosk fullscreen (handy on a desk; on the wall there's no keyboard anyway).
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape' && win?.isKiosk()) {
      win.setKiosk(false)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void win.loadURL('app://bundle/index.html')
  }

  if (process.env.SHOT_DIR) scheduleScreenshots(win, process.env.SHOT_DIR)
}

/** Dev aid: SHOT_DIR=/tmp/shots npm run dev captures each view then quits. */
function scheduleScreenshots(target: BrowserWindow, dir: string): void {
  target.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      fs.mkdirSync(dir, { recursive: true })
      for (const view of ['dashboard', 'assistant', 'spotify', 'calendar', 'settings']) {
        send('ui:navigate', view)
        await new Promise((r) => setTimeout(r, 1100))
        try {
          const image = await target.webContents.capturePage()
          fs.writeFileSync(path.join(dir, `${view}.png`), image.toPNG())
        } catch (err) {
          console.error('screenshot failed:', err)
        }
      }
      app.quit()
    }, 3500)
  })
}

app.whenReady().then(() => {
  protocol.handle('media', serveMedia)

  // Serve the built renderer over app:// so fetch()/import() work when packaged.
  const rendererRoot = path.resolve(__dirname, '../renderer')
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
    const file = path.resolve(rendererRoot, rel)
    if (file !== rendererRoot && !file.startsWith(rendererRoot + path.sep)) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(file).toString())
  })

  // YouTube rejects embedded-player requests that carry no HTTP Referer
  // ("error 153"), and Chromium sends none from our app:// origin. Scoped to
  // /embed/ so ordinary YouTube browsing in the web panel is untouched.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        'https://www.youtube.com/embed/*',
        'https://www.youtube-nocookie.com/embed/*',
      ],
    },
    (details, callback) => {
      if (!details.requestHeaders['Referer']) {
        details.requestHeaders['Referer'] = 'https://www.youtube.com/'
      }
      callback({ requestHeaders: details.requestHeaders })
    },
  )

  // The renderer needs the microphone for push-to-talk.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'audioCapture', 'mediaKeySystem', 'fullscreen'].includes(permission))
  })

  registerIpc()
  createWindow()
  applyKeepAwake()
  applyLoginItem()
  spotify.startPolling()
  void startAutoUpdater()

  onSettingsChange((s) => {
    applyKeepAwake()
    applyLoginItem()
    if (win && win.isKiosk() !== s.display.kiosk) win.setKiosk(s.display.kiosk)
  })

  // Let the renderer know initial status once it's ready.
  win?.webContents.once('did-finish-load', () => send('status:changed', serviceStatus()))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})
