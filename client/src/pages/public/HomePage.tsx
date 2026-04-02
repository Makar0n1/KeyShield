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

// Reveal on scroll
function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [v, setV] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setV(true); obs.disconnect() } }, { threshold: 0.1 })
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

export function HomePage() {
  const { t } = useTranslation()
  return (
    <>
      <SEO title={t('home.seo_title')} description={t('home.seo_description')} schema={generateOrganizationSchema()} />
      <div className="bg-[#0e1117] text-white/80 overflow-hidden">
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

// ─── HERO ──────────────────────────────────
function HeroSection() {
  const { t } = useTranslation()
  return (
    <section className="relative pt-32 sm:pt-40 pb-20 sm:pb-28">
      {/* Gradient orbs */}
      <div className="absolute top-20 left-1/3 w-[500px] h-[500px] bg-indigo-600/[0.05] rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-purple-600/[0.04] rounded-full blur-[120px] pointer-events-none" />

      <div className={CX}>
        <Reveal>
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-[0.25em] text-indigo-400/70 mb-5">Escrow on TRON blockchain</p>
            <h1 className="text-[2.2rem] sm:text-5xl lg:text-[3.5rem] font-light leading-[1.12] tracking-tight text-white mb-6">
              {t('home.hero.title')}
            </h1>
            <p className="text-base sm:text-[1.05rem] text-white/35 leading-relaxed max-w-xl mb-10">
              {t('home.hero.subtitle')}
            </p>
            <div className="flex flex-wrap items-center gap-3 mb-20">
              <a
                href="https://t.me/keyshield_bot" target="_blank" rel="noopener noreferrer"
                onClick={() => trackLead()}
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-500 text-white text-sm font-medium rounded-full hover:bg-indigo-400 transition-colors"
              >
                {t('home.hero.cta_start')} <ArrowRight size={15} />
              </a>
              <a href="#how-it-works" className="inline-flex items-center gap-2 px-6 py-3 text-white/40 text-sm border border-white/[0.08] rounded-full hover:border-white/[0.18] hover:text-white/70 transition-all">
                {t('home.hero.cta_how')}
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 sm:gap-14 max-w-md border-t border-white/[0.06] pt-8">
            {[
              { value: '2/3', label: t('home.hero.stat_signatures') },
              { value: `${COMMISSION_TIER_1_FIXED}$`, label: t('home.hero.stat_commission') },
              { value: '24/7', label: t('home.hero.stat_availability') },
            ].map((s, i) => (
              <div key={i}>
                <p className="text-xl sm:text-2xl font-light text-white">{s.value}</p>
                <p className="text-[11px] text-white/25 mt-1 leading-snug">{s.label}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── FEATURES ──────────────────────────────
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
    <section id="features" className="py-20 sm:py-24 border-t border-white/[0.04]">
      <div className={CX}>
        <Reveal>
          <Label>Features</Label>
          <Heading className="max-w-lg">{t('home.features.title')}</Heading>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-10">
            {features.map(({ icon: Icon, key }) => (
              <div key={key} className="group">
                <div className="w-9 h-9 rounded-xl bg-white/[0.03] flex items-center justify-center mb-4 group-hover:bg-indigo-500/10 transition-colors">
                  <Icon size={18} className="text-white/25 group-hover:text-indigo-400 transition-colors" strokeWidth={1.5} />
                </div>
                <h3 className="text-[15px] font-medium text-white/80 mb-2">{t(`home.features.${key}_title`, { fee: COMMISSION_TIER_1_FIXED })}</h3>
                <p className="text-[13px] text-white/30 leading-relaxed">{t(`home.features.${key}_desc`, { fee: COMMISSION_TIER_1_FIXED })}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── HOW IT WORKS ──────────────────────────
function HowItWorksSection() {
  const { t } = useTranslation()
  const steps = ['step1', 'step2', 'step3', 'step4', 'step5']
  return (
    <section id="how-it-works" className="py-20 sm:py-24 border-t border-white/[0.04]">
      <div className={CX}>
        <Reveal>
          <Label>Process</Label>
          <Heading>{t('home.how_it_works.title')}</Heading>
          <div className="max-w-2xl space-y-6">
            {steps.map((key, i) => (
              <div key={key} className="flex gap-5 group">
                <div className="w-8 h-8 rounded-full bg-white/[0.04] group-hover:bg-indigo-500/10 flex items-center justify-center shrink-0 transition-colors">
                  <span className="text-[11px] font-mono text-white/25 group-hover:text-indigo-400 transition-colors">{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div className="pt-1">
                  <h3 className="text-[15px] font-medium text-white/80 mb-1">{t(`home.how_it_works.${key}_title`)}</h3>
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

// ─── DEAL BUILDER ──────────────────────────
function DealBuilderSection() {
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
    <section className="py-20 sm:py-24 border-t border-white/[0.04]">
      <div className={CX}>
        <Reveal>
          <div className="max-w-md mx-auto">
            <Label>{t('home.deal_builder.label')}</Label>
            <Heading className="text-center">{t('home.deal_builder.title')}</Heading>
            <p className="text-[13px] text-white/30 text-center -mt-6 mb-8">{t('home.deal_builder.subtitle')}</p>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-2 mb-8">
              {stepLabels.map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full transition-all ${i <= step ? 'bg-indigo-500 scale-110' : 'bg-white/10'}`} />
                  {i < 3 && <div className={`w-6 h-px ${i < step ? 'bg-indigo-500/40' : 'bg-white/[0.06]'}`} />}
                </div>
              ))}
            </div>

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
                  className="w-full h-12 px-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/15 outline-none focus:border-indigo-500/40 transition-colors"
                  onKeyDown={e => e.key === 'Enter' && handleNext()} />
              </div>
            )}

            {step === 2 && (
              <div>
                <label className="block text-[11px] uppercase tracking-widest text-white/25 mb-2">{t('home.deal_builder.amount_label')}</label>
                <input type="number" value={amount} onChange={e => { setAmount(e.target.value); setError('') }}
                  placeholder={t('home.deal_builder.amount_placeholder')} autoFocus min={50}
                  className="w-full h-12 px-4 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white text-sm placeholder:text-white/15 outline-none focus:border-indigo-500/40 transition-colors"
                  onKeyDown={e => e.key === 'Enter' && handleNext()} />
                {commission > 0 && <p className="text-[11px] text-white/15 mt-2">{t('home.deal_builder.commission_hint')}: ~{commission.toFixed(2)} USDT</p>}
              </div>
            )}

            {step === 3 && deepLink && (
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-4"><Check size={22} /></div>
                <p className="text-[15px] text-white/80 mb-1">{t('home.deal_builder.done_title')}</p>
                <p className="text-[12px] text-white/25 mb-6">{t('home.deal_builder.done_subtitle')}</p>
                <a href={deepLink} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-500 text-white text-sm font-medium rounded-full hover:bg-indigo-400 transition-colors mb-4">
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

            {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

            {step < 3 && (
              <button onClick={handleNext} disabled={loading || (step === 0 && !role)}
                className="w-full mt-6 py-3 text-sm font-medium rounded-full transition-all disabled:opacity-20 bg-indigo-500 text-white hover:bg-indigo-400">
                {loading ? <span className="flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" />{t('home.deal_builder.btn_creating')}</span>
                  : step === 2 ? t('home.deal_builder.btn_create') : t('home.deal_builder.btn_next')}
              </button>
            )}
            {step > 0 && step < 3 && <button onClick={() => setStep(s => s - 1)} className="w-full mt-2 py-2 text-[13px] text-white/20 hover:text-white/40 transition-colors">{t('home.deal_builder.btn_back')}</button>}
            {step === 3 && <button onClick={reset} className="w-full mt-4 py-2 text-[13px] text-white/20 hover:text-white/40 transition-colors">{t('home.deal_builder.done_another')}</button>}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── PRICING ───────────────────────────────
function PricingSection() {
  const { t } = useTranslation()
  return (
    <section id="pricing" className="py-20 sm:py-24 border-t border-white/[0.04]">
      <div className={CX}>
        <Reveal>
          <Label>Pricing</Label>
          <Heading>{t('home.pricing.title')}</Heading>
          <div className="grid sm:grid-cols-2 gap-6 max-w-2xl">
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
          <div className="mt-8 flex flex-wrap gap-x-10 gap-y-2 text-[12px] text-white/20 max-w-2xl">
            <span>{t('home.pricing.who_pays_title')}: {t('home.pricing.who_pays_desc')}</span>
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
    <section className="py-20 sm:py-24 border-t border-white/[0.04]">
      <div className={CX}>
        <Reveal>
          <Label>FAQ</Label>
          <Heading>{t('home.faq.title')}</Heading>
          <div className="max-w-2xl">
            {items.map((item, i) => (
              <div key={i} className="border-b border-white/[0.04]">
                <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between py-5 text-left group">
                  <span className="text-sm text-white/60 group-hover:text-white/80 transition-colors pr-4">{item.q}</span>
                  <ChevronDown size={15} className={`text-white/15 shrink-0 transition-transform ${open === i ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${open === i ? 'max-h-96 pb-5' : 'max-h-0'}`}>
                  <p className="text-[13px] text-white/25 leading-relaxed">{item.a}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ─── CTA ───────────────────────────────────
function CTASection() {
  const { t } = useTranslation()
  return (
    <section className="py-20 sm:py-28 border-t border-white/[0.04]">
      <div className={`${CX} text-center`}>
        <Reveal>
          <h2 className="text-2xl sm:text-3xl font-light tracking-tight text-white/90 mb-4">{t('home.cta.title')}</h2>
          <p className="text-[13px] text-white/25 mb-8 max-w-md mx-auto">{t('home.cta.subtitle')}</p>
          <a href="https://t.me/keyshield_bot" target="_blank" rel="noopener noreferrer" onClick={() => trackLead()}
            className="inline-flex items-center gap-2 px-7 py-3.5 bg-indigo-500 text-white text-sm font-medium rounded-full hover:bg-indigo-400 transition-colors">
            {t('home.cta.button')} <ArrowRight size={15} />
          </a>
        </Reveal>
      </div>
    </section>
  )
}
