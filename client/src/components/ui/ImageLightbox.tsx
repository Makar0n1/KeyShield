import { useState, useEffect, useRef, useCallback } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { createPortal } from 'react-dom'

interface ImageLightboxProps {
  images: string[]
  initialIndex?: number
  isOpen: boolean
  onClose: () => void
  alt?: string
}

export function ImageLightbox({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  alt = 'Image'
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [showHint, setShowHint] = useState(true)
  const [isClosing, setIsClosing] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const carouselRef = useRef<HTMLDivElement>(null)

  // Reset index when opening
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex)
      setIsClosing(false)
      setShowHint(true)
      const timer = setTimeout(() => setShowHint(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [isOpen, initialIndex])

  // Scroll to current image when index changes
  useEffect(() => {
    if (isOpen && carouselRef.current) {
      const scrollTo = currentIndex * window.innerWidth
      carouselRef.current.scrollTo({ left: scrollTo, behavior: 'smooth' })
    }
  }, [currentIndex, isOpen])

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Save scroll position when opening lightbox
  const savedScrollY = useRef(0)

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return

    // Save scroll position when opening
    savedScrollY.current = window.scrollY

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowLeft':
          goToPrev()
          break
        case 'ArrowRight':
          goToNext()
          break
        case 'Escape':
          handleClose()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${savedScrollY.current}px`
    document.body.style.width = '100%'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      // Restore scroll position when closing
      window.scrollTo(0, savedScrollY.current)
    }
  }, [isOpen, currentIndex])

  const goToNext = useCallback(() => {
    if (images.length > 1) {
      setCurrentIndex((prev) => (prev + 1) % images.length)
    }
  }, [images.length])

  const goToPrev = useCallback(() => {
    if (images.length > 1) {
      setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)
    }
  }, [images.length])

  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
    }, 150)
  }, [onClose])

  // Handle scroll snap end to update current index
  const handleScroll = useCallback(() => {
    if (!carouselRef.current) return
    const scrollLeft = carouselRef.current.scrollLeft
    const width = window.innerWidth
    const newIndex = Math.round(scrollLeft / width)
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < images.length) {
      setCurrentIndex(newIndex)
    }
  }, [currentIndex, images.length])

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === containerRef.current) {
      handleClose()
    }
  }, [handleClose])

  // Handle swipe up/down to close
  const touchStartY = useRef(0)
  const touchStartX = useRef(0)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    touchStartX.current = e.touches[0].clientX
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const deltaY = e.changedTouches[0].clientY - touchStartY.current
    const deltaX = Math.abs(e.changedTouches[0].clientX - touchStartX.current)

    // Swipe up/down to close (only if not horizontal swipe)
    if (Math.abs(deltaY) > 100 && deltaX < 50) {
      handleClose()
    }
  }, [handleClose])

  if (!isOpen) return null

  const hasMultiple = images.length > 1

  const content = (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[9999] bg-black/95 transition-opacity duration-150 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
      onClick={handleBackdropClick}
    >
      {/* Close button */}
      <button
        onClick={handleClose}
        className="absolute top-4 right-4 z-20 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
      >
        <X size={24} />
      </button>

      {/* Counter */}
      {hasMultiple && (
        <div className="absolute top-4 left-4 z-20 px-4 py-2 rounded-full bg-black/50 text-white text-sm font-medium">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Navigation arrows - desktop only */}
      {hasMultiple && !isMobile && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goToPrev() }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <ChevronLeft size={32} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goToNext() }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <ChevronRight size={32} />
          </button>
        </>
      )}

      {/* Carousel container */}
      <div
        ref={carouselRef}
        className="h-full w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none'
        }}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex h-full" style={{ width: `${images.length * 100}vw` }}>
          {images.map((src, idx) => (
            <div
              key={idx}
              className="flex-shrink-0 w-screen h-full flex items-center justify-center snap-center p-4"
              style={{ scrollSnapAlign: 'center' }}
            >
              <img
                src={src}
                alt={`${alt} ${idx + 1}`}
                className={`max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-transform duration-150 ${isClosing ? 'scale-95' : 'scale-100'}`}
                draggable={false}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dots indicator */}
      {hasMultiple && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-20">
          {images.map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation()
                setCurrentIndex(idx)
              }}
              className={`h-2 rounded-full transition-all ${
                idx === currentIndex
                  ? 'bg-white w-6'
                  : 'bg-white/50 hover:bg-white/70 w-2'
              }`}
            />
          ))}
        </div>
      )}

      {/* Navigation hints toast */}
      {showHint && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-lg bg-black/70 text-white text-sm animate-fade-in">
          {isMobile ? (
            hasMultiple
              ? 'Свайп влево/вправо — листать • Вверх/вниз — закрыть'
              : 'Свайп вверх/вниз — закрыть'
          ) : (
            hasMultiple
              ? '← → — листать • Esc — закрыть'
              : 'Esc или клик вне фото — закрыть'
          )}
        </div>
      )}

      {/* Hide scrollbar styles */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )

  return createPortal(content, document.body)
}
