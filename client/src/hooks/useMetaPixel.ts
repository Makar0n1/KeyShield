import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

declare global {
  interface Window {
    fbq?: (action: string, event: string, params?: Record<string, unknown>) => void
  }
}

export function useMetaPixel() {
  const location = useLocation()

  // Track PageView on route change (for SPA navigation)
  useEffect(() => {
    if (window.fbq) {
      window.fbq('track', 'PageView')
    }
  }, [location.pathname])
}

export function trackEvent(event: string, params?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', event, params)
  }
}
