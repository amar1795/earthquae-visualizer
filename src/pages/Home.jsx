import React from 'react'
import MapView from '../components/MapView'

export default function Home() {
  return (
    <main className="p-6 font-sans">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">🌍 Earthquake Visualizer</h1>
        <p className="text-sm text-gray-600">Map and filters will be added in subsequent steps.</p>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1">
          <div className="p-4 bg-white rounded shadow">Filters panel (coming soon)</div>
        </aside>
        <div className="lg:col-span-3">
          <MapView />
        </div>
      </section>
    </main>
  )
}
