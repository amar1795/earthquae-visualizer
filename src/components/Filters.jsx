import React from 'react'

export default function Filters({ range, setRange, minMagnitude, setMinMagnitude }) {
  const ranges = ['24h', '7d', '30d']
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
                border: range === r ? '2px solid #2563eb' : '1px solid #e5e7eb',
                background: range === r ? '#bfdbfe' : 'white',
                cursor: 'pointer'
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Minimum magnitude</div>
        <input
          type="number"
          min="0"
          step="0.1"
          value={minMagnitude}
          onChange={e => setMinMagnitude(Number(e.target.value))}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #e5e7eb' }}
        />
      </div>
    </div>
  )
}
