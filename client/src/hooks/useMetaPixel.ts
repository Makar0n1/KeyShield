import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

declare global {
  interface Window {
    fbq?: FBQ
    _fbq?: FBQ
  }
}

interface FBQ {
  (action: string, event: string, params?: Record<string, unknown>): void
  callMethod?: (...args: unknown[]) => void
  queue: unknown[][]
  push: typeof Array.prototype.push
  loaded: boolean
  version: string
}

const META_PIXEL_ID = '749034924885108'

function initMetaPixel() {
  if (typeof window === 'undefined') return
  if (window.fbq) return

  const fbq: FBQ = function (...args: unknown[]) {
    if (fbq.callMethod) {
      fbq.callMethod(...args)
    } else {
      fbq.queue.push(args)
    }
  } as FBQ

  fbq.push = fbq.push || Array.prototype.push
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []

  window.fbq = fbq
  if (!window._fbq) window._fbq = fbq

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

export function trackEvent(event: string, params?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', event, params)
  }
}
