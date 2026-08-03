import { getSettings } from '../settings'

function apiKey(): string {
  const key = getSettings().openai.apiKey
  if (!key) throw new Error('No OpenAI API key configured. Add one in Settings → Voice.')
  return key
}

/** Speech-to-text via OpenAI. Accepts webm/ogg/wav bytes recorded in the renderer. */
export async function transcribe(bytes: Uint8Array, mime: string): Promise<string> {
  const settings = getSettings()
  const form = new FormData()
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : 'webm'
  form.append('file', new Blob([bytes.buffer as ArrayBuffer], { type: mime }), `speech.${ext}`)
  form.append('model', settings.openai.sttModel)
  form.append('response_format', 'json')

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Transcription failed (HTTP ${res.status}): ${body.slice(0, 300)}`)
  }
  const json = (await res.json()) as { text?: string }
  return (json.text ?? '').trim()
}

/** Text-to-speech via OpenAI. Returns MP3 bytes for playback in the renderer. */
export async function speak(text: string): Promise<Uint8Array> {
  const settings = getSettings()
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.openai.ttsModel,
      voice: settings.openai.ttsVoice,
      input: text.slice(0, 4000),
      response_format: 'mp3',
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Speech synthesis failed (HTTP ${res.status}): ${body.slice(0, 300)}`)
  }
  return new Uint8Array(await res.arrayBuffer())
}
