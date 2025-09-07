import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'
import earthquakesAPI from '../api/earthquakes'
import { formatTimestamp } from '../utils/formatDate'

function magnitudeColor(m) {
  if (m >= 6) return '#b91c1c' // red
  if (m >= 5) return '#f97316' // orange
  if (m >= 4) return '#f59e0b' // amber
  if (m >= 2) return '#84cc16' // lime
  return '#10b981' // green
}

function magnitudeRadius(m) {
  if (!m && m !== 0) return 4
  return Math.max(4, Math.min(40, m * 4))
}

export default function MapView({ range = '24h', minMagnitude = 0 }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    earthquakesAPI.getEarthquakes({ range, minMagnitude }).then(res => {
      if (!mounted) return
      if (res.ok) {
        setData(res.features)
        setError(null)
      } else {
        setError(res.error || 'Failed to fetch')
      }
      setLoading(false)
    }).catch(err => {
      if (!mounted) return
      setError(err.message || String(err))
      setLoading(false)
    })
    return () => { mounted = false }
  }, [range, minMagnitude])

  return (
    <div className="h-[70vh] w-full rounded-md overflow-hidden shadow" style={{ height: '70vh', position: 'relative' }}>
      {loading && (
        <div style={{position:'absolute', left:12, top:12, zIndex:6000, background:'rgba(255,255,255,0.95)', padding:10, borderRadius:8}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{width:16,height:16,border:'3px solid #cbd5e1',borderTopColor:'#2563eb',borderRadius:999,animation:'spin 1s linear infinite'}} />
            <div style={{fontSize:13}}>Loading earthquakes...</div>
          </div>
        </div>
      )}
      {error && <div style={{position:'absolute', left:12, top:12, zIndex:6000, background:'rgba(255,255,255,0.95)', padding:10, borderRadius:8, color:'red'}}>Error: {error}</div>}
      <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {data.map(eq => (
          <CircleMarker
            key={eq.id}
            center={[eq.coords.lat, eq.coords.lon]}
            pathOptions={{ color: magnitudeColor(eq.magnitude), fillColor: magnitudeColor(eq.magnitude), fillOpacity: 0.8 }}
            radius={magnitudeRadius(eq.magnitude)}
          >
            <Popup>
              <div style={{minWidth: 180}}>
                <strong>{eq.place}</strong>
                <div>Mag: {eq.magnitude ?? 'N/A'}</div>
                <div>Depth: {eq.depth ?? 'N/A'} km</div>
                <div>{formatTimestamp(eq.time)}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

        {!loading && !error && data.length === 0 && (
          <div style={{position:'absolute', left:'50%', top:'48%', transform:'translate(-50%,-50%)', zIndex:6000, background:'rgba(255,255,255,0.95)', padding:16, borderRadius:8}}>
            No earthquakes match this filter.
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={{ position: 'absolute', right: 12, bottom: 12, background: 'white', padding: 8, borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>Legend</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <div style={{ width: 12, height: 12, background: '#10b981' }}></div><div style={{fontSize:12}}> &lt;2</div>
          <div style={{ width: 12, height: 12, background: '#84cc16' }}></div><div style={{fontSize:12}}> 2-3.9</div>
          <div style={{ width: 12, height: 12, background: '#f59e0b' }}></div><div style={{fontSize:12}}> 4-4.9</div>
          <div style={{ width: 12, height: 12, background: '#f97316' }}></div><div style={{fontSize:12}}> 5-5.9</div>
          <div style={{ width: 12, height: 12, background: '#b91c1c' }}></div><div style={{fontSize:12}}> 6+</div>
        </div>
      </div>
    </div>
  )
}
