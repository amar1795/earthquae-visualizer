import React from 'react'
import MapView from '../components/MapView'
import Filters from '../components/Filters'
import Charts from '../components/Charts'
import ThemeToggle from '../components/ThemeToggle'
import { useState } from 'react'

export default function Home() {
  const [range, setRange] = useState('24h')
  const [minMagnitude, setMinMagnitude] = useState(0)
  // selected event id used to link charts <-> map
  const [selectedId, setSelectedId] = useState(null)
  // highlighted ids (from chart hover) to visually emphasize many markers
  const [highlightedIds, setHighlightedIds] = useState([])

  return (
    <main className="p-6 font-sans" style={{ padding: '1.5rem', fontFamily: 'Arial, sans-serif' }}>

        <div className=" p-4 sm:py-6 rounded mb-4 w-full flex items-center justify-center">
          <header className="mb-0 w-full max-w-4xl px-2" style={{ position: 'relative' }}>
            <ThemeToggle />
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-center uppercase tracking-tight" style={{ margin: 0 }}>
              <span className="hidden sm:inline-block mr-2" aria-hidden="true">🌍</span>
              Earthquake Visualizer
            </h1>
          </header>
        </div>

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-6" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
        
        
        <div className="lg:col-span-3">
          <MapView range={range} minMagnitude={minMagnitude} selectedId={selectedId} setSelectedId={setSelectedId} highlightedIds={highlightedIds} />
        </div>
        <aside className="lg:col-span-1">
            <div className="p-4 rounded shadow" style={{ background: 'var(--panel-bg)', color: 'var(--panel-text)' }}>
            <Charts range={range} minMagnitude={minMagnitude} selectedId={selectedId} setSelectedId={setSelectedId} setHighlightedIds={setHighlightedIds} />
          </div>
          <div style={{ height: 12 }} />
          
        </aside>
      </section>
    </main>
  )
}
 
