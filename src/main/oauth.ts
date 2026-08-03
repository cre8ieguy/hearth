import http from 'http'
import crypto from 'crypto'

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(crypto.randomBytes(48))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

const activeServers = new Map<number, http.Server>()

const DONE_HTML = `<!doctype html><meta charset="utf-8"><title>Hearth</title>
<body style="font-family:system-ui;background:#0b0b12;color:#e8e6ff;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center"><div style="font-size:52px">✓</div>
<h2 style="font-weight:500">Connected to Hearth</h2><p style="opacity:.6">You can close this window and return to the app.</p></div></body>`

/**
 * Start a one-shot loopback server and wait for the OAuth redirect.
 * Resolves with the `code` query param; rejects on `error` or timeout.
 */
export function waitForCode(port: number, pathname: string, timeoutMs = 5 * 60 * 1000): Promise<string> {
  activeServers.get(port)?.close()
  activeServers.delete(port)

  return new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
      if (url.pathname !== pathname) {
        res.writeHead(404).end()
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(DONE_HTML)
      finish(() => {
        const err = url.searchParams.get('error')
        const code = url.searchParams.get('code')
        if (err) reject(new Error(`Authorization failed: ${err}`))
        else if (code) resolve(code)
        else reject(new Error('Authorization response had no code.'))
      })
    })

    const timeout = setTimeout(() => {
      finish(() => reject(new Error('Timed out waiting for authorization (5 minutes).')))
    }, timeoutMs)

    let done = false
    function finish(fn: () => void): void {
      if (done) return
      done = true
      clearTimeout(timeout)
      // Give the response a beat to flush before tearing down.
      setTimeout(() => {
        server.close()
        activeServers.delete(port)
      }, 500)
      fn()
    }

    server.on('error', (err) => finish(() => reject(err)))
    server.listen(port, '127.0.0.1')
    activeServers.set(port, server)
  })
}

export async function postForm(url: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const detail =
      (json.error_description as string) || (json.error as string) || `HTTP ${res.status}`
    throw new Error(`Token request failed: ${detail}`)
  }
  return json
}
