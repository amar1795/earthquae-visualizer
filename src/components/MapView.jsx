import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import earthquakesAPI from '../api/earthquakes'
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

// START: Mobile Responsiveness Hook
// A simple hook to detect viewport size and determine if the view is mobile.
function useViewport() {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleWindowResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  // Use 768px as the breakpoint for mobile devices
  return { width, isMobile: width < 768 };
}
// END: Mobile Responsiveness Hook

// Advanced Canvas-based Heatmap Component
function CanvasHeatmap({ points, radius = 25, blur = 15, gradient, maxIntensity = 1 }) {
  const map = useMap()
  const canvasRef = useRef(null)
  const layerRef = useRef(null)
  
  useEffect(() => {
    if (!map || !points.length) return
    
    // Remove existing layer
    if (layerRef.current) {
      map.removeLayer(layerRef.current)
    }
    
    // Create canvas element
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const bounds = map.getBounds()
    const size = map.getSize()
    
    canvas.width = size.x
    canvas.height = size.y
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    // Convert lat/lng to pixel coordinates and draw heat points
    const pixelPoints = points.map(p => {
      const point = map.latLngToContainerPoint([p.lat, p.lng])
      return { x: point.x, y: point.y, intensity: p.intensity }
    }).filter(p => p.x >= 0 && p.x <= size.x && p.y >= 0 && p.y <= size.y)
    
    if (pixelPoints.length === 0) return
    
    // Create heat effect
    pixelPoints.forEach(point => {
      const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius)
      const alpha = Math.min(1, point.intensity / maxIntensity)
      
      gradient.addColorStop(0, `rgba(255, 0, 0, ${alpha * 0.8})`)
      gradient.addColorStop(0.5, `rgba(255, 255, 0, ${alpha * 0.4})`)
      gradient.addColorStop(1, `rgba(0, 255, 0, ${alpha * 0.1})`)
      
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
      ctx.fill()
    })
    
    // Apply blur effect
    if (blur > 0) {
      ctx.filter = `blur(${blur}px)`
      ctx.globalCompositeOperation = 'multiply'
      ctx.drawImage(canvas, 0, 0)
    }
    
    // Create Leaflet image overlay
    const imageUrl = canvas.toDataURL()
    const overlay = L.imageOverlay(imageUrl, bounds, { opacity: 0.7 })
    overlay.addTo(map)

    
    layerRef.current = overlay
    
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
      }
    }
  }, [map, points, radius, blur, maxIntensity])
  
  return null
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
    
    updateBounds()
    
    let timeoutId
    const debouncedUpdate = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(updateBounds, 200) // Faster response for Phase 2
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

// Lightweight Custom Clustering Component
function LightweightCluster({ earthquakes, onMarkerClick, selectedId, highlightedIds }) {
  const map = useMap()
  const [clusters, setClusters] = useState([])
  const markersRef = useRef([])
  
  // Simple clustering algorithm
  const createClusters = useCallback((points, zoom) => {
    const clusterDistance = zoom > 10 ? 40 : zoom > 7 ? 60 : zoom > 4 ? 80 : 120
    const clusters = []
    const processed = new Set()
    
    points.forEach((point, i) => {
      if (processed.has(i)) return
      
      const cluster = {
        lat: point.coords.lat,
        lng: point.coords.lon,
        points: [point],
        maxMagnitude: point.magnitude || 0
      }
      
      // Find nearby points
      points.forEach((otherPoint, j) => {
        if (i === j || processed.has(j)) return
        
        const distance = Math.sqrt(
          Math.pow(point.coords.lat - otherPoint.coords.lat, 2) +
          Math.pow(point.coords.lon - otherPoint.coords.lon, 2)
        ) * 111000 // Rough conversion to meters
        
        if (distance < clusterDistance) {
          cluster.points.push(otherPoint)
          cluster.maxMagnitude = Math.max(cluster.maxMagnitude, otherPoint.magnitude || 0)
          processed.add(j)
        }
      })
      
      // Update cluster center (weighted by magnitude)
      if (cluster.points.length > 1) {
        let totalWeight = 0
        let weightedLat = 0
        let weightedLng = 0
        
        cluster.points.forEach(p => {
          const weight = Math.max(1, p.magnitude || 1)
          weightedLat += p.coords.lat * weight
          weightedLng += p.coords.lon * weight
          totalWeight += weight
        })
        
        cluster.lat = weightedLat / totalWeight
        cluster.lng = weightedLng / totalWeight
      }
      
      clusters.push(cluster)
      processed.add(i)
    })
    
    return clusters
  }, [])
  
  useEffect(() => {
    if (!map || !earthquakes.length) {
      setClusters([])
      return
    }
    
    const zoom = map.getZoom()
    const newClusters = createClusters(earthquakes, zoom)
    setClusters(newClusters)
  }, [earthquakes, map, createClusters])
  
  // Clear existing markers
  useEffect(() => {
    markersRef.current.forEach(marker => {
      if (map.hasLayer(marker)) {
        map.removeLayer(marker)
      }
    })
    markersRef.current = []
  }, [clusters, map])
  
  // Render clusters
  useEffect(() => {
    if (!map || !clusters.length) return
    
    clusters.forEach(cluster => {
      const isMultiple = cluster.points.length > 1
      
      if (isMultiple) {
        // Create cluster marker
        const size = Math.min(60, 25 + Math.log10(cluster.points.length) * 15)
        const color = magnitudeColor(cluster.maxMagnitude)
        
        const icon = L.divIcon({
          html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;border:2px solid rgba(255,255,255,0.9);font-size:${Math.max(10, size/4)}px;">${cluster.points.length}</div>`,
          className: 'custom-cluster-marker',
          iconSize: [size, size]
        })
        
        const marker = L.marker([cluster.lat, cluster.lng], { icon })
        
        marker.on('click', () => {
          // Zoom into cluster
          const group = new L.featureGroup(cluster.points.map(p => L.marker([p.coords.lat, p.coords.lon])))
          map.fitBounds(group.getBounds().pad(0.1))
        })
        
        // Add popup with cluster info
        const popupContent = `
          <div style="min-width: 180px;">
            <strong>Cluster (${cluster.points.length} earthquakes)</strong>
            <div>Max Magnitude: ${cluster.maxMagnitude.toFixed(1)}</div>
            <div>Click to zoom in</div>
          </div>
        `
        marker.bindPopup(popupContent)
        
        marker.addTo(map)
        markersRef.current.push(marker)
      } else {
        // Single earthquake marker
        const eq = cluster.points[0]
        const isSelected = selectedId === eq.id
        const isHighlighted = highlightedIds?.includes(eq.id)
        
        const radius = isSelected ? Math.max(10, magnitudeRadius(eq.magnitude) + 4) : 
                     isHighlighted ? Math.max(8, magnitudeRadius(eq.magnitude) + 2) : 
                     magnitudeRadius(eq.magnitude)
        
        const color = isSelected ? '#07ccfd6e' : 
                     isHighlighted ? '#0ea5a4' : 
                     magnitudeColor(eq.magnitude)
        
        const marker = L.circleMarker([eq.coords.lat, eq.coords.lon], {
          radius: radius,
          fillColor: color,
          color: color,
          fillOpacity: isSelected ? 1 : isHighlighted ? 0.95 : 0.8,
          weight: 2
        })
        
        marker.on('click', () => onMarkerClick(eq.id))
        
        const popupContent = `
          <div style="min-width: 180px;">
            <strong>${eq.place}</strong>
            <div>Magnitude: ${eq.magnitude ?? 'N/A'}</div>
            <div>Depth: ${eq.depth ?? 'N/A'} km</div>
            <div>${formatTimestamp(eq.time)}</div>
          </div>
        `
        marker.bindPopup(popupContent)
        
        marker.addTo(map)
        markersRef.current.push(marker)
      }
    })
    
    return () => {
      markersRef.current.forEach(marker => {
        if (map.hasLayer(marker)) {
          map.removeLayer(marker)
        }
      })
      markersRef.current = []
    }
  }, [clusters, map, onMarkerClick, selectedId, highlightedIds])
  
  return null
}

// Enhanced earthquake API with geographic bounds support
async function getEarthquakesWithBounds({ range = '24h', minMagnitude = 0, bounds = null, maxResults = 500, signal } = {}) {
  // First get all earthquakes
  const result = await earthquakesAPI.getEarthquakes({ range, minMagnitude, maxResults: maxResults * 2, signal })
  
  if (!result.ok || !bounds) {
    return result
  }
  
  // Filter by geographic bounds
  const filtered = result.features.filter(eq => {
    if (!eq.coords) return false
    const { lat, lon } = eq.coords
    return lat >= bounds.south && lat <= bounds.north && 
           lon >= bounds.west && lon <= bounds.east
  })
  
  // Apply result limit after filtering
  const limited = maxResults ? filtered.slice(0, maxResults) : filtered
  
  return {
    ...result,
    features: limited,
    originalCount: result.features.length,
    filteredCount: filtered.length
  }
}

// Optimized functions
function magnitudeColor(m) {
  if (m >= 6) return '#b91c1c'
  if (m >= 5) return '#f97316'
  if (m >= 4) return '#f59e0b'
  if (m >= 2) return '#84cc16'
  return '#10b981'
}

function magnitudeRadius(m) {
  if (!m && m !== 0) return 4
  return Math.max(4, Math.min(40, m * 4))
}

// Check if earthquake is within viewport bounds
function isInViewport(eq, bounds) {
  if (!bounds || !eq.coords) return true
  const { lat, lon } = eq.coords
  return lat >= bounds.south && lat <= bounds.north && 
         lon >= bounds.west && lon <= bounds.east
}

// Smart rendering limits based on zoom and performance
function getSmartRenderingLimit(zoom, totalCount, performance = 'auto') {
  if (performance === 'high') {
    if (zoom >= 10) return Math.min(2000, totalCount)
    if (zoom >= 8) return Math.min(1500, totalCount)
    if (zoom >= 6) return Math.min(1000, totalCount)
    if (zoom >= 4) return Math.min(500, totalCount)
    return Math.min(200, totalCount)
  }
  
  if (performance === 'balanced') {
    if (zoom >= 8) return Math.min(1000, totalCount)
    if (zoom >= 6) return Math.min(500, totalCount)
    if (zoom >= 4) return Math.min(250, totalCount)
    return Math.min(100, totalCount)
  }
  
  // Performance mode
  if (zoom >= 8) return Math.min(500, totalCount)
  if (zoom >= 6) return Math.min(250, totalCount)
  if (zoom >= 4) return Math.min(150, totalCount)
  return Math.min(75, totalCount)
}

export default function MapView({ range = '24h', minMagnitude = 0, selectedId = null, setSelectedId = () => {}, highlightedIds = [] }) {
  const { isMobile } = useViewport(); // <-- Use the viewport hook
  const [allData, setAllData] = useState([])
  const [viewportBounds, setViewportBounds] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [renderingStats, setRenderingStats] = useState({ visible: 0, total: 0, culled: 0 })
  
  // UI State
  const [renderingMode, setRenderingMode] = useState('smart') // 'smart', 'canvas', 'dom'
  const [performanceMode, setPerformanceMode] = useState('balanced') // 'performance', 'balanced', 'high'
  const [showHeatmap, setShowHeatmap] = useState(false)
  const [heatRadius, setHeatRadius] = useState(25)
  const [heatBlur, setHeatBlur] = useState(15)
  const [heatScale, setHeatScale] = useState(1)
  const [legendCollapsed, setLegendCollapsed] = useState(isMobile); // <-- Default to collapsed on mobile
  const [fromCache, setFromCache] = useState(false)
  const [toast, setToast] = useState(null)
  const [showInspector, setShowInspector] = useState(false)
  const [geographicFiltering, setGeographicFiltering] = useState(true)
  
  // Performance tracking
  const renderCountRef = useRef(0)
  const lastFetchTime = useRef(0)
  const performanceMetrics = useRef({ avgRenderTime: 0, renderCount: 0 })
  
  // Debounced filter values
  const debouncedRange = useDebounce(range, 400)
  const debouncedMinMagnitude = useDebounce(minMagnitude, 250)
  const debouncedBounds = useDebounce(viewportBounds, 300)
  
  // Enhanced data fetching with geographic bounds
  useEffect(() => {
    let mounted = true
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    
    const fetchStart = performance.now()
    
    const maxResults = performanceMode === 'high' ? 3000 : 
                      performanceMode === 'balanced' ? 2000 : 1500
    
    const fetchParams = {
      range: debouncedRange,
      minMagnitude: debouncedMinMagnitude,
      maxResults,
      signal: controller.signal
    }
    
    // Add geographic filtering if enabled and bounds available
    if (geographicFiltering && debouncedBounds) {
      fetchParams.bounds = debouncedBounds
    }
    
    const fetchFunction = geographicFiltering ? getEarthquakesWithBounds : earthquakesAPI.getEarthquakes
    
    fetchFunction(fetchParams).then(res => {
      if (!mounted) return
      
      const fetchTime = performance.now() - fetchStart
      lastFetchTime.current = fetchTime
      
      if (res.ok) {
        setAllData(res.features)
        setFromCache(!!res.fromCache)
        setError(null)
        
        // Show performance info
        if (res.originalCount && res.filteredCount) {
          console.log(`Geographic filtering: ${res.filteredCount}/${res.originalCount} earthquakes (${fetchTime.toFixed(1)}ms)`)
        }
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
  }, [debouncedRange, debouncedMinMagnitude, debouncedBounds, geographicFiltering, performanceMode])
  
  // Smart visible data calculation
  const visibleData = useMemo(() => {
    if (!allData.length) return []
    
    const start = performance.now()
    
    // Viewport filtering (if not already done by API)
    const viewportFiltered = !geographicFiltering && viewportBounds ? 
      allData.filter(eq => isInViewport(eq, viewportBounds)) : 
      allData
    
    // Priority sorting - magnitude and recency
    const sorted = viewportFiltered.sort((a, b) => {
      const aMag = a.magnitude || 0
      const bMag = b.magnitude || 0
      const aTime = a.time || 0
      const bTime = b.time || 0
      
      // Prioritize higher magnitude, then recent
      if (Math.abs(aMag - bMag) > 0.5) return bMag - aMag
      return bTime - aTime
    })
    
    // Smart rendering limits
    const zoom = viewportBounds?.zoom || 2
    const renderLimit = getSmartRenderingLimit(zoom, sorted.length, performanceMode)
    const limited = sorted.slice(0, renderLimit)
    
    // Update performance metrics
    const renderTime = performance.now() - start
    performanceMetrics.current.renderCount++
    performanceMetrics.current.avgRenderTime = 
      (performanceMetrics.current.avgRenderTime * (performanceMetrics.current.renderCount - 1) + renderTime) / 
      performanceMetrics.current.renderCount
    
    // Update stats
    setRenderingStats({
      visible: limited.length,
      total: allData.length,
      culled: allData.length - limited.length,
      viewport: viewportFiltered.length,
      avgRenderTime: performanceMetrics.current.avgRenderTime
    })
    
    if (renderTime > 50) {
      console.warn(`Slow render: ${renderTime.toFixed(1)}ms for ${limited.length} earthquakes`)
    }
    
    return limited
  }, [allData, viewportBounds, performanceMode, geographicFiltering])
  
  // Optimized heatmap points
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
  
  // Marker click handler
  const handleMarkerClick = useCallback((eqId) => {
    setSelectedId(eqId)
  }, [setSelectedId])
  
  // Auto-performance adjustment based on performance
  useEffect(() => {
    if (performanceMetrics.current.avgRenderTime > 100 && performanceMode !== 'performance') {
      console.log('Performance degradation detected, suggesting performance mode')
      setToast('Consider switching to Performance mode for better responsiveness')
      setTimeout(() => setToast(null), 4000)
    }
  }, [renderingStats, performanceMode])
  
  // Determine rendering mode based on data density and zoom
  const shouldUseCanvas = useMemo(() => {
    if (renderingMode === 'canvas') return true
    if (renderingMode === 'dom') return false
    
    // Smart mode: use canvas for dense areas
    const zoom = viewportBounds?.zoom || 2
    const density = visibleData.length / Math.max(1, Math.pow(2, zoom))
    return density > 10 && visibleData.length > 200
  }, [renderingMode, viewportBounds, visibleData.length])

  // START: Responsive styles
  const controlsPanelStyle = {
    position: 'absolute',
    top: isMobile ? 8 : 12,
    left: isMobile ? 8 : 12,
    right: isMobile ? 8 : 'auto',
    zIndex: 7000,
    background: 'var(--panel-bg)',
    color: 'var(--panel-text)',
    padding: 10,
    borderRadius: 8,
    width: isMobile ? 'auto' : 320,
    maxWidth: isMobile ? 'calc(100% - 16px)' : 400,
  };

  const toastStyle = {
    position: 'fixed',
    bottom: 12,
    zIndex: 20000,
    background: 'var(--panel-bg)',
    color: 'var(--panel-text)',
    padding: '12px 16px',
    borderRadius: 8,
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    maxWidth: '300px',
    ...(isMobile ? {
        left: '50%',
        transform: 'translateX(-50%)',
        width: 'calc(100% - 24px)',
        textAlign: 'center',
    } : {
        right: 12,
    })
  };
  // END: Responsive styles
  
  return (
    <>
      <div className="h-[70vh] w-full rounded-md overflow-hidden shadow" style={{ height: '70vh', position: 'relative' }}>
        {loading && (
          <div style={{position:'absolute', left:12, top:12, zIndex:6000, background:'var(--panel-bg)', color:'var(--panel-text)', padding:10, borderRadius:8}}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:16,height:16,border:'3px solid #cbd5e1',borderTopColor:'#2563eb',borderRadius:999,animation:'spin 1s linear infinite'}} />
              <div style={{fontSize:13}}>Loading earthquakes...</div>
            </div>
          </div>
        )}
  {error && <div style={{position:'absolute', left:12, top:12, zIndex:6000, background:'var(--panel-bg)', color:'red', padding:10, borderRadius:8}}>Error: {error}</div>}
        
        <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
          <ViewportTracker onBoundsChange={handleBoundsChange} />
          
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Canvas-based heatmap or regular heatmap */}
          {showHeatmap && heatmapPoints.length > 0 && (
            <CanvasHeatmap 
              points={heatmapPoints}
              radius={heatRadius}
              blur={heatBlur}
              maxIntensity={heatmapPoints.reduce((max, p) => Math.max(max, p.intensity || 0), 0) || 1}
            />
          )}
          
          {/* Lightweight custom clustering */}
          {!showHeatmap && (
            <LightweightCluster 
              earthquakes={visibleData}
              onMarkerClick={handleMarkerClick}
              selectedId={selectedId}
              highlightedIds={highlightedIds}
            />
          )}
        </MapContainer>

        {/* Advanced Controls Panel */}
        {!loading && !error && allData.length > 0 && (
          <div style={controlsPanelStyle}>
            {/* Performance Mode & Filtering Toggles */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Performance Mode:</div>
                <select 
                  value={performanceMode} 
                  onChange={e => setPerformanceMode(e.target.value)}
                  style={{ fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.08)', background: 'var(--panel-bg)', color: 'var(--panel-text)' }}
                >
                  <option value="performance">Performance</option>
                  <option value="balanced">Balanced</option>
                  <option value="high">High Quality</option>
                </select>
              </div>
              
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, marginTop: isMobile ? 0 : 20 }}>
                <input 
                  type="checkbox" 
                  checked={geographicFiltering} 
                  onChange={e => setGeographicFiltering(e.target.checked)} 
                />
                <span>Smart Loading</span>
              </label>
            </div>
            
            {/* Rendering Stats */}
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, lineHeight: 1.3 }}>
              <div>Showing {renderingStats.visible} of {renderingStats.total} earthquakes</div>
              {renderingStats.culled > 0 && (
                <div style={{ color: '#059669' }}>• {renderingStats.culled} culled for performance</div>
              )}
              {renderingStats.avgRenderTime > 0 && (
                <div style={{ color: renderingStats.avgRenderTime > 50 ? '#dc2626' : '#059669' }}>
                  • Avg render: {renderingStats.avgRenderTime.toFixed(1)}ms
                </div>
              )}
              {lastFetchTime.current > 0 && (
                <div>• Fetch time: {lastFetchTime.current.toFixed(1)}ms</div>
              )}
            </div>
            
            {/* Heatmap Controls */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={showHeatmap} onChange={e => setShowHeatmap(e.target.checked)} />
                <span style={{ fontSize: 12 }}>Heatmap Mode</span>
              </label>
            </div>

            {showHeatmap && (
              <div style={{ display: 'grid', gap: 6, marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 8px', alignItems: 'center' }}>
                  <label style={{ fontSize: 11 }}>Radius: {heatRadius}</label>
                  <input type="range" min="10" max="80" value={heatRadius} onChange={e => setHeatRadius(Number(e.target.value))} />
                  
                  <label style={{ fontSize: 11 }}>Blur: {heatBlur}</label>
                  <input type="range" min="5" max="50" value={heatBlur} onChange={e => setHeatBlur(Number(e.target.value))} />
                  
                  <label style={{ fontSize: 11 }}>Scale: {heatScale.toFixed(1)}</label>
                  <input type="range" min="0.1" max="5" step="0.1" value={heatScale} onChange={e => setHeatScale(Number(e.target.value))} />
                </div>
              </div>
            )}
            
            {/* Cache and Debug Controls */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: fromCache ? '#e6fffa' : '#eef2ff', color: fromCache ? '#0f766e' : '#3730a3' }}>
                {fromCache ? 'Cached' : 'Live'}
              </div>
              
              <button 
                onClick={() => {
                  cacheLib.clearAll()
                  setFromCache(false)
                  setToast('All cache cleared')
                  setTimeout(() => setToast(null), 2000)
                }}
                style={{ background: '#ef4444', color: 'white', border: 'none', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
              >
                Clear All Cache
              </button>
              
              <button 
                onClick={() => setShowInspector(true)}
                style={{ background: '#6b7280', color: 'white', border: 'none', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}
              >
                Cache Inspector
              </button>
            </div>
          </div>
        )}

        {!loading && !error && allData.length === 0 && (
          <div style={{position:'absolute', left:'50%', top:'48%', transform:'translate(-50%,-50%)', zIndex:6000, background:'var(--panel-bg)', color: 'var(--panel-text)', padding:16, borderRadius:8}}>
            No earthquakes match current filters.
          </div>
        )}

        {/* START: Responsive Styles Block */}
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          
          .eq-legend {
            position: absolute;
            bottom: 20px;
            right: 12px;
            background: var(--panel-bg);
            color: var(--panel-text);
            padding: 12px;
            border-radius: 8px;
            z-index: 1000;
            box-shadow: 0 1px 5px rgba(0,0,0,0.2);
            transition: all 0.2s ease-in-out;
          }
          .eq-legend.collapsed {
            padding: 6px;
          }
          .eq-legend .title { font-weight: 600; margin-bottom: 8px; font-size: 14px; }
          .eq-legend .row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
          .eq-legend .swatch { width: 16px; height: 16px; border-radius: 4px; }
            .eq-legend .toggle {
              background: var(--panel-bg);
              border: 1px solid rgba(0,0,0,0.06);
              color: var(--panel-text);
              border-radius: 6px;
              width: 24px;
              height: 24px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 16px;
              line-height: 1;
            }

          /* Mobile adjustments */
          @media (max-width: 767px) {
            .eq-legend {
              bottom: 12px;
              left: 8px;
              right: 8px;
              width: auto;
            }
            .eq-legend:not(.collapsed) .title {
              text-align: center;
            }
            .eq-legend:not(.collapsed) .legend-body {
              display: flex;
              flex-wrap: wrap;
              justify-content: center;
              gap: 4px 16px; /* row and column gap */
            }
          }
        `}</style>
        {/* END: Responsive Styles Block */}

        {/* Enhanced Legend */}
        <div className={`eq-legend ${legendCollapsed ? 'collapsed' : ''}`} role="region" aria-label="Magnitude legend">
          {!legendCollapsed ? (
            <>
              <div className="title">Legend</div>
              <div className="legend-body">
                <div className="row">
                  <div className="swatch" style={{ background: '#10b981' }}></div><div style={{fontSize:12}}> &lt;2.0</div>
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
                  <div className="swatch" style={{ background: '#b91c1c' }}></div><div style={{fontSize:12}}> 6.0+</div>
                </div>
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: '#6b7280', textAlign: 'center' }}>
                Mode: {shouldUseCanvas ? 'Canvas' : 'DOM'} | {performanceMode}
              </div>
              <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="toggle" aria-label="Collapse legend" onClick={() => setLegendCollapsed(true)}>▾</button>
              </div>
            </>
          ) : (
            <button className="toggle" aria-label="Expand legend" onClick={() => setLegendCollapsed(false)}>▸</button>
          )}
        </div>
      </div>
      
      {/* Enhanced Toast System */}
      {toast && (
        <div style={toastStyle}>
          <div style={{ fontSize: 13 }}>{toast}</div>
          <button 
            onClick={() => setToast(null)} 
            style={{ 
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent', 
              border: 'none', 
              color: '#a1a1aa', 
              cursor: 'pointer',
              fontSize: 18,
              padding: '4px'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Cache Inspector Modal */}
      {showInspector && (
        <div style={{ 
          position: 'fixed', 
          left: 0, 
          top: 0, 
          right: 0, 
          bottom: 0, 
          background: '(0,0,0,0.4)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          zIndex: 30000,
          padding: '16px'
        }}>
          {/* Modal Content container made responsive */}
          <div
          className='flex items-center justify-center'
          style={{ 
            color: 'var(--panel-text)',
            borderRadius: '8px',
            padding: '20px',
            width: '100%',
            maxWidth: '800px', 
            height: '100%',
            maxHeight: '85vh', 
            overflowY: 'auto',
            zIndex: 30001 
          }}>
            <CacheInspector 
              onClose={() => setShowInspector(false)} 
              onClearAll={(err, removed) => {
                if (err) {
                  setToast('Failed to clear cache: ' + err.message)
                } else {
                  setToast(`Successfully cleared ${removed || 0} cache entries`)
                  setFromCache(false)
                }
                setShowInspector(false)
                setTimeout(() => setToast(null), 3000)
              }} 
            />
          </div>
        </div>
      )}
    </>
  )
}