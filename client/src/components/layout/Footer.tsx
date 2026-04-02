import { useTranslation } from 'react-i18next'
import { LangLink } from '@/components/ui/LangLink'

export function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="border-t border-white/[0.06]">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12 sm:py-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-12">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-2">
              <img src="/keyshield-logo.png" alt="KeyShield" width="18" height="18" className="shrink-0" />
              <p className="text-white font-semibold text-sm">KeyShield</p>
            </div>
            <p className="text-white/30 text-xs leading-relaxed max-w-[200px]">
              {t('footer.tagline')}
            </p>
          </div>

          {/* Product */}
          <div>
            <p className="text-[11px] uppercase tracking-widest text-white/20 mb-3">Product</p>
            <ul className="space-y-2.5">
              <li><LangLink to="/#features" className="text-white/40 hover:text-white text-[13px] transition-colors">{t('header.features')}</LangLink></li>
              <li><LangLink to="/#how-it-works" className="text-white/40 hover:text-white text-[13px] transition-colors">{t('header.how_it_works')}</LangLink></li>
              <li><LangLink to="/#pricing" className="text-white/40 hover:text-white text-[13px] transition-colors">{t('header.pricing')}</LangLink></li>
              <li><LangLink to="/blog" className="text-white/40 hover:text-white text-[13px] transition-colors">{t('header.blog')}</LangLink></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-[11px] uppercase tracking-widest text-white/20 mb-3">{t('footer.documents')}</p>
            <ul className="space-y-2.5">
              <li><LangLink to="/terms" className="text-white/40 hover:text-white text-[13px] transition-colors">{t('footer.terms')}</LangLink></li>
              <li><LangLink to="/privacy" className="text-white/40 hover:text-white text-[13px] transition-colors">{t('footer.privacy')}</LangLink></li>
              <li><LangLink to="/offer" className="text-white/40 hover:text-white text-[13px] transition-colors">{t('footer.offer')}</LangLink></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <p className="text-[11px] uppercase tracking-widest text-white/20 mb-3">{t('footer.support')}</p>
            <ul className="space-y-2.5">
              <li>
                <a href="https://t.me/keyshield_support" target="_blank" rel="noopener noreferrer" className="text-white/40 hover:text-white text-[13px] transition-colors">
                  Telegram
                </a>
              </li>
              <li>
                <a href="mailto:support@keyshield.me" className="text-white/40 hover:text-white text-[13px] transition-colors">
                  Email
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-12 pt-6 border-t border-white/[0.04] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-white/20 text-xs">
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </p>
          <p className="text-white/15 text-[11px] max-w-lg">
            {t('footer.disclaimer')}
          </p>
        </div>
      </div>
    </footer>
  )
}
