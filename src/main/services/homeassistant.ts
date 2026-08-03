import { getSettings } from '../settings'
import type { HaEntity } from '@shared/types'

// Domains worth exposing to the assistant by default. Sensors are only
// included when the user searches for them explicitly (there are hundreds).
const CONTROL_DOMAINS = new Set([
  'light',
  'switch',
  'scene',
  'script',
  'climate',
  'media_player',
  'cover',
  'fan',
  'lock',
  'vacuum',
  'humidifier',
  'input_boolean',
  'automation',
])

function config(): { base: string; token: string } {
  const { url, token } = getSettings().homeAssistant
  if (!url || !token) {
    throw new Error('Home Assistant is not configured. Add its URL and token in Settings → Smart home.')
  }
  return { base: url.replace(/\/+$/, ''), token }
}

export function isConfigured(): boolean {
  const { url, token } = getSettings().homeAssistant
  return !!url && !!token
}

async function api<T = unknown>(method: string, apiPath: string, body?: unknown): Promise<T> {
  const { base, token } = config()
  const res = await fetch(`${base}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Home Assistant error (HTTP ${res.status}): ${text.slice(0, 200)}`)
  }
  return (await res.json().catch(() => ({}))) as T
}

export async function test(): Promise<string> {
  const json = await api<{ message?: string }>('GET', '/api/')
  return json.message ?? 'OK'
}

interface RawState {
  entity_id: string
  state: string
  attributes: { friendly_name?: string }
}

export async function listEntities(search?: string, domain?: string): Promise<HaEntity[]> {
  const states = await api<RawState[]>('GET', '/api/states')
  const q = search?.trim().toLowerCase()
  return states
    .map((s) => ({
      entityId: s.entity_id,
      name: s.attributes.friendly_name ?? s.entity_id,
      state: s.state,
      domain: s.entity_id.split('.')[0],
    }))
    .filter((e) => {
      if (domain) return e.domain === domain
      if (q) return e.name.toLowerCase().includes(q) || e.entityId.toLowerCase().includes(q)
      return CONTROL_DOMAINS.has(e.domain)
    })
    .filter((e) => e.state !== 'unavailable')
    .slice(0, 80)
}

/** service is the bare service name, e.g. "turn_on" — domain comes from the entity id. */
export async function callService(
  entityId: string,
  service: string,
  data?: Record<string, unknown>,
): Promise<string> {
  const domain = entityId.split('.')[0]
  if (!domain || !entityId.includes('.')) throw new Error(`Invalid entity id: ${entityId}`)
  await api('POST', `/api/services/${domain}/${encodeURIComponent(service)}`, {
    entity_id: entityId,
    ...(data ?? {}),
  })
  return `Called ${domain}.${service} on ${entityId}`
}
