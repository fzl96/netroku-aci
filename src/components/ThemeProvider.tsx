// src/components/ThemeProvider.tsx
'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeCtx {
  theme: Theme
  toggle: () => void
}

const Ctx = createContext<ThemeCtx>({ theme: 'light', toggle: () => {} })

export function useTheme() {
  return useContext(Ctx)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialise from what the inline script already applied to <html>
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light'
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  })

  // Keep state in sync when the class changes externally (e.g. SSR mismatch fix)
  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark')
    setTheme(isDark ? 'dark' : 'light')
  }, [])

  function toggle() {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light'
      document.documentElement.classList.toggle('dark', next === 'dark')
      try { localStorage.setItem('theme', next) } catch {}
      return next
    })
  }

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>
}
