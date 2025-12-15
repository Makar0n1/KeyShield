import { useState, useEffect } from 'react'
import { ArrowUp } from 'lucide-react'

interface ScrollToTopButtonProps {
  threshold?: number // pixels scrolled before showing button
}

/**
 * Floating button that appears on scroll and scrolls page to top
 */
export function ScrollToTopButton({ threshold = 400 }: ScrollToTopButtonProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > threshold)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    // Check initial state
    handleScroll()

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  }, [threshold])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    })
  }

  if (!isVisible) return null

  return (
    <button
      onClick={scrollToTop}
      className="fixed bottom-6 right-6 z-50 p-3 bg-primary hover:bg-primary-dark text-white rounded-full shadow-lg transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-dark"
      aria-label="Scroll to top"
    >
      <ArrowUp size={20} />
    </button>
  )
}
