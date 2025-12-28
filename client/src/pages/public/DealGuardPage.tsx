import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { SEO } from '@/components/SEO'
import { trackLead, trackViewContent } from '@/hooks/useMetaPixel'
import { COMMISSION_TIER_1_MAX, COMMISSION_TIER_1_FIXED, COMMISSION_TIER_2_RATE, MIN_DEAL_AMOUNT } from '@/config/constants'

// ========== Constants ==========
const BOT_URL = 'https://t.me/keyshield_bot'
const CTA_TEXT = 'Открыть Telegram-бота'
const CTA_SUBTEXT = 'После клика откроется Telegram-бот, сделка создается за 2 минуты'

// Helper for UTM links
function getBotLink(source = 'deal_guard') {
  return `${BOT_URL}?start=fb_${source}`
}

// ========== Icons (line style, no crypto symbols) ==========
const Icons = {
  shield: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  clock: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  scales: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
    </svg>
  ),
  check: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
    </svg>
  ),
  bolt: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  document: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  users: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  briefcase: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  chat: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  handshake: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 11l5-5m0 0l5 5m-5-5v12" />
    </svg>
  ),
  chevronDown: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
}

// ========== Header ==========
function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-dark/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/deal-guard" className="flex items-center gap-2">
            <img src="/logo.png" alt="KeyShield" className="w-12 h-12" />
            <span className="text-xl font-bold text-white">KeyShield</span>
          </Link>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-6">
            <a
              href="#how-it-works"
              className="text-gray-300 hover:text-white transition-colors"
              onClick={() => trackViewContent({ content_name: 'section_scroll', content_category: 'how-it-works' })}
            >
              Как работает
            </a>
            <a
              href="#pricing"
              className="text-gray-300 hover:text-white transition-colors"
              onClick={() => trackViewContent({ content_name: 'section_scroll', content_category: 'pricing' })}
            >
              Комиссия
            </a>
            <a
              href="#faq"
              className="text-gray-300 hover:text-white transition-colors"
              onClick={() => trackViewContent({ content_name: 'section_scroll', content_category: 'faq' })}
            >
              FAQ
            </a>
          </nav>

          {/* CTA */}
          <Button size="sm" asChild>
            <a
              href={getBotLink('header')}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackLead({ content_name: 'deal_guard_header', content_category: 'telegram_bot' })}
            >
              {CTA_TEXT}
            </a>
          </Button>
        </div>
      </div>
    </header>
  )
}

// ========== Sticky Mobile CTA ==========
function StickyCTA() {
  const [isVisible, setIsVisible] = useState(false)

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
            href={getBotLink('sticky_mobile')}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackLead({ content_name: 'deal_guard_sticky', content_category: 'telegram_bot' })}
          >
            {CTA_TEXT}
          </a>
        </Button>
        <button
          className="text-xs text-muted text-center"
          onClick={() => {
            trackViewContent({ content_name: 'section_scroll', content_category: 'how-it-works' })
            document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
          }}
        >
          Как это работает
        </button>
      </div>
    </div>
  )
}

// ========== Hero Section ==========
function HeroSection() {
  return (
    <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />

      <div className="container mx-auto px-4 relative">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text */}
          <div className="animate-fade-in">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
              Безопасные сделки в Telegram с оплатой после приемки
            </h1>
            <p className="text-base md:text-lg text-gray-300 mb-2 leading-relaxed">
              Договоритесь о правилах, зафиксируйте сумму и завершите сделку после проверки результата.
              Сервис не может перевести сумму в одиночку.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              Подходит для фриланса, цифровых товаров и сделок из чатов.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <Button size="lg" asChild>
                <a
                  href={getBotLink('hero_primary')}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackLead({ content_name: 'deal_guard_hero', content_category: 'telegram_bot' })}
                >
                  {CTA_TEXT}
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
                Как это работает
              </Button>
            </div>

            <p className="text-xs text-muted mb-6">{CTA_SUBTEXT}</p>

            {/* Mini bullets */}
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start sm:flex-wrap sm:gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1">
                <span className="text-primary">{Icons.check}</span>
                Оплата после приемки
              </span>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1">
                  <span className="text-primary">{Icons.clock}</span>
                  Дедлайны и возврат
                </span>
                <span className="flex items-center gap-1">
                  <span className="text-primary">{Icons.scales}</span>
                  Споры и арбитраж
                </span>
              </div>
            </div>
          </div>

          {/* Right: Visual (2-of-3 scheme) */}
          <div className="flex flex-col items-center">
            <div className="relative w-72 h-72 md:w-80 md:h-80">
              {/* Center circle - Service */}
              <div className="absolute top-[57.5%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-lg shadow-primary/30">
                <div className="text-center">
                  <div className="text-white font-bold text-base md:text-lg">2 из 3</div>
                  <div className="text-white/70 text-xs">подписи</div>
                </div>
              </div>

              {/* Top circle - Buyer */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-14 md:w-16 md:h-16 rounded-full bg-dark-light border-2 border-secondary flex items-center justify-center">
                <span className="text-secondary text-xl md:text-2xl">🛒</span>
              </div>
              <div className="absolute top-16 md:top-20 left-1/2 -translate-x-1/2 text-center">
                <div className="text-white text-xs md:text-sm font-medium">Покупатель</div>
              </div>

              {/* Bottom left - Seller */}
              <div className="absolute bottom-6 md:bottom-8 left-6 md:left-8 w-14 h-14 md:w-16 md:h-16 rounded-full bg-dark-light border-2 border-green-500 flex items-center justify-center">
                <span className="text-green-400 text-xl md:text-2xl">💼</span>
              </div>
              <div className="absolute bottom-0 left-2 md:left-4 text-center">
                <div className="text-white text-xs md:text-sm font-medium">Продавец</div>
              </div>

              {/* Bottom right - Service */}
              <div className="absolute bottom-6 md:bottom-8 right-6 md:right-8 w-14 h-14 md:w-16 md:h-16 rounded-full bg-dark-light border-2 border-primary flex items-center justify-center">
                <span className="text-primary text-xl md:text-2xl">{Icons.shield}</span>
              </div>
              <div className="absolute bottom-0 right-2 md:right-4 text-center">
                <div className="text-white text-xs md:text-sm font-medium">Сервис</div>
              </div>

              {/* Connecting lines */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 320 320">
                <line x1="160" y1="80" x2="80" y2="232" stroke="currentColor" strokeWidth="1" className="text-border" strokeDasharray="4 4" />
                <line x1="160" y1="80" x2="240" y2="232" stroke="currentColor" strokeWidth="1" className="text-border" strokeDasharray="4 4" />
                <line x1="80" y1="232" x2="240" y2="232" stroke="currentColor" strokeWidth="1" className="text-border" strokeDasharray="4 4" />
              </svg>
            </div>

            {/* Explanations under scheme - now in normal flow */}
            <div className="text-center space-y-1 mt-2 pb-2">
              <div className="text-xs text-gray-400">Выплата = подтверждение сервиса + получателя</div>
              <div className="text-xs text-gray-500">Один сервис не может перевести сумму</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ========== Trust Bar ==========
function TrustBar() {
  const items = [
    { icon: Icons.shield, text: '2 из 3 подтверждения для выплаты' },
    { icon: Icons.bolt, text: 'Автоматические уведомления о статусе' },
    { icon: Icons.check, text: 'Сделка без регистрации и лишних данных' },
  ]

  return (
    <section className="py-8 md:mt-0 bg-dark-light/50 border-y border-border">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-3 gap-6">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-3 justify-center">
              <div className="text-primary">{item.icon}</div>
              <span className="text-gray-300 text-sm">{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ========== Use Cases Section ==========
function UseCasesSection() {
  const cases = [
    {
      icon: Icons.briefcase,
      title: 'Фриланс-услуги',
      description: 'Оплата после приемки результата. Условия фиксируются заранее, дедлайн контролируется автоматически.',
    },
    {
      icon: Icons.document,
      title: 'Цифровые товары',
      description: 'Аккаунты, доступы, лицензии, домены. Сумма удерживается до подтверждения получения.',
    },
    {
      icon: Icons.chat,
      title: 'Сделки из чатов и форумов',
      description: 'Когда контрагент найден в переписке, но доверия нет. Сервис помогает оформить правила и завершить обмен.',
    },
    {
      icon: Icons.users,
      title: 'Разовые сделки между людьми',
      description: 'Подходит для любой разовой сделки, где важны дедлайн, подтверждение результата и возможность спора.',
    },
  ]

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          Для каких сделок подходит сервис
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {cases.map((item, i) => (
            <div
              key={i}
              className="bg-dark-light rounded-xl p-6 border border-border hover:border-primary/50 transition-all duration-300 hover:-translate-y-1"
            >
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center text-primary mb-4">
                {item.icon}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-muted text-sm">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ========== How It Works Section ==========
function HowItWorksSection() {
  const steps = [
    'Создаете сделку в боте и выбираете роль',
    'Указываете контрагента и описание сделки',
    'Настраиваете сумму, срок и комиссию',
    'Фиксируете сумму и получаете подтверждение',
    'Завершаете сделку после проверки результата',
    'Выплата или возврат выполняются по правилам сделки',
  ]

  return (
    <section id="how-it-works" className="py-20 bg-dark-light/50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          Как проходит сделка
        </h2>
        <div className="grid lg:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
          {/* Steps */}
          <div className="space-y-4">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-4 items-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm">
                  {i + 1}
                </div>
                <p className="text-gray-300 pt-1">{step}</p>
              </div>
            ))}
          </div>

          {/* Visual - Bot mockup */}
          <div className="block">
            <div className="bg-dark rounded-xl p-6 md:p-8 border border-border">
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-dark-light rounded-lg">
                  <img src="/logo.png" alt="KeyShield" className="w-10 h-10" />
                  <div>
                    <div className="text-white font-medium">KeyShield Bot</div>
                    <div className="text-xs text-muted">Telegram</div>
                  </div>
                </div>
                <div className="p-4 bg-primary/10 rounded-lg border border-primary/30">
                  <div className="text-sm text-gray-300">
                    Сделка <span className="text-primary font-mono">DL-123456</span> создана
                  </div>
                  <div className="text-xs text-muted mt-1">Ожидание фиксации суммы...</div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 p-2 bg-primary/20 rounded text-center text-xs text-primary">Сумма</div>
                  <div className="flex-1 p-2 bg-dark-light rounded text-center text-xs text-muted">В работе</div>
                  <div className="flex-1 p-2 bg-dark-light rounded text-center text-xs text-muted">Готово</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ========== Comparison Section ==========
function ComparisonSection() {
  const rows = [
    {
      criterion: 'Доступ к сумме',
      service: 'Сервис не может действовать один',
      manual: 'Один человек контролирует перевод',
    },
    {
      criterion: 'Подтверждения',
      service: '2 из 3, нужен участник сделки',
      manual: 'Часто достаточно решения администратора',
    },
    {
      criterion: 'Выплата',
      service: 'Требует подтверждения получателя',
      manual: 'Зависит от решения гаранта',
    },
    {
      criterion: 'Дедлайны',
      service: 'Автоматический контроль и напоминания',
      manual: 'Нужно писать и ждать ответа',
    },
    {
      criterion: 'Споры',
      service: 'Встроенный спор с доказательствами',
      manual: 'Решение зависит от человека',
    },
    {
      criterion: 'Скорость',
      service: 'Автоматические статусы 24/7',
      manual: 'Зависит от времени и нагрузки',
    },
  ]

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          Чем это отличается от ручного гаранта
        </h2>

        {/* Desktop: Table */}
        <div className="hidden md:block max-w-4xl mx-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-4 px-4 text-muted font-medium">Критерий</th>
                <th className="text-left py-4 px-4 text-primary font-medium">Сервис с резервом</th>
                <th className="text-left py-4 px-4 text-gray-500 font-medium">Ручной гарант</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-dark-light/50 transition-colors">
                  <td className="py-4 px-4 text-white font-medium">{row.criterion}</td>
                  <td className="py-4 px-4 text-gray-300">{row.service}</td>
                  <td className="py-4 px-4 text-gray-500">{row.manual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: Cards */}
        <div className="md:hidden space-y-4 max-w-lg mx-auto">
          {rows.map((row, i) => (
            <div key={i} className="bg-dark-light rounded-xl p-4 border border-border">
              <h3 className="text-white font-semibold mb-3">{row.criterion}</h3>
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-primary font-medium mb-1">Сервис с резервом</div>
                  <div className="text-sm text-gray-300">{row.service}</div>
                </div>
                <div className="border-t border-border/50 pt-3">
                  <div className="text-xs text-gray-500 font-medium mb-1">Ручной гарант</div>
                  <div className="text-sm text-gray-500">{row.manual}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ========== Deadline Protection Section ==========
function DeadlineSection() {
  return (
    <section className="py-20 bg-dark-light/50">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto rounded-2xl overflow-hidden border border-primary/30 bg-dark-light">
          <div className="bg-gradient-to-r from-primary/20 to-secondary/20 p-8 md:p-12">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-primary/30 flex items-center justify-center text-primary flex-shrink-0">
                  {Icons.clock}
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-white">
                  Дедлайн и защита от затягивания
                </h2>
              </div>
              <p className="text-gray-300">
                Вы задаете срок выполнения. Сервис напоминает о приближении дедлайна и фиксирует просрочку.
                После льготного периода сумма возвращается по правилам сделки.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              {[
                'Срок 12 / 24 / 48 / 72 часа',
                'Напоминания по ходу сделки',
                'Льготный период после дедлайна',
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-gray-300">
                  <span className="text-secondary">{Icons.check}</span>
                  <span className="text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ========== Pricing Section ==========
function PricingSection() {
  return (
    <section id="pricing" className="py-20">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          Комиссия сервиса
        </h2>
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Fixed */}
          <div className="bg-dark-light rounded-xl p-8 border border-border">
            <h3 className="text-lg font-semibold text-white mb-4">Фиксированная комиссия</h3>
            <div className="text-4xl font-bold text-primary mb-2">{COMMISSION_TIER_1_FIXED}</div>
            <p className="text-muted mb-4">для сделок от {MIN_DEAL_AMOUNT} до {COMMISSION_TIER_1_MAX - 1}</p>
            <p className="text-xs text-gray-500">В валюте сделки</p>
          </div>

          {/* Percent */}
          <div className="bg-dark-light rounded-xl p-8 border-2 border-primary relative">
            <h3 className="text-lg font-semibold text-white mb-4">Процентная комиссия</h3>
            <div className="text-4xl font-bold text-primary mb-2">{(COMMISSION_TIER_2_RATE * 100).toFixed(1)}%</div>
            <p className="text-muted mb-4">для сделок от {COMMISSION_TIER_1_MAX}</p>
            <p className="text-xs text-gray-500">В валюте сделки</p>
          </div>
        </div>

        {/* Details */}
        <div className="max-w-3xl mx-auto mt-6 space-y-3">
          <div className="bg-dark rounded-lg p-4 border border-border">
            <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <span className="text-primary">{Icons.check}</span>
                Минимальная сумма сделки: {MIN_DEAL_AMOUNT}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-primary">{Icons.check}</span>
                Комиссию можно разделить 50/50
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-gray-500">
            Комиссия списывается по правилам сделки. Все суммы указаны в валюте сделки.
          </p>
        </div>
      </div>
    </section>
  )
}

// ========== FAQ Section ==========
function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const handleFaqToggle = (index: number, question: string) => {
    const isOpening = openIndex !== index
    setOpenIndex(isOpening ? index : null)
    if (isOpening) {
      trackViewContent({ content_name: 'faq_expand', content_category: question })
    }
  }

  const faqs = [
    {
      q: 'Нужна ли регистрация?',
      a: 'Нет. Сделка создается в Telegram-боте, без анкеты и лишних данных.',
    },
    {
      q: 'Можно ли оформить спор?',
      a: 'Да. В споре можно прикрепить материалы и пояснения. Решение принимается по правилам сделки и доказательствам.',
    },
    {
      q: 'Кто рассматривает спор и сколько это занимает?',
      a: 'Арбитраж рассматривает материалы обеих сторон. Обычно решение занимает до 24 часов, в сложных случаях — до 72 часов.',
    },
    {
      q: 'Что происходит при просрочке?',
      a: 'Сервис фиксирует дедлайн и применяет правила возврата после льготного периода.',
    },
    {
      q: 'Что нужно, чтобы закрыть сделку?',
      a: 'Подтверждение приемки результата от покупателя и действие получателя в боте для завершения выплаты.',
    },
    {
      q: 'Можно ли изменить условия после старта?',
      a: 'Условия фиксируются при создании сделки. Если нужно изменить правила, проще создать новую сделку.',
    },
    {
      q: 'Подходит ли сервис для любых товаров и услуг?',
      a: 'Для большинства цифровых товаров и услуг — да. Для запрещенного контента и незаконных сделок сервис не предназначен.',
    },
    {
      q: 'Это биржа или инвестиционный продукт?',
      a: 'Нет. Сервис помогает обеспечить исполнение договоренностей между пользователями.',
    },
  ]

  return (
    <section id="faq" className="py-20 bg-dark-light/50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          Частые вопросы
        </h2>
        <div className="max-w-3xl mx-auto space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-dark rounded-lg border border-border overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-4 text-left hover:bg-dark-light/50 transition-colors"
                onClick={() => handleFaqToggle(i, faq.q)}
              >
                <span className="text-white font-medium">{faq.q}</span>
                <span className={`text-muted transition-transform duration-200 ${openIndex === i ? 'rotate-180' : ''}`}>
                  {Icons.chevronDown}
                </span>
              </button>
              <div
                className={`grid transition-all duration-200 ease-out ${
                  openIndex === i ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="px-4 pt-1 pb-4 text-gray-400">
                    {faq.a}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ========== Final CTA Section ==========
function FinalCTASection() {
  return (
    <section className="py-20 bg-gradient-to-r from-primary to-primary-dark">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Готовы провести сделку безопасно?
        </h2>
        <p className="text-white/80 text-lg mb-8">
          Откройте бота и создайте сделку за 2 минуты.
        </p>
        <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-gray-100" asChild>
          <a
            href={getBotLink('final_cta')}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackLead({ content_name: 'deal_guard_final', content_category: 'telegram_bot' })}
          >
            {CTA_TEXT}
          </a>
        </Button>
      </div>
    </section>
  )
}

// ========== Footer ==========
function Footer() {
  return (
    <footer className="py-8 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8 bg-dark border-t border-border">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6 text-sm text-muted">
            <Link to="/terms" className="hover:text-white transition-colors">Документы</Link>
            <Link to="/blog" className="hover:text-white transition-colors">Блог</Link>
          </div>
          <p className="text-xs text-gray-600 text-center md:text-right max-w-md">
            Сервис не является биржей и не предлагает инвестиционные продукты.
            Используется для обеспечения исполнения сделок между пользователями.
          </p>
        </div>
      </div>
    </footer>
  )
}

// ========== Main Component ==========
export function DealGuardPage() {
  return (
    <>
      <SEO
        title="Безопасные сделки в Telegram с оплатой после приемки | KeyShield"
        description="Договоритесь о правилах, зафиксируйте сумму и завершите сделку после проверки результата. Сервис не может перевести сумму в одиночку. 2 из 3 подтверждения для выплаты."
        url="/deal-guard"
        noindex={false}
      />
      <div className="min-h-screen bg-dark">
        <Header />
        <main>
          <HeroSection />
          <TrustBar />
          <UseCasesSection />
          <HowItWorksSection />
          <ComparisonSection />
          <DeadlineSection />
          <PricingSection />
          <FAQSection />
          <FinalCTASection />
        </main>
        <Footer />
        <StickyCTA />
      </div>
    </>
  )
}
