import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

const navLinks = [
  { href: '/#features', label: 'Возможности' },
  { href: '/#how-it-works', label: 'Как работает' },
  { href: '/#pricing', label: 'Цены' },
  { href: '/blog', label: 'Блог' },
  { href: '/terms', label: 'Документы' },
]

export function Header() {
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()

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

  const handleNavClick = (href: string) => {
    setIsOpen(false)
    // Handle anchor links on home page
    if (href.startsWith('/#') && location.pathname === '/') {
      const element = document.querySelector(href.replace('/', ''))
      element?.scrollIntoView({ behavior: 'smooth' })
    }
  }

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
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    onClick={() => handleNavClick(link.href)}
                    className={cn(
                      'text-gray-300 hover:text-white transition-colors text-sm',
                      location.pathname === link.href && 'text-white'
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>

            {/* CTA Button */}
            <Button asChild className="hidden md:inline-flex">
              <a href="https://t.me/keyshield_bot" target="_blank" rel="noopener noreferrer">
                Открыть бота
              </a>
            </Button>

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
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    className="text-gray-300 hover:text-white py-3 border-b border-border transition-colors"
                    onClick={() => handleNavClick(link.href)}
                  >
                    {link.label}
                  </Link>
                ))}
                <Button asChild className="mt-6">
                  <a href="https://t.me/keyshield_bot" target="_blank" rel="noopener noreferrer">
                    Открыть бота
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
