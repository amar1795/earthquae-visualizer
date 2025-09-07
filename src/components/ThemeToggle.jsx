import React, { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem('theme')
      if (stored) return stored === 'dark'
    } catch (e) {
      // ignore
    }
    // fall back to system preference
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    const el = document.documentElement
    if (isDark) {
      el.classList.add('dark')
      try { localStorage.setItem('theme', 'dark') } catch (e) {}
    } else {
      el.classList.remove('dark')
      try { localStorage.setItem('theme', 'light') } catch (e) {}
    }
  }, [isDark])

  return (
    <button
      aria-label="Toggle theme"
      title="Toggle light / dark"
      onClick={() => setIsDark(v => !v)}
      className="theme-toggle"
    >
      {isDark ? '🌙' : '☀️'}
    </button>
  )
}
