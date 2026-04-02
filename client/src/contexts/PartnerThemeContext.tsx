import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

type Theme = 'dark' | 'light'

interface ThemeContextType {
  theme: Theme
  toggle: () => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextType | null>(null)

const STORAGE_KEY = 'partner_theme'

export function PartnerThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return (saved === 'light' || saved === 'dark') ? saved : 'dark'
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, theme)
    // Add/remove class on root for partner pages
    document.documentElement.setAttribute('data-partner-theme', theme)
    return () => {
      document.documentElement.removeAttribute('data-partner-theme')
    }
  }, [theme])

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  return (
    <ThemeContext.Provider value={{ theme, toggle, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function usePartnerTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('usePartnerTheme must be used within PartnerThemeProvider')
  return context
}
