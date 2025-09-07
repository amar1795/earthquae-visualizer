import React, { useEffect, useState } from 'react'
import cache from '../lib/cache'

export default function CacheInspector(props) {
  const { onClose } = props || {}
  const [keys, setKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [clearing, setClearing] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const k = await cache.getKeys()
        if (!mounted) return
        setKeys(Array.isArray(k) ? k : [])
      } catch (e) {
        if (!mounted) return
        setError('Failed to read cache')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    try {
      load()
    } catch (e) {
      if (mounted) { setError('Failed to read cache'); setLoading(false) }
    }
    return () => { mounted = false }
  }, [])

  return (
    <div style={{ padding: 12, width: 340, background: 'var(--panel-bg)', color: 'var(--panel-text)', borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700 }}>Cache Inspector</div>
  <button onClick={onClose || (() => {})} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--panel-text)' }}>✕</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 13 }}>
        {loading && 'Loading...'}
        {error && <div style={{ color: 'red' }}>{error}</div>}
        {!loading && !error && (keys.length === 0 ? 'No cache to delete' : (
          <ul style={{ maxHeight: 220, overflow: 'auto', paddingLeft: 14 }}>
            {keys.map(k => <li key={k} style={{ marginBottom: 6, wordBreak: 'break-all' }}>{k}</li>)}
          </ul>
        ))}
      </div>

      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <button onClick={() => { if (!loading && keys.length > 0) setShowConfirm(true) }} disabled={clearing || loading || keys.length === 0} title={keys.length === 0 ? 'No cache entries' : undefined} style={{ background: (clearing || loading || keys.length === 0) ? '#9ca3af' : '#ef4444', color: 'white', border: 'none', padding: '8px 10px', borderRadius: 6, cursor: (clearing || loading || keys.length === 0) ? 'not-allowed' : 'pointer' }}>{clearing ? 'Clearing...' : (keys.length > 0 ? `Clear all (${keys.length})` : 'Clear all')}</button>
  <button onClick={onClose || (() => {})} style={{ background: 'rgba(229,231,235,0.12)', border: 'none', padding: '8px 10px', borderRadius: 6, cursor: 'pointer', color: 'var(--panel-text)' }}>Close</button>
      </div>

      {showConfirm && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40000 }}>
          <div role="dialog" aria-modal="true" style={{ width: 420, background: 'var(--panel-bg)', color: 'var(--panel-text)', padding: 18, borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.3)', zIndex: 40001 }}>
            <div style={{ fontWeight: 700 }}>Confirm clear cache</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>Clear all cached entries? This cannot be undone.</div>
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setShowConfirm(false)} style={{ background: 'rgba(229,231,235,0.12)', border: 'none', padding: '8px 12px', borderRadius: 6, cursor: 'pointer', color: 'var(--panel-text)' }}>Cancel</button>
              <button onClick={async () => {
                setShowConfirm(false)
                setClearing(true)
                try {
                  const removed = await cache.clearAll()
                  setKeys([])
                  if (props.onClearAll) props.onClearAll(null, removed)
                } catch (e) {
                  if (props.onClearAll) props.onClearAll(e)
                } finally {
                  setClearing(false)
                }
              }} disabled={clearing} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px 12px', borderRadius: 6, cursor: 'pointer' }}>{clearing ? 'Clearing...' : 'Confirm'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
