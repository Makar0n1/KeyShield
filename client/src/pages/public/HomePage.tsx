import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { SEO, generateOrganizationSchema } from '@/components/SEO'
import { blogService } from '@/services/blog'
import type { BlogPost } from '@/types'
import { formatDateShort } from '@/utils/format'

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
            Безопасный криптовалютный эскроу на TRON
          </h1>
          <p className="text-lg md:text-xl text-gray-300 mb-8 leading-relaxed">
            Ваши средства под защитой технологии Multisig. Операции подтверждаются
            только участниками сделки — без стороннего доступа.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <a href="https://t.me/keyshield_bot" target="_blank" rel="noopener noreferrer">
                Начать работу
              </a>
            </Button>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => {
                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              Как это работает
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-8 mt-16">
            {[
              { value: '2/3', label: 'Подписей для транзакции' },
              { value: '5%', label: 'Минимальная комиссия' },
              { value: '24/7', label: 'Автоматическая работа' },
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

// ========== Features Section ==========
const features = [
  {
    icon: '&#x1F512;',
    title: 'Multisig защита',
    description: 'Для каждой сделки создается уникальный кошелек с 3 ключами. Для перемещения средств нужны 2 из 3 подписей.',
  },
  {
    icon: '&#x26A1;',
    title: 'Автоматизация',
    description: 'Автоматическое обнаружение депозитов и выплат. Никаких ручных операций.',
  },
  {
    icon: '&#x1F3AF;',
    title: 'Прозрачность',
    description: 'Все транзакции видны в блокчейне TRON. Полная прозрачность операций.',
  },
  {
    icon: '&#x1F6E1;',
    title: 'Арбитраж',
    description: 'В случае спора независимый арбитр принимает решение на основе предоставленных доказательств.',
  },
  {
    icon: '&#x1F4B8;',
    title: 'Низкие комиссии',
    description: 'Всего 5% от суммы сделки (минимум 15 USDT). Без скрытых платежей.',
  },
  {
    icon: '&#x1F680;',
    title: 'Быстрый запуск',
    description: 'Создайте сделку за 2 минуты через Telegram бота. Без регистрации и KYC.',
  },
]

function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-dark-light/50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-white text-center mb-12">
          Почему KeyShield?
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
    description: 'Покупатель или продавец создает сделку через Telegram бота, указывая условия, сумму и срок.',
  },
  {
    number: 2,
    title: 'Multisig кошелек',
    description: 'Автоматически создается защищенный multisig-кошелек с тремя ключами: покупатель, продавец, арбитр.',
  },
  {
    number: 3,
    title: 'Депозит',
    description: 'Покупатель переводит USDT на multisig-адрес. Средства замораживаются в блокчейне.',
  },
  {
    number: 4,
    title: 'Выполнение работы',
    description: 'Продавец выполняет работу в согласованный срок.',
  },
  {
    number: 5,
    title: 'Завершение',
    description: 'Покупатель принимает работу — автоматическая выплата продавцу. При споре — решение арбитра.',
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
          <h3 className="text-xl font-semibold text-yellow-400 mb-2">
            &#x23F0; Важно: Срок выполнения
          </h3>
          <p className="text-gray-300">
            Если срок сделки истёк и в течение <strong>12 часов</strong> не будет
            подтверждения или спора — средства автоматически возвращаются покупателю.
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
            <div className="text-5xl font-bold text-primary mb-2">5%</div>
            <p className="text-muted mb-6">от суммы сделки</p>
            <ul className="space-y-3">
              {['Для сделок от 300 USDT', 'Автоматические выплаты', 'Арбитраж при спорах', 'Техподдержка 24/7'].map((item) => (
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
            <div className="text-5xl font-bold text-primary mb-2">15 USDT</div>
            <p className="text-muted mb-6">для сделок до 300 USDT</p>
            <ul className="space-y-3">
              {['Минимальная сумма: 50 USDT', 'Все функции включены', 'Операционные расходы ~8 USDT', 'Чистая прибыль сервиса ~7 USDT'].map((item) => (
                <li key={item} className="flex items-center gap-2 text-gray-300">
                  <span className="text-secondary">&#x2713;</span> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="max-w-2xl mx-auto mt-8 text-center text-muted text-sm">
          <p>
            <strong className="text-white">Кто платит комиссию?</strong> При создании сделки стороны
            договариваются: покупатель платит всю комиссию, продавец платит всю комиссию, или 50/50.
          </p>
          <p className="mt-2">
            <strong className="text-white">Без скрытых платежей.</strong> Комиссия включает все операционные расходы.
          </p>
        </div>
      </div>
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
          <a href="https://t.me/keyshield_bot" target="_blank" rel="noopener noreferrer">
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
    <section className="py-20">
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
                  <div
                    className="h-40 bg-cover bg-center"
                    style={{ backgroundImage: `url(${post.coverImage})` }}
                  />
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
  // Schema for home page - Organization + WebSite + Service
  const schemas = [
    generateOrganizationSchema(),
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'KeyShield',
      url: import.meta.env.VITE_WEB_DOMAIN || 'https://keyshield.io',
      description: 'Безопасный escrow-сервис для криптовалютных сделок на блокчейне TRON',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${import.meta.env.VITE_WEB_DOMAIN || 'https://keyshield.io'}/blog?search={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'KeyShield Escrow',
      serviceType: 'Cryptocurrency Escrow Service',
      description: 'Безопасный escrow-сервис для криптовалютных сделок с использованием технологии multisig на блокчейне TRON.',
      provider: {
        '@type': 'Organization',
        name: 'KeyShield',
      },
      areaServed: 'Worldwide',
      offers: {
        '@type': 'Offer',
        description: 'Escrow услуги для криптовалютных сделок',
        price: '15',
        priceCurrency: 'USD',
        priceSpecification: {
          '@type': 'PriceSpecification',
          price: '5',
          priceCurrency: 'USD',
          unitText: 'процент от суммы сделки',
        },
      },
    },
  ]

  return (
    <>
      <SEO
        title="Безопасный Escrow для криптосделок"
        description="KeyShield — надёжный escrow-сервис для безопасных сделок с криптовалютой. Мультисиг-кошельки на TRON, автоматический контроль депозитов, справедливый арбитраж."
        url="/"
        schema={schemas}
      />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingSection />
      <CTASection />
      <BlogSection />
    </>
  )
}
