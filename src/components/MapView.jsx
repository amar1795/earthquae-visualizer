import React, { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Marker } from 'react-leaflet'
import L from 'leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import earthquakesAPI from '../api/earthquakes'
import HeatmapLayer from './HeatmapLayer'
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
  const [visibleData, setVisibleData] = useState([]) // data rendered so far
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [renderAll, setRenderAll] = useState(false)
  const [renderProgress, setRenderProgress] = useState(0)
  const [legendCollapsed, setLegendCollapsed] = useState(false)
  const [showClusters, setShowClusters] = useState(true)
  const [showClusterPopover, setShowClusterPopover] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [heatRadius, setHeatRadius] = useState(25)
  const [heatBlur, setHeatBlur] = useState(15)
  const [heatScale, setHeatScale] = useState(1)

  useEffect(() => {
    let mounted = true
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    // limit results to avoid DOM overload when switching to 7d/30d
    const MAX_RESULTS = 2000

    earthquakesAPI.getEarthquakes({ range, minMagnitude, maxResults: MAX_RESULTS, signal: controller.signal }).then(res => {
      if (!mounted) return
      if (res.ok) {
        setData(res.features)
        setError(null)
        // reset progressive render state
        setVisibleData([])
        setRenderProgress(0)
        setRenderAll(false)
      } else {
        if (res.error === 'aborted') {
          setError(null)
        } else {
          setError(res.error || 'Failed to fetch')
        }
      }
      setLoading(false)
    }).catch(err => {
      if (!mounted) return
      if (err && err.name === 'AbortError') {
        setError(null)
      } else {
        setError(err.message || String(err))
      }
      setLoading(false)
    })
    return () => {
      mounted = false
      controller.abort()
    }
  }, [range, minMagnitude])

  // progressive batch renderer
  useEffect(() => {
    let cancelled = false
    if (!data || data.length === 0) {
      setVisibleData([])
      setRenderProgress(0)
      return
    }

    if (renderAll) {
      setVisibleData(data)
      setRenderProgress(100)
      return
    }

    const BATCH = 100
    let index = 0

    function renderBatch() {
      if (cancelled) return
      const next = data.slice(index, index + BATCH)
      setVisibleData(prev => prev.concat(next))
      index += BATCH
      setRenderProgress(Math.min(100, Math.round((index / data.length) * 100)))
      if (index < data.length) {
        // yield to main thread
        setTimeout(renderBatch, 50)
      }
    }

    renderBatch()
    return () => { cancelled = true }
  }, [data, renderAll])

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

        {/* heatmap mode */}
        {showHeatmap && visibleData.length > 0 && (() => {
          const points = visibleData.map(d => ({ lat: d.coords.lat, lng: d.coords.lon, intensity: Math.max(0.01, ((d.magnitude || 0) / 8) * heatScale) }))
          // compute max intensity for legend
          const maxIntensity = points.reduce((max, p) => Math.max(max, p.intensity || 0), 0) || 1
          // gradient mapping: green -> yellow -> red
          const gradient = { 0.0: 'rgba(16,185,129,0.9)', 0.5: 'rgba(250,204,21,0.95)', 1.0: 'rgba(239,68,68,0.95)' }
          return (
            <HeatmapLayer points={points} radius={heatRadius} blur={heatBlur} gradient={gradient} maxIntensity={maxIntensity} />
          )
        })()}

  {showClusters && (
  <MarkerClusterGroup
          iconCreateFunction={cluster => {
            try {
              const children = cluster.getAllChildMarkers() || []
              const count = children.length
              // compute max magnitude among child markers (stored in feature ref)
              let maxMag = 0
              for (const m of children) {
                const eq = m && m.feature ? m.feature : m && m.options && m.options.eq
                const mag = eq && eq.magnitude ? eq.magnitude : (m && m.options && m.options.magnitude) || 0
                if (mag > maxMag) maxMag = mag
              }
              const color = magnitudeColor(maxMag)
              const size = Math.min(60, 30 + Math.round(Math.log10(Math.max(1, count)) * 8))
              // accessible label and tabindex so keyboard/screen-reader users can discover cluster meaning
              const aria = `aria-label="${count} earthquakes; max magnitude ${maxMag ? maxMag.toFixed(1) : 'N/A'}" role="button" tabindex="0"`
              const inner = `<div style="display:flex;flex-direction:row;align-items:center;gap:6px;">
                                <div style=\"background:${color};width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;border:2px solid rgba(255,255,255,0.9);\">${count}</div>
                                <div style=\"font-size:11px; font-weight:600; color:#0f172a\">${maxMag ? maxMag.toFixed(1) : ''}</div>
                             </div>`
              const html = `<div ${aria} class=\"custom-cluster-icon-wrapper\">${inner}</div>`
              return L.divIcon({ html, className: 'custom-cluster-icon', iconSize: [size + 20, size + 8] })
            } catch (e) {
              return undefined
            }
          }}
        >
          {visibleData.map(eq => (
            <Marker key={eq.id} position={[eq.coords.lat, eq.coords.lon]} eq={eq} magnitude={eq.magnitude}>
              <CircleMarker
                center={[0, 0]}
                pathOptions={{ color: magnitudeColor(eq.magnitude), fillColor: magnitudeColor(eq.magnitude), fillOpacity: 0.8 }}
                radius={magnitudeRadius(eq.magnitude)}
              />
              <Popup>
                <div style={{minWidth: 180}}>
                  <strong>{eq.place}</strong>
                  <div>Mag: {eq.magnitude ?? 'N/A'}</div>
                  <div>Depth: {eq.depth ?? 'N/A'} km</div>
                  <div>{formatTimestamp(eq.time)}</div>
                </div>
              </Popup>
            </Marker>
          ))}
  </MarkerClusterGroup>
  )}
      </MapContainer>

      {/* heatmap toggle */}
      {!loading && !error && data.length > 0 && (
        <div style={{ position: 'absolute', left: 12, top: 12, zIndex: 7000, background: 'rgba(255,255,255,0.95)', padding: 8, borderRadius: 8, minWidth: 220 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={showHeatmap} onChange={e => setShowHeatmap(e.target.checked)} />
              <span style={{ fontSize: 12 }}>Heatmap</span>
            </label>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{visibleData.length} points</div>
          </div>

          {showHeatmap && (
            <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>Radius: {heatRadius}</div>
              <input type="range" min="5" max="60" value={heatRadius} onChange={e => setHeatRadius(Number(e.target.value))} />
              <div style={{ fontSize: 12, fontWeight: 600 }}>Blur: {heatBlur}</div>
              <input type="range" min="5" max="40" value={heatBlur} onChange={e => setHeatBlur(Number(e.target.value))} />
              <div style={{ fontSize: 12, fontWeight: 600 }}>Intensity scale: {heatScale.toFixed(2)}</div>
              <input type="range" min="0.1" max="3" step="0.1" value={heatScale} onChange={e => setHeatScale(Number(e.target.value))} />
            </div>
          )}
        </div>
      )}

      {/* heatmap legend bar */}
      {showHeatmap && (() => {
        const points = visibleData.map(d => Math.max(0.01, ((d.magnitude || 0) / 8) * heatScale))
        const maxIntensity = points.reduce((m, v) => Math.max(m, v), 0) || 1
        return (
          <div className="heat-legend" style={{ right: '12px', left: 'auto', top: 12 }} aria-hidden={false} role="img" aria-label="Heatmap intensity legend">
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Intensity</div>
            <div className="bar" style={{ width: 140 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
              <div>0</div>
              <div>{maxIntensity.toFixed(2)}</div>
            </div>
          </div>
        )
      })()}

      {/* cluster legend explaining icon (collapsible). When closed, show an exclamation button to reopen. */}
      {showClusters ? (
        <div className="cluster-legend" role="note" aria-label="Cluster legend">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Cluster icon</div>
            <button aria-label="Hide clusters" onClick={() => setShowClusters(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
          <div style={{ fontSize: 12, marginTop:6 }}>Shows count and strongest earthquake magnitude inside the cluster.</div>
          <div className="item">
            <div className="dot" style={{ background: '#10b981' }}></div>
            <div style={{ fontSize: 12 }}>Low max magnitude</div>
          </div>
          <div className="item">
            <div className="dot" style={{ background: '#b91c1c' }}></div>
            <div style={{ fontSize: 12 }}>High max magnitude</div>
          </div>
        </div>
      ) : (
        <div style={{ position: 'absolute', left: 12, bottom: 80, zIndex: 8000 }}>
          <button aria-label="Show clusters" title="Show clusters" onClick={() => setShowClusterPopover(prev => !prev)} style={{ background: '#f97316', color: 'white', border: 'none', borderRadius: 8, padding: '8px 10px', cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>⚠</button>
          {showClusterPopover && (
            <div role="dialog" aria-label="Cluster controls" style={{ marginTop: 8, background: 'white', padding: 8, borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.12)', width: 220 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Clusters are hidden</div>
              <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>Toggle clusters on to restore clustered markers.</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={showClusters}
                  onChange={e => { setShowClusters(!!e.target.checked); setShowClusterPopover(false); }}
                />
                <span style={{ fontSize: 13 }}>Show clusters</span>
              </label>
            </div>
          )}
        </div>
      )}

        {!loading && !error && data.length === 0 && (
          <div style={{position:'absolute', left:'50%', top:'48%', transform:'translate(-50%,-50%)', zIndex:6000, background:'rgba(255,255,255,0.95)', padding:16, borderRadius:8}}>
            No earthquakes match this filter.
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {/* render progress UI */}
        {!loading && !error && data.length > 0 && (
          <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 7000, background: 'rgba(255,255,255,0.95)', padding: 8, borderRadius: 8 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              Rendering markers: {renderProgress}% ({visibleData.length}/{data.length})
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setRenderAll(true)} style={{ padding: '6px 8px', borderRadius: 6, background: '#ef4444', color: 'white', border: 'none', cursor: 'pointer' }}>Render all</button>
              <button onClick={() => { setVisibleData([]); setRenderProgress(0); setRenderAll(false); }} style={{ padding: '6px 8px', borderRadius: 6, background: '#e5e7eb', border: 'none', cursor: 'pointer' }}>Reset</button>
            </div>
          </div>
        )}

      <div className={`eq-legend ${legendCollapsed ? 'collapsed' : ''}`} role="region" aria-label="Magnitude legend">
        {!legendCollapsed ? (
          <>
            <div className="title">Legend</div>
            <div className="row">
              <div className="swatch" style={{ background: '#10b981' }}></div><div style={{fontSize:12}}> &lt;2</div>
            </div>
            <div className="row">
              <div className="swatch" style={{ background: '#84cc16' }}></div><div style={{fontSize:12}}> 2-3.9</div>
            </div>
            <div className="row">
              <div className="swatch" style={{ background: '#f59e0b' }}></div><div style={{fontSize:12}}> 4-4.9</div>
            </div>
            <div className="row">
              <div className="swatch" style={{ background: '#f97316' }}></div><div style={{fontSize:12}}> 5-5.9</div>
            </div>
            <div className="row">
              <div className="swatch" style={{ background: '#b91c1c' }}></div><div style={{fontSize:12}}> 6+</div>
            </div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="toggle" aria-label="Collapse legend" onClick={() => setLegendCollapsed(true)}>▾</button>
            </div>
          </>
        ) : (
          <button className="toggle" aria-label="Expand legend" onClick={() => setLegendCollapsed(false)}>▸</button>
        )}
      </div>
    </div>
  )
}
