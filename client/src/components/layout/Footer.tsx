import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { blogService } from '@/services/blog'
import type { BlogPost } from '@/types'

const footerLinks = {
  documents: [
    { href: '/terms', label: 'Условия использования' },
    { href: '/privacy', label: 'Политика конфиденциальности' },
    { href: '/offer', label: 'Публичная оферта' },
  ],
  support: [
    { href: 'https://t.me/keyshield_support', label: 'Telegram: @keyshield_support', external: true },
    { href: 'mailto:support@keyshield.me', label: 'Email: support@keyshield.me', external: true },
  ],
}

export function Footer() {
  const [recentPosts, setRecentPosts] = useState<BlogPost[]>([])

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const data = await blogService.getPosts({ limit: 4, sort: 'newest' })
        setRecentPosts(data.posts || [])
      } catch {
        // Silently fail
      }
    }
    fetchPosts()
  }, [])

  return (
    <footer className="bg-dark-light border-t border-border py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div>
            <h4 className="text-white font-semibold mb-4">KeyShield</h4>
            <p className="text-muted text-sm">
              Безопасный multisig эскроу на TRON
            </p>
          </div>

          {/* Documents */}
          <div>
            <h4 className="text-white font-semibold mb-4">Документы</h4>
            <ul className="space-y-2">
              {footerLinks.documents.map((link) => (
                <li key={link.href}>
                  <Link to={link.href} className="text-muted hover:text-white text-sm transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-white font-semibold mb-4">Поддержка</h4>
            <ul className="space-y-2">
              {footerLinks.support.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target={link.external ? '_blank' : undefined}
                    rel={link.external ? 'noopener noreferrer' : undefined}
                    className="text-muted hover:text-white text-sm transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Blog - Recent Posts */}
          <div>
            <h4 className="text-white font-semibold mb-4">Блог</h4>
            {recentPosts.length > 0 ? (
              <ul className="space-y-3">
                {recentPosts.map((post) => (
                  <li key={post._id}>
                    <Link
                      to={`/blog/${post.slug}`}
                      className="group flex items-start gap-2.5 text-muted hover:text-white text-sm transition-colors"
                    >
                      {post.coverImage && (
                        <img
                          src={post.coverImage}
                          alt=""
                          className="w-10 h-10 rounded object-cover shrink-0"
                        />
                      )}
                      <span className="line-clamp-2 leading-snug pt-0.5">{post.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Link to="/blog" className="text-muted hover:text-white text-sm transition-colors">
                Все статьи
              </Link>
            )}
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-border text-center">
          <p className="text-muted text-sm">
            &copy; {new Date().getFullYear()} KeyShield. Все права защищены.
          </p>
          <p className="text-muted/70 text-xs mt-2 max-w-2xl mx-auto">
            KeyShield не является финансовой организацией и не предоставляет финансовые услуги.
            Мы предоставляем технологическую платформу для безопасного обмена криптовалютой между сторонами.
          </p>
        </div>
      </div>
    </footer>
  )
}
