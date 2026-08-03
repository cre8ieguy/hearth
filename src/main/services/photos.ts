import fs from 'fs'
import path from 'path'
import { net } from 'electron'
import { pathToFileURL } from 'url'
import { getSettings } from '../settings'

const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'])
const MAX_PHOTOS = 800

function toMediaUrl(filePath: string): string {
  return 'media://p/' + Buffer.from(filePath, 'utf8').toString('base64url')
}

function fromMediaUrl(urlPath: string): string {
  return Buffer.from(urlPath, 'base64url').toString('utf8')
}

function walk(dir: string, depth: number, out: string[]): void {
  if (depth < 0 || out.length >= MAX_PHOTOS) return
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= MAX_PHOTOS) return
    if (entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, depth - 1, out)
    else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(full)
  }
}

/** Returns shuffled media:// URLs for every photo under the configured folder. */
export function listPhotos(): string[] {
  const dir = getSettings().screensaver.photosDir
  if (!dir) return []
  const resolved = path.resolve(dir)
  if (!fs.existsSync(resolved)) return []
  const files: string[] = []
  walk(resolved, 3, files)
  // Fisher–Yates shuffle so the slideshow varies between sessions.
  for (let i = files.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[files[i], files[j]] = [files[j], files[i]]
  }
  return files.map(toMediaUrl)
}

/** protocol.handle('media') handler — only serves files inside the photos folder. */
export async function serveMedia(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url)
    const filePath = path.resolve(fromMediaUrl(url.pathname.replace(/^\//, '')))
    const root = path.resolve(getSettings().screensaver.photosDir || '')
    if (!root || !(filePath === root || filePath.startsWith(root + path.sep))) {
      return new Response('Forbidden', { status: 403 })
    }
    return await net.fetch(pathToFileURL(filePath).toString())
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
