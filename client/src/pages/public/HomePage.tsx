import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
            Открыть Telegram бота
          </a>
        </Button>
        <button
          className="text-xs text-muted text-center"
          onClick={() => {
            trackViewContent({ content_name: 'section_scroll', content_category: 'testimonials' })
            document.getElementById('testimonials')?.scrollIntoView({ behavior: 'smooth' })
          }}
        >
          Читать отзывы
        </button>
      </div>
    </div>
  )
}

// ========== Hero Section ==========
function HeroSection() {
  return (
    <section className="relative py-20 md:py-32 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/10" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />

      <div className="container mx-auto px-4 relative">
        <div className="max-w-3xl mx-auto text-center animate-fade-in">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            Безопасная сделка в Telegram с USDT
          </h1>
          <p className="text-lg md:text-xl text-gray-300 mb-8 leading-relaxed">
            Гарант-сервис на блокчейне TRON. Деньги хранятся на мультисиг-кошельке 2-из-3:
            для вывода нужны подписи двух сторон, приватные ключи есть только у участников сделки.
            Ни один админ не может забрать средства в одиночку.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <a
                href="https://t.me/keyshield_bot"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackLead({ content_name: 'hero_cta', content_category: 'telegram_bot' })}
              >
                Начать работу
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

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 mt-16">
            {[
              { value: '2/3', label: 'Подписей для перевода средств' },
              { value: `${COMMISSION_TIER_1_FIXED} USDT`, label: 'Минимальная комиссия за сделку' },
              { value: '24/7', label: 'Работа через Telegram-бота' },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-primary mb-2">
                  {stat.value}
                </div>
                <div className="text-sm text-muted">{stat.label}</div>
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
  return (
    <section className="py-16 bg-dark-light/30">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-8">
            Что такое безопасная сделка
          </h2>
          <div className="space-y-4 text-gray-300 text-lg leading-relaxed">
            <p>
              <strong className="text-white">Безопасная сделка</strong> — это схема, при которой деньги не идут сразу
              от покупателя к исполнителю. Средства временно блокируются у независимого гаранта и переводятся
              только после выполнения оговорённых условий. В онлайне это важно для фриланса, рекламы в Telegram,
              продажи цифровых товаров и любых сделок между незнакомыми людьми.
            </p>
            <p>
              В KeyShield роль гаранта выполняет <strong className="text-white">мультисиг-кошелёк на блокчейне TRON</strong>.
              Деньги лежат не у человека-посредника, а на адресе, где для любого перевода нужны две подписи —
              покупателя и исполнителя. Так безопасная сделка становится прозрачной и защищённой технически,
              а не только «на доверии».
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

// ========== Features Section ==========
const features = [
  {
    icon: '&#x1F512;',
    title: 'Multisig защита',
    description: 'Для каждой сделки создаётся мультисиг-кошелёк 2-из-3. Заказчик и исполнитель получают свои приватные ключи, сервис — третий. Без двух подписей деньги не двигаются: ни одна сторона и ни админ не могут украсть депозит.',
  },
  {
    icon: '&#x26A1;',
    title: 'Автоматизация',
    description: 'Все шаги безопасной сделки проходят через Telegram-бота: создание условий, депонирование USDT, подтверждение работы и вывод средств. Никаких ручных переводов и поиска реквизитов.',
  },
  {
    icon: '&#x1F3AF;',
    title: 'Прозрачность',
    description: 'Все операции по сделке записаны в блокчейне TRON. Вы видите адрес кошелька, сумму депозита и переводы, а не просто доверяете гаранту на слово.',
  },
  {
    icon: '&#x1F6E1;',
    title: 'Арбитраж',
    description: 'Если возникает спор, к сделке подключается независимый арбитр KeyShield как третья подпись. Решение принимается по переписке и доказательствам в чате.',
  },
  {
    icon: '&#x1F4B8;',
    title: 'Низкая комиссия',
    description: `Комиссия от ${COMMISSION_TIER_1_FIXED} USDT за безопасную сделку. Для небольших сумм — фиксированный тариф, для крупных — процент от депозита. Без скрытых платежей.`,
  },
  {
    icon: '&#x1F680;',
    title: 'Быстрый запуск',
    description: 'Без регистрации и KYC. Чтобы провести безопасную сделку, достаточно открыть бота, описать условия и отправить USDT на мультисиг-адрес.',
  },
]

function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-dark-light/50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          Почему KeyShield — безопасный гарант в Telegram
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="bg-dark-light rounded-xl p-6 border border-border hover:border-primary/50 transition-all duration-300 hover:-translate-y-1"
            >
              <div
                className="text-4xl mb-4"
                dangerouslySetInnerHTML={{ __html: feature.icon }}
              />
              <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-muted">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ========== How It Works Section ==========
const steps = [
  {
    number: 1,
    title: 'Создание сделки',
    description: 'Покупатель или продавец запускает Telegram-бота и создаёт безопасную сделку: описывает услугу или товар, сумму в USDT и сроки.',
  },
  {
    number: 2,
    title: 'Получение ключа',
    description: 'Каждый участник получает свой приватный ключ для подписи транзакций. Ключ хранится только у вас; сервис его не видит и не может восстановить. Без приватных ключей деньги не сдвинутся с места.',
  },
  {
    number: 3,
    title: 'Депозит',
    description: 'Покупатель переводит USDT на мультисиг-адрес. Средства блокируются в блокчейне TRON и ждут подписей участников.',
  },
  {
    number: 4,
    title: 'Выполнение работы',
    description: 'Исполнитель выполняет работу или передаёт товар в согласованный срок. Все договорённости фиксируются в чате Telegram.',
  },
  {
    number: 5,
    title: 'Завершение',
    description: 'Если заказчик доволен, стороны подписывают перевод в пользу исполнителя — и USDT уходят на его кошелёк. Если работа сорвана, заказчик подписывает возврат, и депозит возвращается ему.',
  },
]

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          Как это работает
        </h2>
        <div className="max-w-3xl mx-auto space-y-8">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-6 animate-slide-up">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xl">
                {step.number}
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-muted">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Deadline Warning */}
        <div className="max-w-3xl mx-auto mt-12 p-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
          <h3 className="text-xl font-semibold text-yellow-400 mb-3">
            &#x23F0; Важно: Срок выполнения
          </h3>
          <p className="text-gray-300">
            Если срок сделки истёк и в течение <strong>12 часов</strong> не будет
            подтверждения или спора — инициируется возврат средств покупателю.
          </p>
          <p className="text-gray-300 mt-2">
            <strong className="text-yellow-400">Для получения средств потребуется приватный ключ</strong> —
            система запросит его для подписи транзакции возврата.
          </p>
          <p className="text-gray-300 mt-2">
            <strong>Комиссия сервиса удерживается в любом случае</strong> — она идёт
            на поддержку инфраструктуры. Пожалуйста, старайтесь завершать сделки вовремя.
          </p>
        </div>
      </div>
    </section>
  )
}

// ========== Pricing Section ==========
function PricingSection() {
  return (
    <section id="pricing" className="py-20 bg-dark-light/50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          Прозрачное ценообразование
        </h2>
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Standard */}
          <div className="bg-dark rounded-xl p-8 border border-border">
            <h3 className="text-xl font-semibold text-white mb-4">Стандартная комиссия</h3>
            <div className="text-5xl font-bold text-primary mb-2">{(COMMISSION_TIER_2_RATE * 100).toFixed(1)}%</div>
            <p className="text-muted">от суммы безопасной сделки от 150 USDT</p>
            <p className="text-muted">{(COMMISSION_TIER_3_RATE * 100).toFixed(0)}% от 500 USDT</p>
            <p className="text-muted mb-2">{(COMMISSION_TIER_4_RATE * 100).toFixed(1)}% от 1500 USDT</p>
            <ul className="space-y-3">
              {['Автоматические выплаты', 'Арбитраж при спорах', 'Техподдержка 24/7'].map((item) => (
                <li key={item} className="flex items-center gap-2 text-gray-300">
                  <span className="text-secondary">&#x2713;</span> {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Fixed */}
          <div className="bg-dark rounded-xl p-8 border-2 border-primary relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-medium">
              Минимум
            </div>
            <h3 className="text-xl font-semibold text-white mb-4">Фиксированная комиссия</h3>
            <div className="text-5xl font-bold text-primary mb-2">{COMMISSION_TIER_1_FIXED} USDT</div>
            <p className="text-muted mb-6">комиссия за безопасную сделку до {COMMISSION_TIER_1_MAX} USDT</p>
            <ul className="space-y-3">
              {[`Минимальная сумма: ${MIN_DEAL_AMOUNT} USDT`, 'Все функции включены', 'Идеально для небольших сделок'].map((item) => (
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
              <h4 className="text-white font-semibold mb-1">Кто платит комиссию?</h4>
              <p className="text-muted text-sm">
                При создании сделки стороны договариваются: покупатель, продавец или 50/50.
              </p>
            </div>
          </div>
          <div className="bg-dark rounded-xl p-5 border border-border flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">&#x2705;</span>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-1">Без скрытых платежей</h4>
              <p className="text-muted text-sm">
                Комиссия включает все операционные расходы: активация кошелька, транзакции, арбитраж.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ========== FAQ Section ==========
const faqItems = [
  {
    question: 'Что такое безопасная сделка?',
    answer: 'Безопасная сделка — это схема, при которой деньги временно блокируются у независимого посредника и переводятся исполнителю только после выполнения условий. В KeyShield средства хранятся на мультисиг-кошельке в блокчейне TRON, а не на личном кошельке гаранта.',
  },
  {
    question: 'Как работает гарант в Telegram через KeyShield?',
    answer: 'Заказчик и исполнитель создают сделку через Telegram-бота KeyShield, вносят депозит в USDT и получают свои приватные ключи. Деньги блокируются на мультисиг-кошельке. Для перевода средств исполнителю или возврата заказчику нужны подписи двух сторон, поэтому никто не может забрать депозит в одиночку.',
  },
  {
    question: 'Кто имеет доступ к деньгам на сделке?',
    answer: 'Приватные ключи есть только у участников сделки. Сервис KeyShield не хранит приватные ключи и не может вывести средства самостоятельно. Любое движение средств возможно только при наличии двух подписей из трех — заказчика, исполнителя и, при споре, арбитра.',
  },
  {
    question: 'Подходит ли KeyShield для фриланса и цифровых услуг?',
    answer: 'Да, сервис особенно удобен для сделок в Telegram: заказов у фрилансеров, покупки цифровых товаров, рекламы в каналах и любых онлайн-услуг с оплатой в USDT. Условия фиксируются в боте, деньги блокируются на мультисиг-кошельке и переводятся только после выполнения обязательств.',
  },
]

function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section id="faq" className="py-20">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          Частые вопросы о безопасных сделках
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
const testimonials = [
  {
    name: 'Андрей К.',
    role: 'SMM-специалист',
    avatar: '👨‍💻',
    text: 'Работаю с заказчиками из разных стран. Раньше постоянно кидали — то работу не оплатят, то деньги заберут и пропадут. С KeyShield ни одной проблемы. Клиенты тоже спокойны.',
    rating: 5,
  },
  {
    name: 'Мария Л.',
    role: 'Владелец Telegram-канала',
    avatar: '👩‍💼',
    text: 'Продаю рекламу в канале на 50К подписчиков. Рекламодатели часто новые, незнакомые. Гарант через бота — идеальное решение: я уверена в оплате, они уверены в размещении.',
    rating: 5,
  },
  {
    name: 'Дмитрий В.',
    role: 'Веб-разработчик',
    avatar: '🧑‍🔧',
    text: 'Делал сайт за 800 USDT. Заказчик хотел гаранта, я предложил KeyShield. Всё прошло чётко: деньги на мультисиге, сдал работу — получил оплату. Комиссия копеечная.',
    rating: 5,
  },
  {
    name: 'Елена П.',
    role: 'Покупатель цифровых товаров',
    avatar: '👩',
    text: 'Покупала доступы к курсам у незнакомого продавца. Боялась, что кинут. Через KeyShield всё прошло гладко — деньги списались только после того, как получила товар.',
    rating: 5,
  },
  {
    name: 'Артём С.',
    role: 'Арбитражник трафика',
    avatar: '🧔',
    text: 'Покупаю аккаунты и инструменты для работы. Суммы бывают большие, рисковать не хочется. KeyShield выручает — особенно нравится, что ключи только у меня.',
    rating: 4,
  },
  {
    name: 'Ольга Н.',
    role: 'Дизайнер',
    avatar: '👩‍🎨',
    text: 'Первый раз пользовалась гарантом вообще. Думала будет сложно — оказалось проще, чем обычный перевод. Бот сам всё объясняет. Теперь все заказы только так.',
    rating: 5,
  },
]

function TestimonialsSection() {
  const [isPaused, setIsPaused] = useState(false)

  // Duplicate testimonials for seamless infinite scroll
  const duplicatedTestimonials = [...testimonials, ...testimonials]

  return (
    <section id="testimonials" className="py-20 bg-dark-light/30 overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Что говорят пользователи
          </h2>
          <p className="text-muted text-lg max-w-2xl mx-auto">
            Реальные истории людей, которые уже проводят безопасные сделки через KeyShield
          </p>
        </div>

        {/* Carousel container */}
        <div
          className="relative"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Gradient overlays for smooth edges */}
          <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-dark-light/30 to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-dark-light/30 to-transparent z-10 pointer-events-none" />

          {/* Scrolling track */}
          <div
            className={`flex gap-6 ${isPaused ? 'animation-paused' : ''}`}
            style={{
              animation: 'scroll-testimonials 40s linear infinite',
              width: 'fit-content',
            }}
          >
            {duplicatedTestimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-dark rounded-xl p-6 border border-border hover:border-primary/30 transition-all duration-300 flex-shrink-0 w-[340px]"
              >
                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-dark-light flex items-center justify-center text-2xl">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <div className="font-semibold text-white">{testimonial.name}</div>
                    <div className="text-sm text-muted">{testimonial.role}</div>
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

                {/* Text */}
                <p className="text-gray-300 leading-relaxed">"{testimonial.text}"</p>
              </div>
            ))}
          </div>
        </div>

        {/* Trust indicators */}
        <div className="flex flex-wrap justify-center gap-8 mt-12 pt-8 border-t border-border">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">150+</div>
            <div className="text-sm text-muted">успешных сделок</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">70+</div>
            <div className="text-sm text-muted">активных пользователей</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">0</div>
            <div className="text-sm text-muted">случаев мошенничества</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">24/7</div>
            <div className="text-sm text-muted">поддержка и арбитраж</div>
          </div>
        </div>
      </div>

      {/* CSS for carousel animation */}
      <style>{`
        @keyframes scroll-testimonials {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-50%);
          }
        }
        .animation-paused {
          animation-play-state: paused !important;
        }
      `}</style>
    </section>
  )
}

// ========== CTA Section ==========
function CTASection() {
  return (
    <section className="py-20 bg-gradient-to-r from-primary to-primary-dark">
      <div className="container mx-auto px-4 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Готовы начать безопасные сделки?
        </h2>
        <p className="text-white/80 text-lg mb-8">
          Присоединяйтесь к KeyShield и защитите свои криптовалютные транзакции
        </p>
        <Button size="lg" variant="secondary" className="bg-white text-primary hover:bg-gray-100" asChild>
          <a
            href="https://t.me/keyshield_bot"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackLead({ content_name: 'cta_section', content_category: 'telegram_bot' })}
          >
            Открыть Telegram бота
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
          Полезные статьи
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
            <Link to="/blog">Читать больше статей</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}

// ========== Main Page Component ==========
export function HomePage() {
  const webDomain = import.meta.env.VITE_WEB_DOMAIN || 'https://keyshield.me'

  // FAQ Schema
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
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
      description: 'Безопасная сделка в Telegram с USDT. Гарант-сервис на блокчейне TRON с мультисиг-кошельками.',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${webDomain}/blog?search={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'KeyShield — безопасная сделка',
      serviceType: 'Гарант-сервис для криптовалютных сделок',
      description: 'Безопасная сделка в Telegram с USDT. Мультисиг-кошелёк 2-из-3 на TRON: приватные ключи только у участников сделки, сервис не может вывести деньги.',
      provider: {
        '@type': 'Organization',
        name: 'KeyShield',
      },
      areaServed: 'Worldwide',
      offers: {
        '@type': 'Offer',
        description: 'Комиссия за безопасную сделку',
        price: COMMISSION_TIER_1_FIXED.toString(),
        priceCurrency: 'USD',
        priceSpecification: {
          '@type': 'PriceSpecification',
          price: (COMMISSION_TIER_2_RATE * 100).toFixed(1),
          priceCurrency: 'USD',
          unitText: 'процент от суммы сделки',
        },
      },
    },
    faqSchema,
  ]

  return (
    <>
      <SEO
        title="Безопасная сделка в Telegram с USDT | Гарант-сервис на TRON"
        description="KeyShield — безопасная сделка в Telegram с USDT. Мультисиг-кошелёк 2-из-3 на TRON: приватные ключи только у участников сделки, сервис не может вывести деньги."
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
