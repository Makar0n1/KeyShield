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

// Container used everywhere
const CX = 'max-w-5xl mx-auto px-5 sm:px-8'

// Reveal on scroll — starts visible (for SEO/bots), animates after hydration
const isBrowser = typeof window !== 'undefined'

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(!isBrowser) // true on server (visible for bots), false in browser (animate)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // threshold 0 + rootMargin ensures already-visible elements trigger immediately
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect() } }, { threshold: 0.1, rootMargin: '100px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return <div ref={ref} className={`transition-all duration-700 ${v ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}>{children}</div>
}

// Section label
function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] uppercase tracking-[0.2em] text-indigo-400/60 mb-3">{children}</p>
}

// Section heading
function Heading({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-2xl sm:text-[2rem] font-light leading-snug tracking-tight mb-10 text-white/90 ${className}`}>{children}</h2>
}

/*
 * FlowLine — декоративная SVG кривая.
 * Ставится ВНУТРЬ секции с className="relative".
 * Позиционируется absolute, не влияет на layout.
 *
 * Props:
 *   id     — уникальный для каждой линии ("fl1", "fl2", "fl3")
 *   d      — SVG path. viewBox = "0 0 1000 200"
 *            X: 0=лево  500=центр  1000=право
 *            Y: 0=верх  200=низ
 *            Формат: "M{x},{y} C{cp1x},{cp1y} {cp2x},{cp2y} {endX},{endY}"
 *   top    — px от верха секции (default: -60, минус = выше секции)
 *   height — высота SVG зоны в px (default: 250)
 *   sw     — толщина линии (default: 1.5)
 *
 * Примеры d:
 *   "M150,0 C150,150 850,50 850,200"   — из лева вниз направо
 *   "M850,0 C850,150 150,50 150,200"   — из права вниз налево
 *   "M200,0 C800,60 200,140 800,200"   — S-образная
 */
function FlowLine({ id, d, top = -60, height = 250, left = 0, right = 0, sw = 1.5 }: {
  id: string; d: string; top?: number; height?: number; left?: number; right?: number; sw?: number
}) {
  return (
    <div className="hidden lg:block absolute pointer-events-none z-0" style={{ top, height, left, right }} aria-hidden>
      <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 200">
        <path d={d} fill="none" stroke={`url(#${id})`} strokeWidth={sw} strokeLinecap="round" />
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#6366f1" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.1" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}

// YouTube lazy embed — loads iframe only on click
function YoutubeEmbed({ videoId }: { videoId: string }) {
  const [playing, setPlaying] = useState(false)
  return (
    <div className="aspect-video rounded-2xl overflow-hidden relative bg-black">
      {!playing ? (
        <button onClick={() => setPlaying(true)} className="absolute inset-0 w-full h-full group cursor-pointer">
          <img
            src={`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`}
            alt="Video preview"
            className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-90 transition-opacity duration-300"
            loading="lazy"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm group-hover:bg-white/30 flex items-center justify-center transition-all duration-300 group-hover:scale-110">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M8 5.14v13.72a1 1 0 001.5.86l11.04-6.86a1 1 0 000-1.72L9.5 4.28a1 1 0 00-1.5.86z" fill="white"/>
              </svg>
            </div>
          </div>
        </button>
      ) : (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
          title="KeyShield Demo"
        />
      )}
    </div>
  )
}

export function HomePage() {
  const { t } = useTranslation()
  return (
    <>
      <SEO title={t('home.seo_title')} description={t('home.seo_description')} schema={generateOrganizationSchema(t('home.seo_description'))} />
      <div className="bg-[#13161d] text-white/85 overflow-hidden">
        <HeroSection />
        <div id="sticky-cta-start" />
        <FeaturesSection />
        <HowItWorksSection />
        <PricingSection />
        <FAQSection />
        <div id="sticky-cta-end" />
        <CTASection />
        <StickyBotCTA />
      </div>
    </>
  )
}

// ─── HERO + DEAL BUILDER ───────────────────
function HeroSection() {
  const { t } = useTranslation()
  return (
    <section className="relative pt-28 sm:pt-36 pb-16 sm:pb-24">
      {/* Gradient orbs */}
      <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-indigo-600/[0.06] rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-600/[0.05] rounded-full blur-[120px] pointer-events-none" />

      <div className={CX}>
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — text */}
          <Reveal>
            <p className="text-[11px] uppercase tracking-[0.25em] text-indigo-400 mb-5">Escrow on TRON blockchain</p>
            <h1 className="text-[2rem] sm:text-4xl lg:text-[2.8rem] font-normal tracking-tight text-white mb-5" style={{ lineHeight: 1.05 }}>
              {t('home.hero.title')}
            </h1>
            <p className="text-[15px] text-white/50 leading-relaxed mb-8">
              {t('home.hero.subtitle')}
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-12">
              <a
                href="https://t.me/keyshield_bot" target="_blank" rel="noopener noreferrer"
                onClick={() => trackLead()}
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-500 text-white text-sm font-medium rounded-full hover:bg-indigo-400 transition-colors"
              >
                {t('home.hero.cta_start')} <ArrowRight size={15} />
              </a>
              <a href="#how-it-works" className="inline-flex items-center gap-2 px-6 py-3 text-white/50 text-sm border border-white/10 rounded-full hover:border-white/20 hover:text-white/70 transition-all">
                {t('home.hero.cta_how')}
              </a>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-8 border-t border-white/[0.08] pt-6">
              {[
                { value: '2/3', label: t('home.hero.stat_signatures') },
                { value: `${COMMISSION_TIER_1_FIXED}$`, label: t('home.hero.stat_commission') },
                { value: '24/7', label: t('home.hero.stat_availability') },
              ].map((s, i) => (
                <div key={i}>
                  <p className="text-xl sm:text-2xl font-normal text-white">{s.value}</p>
                  <p className="text-[11px] text-white/35 mt-1 leading-snug">{s.label}</p>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Right — Deal Builder */}
          <Reveal className="lg:mt-8">
            <DealBuilderCard />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

// ─── FEATURES ──────────────────────────────
function FeatureCard({ icon: Icon, featureKey, index }: { icon: typeof Shield; featureKey: string; index: number }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(!isBrowser) // visible for bots

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } }, { threshold: 0.2, rootMargin: '100px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className="group relative p-6 rounded-2xl bg-white/[0.02] hover:bg-white/[0.05] transition-all duration-500 cursor-default min-w-[260px] sm:min-w-0 h-full"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.97)',
        transition: `opacity 0.5s ${index * 0.1}s, transform 0.5s ${index * 0.1}s, background 0.3s`,
      }}
    >
      {/* Hover glow */}
      <div className="absolute inset-0 rounded-2xl bg-indigo-500/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="relative">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 flex items-center justify-center mb-4 group-hover:from-indigo-500/20 group-hover:to-purple-500/20 transition-all duration-500">
          <Icon size={18} className="text-indigo-400/60 group-hover:text-indigo-400 transition-colors duration-500" strokeWidth={1.5} />
        </div>
        <h3 className="text-[15px] font-medium text-white mb-2">{t(`home.features.${featureKey}_title`, { fee: COMMISSION_TIER_1_FIXED })}</h3>
        <p className="text-[12px] text-white/40 leading-relaxed">{t(`home.features.${featureKey}_desc`, { fee: COMMISSION_TIER_1_FIXED })}</p>
      </div>
    </div>
  )
}

function FeaturesSection() {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [activeDot, setActiveDot] = useState(0)

  const features = [
    { icon: Shield, key: 'multisig' },
    { icon: Zap, key: 'automation' },
    { icon: Eye, key: 'transparency' },
    { icon: Scale, key: 'arbitration' },
    { icon: Coins, key: 'low_fee' },
    { icon: Rocket, key: 'fast_start' },
  ]

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const scrollLeft = el.scrollLeft
      const cardWidth = el.scrollWidth / features.length
      setActiveDot(Math.round(scrollLeft / cardWidth))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [features.length])

  return (
    <section id="features" className="py-20 sm:py-24 border-t border-white/[0.08]">
      <div className={CX}>
        <Label>Features</Label>
        <Heading className="max-w-lg">{t('home.features.title')}</Heading>
      </div>

      {/* Desktop: grid */}
      <div className={`${CX} hidden sm:block`}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(({ icon, key }, i) => (
            <FeatureCard key={key} icon={icon} featureKey={key} index={i} />
          ))}
        </div>
      </div>

      {/* Mobile: horizontal scroll */}
      <div className="sm:hidden px-5">
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide -mx-0"
        >
          {features.map(({ icon, key }, i) => (
            <div key={key} className="snap-center shrink-0 w-[80vw] max-w-[300px] h-[280px]">
              <FeatureCard icon={icon} featureKey={key} index={i} />
            </div>
          ))}
        </div>
        {/* Pagination dots */}
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {features.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === activeDot ? 'w-5 h-1.5 bg-indigo-500' : 'w-1.5 h-1.5 bg-white/15'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── HOW IT WORKS (snake grid) ──────
function HowItWorksSection() {
  const { t } = useTranslation()
  const steps = ['step1', 'step2', 'step3', 'step4', 'step5']

  return (
    <section id="how-it-works" className="py-20 sm:py-24 border-t border-white/[0.08]">
      <div className={CX}>
        <Reveal>
          <div className="mb-12">
            <Label>Process</Label>
            <Heading>{t('home.how_it_works.title')}</Heading>
          </div>

          {/* Row 1: steps 1-2-3 */}
          <div className="hidden sm:grid sm:grid-cols-3 gap-6 mb-4">
            {steps.slice(0, 3).map((key, i) => (
              <div key={key} className="group">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono text-indigo-400">{String(i + 1).padStart(2, '0')}</span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
                <h3 className="text-sm font-medium text-white mb-1">{t(`home.how_it_works.${key}_title`)}</h3>
                <p className="text-[12px] text-white/35 leading-relaxed">{t(`home.how_it_works.${key}_desc`)}</p>
              </div>
            ))}
          </div>

          {/* Row 2: steps 4-5 */}
          <div className="hidden sm:grid sm:grid-cols-2 gap-6" style={{ maxWidth: 'calc(100% - (100% / 3 - 1.5rem) * 0)', paddingLeft: 0 }}>
            {steps.slice(3, 5).map((key, i) => (
              <div key={key} className="group">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono text-indigo-400">{String(i + 4).padStart(2, '0')}</span>
                  <div className="flex-1 h-px bg-white/[0.06]" />
                </div>
                <h3 className="text-sm font-medium text-white mb-1">{t(`home.how_it_works.${key}_title`)}</h3>
                <p className="text-[12px] text-white/35 leading-relaxed">{t(`home.how_it_works.${key}_desc`)}</p>
              </div>
            ))}
          </div>

          {/* Mobile — staggered layout */}
          <div className="sm:hidden space-y-4">
            {steps.map((key, i) => {
              const isEven = i % 2 === 0
              return (
                <div
                  key={key}
                  className={`p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] ${isEven ? 'mr-8' : 'ml-8'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-mono text-indigo-400">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <h3 className="text-sm font-medium text-white">{t(`home.how_it_works.${key}_title`)}</h3>
                  </div>
                  <p className="text-[12px] text-white/35 leading-relaxed pl-9">{t(`home.how_it_works.${key}_desc`)}</p>
                </div>
              )
            })}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── DEAL BUILDER CARD ─────────────────────
function DealBuilderCard() {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const [role, setRole] = useState<'buyer' | 'seller' | ''>('')
  const [product, setProduct] = useState('')
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [deepLink, setDeepLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const handleNext = () => {
    if (step === 0 && !role) return
    if (step === 1 && product.length < 2) { setError(t('home.deal_builder.error_name')); return }
    if (step === 2) {
      if (!amount || Number(amount) < 50) { setError(t('home.deal_builder.error_amount')); return }
      handleCreate(); return
    }
    setError(''); setStep(s => s + 1)
  }

  const handleCreate = async () => {
    setLoading(true); setError('')
    try {
      const { data } = await api.post('/web-deal', { creatorRole: role, productName: product, amount: Number(amount), deadlineHours: 72, commissionType: 'buyer' })
      setDeepLink(data.deepLink); setStep(3); trackLead()
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Error')
    } finally { setLoading(false) }
  }

  const copyLink = () => { navigator.clipboard.writeText(deepLink); setCopied(true); setTimeout(() => setCopied(false), 2000) }
  const reset = () => { setStep(0); setRole(''); setProduct(''); setAmount(''); setDeepLink(''); setError('') }

  const stepLabels = [t('home.deal_builder.step_role'), t('home.deal_builder.step_product'), t('home.deal_builder.step_amount'), t('home.deal_builder.step_done')]

  const commission = Number(amount) >= 50
    ? Number(amount) <= 150 ? COMMISSION_TIER_1_FIXED
    : Number(amount) * (Number(amount) <= 500 ? COMMISSION_TIER_2_RATE : Number(amount) <= 1500 ? COMMISSION_TIER_3_RATE : COMMISSION_TIER_4_RATE)
    : 0

  return (
    <div className="p-6 sm:p-8 lg:p-10 rounded-2xl border border-white/[0.08] bg-white/[0.02] flex flex-col">
      {/* Header — fixed */}
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-indigo-400 mb-3">{t('home.deal_builder.label')}</p>
        <h3 className="text-xl font-medium text-white mb-2">{t('home.deal_builder.title')}</h3>
        <p className="text-[13px] text-white/40 mb-6">{t('home.deal_builder.subtitle')}</p>
        <div className="flex items-center justify-center gap-2 mb-6">
          {stepLabels.map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-all ${i <= step ? 'bg-indigo-500 scale-110' : 'bg-white/10'}`} />
              {i < 3 && <div className={`w-6 h-px ${i < step ? 'bg-indigo-500/40' : 'bg-white/[0.06]'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Content — fixed height area */}
      <div className="min-h-[200px] flex flex-col justify-center">
        {step === 0 && (
          <div className="space-y-3">
            {[
              { val: 'buyer', title: t('home.deal_builder.role_buyer'), hint: t('home.deal_builder.role_buyer_hint') },
              { val: 'seller', title: t('home.deal_builder.role_seller'), hint: t('home.deal_builder.role_seller_hint') },
            ].map(opt => (
              <button key={opt.val} onClick={() => { setRole(opt.val as 'buyer' | 'seller'); setError('') }}
                className={`w-full text-left px-5 py-4 rounded-2xl border transition-all ${role === opt.val ? 'border-indigo-500/40 bg-indigo-500/[0.05]' : 'border-white/[0.06] hover:border-white/[0.12]'}`}>
                <p className="text-sm text-white/80">{opt.title}</p>
                <p className="text-[12px] text-white/25 mt-0.5">{opt.hint}</p>
              </button>
            ))}
          </div>
        )}

        {step === 1 && (
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-white/25 mb-2">{t('home.deal_builder.product_label')}</label>
            <input type="text" value={product} onChange={e => { setProduct(e.target.value); setError('') }}
              placeholder={t('home.deal_builder.product_placeholder')} autoFocus maxLength={200}
              className="w-full h-14 px-5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/15 outline-none focus:border-indigo-500/40 transition-colors"
              onKeyDown={e => e.key === 'Enter' && handleNext()} />
            <p className="text-[11px] text-transparent mt-2 select-none">&nbsp;</p>
          </div>
        )}

        {step === 2 && (
          <div>
            <label className="block text-[11px] uppercase tracking-widest text-white/25 mb-2">{t('home.deal_builder.amount_label')}</label>
            <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setError('') }}
              placeholder={t('home.deal_builder.amount_placeholder')} autoFocus min={50}
              className="w-full h-14 px-5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/15 outline-none focus:border-indigo-500/40 transition-colors"
              onKeyDown={e => e.key === 'Enter' && handleNext()} />
            <p className="text-[11px] text-white/15 mt-2">{commission > 0 ? `${t('home.deal_builder.commission_hint')}: ~${commission.toFixed(2)} USDT` : '\u00A0'}</p>
          </div>
        )}

        {step === 3 && deepLink && (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-4"><Check size={22} /></div>
            <p className="text-[15px] text-white/80 mb-1">{t('home.deal_builder.done_title')}</p>
            <p className="text-[12px] text-white/25 mb-5">{t('home.deal_builder.done_subtitle')}</p>
            <a href={deepLink} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-500 text-white text-sm font-medium rounded-full hover:bg-indigo-400 transition-colors mb-3">
              {t('home.deal_builder.done_open')} <ExternalLink size={14} />
            </a>
            <div className="flex items-center gap-2 justify-center">
              <p className="text-[11px] text-white/15 font-mono truncate max-w-[200px]">{deepLink}</p>
              <button onClick={copyLink} className="text-white/20 hover:text-white transition-colors">
                {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              </button>
            </div>
            <p className="text-[11px] text-white/10 mt-2">{t('home.deal_builder.done_copy_hint')}</p>
          </div>
        )}
      </div>

      {/* Footer — fixed height, no layout shift */}
      <div className="mt-4 h-[90px]">
        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        {step < 3 && (
          <>
            <button onClick={handleNext} disabled={loading || (step === 0 && !role)}
              className="w-full py-3.5 text-sm font-medium rounded-full transition-all disabled:opacity-20 bg-indigo-500 text-white hover:bg-indigo-400">
              {loading ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" />{t('home.deal_builder.btn_creating')}</span>
                : step === 2 ? t('home.deal_builder.btn_create') : t('home.deal_builder.btn_next')}
            </button>
            <button onClick={() => step > 0 ? setStep(s => s - 1) : undefined}
              className={`w-full mt-1 py-2 text-[13px] transition-colors ${step > 0 ? 'text-white/20 hover:text-white/40 cursor-pointer' : 'text-transparent cursor-default'}`}>
              {t('home.deal_builder.btn_back')}
            </button>
          </>
        )}
        {step === 3 && <button onClick={reset} className="w-full py-2 text-[13px] text-white/20 hover:text-white/40 transition-colors">{t('home.deal_builder.done_another')}</button>}
      </div>
    </div>
  )
}

// ─── PRICING ───────────────────────────────
function PricingSection() {
  const { t } = useTranslation()
  return (
    <section id="pricing" className="py-20 sm:py-24 border-t border-white/[0.08] relative">
      <div className={CX}>
        <Reveal>
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
          <div>
            <Label>Pricing</Label>
            <Heading>{t('home.pricing.title')}</Heading>
            <div className="text-[13px] text-white/35 space-y-3 max-w-xs">
              <p><span className="text-white/60">{t('home.pricing.who_pays_title')}</span> — {t('home.pricing.who_pays_desc')}</p>
              <p><span className="text-white/60">{t('home.pricing.no_hidden_title')}</span> — {t('home.pricing.no_hidden_desc')}</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="p-6 rounded-2xl border border-indigo-500/20 bg-indigo-500/[0.03]">
              <p className="text-[11px] uppercase tracking-widest text-indigo-400/50 mb-4">{t('home.pricing.minimum_badge')}</p>
              <p className="text-3xl font-light text-white mb-1">{COMMISSION_TIER_1_FIXED} <span className="text-sm text-white/25">USDT</span></p>
              <p className="text-[12px] text-white/25 mb-6">{t('home.pricing.fixed_desc', { max: COMMISSION_TIER_1_MAX })}</p>
              <ul className="space-y-2.5">
                {[t('home.pricing.fixed_min_amount', { min: MIN_DEAL_AMOUNT }), t('home.pricing.fixed_all_features'), t('home.pricing.fixed_ideal')].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-white/35"><Check size={14} className="text-indigo-400/50 mt-0.5 shrink-0" />{item}</li>
                ))}
              </ul>
            </div>
            <div className="p-6 rounded-2xl border border-white/[0.06]">
              <p className="text-[11px] uppercase tracking-widest text-white/15 mb-4">{t('home.pricing.standard_title')}</p>
              <p className="text-3xl font-light text-white mb-1">{(COMMISSION_TIER_2_RATE * 100).toFixed(1)}% <span className="text-sm text-white/25">— {(COMMISSION_TIER_4_RATE * 100).toFixed(1)}%</span></p>
              <p className="text-[12px] text-white/25 mb-6">{t('home.pricing.standard_from')}</p>
              <ul className="space-y-2.5">
                {[t('home.pricing.auto_payouts'), t('home.pricing.dispute_arbitration'), t('home.pricing.support_247')].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-white/35"><Check size={14} className="text-white/15 mt-0.5 shrink-0" />{item}</li>
                ))}
              </ul>
            </div>
          </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── FAQ ───────────────────────────────────
function FAQSection() {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)
  const items = [1, 2, 3, 4].map(i => ({ q: t(`home.faq.q${i}`), a: t(`home.faq.a${i}`) }))

  return (
    <section className="py-20 sm:py-24 border-t border-white/[0.08] relative">
      <FlowLine id="fl2" d="M600,0 C600,150 200,50 200,200" top={-80} height={180} left={300} right={55} />
      <div className={CX}>
        <Reveal>
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
            <div className="order-2 lg:order-1">
              {items.map((item, i) => (
                <div key={i} className="border-b border-white/[0.06]">
                  <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between py-5 text-left group">
                    <span className="text-sm text-white/70 group-hover:text-white transition-colors pr-4">{item.q}</span>
                    <ChevronDown size={15} className={`text-white/20 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`overflow-hidden transition-all duration-300 ${!isBrowser || open === i ? 'max-h-96 pb-5' : 'max-h-0'}`}>
                    <p className="text-[13px] text-white/40 leading-relaxed">{item.a}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="order-1 lg:order-2">
              <Label>FAQ</Label>
              <Heading>{t('home.faq.title')}</Heading>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── CTA + VIDEO ───────────────────────────
function CTASection() {
  const { t } = useTranslation()
  return (
    <section className="py-20 sm:py-28 border-t border-white/[0.08] relative">
      <FlowLine id="fl3" d="M350,0 C350,150 800,50 800,200" top={-80} height={180} left={140} right={385} />
      <div className={CX}>
        <Reveal>
          <div className="grid lg:grid-cols-[5fr_7fr] gap-10 lg:gap-12 items-center">
            <div className="text-center lg:text-left">
              <Label>Guide</Label>
              <Heading>{t('home.cta.title')}</Heading>
              <p className="text-[13px] text-white/40 mb-8 max-w-sm mx-auto lg:mx-0">{t('home.cta.subtitle')}</p>
              <a href="https://t.me/keyshield_bot" target="_blank" rel="noopener noreferrer" onClick={() => trackLead()}
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-indigo-500 text-white text-sm font-medium rounded-full hover:bg-indigo-400 transition-colors">
                {t('home.cta.button')} <ArrowRight size={15} />
              </a>
            </div>

            {/* YouTube lazy embed */}
            <YoutubeEmbed videoId="xd21ruhSILU" />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── STICKY BOT CTA (lead magnet bar) ──────
function StickyBotCTA() {
  const { t } = useTranslation()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const start = document.getElementById('sticky-cta-start')
      const end = document.getElementById('sticky-cta-end')
      if (!start || !end) return
      const show = start.getBoundingClientRect().top < 0 && end.getBoundingClientRect().bottom > window.innerHeight
      setVisible(show)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 transition-all duration-500 ease-out ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="bg-[#0a0a0f]/95 backdrop-blur-xl border-t border-white/[0.08] lg:hidden">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between gap-4">
          <div className="hidden sm:block min-w-0">
            <p className="text-sm text-white truncate">{t('home.hero.title')}</p>
            <p className="text-[11px] text-white/30 truncate">{t('home.hero.subtitle')}</p>
          </div>
          <p className="text-[13px] text-white/50 sm:hidden flex-1">{t('home.hero.cta_start')}</p>
          <a
            href="https://t.me/keyshield_bot"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackLead()}
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-500 text-white text-[13px] font-medium rounded-full hover:bg-indigo-400 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.2-.04-.28-.02-.12.02-2.02 1.28-5.69 3.77-.54.37-1.03.55-1.47.54-.48-.01-1.4-.27-2.09-.49-.84-.27-1.51-.42-1.45-.89.03-.24.38-.49 1.05-.74 4.11-1.79 6.85-2.97 8.24-3.54 3.93-1.62 4.74-1.9 5.27-1.91.12 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .37z"/></svg>
            {t('header.open_bot')}
          </a>
        </div>
      </div>
    </div>
  )
}
