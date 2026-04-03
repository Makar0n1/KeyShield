import { LangLink as Link } from '@/components/ui/LangLink'
import { Button } from '@/components/ui/button'
import { Home, MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SEO } from '@/components/SEO'

export function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <>
      <SEO title="404" noindex />
      <div className="min-h-[60vh] flex items-center justify-center py-20">
        <div className="text-center">
          <h1 className="text-9xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            404
          </h1>
          <h2 className="text-2xl font-semibold text-white mt-4 mb-2">
            {t('not_found.title')}
          </h2>
          <p className="text-muted text-lg mb-8 max-w-md mx-auto">
            {t('not_found.description')}
          </p>
          <div className="flex gap-4 justify-center">
            <Button asChild>
              <Link to="/">
                <Home className="mr-2 h-4 w-4" />
                {t('not_found.go_home')}
              </Link>
            </Button>
            <Button variant="secondary" asChild>
              <a href="https://t.me/keyshield_bot" target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" />
                {t('not_found.open_bot')}
              </a>
            </Button>
          </div>

          <div className="mt-12 flex justify-center gap-4 text-muted">
            <Link to="/blog" className="hover:text-white transition-colors">
              {t('not_found.blog')}
            </Link>
            <span>•</span>
            <Link to="/terms" className="hover:text-white transition-colors">
              {t('not_found.docs')}
            </Link>
            <span>•</span>
            <a href="https://t.me/jessy_jackson" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
              {t('not_found.support')}
            </a>
          </div>
        </div>
      </div>
    </>
  )
}
