import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import earthquakesAPI from '../api/earthquakes'
import HeatmapLayer from './HeatmapLayer'
import { formatTimestamp } from '../utils/formatDate'
import cacheLib from '../lib/cache'
import CacheInspector from './CacheInspector'

// Debounce utility
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)
    
    return () => clearTimeout(handler)
  }, [value, delay])
  
  return debouncedValue
}

// Viewport bounds tracker component
function ViewportTracker({ onBoundsChange }) {
  const map = useMap()
  
  useEffect(() => {
    const updateBounds = () => {
      const bounds = map.getBounds()
      onBoundsChange({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
        zoom: map.getZoom()
      })
    }
    
    // Initial bounds
    updateBounds()
    
    // Debounced bounds update
    let timeoutId
    const debouncedUpdate = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(updateBounds, 300)
    }
    
    map.on('moveend', debouncedUpdate)
    map.on('zoomend', debouncedUpdate)
    
    return () => {
      clearTimeout(timeoutId)
      map.off('moveend', debouncedUpdate)
      map.off('zoomend', debouncedUpdate)
    }
  }, [map, onBoundsChange])
  
  return null
}

// Optimized functions (moved outside component to prevent recreation)
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

const RANGE_TO_FEED = {
  '24h': 'all_day',
  '7d': 'all_week',
  '30d': 'all_month'
}

function buildFeedUrl(range) {
  const feed = RANGE_TO_FEED[range] || RANGE_TO_FEED['24h']
  return `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${feed}.geojson`
}

// Check if earthquake is within viewport bounds
function isInViewport(eq, bounds) {
  if (!bounds || !eq.coords) return true
  
  const { lat, lon } = eq.coords
  return lat >= bounds.south && 
         lat <= bounds.north && 
         lon >= bounds.west && 
         lon <= bounds.east
}

// Calculate appropriate rendering limit based on zoom level
function getRenderingLimit(zoom, totalCount) {
  if (zoom >= 8) return Math.min(1000, totalCount) // City level
  if (zoom >= 6) return Math.min(500, totalCount)  // State level
  if (zoom >= 4) return Math.min(250, totalCount)  // Country level
  return Math.min(100, totalCount) // World level
}

export default function MapView({ range = '24h', minMagnitude = 0, selectedId = null, setSelectedId = () => {}, highlightedIds = [] }) {
  const [allData, setAllData] = useState([])
  const [viewportBounds, setViewportBounds] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [renderingStats, setRenderingStats] = useState({ visible: 0, total: 0, culled: 0 })
  
  // UI State
  const [legendCollapsed, setLegendCollapsed] = useState(false)
  const [showClusters, setShowClusters] = useState(true)
  const [showClusterPopover, setShowClusterPopover] = useState(false)
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [heatRadius, setHeatRadius] = useState(25)
  const [heatBlur, setHeatBlur] = useState(15)
  const [heatScale, setHeatScale] = useState(1)
  const [fromCache, setFromCache] = useState(false)
  const [toast, setToast] = useState(null)
  const [showInspector, setShowInspector] = useState(false)
  const [autoOptimize, setAutoOptimize] = useState(true)
  
  // Refs for performance tracking
  const renderCountRef = useRef(0)
  const lastRenderTime = useRef(Date.now())
  
  // Debounced filter values to prevent excessive API calls
  const debouncedRange = useDebounce(range, 500)
  const debouncedMinMagnitude = useDebounce(minMagnitude, 300)
  
  // Fetch earthquake data (only when debounced values change)
  useEffect(() => {
    let mounted = true
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    
    // Determine max results based on range
    const MAX_RESULTS = debouncedRange === '24h' ? 1000 : debouncedRange === '7d' ? 1500 : 2000
    
    earthquakesAPI.getEarthquakes({ 
      range: debouncedRange, 
      minMagnitude: debouncedMinMagnitude, 
      maxResults: MAX_RESULTS, 
      signal: controller.signal 
    }).then(res => {
      if (!mounted) return
      if (res.ok) {
        setAllData(res.features)
        setFromCache(!!res.fromCache)
        setError(null)
      } else {
        if (res.error !== 'aborted') {
          setError(res.error || 'Failed to fetch')
        }
      }
      setLoading(false)
    }).catch(err => {
      if (!mounted) return
      if (err && err.name !== 'AbortError') {
        setError(err.message || String(err))
      }
      setLoading(false)
    })
    
    return () => {
      mounted = false
      controller.abort()
    }
  }, [debouncedRange, debouncedMinMagnitude])
  
  // Memoized viewport filtering and rendering optimization
  const visibleData = useMemo(() => {
    if (!allData.length) return []
    
    const start = performance.now()
    
    // Step 1: Filter by viewport bounds (major performance gain)
    const viewportFiltered = viewportBounds ? 
      allData.filter(eq => isInViewport(eq, viewportBounds)) : 
      allData
    
    // Step 2: Sort by priority (magnitude + recency)
    const prioritySorted = viewportFiltered.sort((a, b) => {
      const aMag = a.magnitude || 0
      const bMag = b.magnitude || 0
      const aTime = a.time || 0
      const bTime = b.time || 0
      
      // Prioritize: higher magnitude first, then more recent
      if (Math.abs(aMag - bMag) > 0.5) return bMag - aMag
      return bTime - aTime
    })
    
    // Step 3: Apply rendering limits based on zoom level
    const zoom = viewportBounds?.zoom || 2
    const renderLimit = autoOptimize ? getRenderingLimit(zoom, prioritySorted.length) : prioritySorted.length
    const limited = prioritySorted.slice(0, renderLimit)
    
    // Update stats
    const culled = allData.length - limited.length
    setRenderingStats({
      visible: limited.length,
      total: allData.length,
      culled: culled,
      viewport: viewportFiltered.length
    })
    
    const end = performance.now()
    console.log(`Viewport filtering took ${(end - start).toFixed(2)}ms - Showing ${limited.length}/${allData.length} earthquakes`)
    
    return limited
  }, [allData, viewportBounds, autoOptimize])
  
  // Memoized heatmap points calculation
  const heatmapPoints = useMemo(() => {
    if (!showHeatmap || !visibleData.length) return []
    
    return visibleData.map(d => ({
      lat: d.coords.lat,
      lng: d.coords.lon,
      intensity: Math.max(0.01, ((d.magnitude || 0) / 8) * heatScale)
    }))
  }, [visibleData, showHeatmap, heatScale])
  
  // Viewport bounds change handler
  const handleBoundsChange = useCallback((bounds) => {
    setViewportBounds(bounds)
  }, [])
  
  // Pan to selected marker (optimized)
  useEffect(() => {
    if (!selectedId || !visibleData.length) return
    
    const found = visibleData.find(d => d.id === selectedId)
    if (!found?.coords) return
    
    // Use a more reliable way to access the map
    const mapElement = document.querySelector('.leaflet-container')
    if (mapElement?._leaflet_map) {
      try {
        mapElement._leaflet_map.panTo([found.coords.lat, found.coords.lon])
      } catch (e) {
        console.warn('Failed to pan to marker:', e)
      }
    }
  }, [selectedId, visibleData])
  
  // Background prefetch (optimized with idle callback)
  useEffect(() => {
    if (typeof window === 'undefined' || !('requestIdleCallback' in window)) return
    
    let cancelled = false
    const prefetchRanges = ['24h', '7d', '30d'].filter(r => r !== debouncedRange)
    
    const cb = () => {
      if (cancelled) return
      // Prefetch other ranges with lower priority
      prefetchRanges.forEach(r => {
        earthquakesAPI.getEarthquakes({ 
          range: r, 
          minMagnitude: debouncedMinMagnitude, 
          maxResults: 500 // Smaller prefetch size
        }).catch(() => {}) // Silent fail
      })
    }
    
    const id = window.requestIdleCallback(cb, { timeout: 5000 })
    return () => { 
      cancelled = true
      window.cancelIdleCallback?.(id)
    }
  }, [debouncedRange, debouncedMinMagnitude])
  
  // Performance monitoring
  useEffect(() => {
    renderCountRef.current++
    const now = Date.now()
    const timeSinceLastRender = now - lastRenderTime.current
    lastRenderTime.current = now
    
    if (renderCountRef.current > 1 && timeSinceLastRender < 100) {
      console.warn(`Fast re-render detected: ${timeSinceLastRender}ms since last render`)
    }
  })
  
  // Memoized marker click handler
  const handleMarkerClick = useCallback((eqId) => {
    setSelectedId(eqId)
  }, [setSelectedId])
  
  return (
    <>
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
          <ViewportTracker onBoundsChange={handleBoundsChange} />
          
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Optimized heatmap mode */}
          {showHeatmap && heatmapPoints.length > 0 && (() => {
            const maxIntensity = heatmapPoints.reduce((max, p) => Math.max(max, p.intensity || 0), 0) || 1
            const gradient = { 0.0: 'rgba(16,185,129,0.9)', 0.5: 'rgba(250,204,21,0.95)', 1.0: 'rgba(239,68,68,0.95)' }
            return (
              <HeatmapLayer 
                points={heatmapPoints} 
                radius={heatRadius} 
                blur={heatBlur} 
                gradient={gradient} 
                maxIntensity={maxIntensity} 
              />
            )
          })()}

          {showClusters && (
            <MarkerClusterGroup
              iconCreateFunction={cluster => {
                try {
                  const children = cluster.getAllChildMarkers() || []
                  const count = children.length
                  let maxMag = 0
                  for (const m of children) {
                    const eq = m?.feature || m?.options?.eq
                    const mag = eq?.magnitude || m?.options?.magnitude || 0
                    if (mag > maxMag) maxMag = mag
                  }
                  const color = magnitudeColor(maxMag)
                  const size = Math.min(60, 30 + Math.round(Math.log10(Math.max(1, count)) * 8))
                  const aria = `aria-label="${count} earthquakes; max magnitude ${maxMag ? maxMag.toFixed(1) : 'N/A'}" role="button" tabindex="0"`
                  const inner = `<div style="display:flex;flex-direction:row;align-items:center;gap:6px;">
                                  <div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;border:2px solid rgba(255,255,255,0.9);">${count}</div>
                                  <div style="font-size:11px; font-weight:600; color:#0f172a">${maxMag ? maxMag.toFixed(1) : ''}</div>
                               </div>`
                  const html = `<div ${aria} class="custom-cluster-icon-wrapper">${inner}</div>`
                  return L.divIcon({ html, className: 'custom-cluster-icon', iconSize: [size + 20, size + 8] })
                } catch (e) {
                  return undefined
                }
              }}
            >
              {visibleData.map(eq => {
                const isSelected = selectedId && eq.id === selectedId
                const isHighlighted = highlightedIds?.includes(eq.id)
                return (
                  <Marker 
                    key={eq.id} 
                    position={[eq.coords.lat, eq.coords.lon]} 
                    eq={eq} 
                    magnitude={eq.magnitude} 
                    eventHandlers={{ click: () => handleMarkerClick(eq.id) }}
                  >
                    <CircleMarker
                      center={[0, 0]}
                      pathOptions={{ 
                        color: isSelected ? '#111827' : (isHighlighted ? '#0ea5a4' : magnitudeColor(eq.magnitude)), 
                        fillColor: isSelected ? '#111827' : (isHighlighted ? '#0ea5a4' : magnitudeColor(eq.magnitude)), 
                        fillOpacity: isSelected ? 1 : (isHighlighted ? 0.95 : 0.8) 
                      }}
                      radius={isSelected ? Math.max(10, magnitudeRadius(eq.magnitude) + 4) : (isHighlighted ? Math.max(8, magnitudeRadius(eq.magnitude) + 2) : magnitudeRadius(eq.magnitude))}
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
                )
              })}
            </MarkerClusterGroup>
          )}
        </MapContainer>

        {/* Enhanced Performance Controls */}
        {!loading && !error && allData.length > 0 && (
          <div style={{ position: 'absolute', left: 12, top: 12, zIndex: 7000, background: 'rgba(255,255,255,0.95)', padding: 8, borderRadius: 8, minWidth: 280 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={showHeatmap} onChange={e => setShowHeatmap(e.target.checked)} />
                <span style={{ fontSize: 12 }}>Heatmap</span>
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={autoOptimize} onChange={e => setAutoOptimize(e.target.checked)} />
                <span style={{ fontSize: 12 }}>Auto Optimize</span>
              </label>
            </div>
            
            {/* Performance Stats */}
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>
              Showing {renderingStats.visible} of {renderingStats.total} earthquakes
              {renderingStats.culled > 0 && (
                <span style={{ color: '#059669' }}> ({renderingStats.culled} culled)</span>
              )}
              {viewportBounds && renderingStats.viewport !== renderingStats.total && (
                <span style={{ color: '#7c3aed' }}> ({renderingStats.viewport} in viewport)</span>
              )}
            </div>

            {showHeatmap && (
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Radius: {heatRadius}</div>
                  <input type="range" min="5" max="60" value={heatRadius} onChange={e => setHeatRadius(Number(e.target.value))} style={{ width: 100 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Blur: {heatBlur}</div>
                  <input type="range" min="5" max="40" value={heatBlur} onChange={e => setHeatBlur(Number(e.target.value))} style={{ width: 100 }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Scale: {heatScale.toFixed(1)}</div>
                  <input type="range" min="0.1" max="3" step="0.1" value={heatScale} onChange={e => setHeatScale(Number(e.target.value))} style={{ width: 100 }} />
                </div>
                
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                  <div style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: fromCache ? '#e6fffa' : '#eef2ff', color: fromCache ? '#0f766e' : '#3730a3' }}>
                    {fromCache ? 'Cached' : 'Live'}
                  </div>
                  <button 
                    onClick={async () => { 
                      await cacheLib.removeCache(`${buildFeedUrl(debouncedRange)}|min:${debouncedMinMagnitude}`)
                      setFromCache(false)
                      setToast('Cache cleared')
                      setTimeout(() => setToast(null), 2000)
                    }} 
                    style={{ background: '#ef4444', color: 'white', border: 'none', padding: '3px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                  >
                    Clear Cache
                  </button>
                  <button 
                    onClick={() => setShowInspector(prev => !prev)} 
                    style={{ background: '#6b7280', color: 'white', border: 'none', padding: '3px 6px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
                  >
                    Cache Inspector
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Optimized heatmap legend */}
        {showHeatmap && heatmapPoints.length > 0 && (() => {
          const maxIntensity = heatmapPoints.reduce((m, p) => Math.max(m, p.intensity), 0) || 1
          return (
            <div className="heat-legend" style={{ right: '12px', left: 'auto', top: 12 }} role="img" aria-label="Heatmap intensity legend">
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Intensity</div>
              <div className="bar" style={{ width: 140 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
                <div>0</div>
                <div>{maxIntensity.toFixed(2)}</div>
              </div>
            </div>
          )
        })()}

        {/* Rest of the UI components remain the same */}
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

        {!loading && !error && allData.length === 0 && (
          <div style={{position:'absolute', left:'50%', top:'48%', transform:'translate(-50%,-50%)', zIndex:6000, background:'rgba(255,255,255,0.95)', padding:16, borderRadius:8}}>
            No earthquakes match this filter.
          </div>
        )}

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

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
      
      {/* Toast notifications */}
      {toast && (
        <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 20000, background: 'rgba(17,24,39,0.95)', color: 'white', padding: 10, borderRadius: 8 }}>
          {toast}
          <button onClick={() => setToast(null)} style={{ marginLeft: 8, background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Cache inspector modal */}
      {showInspector && (
        <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30000 }}>
          <div style={{ zIndex: 30001 }}>
            <CacheInspector onClose={() => setShowInspector(false)} onClearAll={(err, removed) => {
              if (err) {
                setToast('Failed to clear cache')
                return
              }
              setToast(`${removed || 0} cache entries removed`)
              setShowInspector(false)
              setTimeout(() => setToast(null), 3000)
            }} />
          </div>
        </div>
      )}
    </>
  )
}