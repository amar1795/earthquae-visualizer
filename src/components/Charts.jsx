import React, { useMemo, useEffect, useState } from 'react'
import earthquakesAPI from '../api/earthquakes'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts'

// data: array of features with { time, magnitude }
export default function Charts({ range = '24h', minMagnitude = 0 }) {
  const [data, setData] = useState([])

  useEffect(() => {
    let mounted = true
    const controller = new AbortController()
    earthquakesAPI.getEarthquakes({ range, minMagnitude, maxResults: 2000, signal: controller.signal }).then(res => {
      if (!mounted) return
      if (res.ok) setData(res.features)
    }).catch(() => {})
    return () => { mounted = false; controller.abort() }
  }, [range, minMagnitude])

  const timeline = useMemo(() => {
    // bucket by hour for the last 7 days range (or available range)
    const map = new Map()
    data.forEach(d => {
      const date = new Date(d.time)
      // bucket key: YYYY-MM-DD HH:00
      const key = date.toISOString().slice(0,13) + ':00'
      map.set(key, (map.get(key) || 0) + 1)
    })
    const arr = Array.from(map.entries()).map(([k,v]) => ({ time: k, count: v }))
    // sort by time
    arr.sort((a,b) => a.time.localeCompare(b.time))
    return arr
  }, [data])

  const histogram = useMemo(() => {
    const buckets = [0,1,2,3,4,5,6,7,8]
    const counts = buckets.map((b, i) => ({ bucket: `${b}-${b+1}`, count: 0 }))
    data.forEach(d => {
      const m = Math.max(0, Math.floor(d.magnitude || 0))
      const idx = Math.min(m, counts.length - 1)
      counts[idx].count += 1
    })
    return counts
  }, [data])

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ height: 140 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Events over time</div>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeline}>
            <XAxis dataKey="time" tick={{ fontSize: 10 }} />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#2563eb" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ height: 140 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Magnitude distribution</div>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={histogram}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
