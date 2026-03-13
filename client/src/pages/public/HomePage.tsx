import { useEffect, useState, useRef, useCallback } from 'react'
import { LangLink as Link } from '@/components/ui/LangLink'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { SEO, generateOrganizationSchema } from '@/components/SEO'
import { blogService } from '@/services/blog'
import { trackLead, trackViewContent } from '@/hooks/useMetaPixel'
import type { BlogPost } from '@/types'
import { formatDateShort } from '@/utils/format'
import {
  COMMISSION_TIER_1_MAX,
  COMMISSION_TIER_1_FIXED,
  COMMISSION_TIER_2_RATE,
  COMMISSION_TIER_3_RATE,
  COMMISSION_TIER_4_RATE,
  MIN_DEAL_AMOUNT
} from '@/config/constants'

// ========== Sticky Mobile CTA ==========
function StickyCTA() {
  const [isVisible, setIsVisible] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    const handleScroll = () => {
      // Show after scrolling 300px
      setIsVisible(window.scrollY > 300)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 md:hidden bg-dark/95 backdrop-blur-md border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] transition-all duration-300 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
      }`}
    >
      <div className="flex flex-col gap-2">
        <Button size="lg" className="w-full" asChild>
          <a
            href="https://t.me/keyshield_bot"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackLead({ content_name: 'sticky_mobile_cta', content_category: 'telegram_bot' })}
          >
            {t('home.sticky_open_bot')}
          </a>
        </Button>
        <button
          className="text-xs text-muted text-center"
          onClick={() => {
            trackViewContent({ content_name: 'section_scroll', content_category: 'testimonials' })
            document.getElementById('testimonials')?.scrollIntoView({ behavior: 'smooth' })
          }}
        >
          {t('home.sticky_read_reviews')}
        </button>
      </div>
    </div>
  )
}

// ========== Hero Section ==========
function HeroSection() {
  const { t } = useTranslation()

  return (
    <section className="relative py-20 md:py-32 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />

      <div className="container mx-auto px-4 relative">
        <div className="max-w-3xl mx-auto text-center animate-fade-in">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            {t('home.hero.title')}
          </h1>
          <p className="text-lg md:text-xl text-gray-300 mb-8 leading-relaxed">
            {t('home.hero.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <a
                href="https://t.me/keyshield_bot"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackLead({ content_name: 'hero_cta', content_category: 'telegram_bot' })}
              >
                {t('home.hero.cta_start')}
              </a>
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => {
                trackViewContent({ content_name: 'section_scroll', content_category: 'how-it-works' })
                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              {t('home.hero.cta_how')}
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 mt-16">
            {[
              { value: '2/3', labelKey: 'home.hero.stat_signatures' },
              { value: `${COMMISSION_TIER_1_FIXED} USDT`, labelKey: 'home.hero.stat_commission' },
              { value: '24/7', labelKey: 'home.hero.stat_availability' },
            ].map((stat) => (
              <div key={stat.labelKey} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-primary mb-2">
                  {stat.value}
                </div>
                <div className="text-sm text-muted">{t(stat.labelKey)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ========== What Is Safe Deal Section ==========
function WhatIsSafeDealSection() {
  const { t } = useTranslation()

  return (
    <section className="py-16 bg-dark-light/30">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-8">
            {t('home.what_is.title')}
          </h2>
          <div className="space-y-4 text-gray-300 text-lg leading-relaxed">
            <p dangerouslySetInnerHTML={{ __html: t('home.what_is.p1') }} />
            <p dangerouslySetInnerHTML={{ __html: t('home.what_is.p2') }} />
          </div>
        </div>
      </div>
    </section>
  )
}

// ========== Features Section ==========
function FeaturesSection() {
  const { t } = useTranslation()

  const features = [
    { icon: '&#x1F512;', titleKey: 'home.features.multisig_title', descKey: 'home.features.multisig_desc' },
    { icon: '&#x26A1;', titleKey: 'home.features.automation_title', descKey: 'home.features.automation_desc' },
    { icon: '&#x1F3AF;', titleKey: 'home.features.transparency_title', descKey: 'home.features.transparency_desc' },
    { icon: '&#x1F6E1;', titleKey: 'home.features.arbitration_title', descKey: 'home.features.arbitration_desc' },
    { icon: '&#x1F4B8;', titleKey: 'home.features.low_fee_title', descKey: 'home.features.low_fee_desc' },
    { icon: '&#x1F680;', titleKey: 'home.features.fast_start_title', descKey: 'home.features.fast_start_desc' },
  ]

  return (
    <section id="features" className="py-20 bg-dark-light/50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          {t('home.features.title')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.titleKey}
              className="bg-dark-light rounded-xl p-6 border border-border hover:border-primary/50 transition-all duration-300 hover:-translate-y-1"
            >
              <div
                className="text-4xl mb-4"
                dangerouslySetInnerHTML={{ __html: feature.icon }}
              />
              <h3 className="text-xl font-semibold text-white mb-2">{t(feature.titleKey)}</h3>
              <p className="text-muted">{t(feature.descKey, { fee: COMMISSION_TIER_1_FIXED })}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ========== How It Works Section ==========
function HowItWorksSection() {
  const { t } = useTranslation()

  const steps = [
    { number: 1, titleKey: 'home.how_it_works.step1_title', descKey: 'home.how_it_works.step1_desc' },
    { number: 2, titleKey: 'home.how_it_works.step2_title', descKey: 'home.how_it_works.step2_desc' },
    { number: 3, titleKey: 'home.how_it_works.step3_title', descKey: 'home.how_it_works.step3_desc' },
    { number: 4, titleKey: 'home.how_it_works.step4_title', descKey: 'home.how_it_works.step4_desc' },
    { number: 5, titleKey: 'home.how_it_works.step5_title', descKey: 'home.how_it_works.step5_desc' },
  ]

  return (
    <section id="how-it-works" className="py-20">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          {t('home.how_it_works.title')}
        </h2>
        <div className="max-w-3xl mx-auto space-y-8">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-6 animate-slide-up">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xl">
                {step.number}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">{t(step.titleKey)}</h3>
                <p className="text-muted">{t(step.descKey)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Deadline Warning */}
        <div className="max-w-3xl mx-auto mt-12 p-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
          <h3 className="text-xl font-semibold text-yellow-400 mb-3">
            &#x23F0; {t('home.how_it_works.deadline_title')}
          </h3>
          <p className="text-gray-300" dangerouslySetInnerHTML={{ __html: t('home.how_it_works.deadline_p1') }} />
          <p className="text-gray-300 mt-2" dangerouslySetInnerHTML={{ __html: t('home.how_it_works.deadline_p2') }} />
          <p className="text-gray-300 mt-2" dangerouslySetInnerHTML={{ __html: t('home.how_it_works.deadline_p3') }} />
        </div>
      </div>
    </section>
  )
}

// ========== Pricing Section ==========
function PricingSection() {
  const { t } = useTranslation()

  return (
    <section id="pricing" className="py-20 bg-dark-light/50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          {t('home.pricing.title')}
        </h2>
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Standard */}
          <div className="bg-dark rounded-xl p-8 border border-border">
            <h3 className="text-xl font-semibold text-white mb-4">{t('home.pricing.standard_title')}</h3>
            <div className="text-5xl font-bold text-primary mb-2">{(COMMISSION_TIER_2_RATE * 100).toFixed(1)}%</div>
            <p className="text-muted">{t('home.pricing.standard_from')}</p>
            <p className="text-muted">{t('home.pricing.standard_tier3', { rate: (COMMISSION_TIER_3_RATE * 100).toFixed(0) })}</p>
            <p className="text-muted mb-2">{t('home.pricing.standard_tier4', { rate: (COMMISSION_TIER_4_RATE * 100).toFixed(1) })}</p>
            <ul className="space-y-3">
              {[t('home.pricing.auto_payouts'), t('home.pricing.dispute_arbitration'), t('home.pricing.support_247')].map((item) => (
                <li key={item} className="flex items-center gap-2 text-gray-300">
                  <span className="text-secondary">&#x2713;</span> {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Fixed */}
          <div className="bg-dark rounded-xl p-8 border-2 border-primary relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-medium">
              {t('home.pricing.minimum_badge')}
            </div>
            <h3 className="text-xl font-semibold text-white mb-4">{t('home.pricing.fixed_title')}</h3>
            <div className="text-5xl font-bold text-primary mb-2">{COMMISSION_TIER_1_FIXED} USDT</div>
            <p className="text-muted mb-6">{t('home.pricing.fixed_desc', { max: COMMISSION_TIER_1_MAX })}</p>
            <ul className="space-y-3">
              {[
                t('home.pricing.fixed_min_amount', { min: MIN_DEAL_AMOUNT }),
                t('home.pricing.fixed_all_features'),
                t('home.pricing.fixed_ideal'),
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-gray-300">
                  <span className="text-secondary">&#x2713;</span> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Commission Info Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto mt-10">
          <div className="bg-dark rounded-xl p-5 border border-border flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">&#x1F4B3;</span>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-1">{t('home.pricing.who_pays_title')}</h4>
              <p className="text-muted text-sm">{t('home.pricing.who_pays_desc')}</p>
            </div>
          </div>
          <div className="bg-dark rounded-xl p-5 border border-border flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">&#x2705;</span>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-1">{t('home.pricing.no_hidden_title')}</h4>
              <p className="text-muted text-sm">{t('home.pricing.no_hidden_desc')}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ========== FAQ Section ==========
function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const { t } = useTranslation()

  const faqItems = [
    { question: t('home.faq.q1'), answer: t('home.faq.a1') },
    { question: t('home.faq.q2'), answer: t('home.faq.a2') },
    { question: t('home.faq.q3'), answer: t('home.faq.a3') },
    { question: t('home.faq.q4'), answer: t('home.faq.a4') },
  ]

  return (
    <section id="faq" className="py-20">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          {t('home.faq.title')}
        </h2>
        <div className="max-w-3xl mx-auto space-y-4">
          {faqItems.map((item, index) => (
            <div
              key={index}
              className="bg-dark-light rounded-xl border border-border overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-dark-lighter transition-colors"
              >
                <span className="text-lg font-medium text-white">{item.question}</span>
                <span className={`text-primary text-2xl transition-transform ${openIndex === index ? 'rotate-45' : ''}`}>
                  +
                </span>
              </button>
              {openIndex === index && (
                <div className="px-6 pb-4">
                  <p className="text-gray-300 leading-relaxed">{item.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ========== Testimonials Section ==========
function useTestimonials() {
  const { t } = useTranslation()
  return [
    { name: t('home.testimonials.t1_name'), role: t('home.testimonials.t1_role'), avatar: '👨‍💻', text: t('home.testimonials.t1_text'), rating: 5 },
    { name: t('home.testimonials.t2_name'), role: t('home.testimonials.t2_role'), avatar: '👩‍💼', text: t('home.testimonials.t2_text'), rating: 5 },
    { name: t('home.testimonials.t3_name'), role: t('home.testimonials.t3_role'), avatar: '🧑‍🔧', text: t('home.testimonials.t3_text'), rating: 5 },
    { name: t('home.testimonials.t4_name'), role: t('home.testimonials.t4_role'), avatar: '👩', text: t('home.testimonials.t4_text'), rating: 5 },
    { name: t('home.testimonials.t5_name'), role: t('home.testimonials.t5_role'), avatar: '🧔', text: t('home.testimonials.t5_text'), rating: 4 },
    { name: t('home.testimonials.t6_name'), role: t('home.testimonials.t6_role'), avatar: '👩‍🎨', text: t('home.testimonials.t6_text'), rating: 5 },
  ]
}

type Testimonial = ReturnType<typeof useTestimonials>[0]

// Skeleton card for loading state
function TestimonialCardSkeleton({ isCenter }: { isCenter: boolean }) {
  return (
    <div
      className={`bg-dark rounded-xl p-6 border border-border flex-shrink-0 w-[340px] mx-2 flex flex-col h-[280px] ${
        isCenter ? 'scale-100 opacity-100' : 'scale-95 opacity-40'
      }`}
    >
      {/* Header skeleton */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-dark-light animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="h-4 w-24 bg-dark-light rounded animate-pulse mb-2" />
          <div className="h-3 w-16 bg-dark-light rounded animate-pulse" />
        </div>
      </div>

      {/* Stars skeleton */}
      <div className="flex gap-1 mb-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="w-4 h-4 bg-dark-light rounded animate-pulse" />
        ))}
      </div>

      {/* Text skeleton */}
      <div className="space-y-2 flex-1">
        <div className="h-3 w-full bg-dark-light rounded animate-pulse" />
        <div className="h-3 w-full bg-dark-light rounded animate-pulse" />
        <div className="h-3 w-full bg-dark-light rounded animate-pulse" />
        <div className="h-3 w-3/4 bg-dark-light rounded animate-pulse" />
      </div>
    </div>
  )
}

// Testimonial card component
function TestimonialCard({
  testimonial,
  isActive,
  isJumping,
}: {
  testimonial: Testimonial
  isActive: boolean
  isJumping: boolean
}) {
  return (
    <div
      className={`bg-dark rounded-xl p-6 border flex-shrink-0 w-[340px] mx-2 flex flex-col h-[280px] ${
        isJumping ? '' : 'transition-all duration-500'
      } ${
        isActive
          ? 'border-primary/50 scale-100 opacity-100'
          : 'border-border scale-95 opacity-40'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-full bg-dark-light flex items-center justify-center text-2xl flex-shrink-0">
          {testimonial.avatar}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-white truncate">{testimonial.name}</div>
          <div className="text-sm text-muted truncate">{testimonial.role}</div>
        </div>
      </div>

      {/* Stars */}
      <div className="flex gap-1 mb-3">
        {[...Array(5)].map((_, i) => (
          <span
            key={i}
            className={i < testimonial.rating ? 'text-yellow-400' : 'text-gray-600'}
          >
            ★
          </span>
        ))}
      </div>

      {/* Text - no truncation, full height */}
      <p className="text-gray-300 leading-relaxed text-sm flex-1">
        "{testimonial.text}"
      </p>
    </div>
  )
}

function TestimonialsSection() {
  const testimonials = useTestimonials()
  const totalSlides = testimonials.length
  const [activeIndex, setActiveIndex] = useState(0) // For dots UI only
  const [visualPosition, setVisualPosition] = useState(3) // Which card is visually active
  const [isJumping, setIsJumping] = useState(false) // Disable card transitions during reset
  const [isLoading, setIsLoading] = useState(true) // Show skeleton until visible
  const [hasBeenVisible, setHasBeenVisible] = useState(false) // Track if section was ever visible
  const { t } = useTranslation()

  const touchStartX = useRef(0)
  const touchEndX = useRef(0)
  const trackRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const positionRef = useRef(3) // Actual position in extended array
  const isAnimatingRef = useRef(false)
  const autoplayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const cardWidth = 356 // 340px card + 16px margin
  const cloneCount = 3 // More clones to prevent edge visibility issues

  // Create extended array: [last3, last2, last1, ...originals, first1, first2, first3]
  const extendedTestimonials = [
    ...testimonials.slice(-cloneCount),
    ...testimonials,
    ...testimonials.slice(0, cloneCount),
  ]

  // Intersection Observer to detect when section is visible
  useEffect(() => {
    if (hasBeenVisible) return // Only trigger once

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHasBeenVisible(true)
          // Show skeleton for 1.5 seconds then reveal content
          setTimeout(() => {
            setIsLoading(false)
          }, 1500)
        }
      },
      { threshold: 0.2 }
    )

    if (sectionRef.current) {
      observer.observe(sectionRef.current)
    }

    return () => observer.disconnect()
  }, [hasBeenVisible])

  // Update track transform - defined before useEffect that uses it
  const updateTrackPosition = useCallback((animate: boolean) => {
    const track = trackRef.current
    if (!track) return
    const offset = positionRef.current * cardWidth

    if (animate) {
      track.style.transition = 'transform 700ms ease-in-out'
    } else {
      track.style.transition = 'none'
    }
    track.style.transform = `translateX(calc(50% - 178px - ${offset}px))`
  }, [cardWidth])

  // Initialize position on mount
  useEffect(() => {
    updateTrackPosition(false)
  }, [updateTrackPosition])

  // Reset autoplay timer
  const resetAutoplay = useCallback(() => {
    if (autoplayIntervalRef.current) {
      clearInterval(autoplayIntervalRef.current)
    }
    autoplayIntervalRef.current = setInterval(() => {
      if (isAnimatingRef.current) return
      isAnimatingRef.current = true
      positionRef.current += 1
      setVisualPosition(positionRef.current)
      setActiveIndex((prev) => (prev + 1) % totalSlides)
      updateTrackPosition(true)
    }, 3000)
  }, [totalSlides, updateTrackPosition])

  // Go to next slide (manual)
  const nextSlide = useCallback(() => {
    if (isAnimatingRef.current) return
    isAnimatingRef.current = true
    positionRef.current += 1
    setVisualPosition(positionRef.current)
    setActiveIndex((prev) => (prev + 1) % totalSlides)
    updateTrackPosition(true)
    resetAutoplay() // Reset timer on manual interaction
  }, [totalSlides, updateTrackPosition, resetAutoplay])

  // Go to previous slide (manual)
  const prevSlide = useCallback(() => {
    if (isAnimatingRef.current) return
    isAnimatingRef.current = true
    positionRef.current -= 1
    setVisualPosition(positionRef.current)
    setActiveIndex((prev) => (prev - 1 + totalSlides) % totalSlides)
    updateTrackPosition(true)
    resetAutoplay() // Reset timer on manual interaction
  }, [totalSlides, updateTrackPosition, resetAutoplay])

  // Jump to specific slide (from dots)
  const goToSlide = useCallback((idx: number) => {
    if (isAnimatingRef.current) return
    isAnimatingRef.current = true
    const currentReal = positionRef.current - cloneCount
    const diff = idx - currentReal
    positionRef.current += diff
    setVisualPosition(positionRef.current)
    setActiveIndex(idx)
    updateTrackPosition(true)
    resetAutoplay() // Reset timer on manual interaction
  }, [updateTrackPosition, resetAutoplay])

  // Handle transition end - check if we need to reset position
  const handleTransitionEnd = useCallback((e: React.TransitionEvent) => {
    // Ignore events from child elements
    if (e.target !== trackRef.current) return
    // Ignore non-transform transitions
    if (e.propertyName !== 'transform') return

    const realPosition = positionRef.current - cloneCount

    if (realPosition >= totalSlides) {
      // We're on a clone after the last real slide - jump to real first
      setIsJumping(true) // Disable card transitions first

      // Use setTimeout to ensure React has time to apply isJumping before DOM changes
      setTimeout(() => {
        positionRef.current = cloneCount
        setVisualPosition(cloneCount) // Switch active to real slide
        updateTrackPosition(false) // Instant jump

        // Small delay before re-enabling transitions
        setTimeout(() => {
          setIsJumping(false) // Re-enable card transitions
          isAnimatingRef.current = false
        }, 20)
      }, 10)
    } else if (realPosition < 0) {
      // We're on a clone before the first real slide - jump to real last
      setIsJumping(true)

      setTimeout(() => {
        positionRef.current = cloneCount + totalSlides - 1
        setVisualPosition(cloneCount + totalSlides - 1)
        updateTrackPosition(false)

        setTimeout(() => {
          setIsJumping(false)
          isAnimatingRef.current = false
        }, 20)
      }, 10)
    } else {
      isAnimatingRef.current = false
    }
  }, [totalSlides, updateTrackPosition])

  // Auto-play - only start after loading complete
  useEffect(() => {
    if (isLoading) return

    resetAutoplay()
    return () => {
      if (autoplayIntervalRef.current) {
        clearInterval(autoplayIntervalRef.current)
      }
    }
  }, [isLoading, resetAutoplay])

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX
  }

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        nextSlide()
      } else {
        prevSlide()
      }
    }
  }

  return (
    <section ref={sectionRef} id="testimonials" className="py-20 bg-dark-light/30 overflow-hidden">
      <div className="container mx-auto px-4 overflow-hidden">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            {t('home.testimonials.title')}
          </h2>
          <p className="text-muted text-lg max-w-2xl mx-auto">
            {t('home.testimonials.subtitle')}
          </p>
        </div>

        {/* Carousel container with fixed height */}
        <div className="relative h-[340px] overflow-hidden">
          {/* Skeleton loading state */}
          <div
            className={`absolute inset-0 transition-opacity duration-500 ${
              isLoading ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="flex items-center justify-center h-[280px]">
              {/* Show 3 skeleton cards centered */}
              <div className="flex items-stretch">
                <TestimonialCardSkeleton isCenter={false} />
                <TestimonialCardSkeleton isCenter={true} />
                <TestimonialCardSkeleton isCenter={false} />
              </div>
            </div>
            {/* Skeleton dots */}
            <div className="flex justify-center gap-2 mt-6">
              {testimonials.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 rounded-full bg-border ${idx === 0 ? 'w-6' : 'w-2'}`}
                />
              ))}
            </div>
          </div>

          {/* Actual carousel */}
          <div
            className={`absolute inset-0 transition-opacity duration-500 ${
              isLoading ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Navigation arrows */}
            <button
              onClick={prevSlide}
              className="hidden md:flex absolute left-0 top-[140px] -translate-y-1/2 -translate-x-4 z-20 w-10 h-10 items-center justify-center rounded-full bg-dark border border-border hover:border-primary/50 text-muted hover:text-white transition-all"
              aria-label="Previous testimonial"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={nextSlide}
              className="hidden md:flex absolute right-0 top-[140px] -translate-y-1/2 translate-x-4 z-20 w-10 h-10 items-center justify-center rounded-full bg-dark border border-border hover:border-primary/50 text-muted hover:text-white transition-all"
              aria-label="Next testimonial"
            >
              <ChevronRight size={20} />
            </button>

            {/* Slider track */}
            <div className="overflow-hidden h-[280px]">
              <div
                ref={trackRef}
                className="flex items-stretch"
                onTransitionEnd={handleTransitionEnd}
              >
                {extendedTestimonials.map((testimonial, idx) => {
                  // isActive based on visualPosition (includes clones)
                  const isActive = idx === visualPosition

                  return (
                    <TestimonialCard
                      key={`testimonial-${idx}`}
                      testimonial={testimonial}
                      isActive={isActive}
                      isJumping={isJumping}
                    />
                  )
                })}
              </div>
            </div>

            {/* Dots */}
            <div className="flex justify-center gap-2 mt-6">
              {testimonials.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => goToSlide(idx)}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    idx === activeIndex ? 'bg-primary w-6' : 'bg-border hover:bg-muted'
                  }`}
                  aria-label={`Go to testimonial ${idx + 1}`}
                />
              ))}
            </div>

            {/* Mobile hint */}
            <p className="text-center text-xs text-muted mt-3 md:hidden">
              {t('home.testimonials.swipe_hint')}
            </p>
          </div>
        </div>

        {/* Trust indicators */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 mt-12 pt-8 border-t border-border max-w-3xl mx-auto">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">150+</div>
            <div className="text-sm text-muted">{t('home.testimonials.stat_deals')}</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">70+</div>
            <div className="text-sm text-muted">{t('home.testimonials.stat_users')}</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">0</div>
            <div className="text-sm text-muted">{t('home.testimonials.stat_fraud')}</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">24/7</div>
            <div className="text-sm text-muted">{t('home.testimonials.stat_support')}</div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ========== CTA Section ==========
function CTASection() {
  const { t } = useTranslation()

  return (
    <section className="py-20 bg-gradient-to-r from-primary to-primary-dark">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          {t('home.cta.title')}
        </h2>
        <p className="text-white/80 text-lg mb-8">
          {t('home.cta.subtitle')}
        </p>
        <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-gray-100" asChild>
          <a
            href="https://t.me/keyshield_bot"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackLead({ content_name: 'cta_section', content_category: 'telegram_bot' })}
          >
            {t('home.cta.button')}
          </a>
        </Button>
      </div>
    </section>
  )
}

// ========== Blog Section ==========
// Skeleton card for loading state
function BlogCardSkeleton() {
  return (
    <div className="bg-dark-light rounded-xl overflow-hidden border border-border">
      <div className="h-40 bg-dark-lighter animate-pulse" />
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-3 w-20 bg-dark-lighter rounded animate-pulse" />
          <div className="h-3 w-16 bg-dark-lighter rounded animate-pulse" />
        </div>
        <div className="h-4 w-full bg-dark-lighter rounded animate-pulse mb-2" />
        <div className="h-4 w-3/4 bg-dark-lighter rounded animate-pulse" />
      </div>
    </div>
  )
}

function BlogSection() {
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [loading, setLoading] = useState(true)
  const { t } = useTranslation()

  useEffect(() => {
    blogService
      .getPosts({ limit: 4, sort: 'newest' })
      .then((data) => {
        setPosts(data.posts || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Don't render if no posts after loading
  if (!loading && posts.length === 0) return null

  return (
    <section className="py-20 bg-dark-light/50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          {t('home.blog.title')}
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {loading ? (
            // Skeleton placeholders while loading
            <>
              <BlogCardSkeleton />
              <BlogCardSkeleton />
              <BlogCardSkeleton />
              <BlogCardSkeleton />
            </>
          ) : (
            posts.map((post) => (
              <Link
                key={post._id}
                to={`/blog/${post.slug}`}
                className="bg-dark-light rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-all duration-300 group hover:-translate-y-1"
              >
                {post.coverImage && (
                  <div className="h-40 relative overflow-hidden bg-dark">
                    {/* Blurred background */}
                    <img
                      src={post.coverImage}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-40"
                    />
                    {/* Main image */}
                    <img
                      src={post.coverImage}
                      alt={post.title}
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted mb-2">
                    {post.category && <span className="text-primary">{post.category.name}</span>}
                    <span>{formatDateShort(post.publishedAt || post.createdAt)}</span>
                  </div>
                  <h3 className="font-semibold text-white group-hover:text-primary transition-colors line-clamp-2">
                    {post.title}
                  </h3>
                </div>
              </Link>
            ))
          )}
        </div>
        <div className="text-center mt-8">
          <Button size="lg" asChild>
            <Link to="/blog">{t('home.blog.read_more')}</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

// ========== Main Page Component ==========
export function HomePage() {
  const webDomain = import.meta.env.VITE_WEB_DOMAIN || 'https://keyshield.me'
  const { t } = useTranslation()

  // FAQ Schema - use translated text
  const faqItems = [
    { q: t('home.faq.q1'), a: t('home.faq.a1') },
    { q: t('home.faq.q2'), a: t('home.faq.a2') },
    { q: t('home.faq.q3'), a: t('home.faq.a3') },
    { q: t('home.faq.q4'), a: t('home.faq.a4') },
  ]

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  }

  // Schema for home page - Organization + WebSite + Service + FAQ
  const schemas = [
    generateOrganizationSchema(),
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'KeyShield',
      url: webDomain,
      description: t('home.seo_description'),
      potentialAction: {
        '@type': 'SearchAction',
        target: `${webDomain}/blog?search={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'KeyShield',
      serviceType: 'Escrow service for cryptocurrency deals',
      description: t('home.seo_description'),
      provider: {
        '@type': 'Organization',
        name: 'KeyShield',
      },
      areaServed: 'Worldwide',
      offers: {
        '@type': 'Offer',
        description: t('home.pricing.fixed_title'),
        price: COMMISSION_TIER_1_FIXED.toString(),
        priceCurrency: 'USD',
        priceSpecification: {
          '@type': 'PriceSpecification',
          price: (COMMISSION_TIER_2_RATE * 100).toFixed(1),
          priceCurrency: 'USD',
          unitText: 'percent of deal amount',
        },
      },
    },
    faqSchema,
  ]

  return (
    <>
      <SEO
        title={t('home.seo_title')}
        description={t('home.seo_description')}
        url="/"
        schema={schemas}
      />
      <HeroSection />
      <WhatIsSafeDealSection />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingSection />
      <FAQSection />
      <TestimonialsSection />
      <CTASection />
      <BlogSection />
      <StickyCTA />
    </>
  )
}
