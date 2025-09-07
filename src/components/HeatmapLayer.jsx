import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.heat'

// points: array of { lat, lng, intensity }
export default function HeatmapLayer({ points = [], radius = 25, blur = 15, maxZoom = 10 }) {
  const map = useMap()

  useEffect(() => {
    if (!map) return
    const heatPoints = points.map(p => [p.lat, p.lng, p.intensity || 0.5])
    const layer = L.heatLayer(heatPoints, { radius, blur, maxZoom })
    layer.addTo(map)
    return () => {
      try { map.removeLayer(layer) } catch (e) { /* ignore */ }
    }
  }, [map, points, radius, blur, maxZoom])

  return null
}
