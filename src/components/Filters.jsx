import React, { useEffect, useState, useRef } from 'react'

export default function Filters({ range, setRange, minMagnitude, setMinMagnitude }) {
  const ranges = ['24h', '7d', '30d']
  const [localMin, setLocalMin] = useState(minMagnitude)
  const [pending, setPending] = useState(false)
  const timeoutRef = useRef(null)

  // keep local input in sync when parent changes externally
  useEffect(() => {
    setLocalMin(minMagnitude)
  }, [minMagnitude])

  // debounce applying the minMagnitude to parent
  useEffect(() => {
    setPending(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setMinMagnitude(Number(localMin) || 0)
      setPending(false)
      timeoutRef.current = null
    }, 400)
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [localMin, setMinMagnitude])

  return (
    <div style={{ padding: 12 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Time range</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {ranges.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: range === r ? '2px solid #2563eb' : '1px solid rgba(0,0,0,0.08)',
                  background: range === r ? '#bfdbfe' : 'var(--panel-bg)',
                  color: 'var(--panel-text)',
                  cursor: 'pointer'
                }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div >
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Minimum magnitude</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="number"
            min="0"
            step="0.1"
            value={localMin}
            onChange={e => setLocalMin(e.target.value)}
            style={{ width: '10%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.08)', background: 'var(--panel-bg)', color: 'var(--panel-text)' }}
          />
          <div style={{ minWidth: 80, fontSize: 12, color: pending ? '#2563eb' : '#6b7280' }}>
            {pending ? 'Applying...' : 'Applied'}
          </div>
        </div>
      </div>
    </div>
  )
}
