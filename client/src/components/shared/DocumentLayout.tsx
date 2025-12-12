import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/utils/cn'

interface DocumentLayoutProps {
  title: string
  date: string
  children: React.ReactNode
}

const documentTabs = [
  { href: '/terms', label: 'Условия использования' },
  { href: '/privacy', label: 'Политика конфиденциальности' },
  { href: '/offer', label: 'Публичная оферта' },
]

export function DocumentLayout({ title, date, children }: DocumentLayoutProps) {
  const location = useLocation()

  return (
    <section className="py-12">
      <div className="container mx-auto px-4">
        {/* Document Navigation Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 pb-4 border-b border-border">
          {documentTabs.map((tab) => (
            <Link
              key={tab.href}
              to={tab.href}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                location.pathname === tab.href
                  ? 'bg-primary text-white'
                  : 'text-muted hover:text-white hover:bg-dark-light'
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        {/* Document Header */}
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{title}</h1>
        <p className="text-muted mb-8">Дата вступления в силу: {date}</p>

        {/* Document Content */}
        <div className="prose prose-invert max-w-none">
          {children}
        </div>

        {/* Document Footer */}
        <p className="text-muted mt-12 pt-8 border-t border-border text-sm">
          Последнее обновление: {date}
        </p>
      </div>
    </section>
  )
}

// Helper components for document content
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-white mb-4">{title}</h2>
      {children}
    </section>
  )
}

export function Paragraph({ children }: { children: React.ReactNode }) {
  return <p className="text-gray-300 mb-3 leading-relaxed">{children}</p>
}

export function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4 ml-4">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  )
}
