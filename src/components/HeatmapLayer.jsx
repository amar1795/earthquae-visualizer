import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.heat'

// points: array of { lat, lng, intensity }
export default function HeatmapLayer({ points = [], radius = 25, blur = 15, maxZoom = 10, gradient = null, maxIntensity = 1 }) {
  const map = useMap()

  useEffect(() => {
    if (!map) return
    const heatPoints = points.map(p => [p.lat, p.lng, p.intensity || 0.5])
    const options = { radius, blur, maxZoom }
    if (gradient) options.gradient = gradient
    if (maxIntensity) options.max = maxIntensity
    const layer = L.heatLayer(heatPoints, options)
    layer.addTo(map)
    return () => {
      try { map.removeLayer(layer) } catch (e) { /* ignore */ }
    }
  }, [map, points, radius, blur, maxZoom, gradient, maxIntensity])

  return null
}
