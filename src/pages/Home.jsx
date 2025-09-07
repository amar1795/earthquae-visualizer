import React from 'react'
import MapView from '../components/MapView'
import Filters from '../components/Filters'
import { useState } from 'react'

export default function Home() {
  return (
    <main className="p-6 font-sans" style={{ padding: '1.5rem', fontFamily: 'Arial, sans-serif' }}>
      <header className="mb-4" style={{ marginBottom: '1rem' }}>
        <h1 className="text-2xl font-bold" style={{ fontSize: '1.5rem', margin: 0 }}>🌍 Earthquake Visualizer</h1>
        <p className="text-sm text-gray-600" style={{ color: '#4b5563' }}>Map and filters will be added in subsequent steps.</p>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-6" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
        <aside className="lg:col-span-1">
          <div className="p-4 bg-white rounded shadow">
            <FiltersWrapper />
          </div>
        </aside>
        <div className="lg:col-span-3">
          <MapViewWrapper />
        </div>
      </section>
    </main>
  )
}

function MapViewWrapper() {
  const [range, setRange] = useState('24h')
  const [minMagnitude, setMinMagnitude] = useState(0)
  return <MapView range={range} minMagnitude={minMagnitude} />
}

function FiltersWrapper() {
  const [range, setRange] = useState('24h')
  const [minMagnitude, setMinMagnitude] = useState(0)
  // Keep local state and lift changes via custom events or context later; for now pass directly
  return <Filters range={range} setRange={setRange} minMagnitude={minMagnitude} setMinMagnitude={setMinMagnitude} />
}
