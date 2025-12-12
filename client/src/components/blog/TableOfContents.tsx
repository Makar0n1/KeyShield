import { useEffect, useState, useRef } from 'react'
import { List, ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'

interface TocItem {
  id: string
  text: string
  level: number
}

interface TableOfContentsProps {
  content: string
  className?: string
}

export function TableOfContents({ content, className }: TableOfContentsProps) {
  const [items, setItems] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [isOpen, setIsOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Parse headings from HTML content
    const parser = new DOMParser()
    const doc = parser.parseFromString(content, 'text/html')
    const headings = doc.querySelectorAll('h2, h3')

    const tocItems: TocItem[] = []
    headings.forEach((heading, index) => {
      const id = heading.id || `heading-${index}`
      tocItems.push({
        id,
        text: heading.textContent || '',
        level: parseInt(heading.tagName[1]),
      })
    })

    setItems(tocItems)
  }, [content])

  useEffect(() => {
    // Set up intersection observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id)
          }
        })
      },
      { rootMargin: '-100px 0px -80% 0px' }
    )

    items.forEach((item) => {
      const element = document.getElementById(item.id)
      if (element) {
        observer.observe(element)
      }
    })

    return () => observer.disconnect()
  }, [items])

  if (items.length === 0) {
    return null
  }

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      const offset = 100
      const top = element.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }

  return (
    <nav className={cn('bg-dark-light rounded-xl border border-border overflow-hidden', className)}>
      {/* Header - clickable to toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between text-white font-semibold hover:bg-dark-lighter transition-colors"
      >
        <span className="flex items-center gap-2">
          <List className="w-4 h-4" />
          Содержание
        </span>
        <ChevronDown
          className={cn(
            'w-5 h-5 text-muted transition-transform duration-300',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* Collapsible content */}
      <div
        className={cn(
          'transition-all duration-300 ease-in-out overflow-hidden',
          isOpen ? 'max-h-[400px]' : 'max-h-0'
        )}
      >
        <div
          ref={contentRef}
          className="px-6 pb-4 overflow-y-auto max-h-[360px] scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent"
        >
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                style={{ paddingLeft: `${(item.level - 2) * 16}px` }}
              >
                <button
                  onClick={() => scrollToHeading(item.id)}
                  className={cn(
                    'text-left text-sm transition-colors hover:text-primary w-full py-1',
                    activeId === item.id ? 'text-primary' : 'text-muted'
                  )}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </nav>
  )
}
