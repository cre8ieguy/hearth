import { getSettings } from '../settings'
import type { GeocodeResult, WeatherReport } from '@shared/types'

let cache: WeatherReport | null = null
let cacheKey = ''

export async function geocode(query: string): Promise<GeocodeResult[]> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', query)
  url.searchParams.set('count', '5')
  url.searchParams.set('language', 'en')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Geocoding failed (HTTP ${res.status})`)
  const json = (await res.json()) as {
    results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[]
  }
  return (json.results ?? []).map((r) => ({
    name: r.name,
    admin1: r.admin1,
    country: r.country,
    lat: r.latitude,
    lon: r.longitude,
  }))
}

export async function getWeather(force = false): Promise<WeatherReport> {
  const { location } = getSettings()
  if (location.lat == null || location.lon == null) {
    throw new Error('No location configured. Set your city in Settings → Location.')
  }
  const key = `${location.lat},${location.lon},${location.unit}`
  if (!force && cache && cacheKey === key && Date.now() - cache.fetchedAt < 10 * 60 * 1000) {
    return cache
  }

  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(location.lat))
  url.searchParams.set('longitude', String(location.lon))
  url.searchParams.set(
    'current',
    'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
  )
  url.searchParams.set(
    'daily',
    'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
  )
  url.searchParams.set('forecast_days', '7')
  url.searchParams.set('timezone', 'auto')
  url.searchParams.set('temperature_unit', location.unit)
  url.searchParams.set('wind_speed_unit', location.unit === 'fahrenheit' ? 'mph' : 'kmh')

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Weather fetch failed (HTTP ${res.status})`)
  const json = (await res.json()) as {
    current: {
      temperature_2m: number
      apparent_temperature: number
      relative_humidity_2m: number
      weather_code: number
      wind_speed_10m: number
      is_day: number
    }
    daily: {
      time: string[]
      weather_code: number[]
      temperature_2m_max: number[]
      temperature_2m_min: number[]
      precipitation_probability_max: (number | null)[]
    }
  }

  cache = {
    location: location.name,
    unit: location.unit,
    now: {
      temp: Math.round(json.current.temperature_2m),
      feelsLike: Math.round(json.current.apparent_temperature),
      humidity: json.current.relative_humidity_2m,
      windSpeed: Math.round(json.current.wind_speed_10m),
      code: json.current.weather_code,
      isDay: json.current.is_day === 1,
    },
    daily: json.daily.time.map((date, i) => ({
      date,
      code: json.daily.weather_code[i],
      tempMax: Math.round(json.daily.temperature_2m_max[i]),
      tempMin: Math.round(json.daily.temperature_2m_min[i]),
      precipChance: json.daily.precipitation_probability_max[i] ?? 0,
    })),
    fetchedAt: Date.now(),
  }
  cacheKey = key
  return cache
}
