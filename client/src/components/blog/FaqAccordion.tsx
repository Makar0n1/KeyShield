import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import { trackViewContent } from '@/hooks/useMetaPixel'

interface FaqItem {
  question: string
  answer: string
}

interface FaqAccordionProps {
  items: FaqItem[]
  className?: string
}

export function FaqAccordion({ items, className }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggleItem = (index: number, question: string) => {
    const isOpening = openIndex !== index
    setOpenIndex(isOpening ? index : null)
    if (isOpening) {
      trackViewContent({ content_name: 'faq_expand', content_category: question })
    }
  }

  if (items.length === 0) {
    return null
  }

  return (
    <section className={cn('mt-12', className)}>
      <h2 className="text-2xl font-bold text-white mb-6">
        Часто задаваемые вопросы
      </h2>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div
            key={index}
            className="bg-dark-light rounded-xl border border-border overflow-hidden"
          >
            <button
              onClick={() => toggleItem(index, item.question)}
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-dark-lighter/50 transition-colors"
            >
              <h3 className="text-white font-semibold pr-4">
                {item.question}
              </h3>
              <ChevronDown
                className={cn(
                  'w-5 h-5 text-muted flex-shrink-0 transition-transform duration-300',
                  openIndex === index && 'rotate-180'
                )}
              />
            </button>
            <div
              className={cn(
                'transition-all duration-300 ease-in-out overflow-hidden',
                openIndex === index ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
              )}
            >
              <div className="px-6 pb-4">
                <p className="text-gray-300 leading-relaxed">{item.answer}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
