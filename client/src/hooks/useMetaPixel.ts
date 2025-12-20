import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

declare global {
  interface Window {
    fbq: (
      action: string,
      event: string,
      params?: Record<string, unknown>
    ) => void
  }
}

const META_PIXEL_ID = '749034924885108'

function initMetaPixel() {
  if (typeof window === 'undefined') return
  if (window.fbq) return

  const f = window as Window & { _fbq?: typeof window.fbq }
  const n = (window.fbq = function (...args: Parameters<typeof window.fbq>) {
    if (n.callMethod) {
      n.callMethod.apply(n, args)
    } else {
      n.queue.push(args)
    }
  } as typeof window.fbq & {
    callMethod?: (...args: Parameters<typeof window.fbq>) => void
    queue: Parameters<typeof window.fbq>[]
    push: typeof Array.prototype.push
    loaded: boolean
    version: string
  })

  if (!f._fbq) f._fbq = n
  n.push = n.push || Array.prototype.push
  n.loaded = true
  n.version = '2.0'
  n.queue = []

  const script = document.createElement('script')
  script.async = true
  script.src = 'https://connect.facebook.net/en_US/fbevents.js'
  const firstScript = document.getElementsByTagName('script')[0]
  firstScript?.parentNode?.insertBefore(script, firstScript)

  window.fbq('init', META_PIXEL_ID)
}

export function useMetaPixel() {
  const location = useLocation()

  useEffect(() => {
    initMetaPixel()
  }, [])

  useEffect(() => {
    if (window.fbq) {
      window.fbq('track', 'PageView')
    }
  }, [location.pathname])
}

export function trackEvent(
  event: string,
  params?: Record<string, unknown>
) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', event, params)
  }
}
