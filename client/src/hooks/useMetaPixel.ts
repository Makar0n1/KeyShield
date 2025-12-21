import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

declare global {
  interface Window {
    fbq?: (
      action: string,
      event: string,
      params?: Record<string, unknown>
    ) => void
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

// Standard Meta Pixel Events
// https://developers.facebook.com/docs/meta-pixel/reference

/**
 * Lead - Завершение регистрации / клик по CTA
 */
export function trackLead(params?: {
  content_name?: string
  content_category?: string
  currency?: string
  value?: number
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Lead', params)
  }
}

/**
 * ViewContent - Посещение важной страницы / просмотр контента
 */
export function trackViewContent(params?: {
  content_name?: string
  content_category?: string
  content_ids?: string[]
  content_type?: string
  currency?: string
  value?: number
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'ViewContent', params)
  }
}

/**
 * Contact - Обращение в компанию
 */
export function trackContact(params?: {
  content_name?: string
  content_category?: string
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Contact', params)
  }
}

/**
 * CompleteRegistration - Заполнение регистрационной формы
 */
export function trackCompleteRegistration(params?: {
  content_name?: string
  currency?: string
  value?: number
  status?: boolean
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'CompleteRegistration', params)
  }
}

/**
 * Search - Выполнение поиска
 */
export function trackSearch(params?: {
  search_string?: string
  content_ids?: string[]
  content_category?: string
  currency?: string
  value?: number
}) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', 'Search', params)
  }
}

/**
 * Generic trackEvent for backwards compatibility and custom events
 */
export function trackEvent(event: string, params?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', event, params)
  }
}
