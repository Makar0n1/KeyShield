import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Menu, X, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LangLink } from '@/components/ui/LangLink'
import { cn } from '@/utils/cn'
import { useLang } from '@/hooks/useLang'

const navKeys = [
  { href: '/#features', key: 'header.features' },
  { href: '/#how-it-works', key: 'header.how_it_works' },
  { href: '/#pricing', key: 'header.pricing' },
  { href: '/blog', key: 'header.blog' },
]

const LANGUAGES = [
  { code: 'ru', label: 'RU', flag: '🇷🇺' },
  { code: 'en', label: 'EN', flag: '🇬🇧' },
  { code: 'uk', label: 'UA', flag: '🇺🇦' },
]

export function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = useLang()

  const isHomePage = location.pathname === `/${lang}` || location.pathname === `/${lang}/`

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  useEffect(() => {
    if (!langOpen) return
    const close = () => setLangOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [langOpen])

  const handleNavClick = (href: string) => {
    setIsOpen(false)
    if (href.startsWith('/#') && isHomePage) {
      const el = document.querySelector(href.replace('/', ''))
      el?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const switchLang = (newLang: string) => {
    const newPath = location.pathname.replace(`/${lang}`, `/${newLang}`)
    navigate(newPath + location.search + location.hash)
    i18n.changeLanguage(newLang)
    setLangOpen(false)
  }

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0]

  return (
    <>
      <header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
          scrolled
            ? 'bg-[#0a0a0f]/90 backdrop-blur-xl border-b border-white/[0.06]'
            : 'bg-transparent'
        )}
      >
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <nav className="flex items-center justify-between h-16">
            {/* Logo */}
            <LangLink to="/" className="flex items-center gap-2 group">
              <span className="text-white font-semibold tracking-tight">KeyShield</span>
            </LangLink>

            {/* Desktop Nav — centered */}
            <ul className="hidden lg:flex items-center gap-8">
              {navKeys.map((link) => (
                <li key={link.href}>
                  <LangLink
                    to={link.href}
                    onClick={() => handleNavClick(link.href)}
                    className="text-[13px] text-white/50 hover:text-white transition-colors"
                  >
                    {t(link.key)}
                  </LangLink>
                </li>
              ))}
            </ul>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* Language */}
              <div className="relative hidden sm:block">
                <button
                  onClick={(e) => { e.stopPropagation(); setLangOpen(!langOpen) }}
                  className="flex items-center gap-1 text-[13px] text-white/40 hover:text-white/70 transition-colors"
                >
                  {currentLang.label}
                  <ChevronDown size={12} />
                </button>
                {langOpen && (
                  <div className="absolute right-0 top-full mt-3 bg-[#141420] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden min-w-[100px]">
                    {LANGUAGES.map((l) => (
                      <button
                        key={l.code}
                        onClick={() => switchLang(l.code)}
                        className={cn(
                          'flex items-center gap-2.5 px-4 py-2.5 text-[13px] w-full transition-colors',
                          i18n.language === l.code
                            ? 'text-white bg-white/[0.06]'
                            : 'text-white/40 hover:text-white hover:bg-white/[0.04]'
                        )}
                      >
                        <span className="text-base">{l.flag}</span>
                        {l.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* CTA */}
              <a
                href="https://t.me/keyshield_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex text-[13px] text-white px-4 py-2 rounded-full border border-white/[0.12] hover:bg-white/[0.06] transition-colors"
              >
                {t('header.open_bot')}
              </a>

              {/* Mobile menu */}
              <button
                className="lg:hidden text-white/60 p-1.5 hover:text-white transition-colors"
                onClick={() => setIsOpen(!isOpen)}
              >
                {isOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* Mobile Menu */}
      {createPortal(
        <div
          className={cn(
            'fixed inset-0 z-[100] lg:hidden transition-opacity duration-300',
            isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsOpen(false)} />

          <div
            className={cn(
              'absolute top-0 right-0 w-72 max-w-[80vw] h-full bg-[#0f0f1a] transform transition-transform duration-300 border-l border-white/[0.06]',
              isOpen ? 'translate-x-0' : 'translate-x-full'
            )}
          >
            <div className="p-6">
              <button
                className="absolute top-4 right-4 text-white/40 p-2 hover:text-white transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <X size={20} />
              </button>

              <nav className="flex flex-col gap-1 mt-14">
                {navKeys.map((link) => (
                  <LangLink
                    key={link.href}
                    to={link.href}
                    className="text-white/50 hover:text-white py-3 text-[15px] transition-colors"
                    onClick={() => handleNavClick(link.href)}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                  >
                    {t(link.key)}
                  </LangLink>
                ))}

                {/* Mobile languages */}
                <div className="flex items-center gap-1 py-4">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => switchLang(l.code)}
                      className={cn(
                        'px-3 py-1.5 text-[13px] rounded-full transition-all',
                        i18n.language === l.code
                          ? 'text-white bg-white/[0.1]'
                          : 'text-white/30 hover:text-white/60'
                      )}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>

                <a
                  href="https://t.me/keyshield_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 text-center text-[13px] text-white py-2.5 rounded-full border border-white/[0.12] hover:bg-white/[0.06] transition-colors"
                >
                  {t('header.open_bot')}
                </a>
              </nav>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
