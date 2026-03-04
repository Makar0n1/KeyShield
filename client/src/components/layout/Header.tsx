import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Menu, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

const navKeys = [
  { href: '/#features', key: 'header.features' },
  { href: '/#how-it-works', key: 'header.how_it_works' },
  { href: '/#pricing', key: 'header.pricing' },
  { href: '/#testimonials', key: 'header.testimonials' },
  { href: '/blog', key: 'header.blog' },
  { href: '/terms', key: 'header.docs' },
]

const LANGUAGES = [
  { code: 'ru', flag: '🇷🇺' },
  { code: 'en', flag: '🇬🇧' },
  { code: 'uk', flag: '🇺🇦' },
]

export function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const location = useLocation()
  const { t, i18n } = useTranslation()

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Close language dropdown on outside click
  useEffect(() => {
    if (!langOpen) return
    const close = () => setLangOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [langOpen])

  const handleNavClick = (href: string) => {
    setIsOpen(false)
    // Handle anchor links on home page
    if (href.startsWith('/#') && location.pathname === '/') {
      const element = document.querySelector(href.replace('/', ''))
      element?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const currentFlag = LANGUAGES.find(l => l.code === i18n.language)?.flag || '🇷🇺'

  return (
    <>
      <header className="sticky top-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-sm border-b border-white/10">
        <div className="container mx-auto px-4">
          <nav className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2 text-white font-bold text-xl">
              <span className="text-2xl">&#x1F510;</span>
              <span>KeyShield</span>
            </Link>

            {/* Desktop Nav */}
            <ul className="hidden md:flex items-center gap-6">
              {navKeys.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    onClick={() => handleNavClick(link.href)}
                    className={cn(
                      'text-gray-300 hover:text-white transition-colors text-sm',
                      location.pathname === link.href && 'text-white'
                    )}
                  >
                    {t(link.key)}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="hidden md:flex items-center gap-3">
              {/* Language Selector */}
              <div className="relative">
                <button
                  onClick={(e) => { e.stopPropagation(); setLangOpen(!langOpen) }}
                  className="text-xl hover:opacity-80 transition-opacity px-1"
                  aria-label="Change language"
                >
                  {currentFlag}
                </button>
                {langOpen && (
                  <div className="absolute right-0 top-full mt-2 bg-dark-light border border-border rounded-lg shadow-lg overflow-hidden z-50">
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => { i18n.changeLanguage(lang.code); setLangOpen(false) }}
                        className={cn(
                          'flex items-center gap-2 px-4 py-2 text-sm w-full hover:bg-dark-lighter transition-colors',
                          i18n.language === lang.code ? 'text-primary' : 'text-gray-300'
                        )}
                      >
                        <span>{lang.flag}</span>
                        <span>{lang.code.toUpperCase()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* CTA Button */}
              <Button asChild>
                <a href="https://t.me/keyshield_bot" target="_blank" rel="noopener noreferrer">
                  {t('header.open_bot')}
                </a>
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden text-white p-2 hover:bg-dark-light rounded-lg transition-colors"
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle menu"
            >
              {isOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile Menu - rendered via portal */}
      {createPortal(
        <div
          className={cn(
            'fixed inset-0 z-[100] md:hidden transition-opacity duration-300',
            isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          )}
        >
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsOpen(false)}
          />

          {/* Sidebar */}
          <div
            className={cn(
              'absolute top-0 right-0 w-72 max-w-[80vw] h-full bg-dark-light transform transition-transform duration-300',
              isOpen ? 'translate-x-0' : 'translate-x-full'
            )}
          >
            <div className="p-6">
              <button
                className="absolute top-4 right-4 text-white p-2 hover:bg-dark-lighter rounded-lg"
                onClick={() => setIsOpen(false)}
              >
                <X size={24} />
              </button>

              <nav className="flex flex-col gap-2 mt-12">
                {navKeys.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    className="text-gray-300 hover:text-white py-3 border-b border-border transition-colors"
                    onClick={() => handleNavClick(link.href)}
                  >
                    {t(link.key)}
                  </Link>
                ))}

                {/* Mobile language selector */}
                <div className="flex items-center gap-2 py-3 border-b border-border">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => i18n.changeLanguage(lang.code)}
                      className={cn(
                        'text-xl px-2 py-1 rounded transition-opacity',
                        i18n.language === lang.code ? 'opacity-100' : 'opacity-40 hover:opacity-70'
                      )}
                    >
                      {lang.flag}
                    </button>
                  ))}
                </div>

                <Button asChild className="mt-6">
                  <a href="https://t.me/keyshield_bot" target="_blank" rel="noopener noreferrer">
                    {t('header.open_bot')}
                  </a>
                </Button>
              </nav>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
