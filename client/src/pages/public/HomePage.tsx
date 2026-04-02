import { useEffect, useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { SEO, generateOrganizationSchema } from '@/components/SEO'
import { trackLead } from '@/hooks/useMetaPixel'
import {
  COMMISSION_TIER_1_FIXED,
  COMMISSION_TIER_1_MAX,
  COMMISSION_TIER_2_RATE,
  COMMISSION_TIER_3_RATE,
  COMMISSION_TIER_4_RATE,
  MIN_DEAL_AMOUNT,
} from '@/config/constants'
import {
  ArrowRight, Shield, Zap, Eye, Scale, Coins, Rocket,
  ChevronDown, Check, Copy, ExternalLink, Loader2,
} from 'lucide-react'
import api from '@/services/api'

// ============================================
// SCROLL ANIMATION WRAPPER
// ============================================
function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0.15 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'} ${className}`}
    >
      {children}
    </div>
  )
}

// ============================================
// HOMEPAGE
// ============================================
export function HomePage() {
  const { t } = useTranslation()

  return (
    <>
      <SEO
        title={t('home.seo_title')}
        description={t('home.seo_description')}
        schema={generateOrganizationSchema()}
      />
      <div className="bg-[#0a0a0f] text-white overflow-hidden">
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <DealBuilderSection />
        <PricingSection />
        <FAQSection />
        <CTASection />
      </div>
    </>
  )
}

// ============================================
// HERO
// ============================================
function HeroSection() {
  const { t } = useTranslation()

  return (
    <section className="relative min-h-[90vh] flex items-center pt-20 pb-16">
      {/* Subtle gradient orb */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-indigo-500/[0.07] rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-5 sm:px-8 relative z-10">
        <div className="max-w-2xl">
          <p className="text-[11px] uppercase tracking-[0.2em] text-indigo-400/80 mb-4">Escrow on TRON blockchain</p>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extralight leading-[1.1] tracking-tight mb-6">
            {t('home.hero.title')}
          </h1>

          <p className="text-base sm:text-lg text-white/40 leading-relaxed max-w-xl mb-10">
            {t('home.hero.subtitle')}
          </p>

          <div className="flex flex-wrap items-center gap-3 mb-16">
            <a
              href="https://t.me/keyshield_bot"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackLead()}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-black text-sm font-medium rounded-full hover:bg-gray-200 transition-colors"
            >
              {t('home.hero.cta_start')}
              <ArrowRight size={16} />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 px-6 py-3 text-white/50 text-sm border border-white/[0.08] rounded-full hover:border-white/[0.2] hover:text-white transition-colors"
            >
              {t('home.hero.cta_how')}
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-6 sm:gap-12 max-w-lg">
          <div>
            <p className="text-2xl sm:text-3xl font-extralight">2/3</p>
            <p className="text-[11px] text-white/30 mt-1">{t('home.hero.stat_signatures')}</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extralight">{COMMISSION_TIER_1_FIXED}$</p>
            <p className="text-[11px] text-white/30 mt-1">{t('home.hero.stat_commission')}</p>
          </div>
          <div>
            <p className="text-2xl sm:text-3xl font-extralight">24/7</p>
            <p className="text-[11px] text-white/30 mt-1">{t('home.hero.stat_availability')}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

// ============================================
// FEATURES
// ============================================
function FeaturesSection() {
  const { t } = useTranslation()

  const features = [
    { icon: Shield, key: 'multisig' },
    { icon: Zap, key: 'automation' },
    { icon: Eye, key: 'transparency' },
    { icon: Scale, key: 'arbitration' },
    { icon: Coins, key: 'low_fee' },
    { icon: Rocket, key: 'fast_start' },
  ]

  return (
    <section id="features" className="py-20 sm:py-28">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <Reveal>
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/30 mb-3">Features</p>
          <h2 className="text-2xl sm:text-3xl font-extralight tracking-tight mb-12 max-w-lg">
            {t('home.features.title')}
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-10">
            {features.map(({ icon: Icon, key }) => (
              <div key={key} className="group">
                <Icon size={20} className="text-white/20 group-hover:text-indigo-400 transition-colors mb-3" strokeWidth={1.5} />
                <h3 className="text-sm font-medium text-white mb-2">
                  {t(`home.features.${key}_title`, { fee: COMMISSION_TIER_1_FIXED })}
                </h3>
                <p className="text-[13px] text-white/30 leading-relaxed">
                  {t(`home.features.${key}_desc`, { fee: COMMISSION_TIER_1_FIXED })}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ============================================
// HOW IT WORKS
// ============================================
function HowItWorksSection() {
  const { t } = useTranslation()

  const steps = [
    { num: '01', key: 'step1' },
    { num: '02', key: 'step2' },
    { num: '03', key: 'step3' },
    { num: '04', key: 'step4' },
    { num: '05', key: 'step5' },
  ]

  return (
    <section id="how-it-works" className="py-20 sm:py-28 border-t border-white/[0.04]">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <Reveal>
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/30 mb-3">Process</p>
          <h2 className="text-2xl sm:text-3xl font-extralight tracking-tight mb-12">
            {t('home.how_it_works.title')}
          </h2>

          <div className="space-y-8 max-w-2xl">
            {steps.map(({ num, key }) => (
              <div key={key} className="flex gap-5">
                <span className="text-[11px] text-white/15 font-mono pt-1 shrink-0">{num}</span>
                <div>
                  <h3 className="text-sm font-medium text-white mb-1.5">{t(`home.how_it_works.${key}_title`)}</h3>
                  <p className="text-[13px] text-white/30 leading-relaxed">{t(`home.how_it_works.${key}_desc`)}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ============================================
// DEAL BUILDER (Create deal from website)
// ============================================
function DealBuilderSection() {

  const [step, setStep] = useState(0) // 0=role, 1=product, 2=amount, 3=result
  const [role, setRole] = useState<'buyer' | 'seller' | ''>('')
  const [product, setProduct] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [deepLink, setDeepLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const handleNext = () => {
    if (step === 0 && !role) return
    if (step === 1 && product.length < 2) { setError('Укажите название'); return }
    if (step === 2) {
      const num = Number(amount)
      if (!num || num < 50) { setError('Минимум 50 USDT'); return }
      handleCreate()
      return
    }
    setError('')
    setStep(s => s + 1)
  }

  const handleCreate = async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/web-deal', {
        creatorRole: role,
        productName: product,
        amount: Number(amount),
        deadlineHours: 72,
        commissionType: 'buyer',
      })
      setDeepLink(data.deepLink)
      setStep(3)
      trackLead()
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Ошибка'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const copyLink = () => {
    navigator.clipboard.writeText(deepLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const stepLabels = ['Роль', 'Товар', 'Сумма', 'Готово']

  return (
    <section className="py-20 sm:py-28 border-t border-white/[0.04]">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <Reveal>
          <div className="max-w-md mx-auto">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/30 mb-3 text-center">Try it now</p>
            <h2 className="text-2xl sm:text-3xl font-extralight tracking-tight mb-3 text-center">
              Создайте сделку прямо сейчас
            </h2>
            <p className="text-[13px] text-white/30 text-center mb-8">Без регистрации. Заполните параметры и получите ссылку для Telegram</p>

            {/* Progress */}
            <div className="flex items-center justify-between mb-8">
              {stepLabels.map((label, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium transition-all ${
                    i < step ? 'bg-indigo-500 text-white' :
                    i === step ? 'bg-white text-black' :
                    'bg-white/[0.06] text-white/30'
                  }`}>
                    {i < step ? <Check size={12} /> : i + 1}
                  </div>
                  <span className={`text-[11px] hidden sm:block ${i <= step ? 'text-white/60' : 'text-white/20'}`}>{label}</span>
                  {i < 3 && <div className={`w-8 sm:w-12 h-px mx-1 ${i < step ? 'bg-indigo-500/50' : 'bg-white/[0.06]'}`} />}
                </div>
              ))}
            </div>

            {/* Step 0: Role */}
            {step === 0 && (
              <div className="space-y-3">
                <button
                  onClick={() => { setRole('buyer'); setError('') }}
                  className={`w-full text-left px-5 py-4 rounded-2xl border transition-all ${
                    role === 'buyer' ? 'border-indigo-500/50 bg-indigo-500/[0.06]' : 'border-white/[0.06] hover:border-white/[0.12]'
                  }`}
                >
                  <p className="text-sm text-white">Я покупатель</p>
                  <p className="text-[12px] text-white/30 mt-0.5">Хочу заказать товар или услугу</p>
                </button>
                <button
                  onClick={() => { setRole('seller'); setError('') }}
                  className={`w-full text-left px-5 py-4 rounded-2xl border transition-all ${
                    role === 'seller' ? 'border-indigo-500/50 bg-indigo-500/[0.06]' : 'border-white/[0.06] hover:border-white/[0.12]'
                  }`}
                >
                  <p className="text-sm text-white">Я продавец</p>
                  <p className="text-[12px] text-white/30 mt-0.5">Предлагаю товар или услугу</p>
                </button>
              </div>
            )}

            {/* Step 1: Product */}
            {step === 1 && (
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-white/30 mb-2">Название товара или услуги</label>
                <input
                  type="text"
                  value={product}
                  onChange={(e) => { setProduct(e.target.value); setError('') }}
                  placeholder="Например: Разработка сайта"
                  autoFocus
                  maxLength={200}
                  className="w-full h-12 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder:text-white/20 outline-none focus:border-indigo-500/50 transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                />
              </div>
            )}

            {/* Step 2: Amount */}
            {step === 2 && (
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-white/30 mb-2">Сумма сделки (USDT)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setError('') }}
                  placeholder="Минимум 50"
                  autoFocus
                  min={50}
                  className="w-full h-12 px-4 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm placeholder:text-white/20 outline-none focus:border-indigo-500/50 transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handleNext()}
                />
                {amount && Number(amount) >= 50 && (
                  <p className="text-[11px] text-white/20 mt-2">
                    Комиссия: ~{Number(amount) <= 150 ? COMMISSION_TIER_1_FIXED : (Number(amount) * (Number(amount) <= 500 ? COMMISSION_TIER_2_RATE : Number(amount) <= 1500 ? COMMISSION_TIER_3_RATE : COMMISSION_TIER_4_RATE)).toFixed(2)} USDT
                  </p>
                )}
              </div>
            )}

            {/* Step 3: Result */}
            {step === 3 && deepLink && (
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                  <Check size={24} />
                </div>
                <p className="text-sm text-white mb-1">Сделка создана</p>
                <p className="text-[12px] text-white/30 mb-6">Перейдите в бот для завершения настройки</p>

                <a
                  href={deepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white text-black text-sm font-medium rounded-full hover:bg-gray-200 transition-colors mb-4"
                >
                  Открыть в Telegram <ExternalLink size={14} />
                </a>

                <div className="flex items-center gap-2 justify-center">
                  <p className="text-[12px] text-white/20 font-mono truncate max-w-[200px]">{deepLink}</p>
                  <button onClick={copyLink} className="text-white/30 hover:text-white transition-colors">
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
                <p className="text-[11px] text-white/15 mt-3">Отправьте эту ссылку контрагенту</p>
              </div>
            )}

            {/* Error */}
            {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

            {/* Next button */}
            {step < 3 && (
              <button
                onClick={handleNext}
                disabled={loading || (step === 0 && !role)}
                className="w-full mt-6 py-3 text-sm font-medium rounded-full transition-all disabled:opacity-30 bg-white text-black hover:bg-gray-200"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Создание...
                  </span>
                ) : step === 2 ? 'Создать сделку' : 'Далее'}
              </button>
            )}

            {/* Back */}
            {step > 0 && step < 3 && (
              <button onClick={() => setStep(s => s - 1)} className="w-full mt-2 py-2 text-[13px] text-white/30 hover:text-white/60 transition-colors">
                Назад
              </button>
            )}

            {/* Reset */}
            {step === 3 && (
              <button
                onClick={() => { setStep(0); setRole(''); setProduct(''); setAmount(''); setDeepLink(''); setError('') }}
                className="w-full mt-4 py-2 text-[13px] text-white/30 hover:text-white/60 transition-colors"
              >
                Создать ещё одну сделку
              </button>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ============================================
// PRICING
// ============================================
function PricingSection() {
  const { t } = useTranslation()

  return (
    <section id="pricing" className="py-20 sm:py-28 border-t border-white/[0.04]">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <Reveal>
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/30 mb-3">Pricing</p>
          <h2 className="text-2xl sm:text-3xl font-extralight tracking-tight mb-12">
            {t('home.pricing.title')}
          </h2>

          <div className="grid sm:grid-cols-2 gap-6 max-w-2xl">
            {/* Fixed */}
            <div className="p-6 rounded-2xl border border-white/[0.06]">
              <p className="text-[11px] uppercase tracking-widest text-indigo-400/60 mb-4">{t('home.pricing.minimum_badge')}</p>
              <p className="text-3xl font-extralight mb-1">{COMMISSION_TIER_1_FIXED} <span className="text-sm text-white/30">USDT</span></p>
              <p className="text-[12px] text-white/30 mb-6">{t('home.pricing.fixed_desc', { max: COMMISSION_TIER_1_MAX })}</p>
              <ul className="space-y-2">
                {[t('home.pricing.fixed_min_amount', { min: MIN_DEAL_AMOUNT }), t('home.pricing.fixed_all_features'), t('home.pricing.fixed_ideal')].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-white/40">
                    <Check size={14} className="text-indigo-400/50 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Percentage */}
            <div className="p-6 rounded-2xl border border-white/[0.06]">
              <p className="text-[11px] uppercase tracking-widest text-white/20 mb-4">{t('home.pricing.standard_title')}</p>
              <p className="text-3xl font-extralight mb-1">{(COMMISSION_TIER_2_RATE * 100).toFixed(1)}% <span className="text-sm text-white/30">— {(COMMISSION_TIER_4_RATE * 100).toFixed(1)}%</span></p>
              <p className="text-[12px] text-white/30 mb-6">{t('home.pricing.standard_from')}</p>
              <ul className="space-y-2">
                {[t('home.pricing.auto_payouts'), t('home.pricing.dispute_arbitration'), t('home.pricing.support_247')].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-white/40">
                    <Check size={14} className="text-white/20 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Extra info */}
          <div className="mt-8 flex flex-wrap gap-x-10 gap-y-3 text-[13px] text-white/25 max-w-2xl">
            <span>{t('home.pricing.who_pays_title')}: {t('home.pricing.who_pays_desc')}</span>
            <span>{t('home.pricing.no_hidden_title')}: {t('home.pricing.no_hidden_desc')}</span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ============================================
// FAQ
// ============================================
function FAQSection() {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)

  const items = [
    { q: t('home.faq.q1'), a: t('home.faq.a1') },
    { q: t('home.faq.q2'), a: t('home.faq.a2') },
    { q: t('home.faq.q3'), a: t('home.faq.a3') },
    { q: t('home.faq.q4'), a: t('home.faq.a4') },
  ]

  return (
    <section className="py-20 sm:py-28 border-t border-white/[0.04]">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <Reveal>
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/30 mb-3">FAQ</p>
          <h2 className="text-2xl sm:text-3xl font-extralight tracking-tight mb-10">
            {t('home.faq.title')}
          </h2>

          <div className="max-w-2xl divide-y divide-white/[0.04]">
            {items.map((item, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  className="w-full flex items-center justify-between py-5 text-left group"
                >
                  <span className="text-sm text-white/70 group-hover:text-white transition-colors pr-4">{item.q}</span>
                  <ChevronDown
                    size={16}
                    className={`text-white/20 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`}
                  />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${open === i ? 'max-h-96 pb-5' : 'max-h-0'}`}>
                  <p className="text-[13px] text-white/30 leading-relaxed">{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ============================================
// CTA
// ============================================
function CTASection() {
  const { t } = useTranslation()

  return (
    <section className="py-20 sm:py-28 border-t border-white/[0.04]">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 text-center">
        <h2 className="text-2xl sm:text-3xl font-extralight tracking-tight mb-4">
          {t('home.cta.title')}
        </h2>
        <p className="text-[13px] text-white/30 mb-8 max-w-md mx-auto">
          {t('home.cta.subtitle')}
        </p>
        <a
          href="https://t.me/keyshield_bot"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackLead()}
          className="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-black text-sm font-medium rounded-full hover:bg-gray-200 transition-colors"
        >
          {t('home.cta.button')}
          <ArrowRight size={16} />
        </a>
      </div>
    </section>
  )
}
