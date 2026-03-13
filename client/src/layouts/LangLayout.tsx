import { useEffect } from 'react'
import { useParams, Navigate, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LANGS, type Lang } from '@/hooks/useLang'

const HTML_LANG_MAP: Record<string, string> = {
  ru: 'ru-RU',
  en: 'en-US',
  uk: 'uk-UA',
}

export function LangLayout() {
  const { lang } = useParams<{ lang: string }>()
  const { i18n } = useTranslation()

  const isValid = LANGS.includes(lang as Lang)

  useEffect(() => {
    if (isValid && i18n.language !== lang) {
      i18n.changeLanguage(lang)
    }
    if (isValid) {
      document.documentElement.lang = HTML_LANG_MAP[lang!] || 'ru-RU'
    }
  }, [lang, i18n, isValid])

  if (!isValid) return <Navigate to="/en" replace />

  return <Outlet />
}
