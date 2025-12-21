import { ExternalLink, Shield } from 'lucide-react'
import { trackLead } from '@/hooks/useMetaPixel'

interface ArticleCTAProps {
  botUsername?: string
}

export function ArticleCTA({ botUsername = 'keyshield_bot' }: ArticleCTAProps) {
  return (
    <div className="my-10">
      {/* Main CTA - Create Deal */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/20 via-primary/10 to-secondary/20 border border-primary/30 p-6 md:p-8">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-secondary/10 rounded-full blur-2xl" />

        <div className="relative flex flex-col md:flex-row items-center gap-6">
          <div className="flex-shrink-0">
            <div className="w-16 h-16 rounded-xl bg-primary/20 flex items-center justify-center">
              <Shield className="w-8 h-8 text-primary" />
            </div>
          </div>

          <div className="flex-1 text-center md:text-left">
            <h3 className="text-xl font-bold text-white mb-2">
              Готовы к безопасной сделке?
            </h3>
            <p className="text-gray-400 mb-0">
              Создайте escrow-сделку прямо сейчас в нашем Telegram-боте.
              Защита средств, автоматический контроль депозитов, справедливый арбитраж.
            </p>
          </div>

          <div className="flex-shrink-0">
            <a
              href={`https://t.me/${botUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-all hover:scale-105"
              onClick={() => trackLead({ content_name: 'article_cta', content_category: 'telegram_bot' })}
            >
              Создать сделку
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
