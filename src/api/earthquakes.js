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

async function fetchJson(url, timeout = 15000, externalSignal) {
  // Create a controller that will be aborted either by timeout or by externalSignal
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  const onExternalAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId)
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', onExternalAbort)
    }
  }

  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }
    return await res.json()
  } catch (err) {
    clearTimeout(timeoutId)
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort)
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

export async function getEarthquakes({ range = '24h', minMagnitude = 0, maxResults = 500, signal } = {}) {
  const url = buildFeedUrl(range)
  try {
    const json = await fetchJson(url, 15000, signal)
    const features = (json && json.features) || []
    const normalized = features
      .map(normalizeFeature)
      .filter(f => (f.magnitude || 0) >= (minMagnitude || 0))
      // sort by magnitude desc so we show the largest quakes first when we cap
      .sort((a, b) => (b.magnitude || 0) - (a.magnitude || 0))
    const capped = typeof maxResults === 'number' ? normalized.slice(0, maxResults) : normalized
    return { ok: true, count: capped.length, features: capped }
  } catch (error) {
    // If the fetch was aborted, propagate a recognizable error
    return { ok: false, error: error && error.name === 'AbortError' ? 'aborted' : (error.message || String(error)) }
  }
}

export default { getEarthquakes }
