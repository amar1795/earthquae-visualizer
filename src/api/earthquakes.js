// Minimal USGS earthquake API helper
// Exports: getEarthquakes({ range: '24h'|'7d'|'30d', minMagnitude?: number }) -> Promise<{features: Array}> 

const RANGE_TO_FEED = {
  '24h': 'all_day', // ~24 hours
  '7d': 'all_week', // 7 days
  '30d': 'all_month' // ~30 days
}

function buildFeedUrl(range) {
  const feed = RANGE_TO_FEED[range] || RANGE_TO_FEED['24h']
  return `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`
}

async function fetchJson(url, timeout = 15000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(id)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }
    return await res.json()
  } catch (err) {
    clearTimeout(id)
    throw err
  }
}

function normalizeFeature(feature) {
  // feature is the GeoJSON Feature from USGS
  const { id, properties = {}, geometry = {} } = feature || {}
  const { mag, place, time, url, detail } = properties
  const coords = (geometry.coordinates && [...geometry.coordinates]) || [0, 0, 0]
  const [lon, lat, depth] = coords
  return {
    id,
    magnitude: mag,
    place,
    time,
    url,
    detail,
    depth,
    coords: { lat, lon }
  }
}

export async function getEarthquakes({ range = '24h', minMagnitude = 0 } = {}) {
  const url = buildFeedUrl(range)
  try {
    const json = await fetchJson(url)
    const features = (json && json.features) || []
    const normalized = features.map(normalizeFeature).filter(f => (f.magnitude || 0) >= (minMagnitude || 0))
    return { ok: true, count: normalized.length, features: normalized }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
}

export default { getEarthquakes }
