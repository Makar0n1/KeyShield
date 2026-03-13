import { useParams } from 'react-router-dom'

export const LANGS = ['ru', 'en', 'uk'] as const
export type Lang = typeof LANGS[number]

export function useLang(): Lang {
  const { lang } = useParams<{ lang?: string }>()
  return (LANGS.includes(lang as Lang) ? lang : 'ru') as Lang
}

export function useLangPath() {
  const lang = useLang()
  return (path: string): string => {
    if (!path.startsWith('/')) return path
    if (path === '/') return `/${lang}`
    return `/${lang}${path}`
  }
}
