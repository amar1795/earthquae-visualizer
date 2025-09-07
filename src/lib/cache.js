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

export async function getKeys() {
  try {
    const keys = await localforage.keys()
    return keys || []
  } catch (e) {
    return []
  }
}

export async function clearAll() {
  try {
    const keys = await localforage.keys()
    if (!keys || keys.length === 0) return 0
    await Promise.all(keys.map(k => localforage.removeItem(k)))
    return keys.length
  } catch (e) {
    throw e
  }
}

export default { getCache, setCache, removeCache, getKeys, clearAll }
