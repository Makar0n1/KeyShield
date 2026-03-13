import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { LangLink as Link } from '@/components/ui/LangLink'
import { ChevronRight, Tag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { blogService } from '@/services/blog'
import { BlogSidebar, PostCard } from '@/components/blog'
import { SEO } from '@/components/SEO'
import { Pagination } from '@/components/ui/pagination'
import { PageLoading } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import type { BlogPost, BlogTag, BlogSidebarData } from '@/types'

export function TagPage() {
  const { t } = useTranslation()
  const { slug } = useParams<{ slug: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get('page') || '1')

  const [tag, setTag] = useState<BlogTag | null>(null)
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [sidebar, setSidebar] = useState<BlogSidebarData>({
    categories: [],
    tags: [],
    recentPosts: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return
      setLoading(true)
      setError('')

      try {
        const [tagData, postsData, sidebarData] = await Promise.all([
          blogService.getTag(slug),
          blogService.getPosts({ page, limit: 9, tag: slug }),
          blogService.getSidebar(),
        ])
        setTag(tagData)
        setPosts(postsData.posts || [])
        setTotalPages(postsData.totalPages || 1)
        setSidebar(sidebarData)
      } catch {
        setError(t('blog.tag.not_found'))
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [slug, page, t])

  const handlePageChange = (newPage: number) => {
    setSearchParams({ page: String(newPage) })
  }

  if (loading) {
    return <PageLoading />
  }

  if (error || !tag) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">🏷️</div>
        <h1 className="text-2xl text-white mb-4">{error || t('blog.tag.not_found')}</h1>
        <Button asChild>
          <Link to="/blog">{t('blog.tag.back_to_blog')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <SEO
        title={t('blog.tag.seo_title', { name: tag.name })}
        description={t('blog.tag.seo_description', { name: tag.name })}
        url={`/tag/${tag.slug}`}
      />

      {/* Breadcrumbs */}
      <div className="bg-dark-light border-b border-border">
        <div className="container mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-sm text-muted">
            <Link to="/" className="hover:text-white">{t('blog.list.breadcrumb_home')}</Link>
            <ChevronRight className="w-4 h-4" />
            <Link to="/blog" className="hover:text-white">{t('blog.list.breadcrumb_blog')}</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">#{tag.name}</span>
          </nav>
        </div>
      </div>

      {/* Hero */}
      <section className="py-16 bg-gradient-to-br from-primary/20 via-transparent to-secondary/10">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Tag className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-4xl font-bold text-white">#{tag.name}</h1>
          </div>
          {tag.description && (
            <p className="text-gray-300 max-w-2xl">{tag.description}</p>
          )}
          <p className="text-muted mt-4">
            {t('blog.tag.posts_count', { count: tag.postsCount || posts.length })}
          </p>
        </div>
      </section>

      {/* Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          <div>
            {posts.length > 0 ? (
              <>
                <div className="grid md:grid-cols-2 gap-6">
                  {posts.map((post) => (
                    <PostCard key={post._id} post={post} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                    className="mt-12"
                  />
                )}
              </>
            ) : (
              <div className="text-center py-16">
                <div className="text-6xl mb-4">📭</div>
                <h2 className="text-xl text-white mb-2">{t('blog.tag.empty_title')}</h2>
                <p className="text-muted mb-6">{t('blog.tag.empty_subtitle')}</p>
                <Button asChild>
                  <Link to="/blog">{t('blog.tag.all_articles')}</Link>
                </Button>
              </div>
            )}
          </div>

          <BlogSidebar
            categories={sidebar.categories}
            tags={sidebar.tags}
            recentPosts={sidebar.recentPosts}
            currentTagSlug={slug}
          />
        </div>
      </div>

      {(tag.seoTitle || tag.seoDescription) && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: tag.seoTitle || `#${tag.name}`,
              description: tag.seoDescription || tag.description,
              url: window.location.href,
            }),
          }}
        />
      )}
    </>
  )
}
