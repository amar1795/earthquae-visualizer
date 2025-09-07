// Simple persistent cache wrapper using localforage with TTL support
import localforage from 'localforage'

const STORE_NAME = 'earthquake-cache'
localforage.config({ name: 'earthquake-visualizer', storeName: STORE_NAME })

/**
 * set a value with TTL (ms)
 */
export async function setCache(key, value, ttl = 5 * 60 * 1000) {
  const payload = { ts: Date.now(), ttl, value }
  await localforage.setItem(key, payload)
}

/**
 * get a cached value if not expired
 */
export async function getCache(key) {
  try {
    const payload = await localforage.getItem(key)
    if (!payload) return null
    const { ts, ttl, value } = payload
    if (Date.now() - ts > (ttl || 0)) {
      await localforage.removeItem(key)
      return null
    }
    return value
  } catch (e) {
    // localforage may throw in some environments (e.g. private mode); fail gracefully
    return null
  }
}

export async function removeCache(key) {
  try { await localforage.removeItem(key) } catch (e) { /* ignore */ }
}

export default { getCache, setCache, removeCache }
