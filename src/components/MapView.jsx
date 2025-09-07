import React from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'

export default function MapView() {
  return (
    <div className="h-[70vh] w-full rounded-md overflow-hidden shadow" style={{ height: '70vh' }}>
      <MapContainer center={[20, 0]} zoom={2} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </MapContainer>
    </div>
  )
}
