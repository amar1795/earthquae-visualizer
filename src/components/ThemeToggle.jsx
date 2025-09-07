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
    <label className="theme-switch" aria-label="Toggle color theme">
      <input
        type="checkbox"
        role="switch"
        aria-checked={isDark}
        checked={isDark}
        onChange={() => setIsDark(v => !v)}
      />
      <span className="switch" aria-hidden>
        <span className="knob" />
      </span>
    </label>
  )
}
