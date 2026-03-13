import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { LangLink as Link } from '@/components/ui/LangLink'
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLang } from '@/hooks/useLang'
import { blogService } from '@/services/blog'
import { BlogSidebar, PostCard } from '@/components/blog'
import { SEO } from '@/components/SEO'
import { Pagination } from '@/components/ui/pagination'
import { PageLoading } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import type { BlogPost, BlogCategory, BlogSidebarData } from '@/types'

// Collapsible description with text fade (using CSS mask)
function CollapsibleDescription({ description }: { description: string }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [measured, setMeasured] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  const collapsedHeight = 100

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight)
      setMeasured(true)
    }
  }, [description])

  const needsCollapse = measured && contentHeight > collapsedHeight + 20
  const showFull = measured && !needsCollapse
  const shouldFade = !showFull && !expanded

  return (
    <div className="max-w-3xl">
      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-500 ease-in-out"
        style={{
          maxHeight: showFull ? 'none' : expanded ? contentHeight : collapsedHeight,
          maskImage: shouldFade
            ? 'linear-gradient(to bottom, black 0%, black 50%, transparent 100%)'
            : 'none',
          WebkitMaskImage: shouldFade
            ? 'linear-gradient(to bottom, black 0%, black 50%, transparent 100%)'
            : 'none',
        }}
      >
        <div
          className="text-gray-300 prose prose-invert prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: description }}
        />
      </div>

      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors text-sm font-medium"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              {t('blog.category.collapse')}
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              {t('blog.category.read_more')}
            </>
          )}
        </button>
      )}
    </div>
  )
}

function HeroSection({ category, postsCount }: { category: BlogCategory; postsCount: number }) {
  const { t } = useTranslation()
  const [bgLoaded, setBgLoaded] = useState(!category.coverImage)

  useEffect(() => {
    if (!category.coverImage) return
    const img = new Image()
    img.onload = () => setBgLoaded(true)
    img.src = category.coverImage
  }, [category.coverImage])

  return (
    <section className="relative py-16 overflow-hidden" style={{ minHeight: '200px' }}>
      <div className={`absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/10 transition-opacity duration-500 ${bgLoaded ? 'opacity-100' : 'opacity-100'}`} />

      {category.coverImage && (
        <div
          className={`absolute inset-0 transition-opacity duration-500 ${bgLoaded ? 'opacity-100' : 'opacity-0'}`}
          style={{
            backgroundImage: `linear-gradient(to bottom, rgba(10,10,15,0.8), rgba(10,10,15,0.95)), url(${category.coverImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}

      <div className="container mx-auto px-4 relative z-10">
        <h1 className="text-4xl font-bold text-white mb-4">{category.name}</h1>
        {category.description && (
          <CollapsibleDescription description={category.description} />
        )}
        <p className="text-muted mt-4">
          {t('blog.category.posts_count', { count: category.postsCount || postsCount })}
        </p>
      </div>
    </section>
  )
}

export function CategoryPage() {
  const { t } = useTranslation()
  const { slug } = useParams<{ slug: string }>()
  const lang = useLang()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get('page') || '1')

  const [category, setCategory] = useState<BlogCategory | null>(null)
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
        const [categoryData, postsData, sidebarData] = await Promise.all([
          blogService.getCategory(slug),
          blogService.getPosts({ page, limit: 9, category: slug }),
          blogService.getSidebar(),
        ])
        setCategory(categoryData)
        setPosts(postsData.posts || [])
        setTotalPages(postsData.totalPages || 1)
        setSidebar(sidebarData)
      } catch {
        setError(t('blog.category.not_found'))
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [slug, page, t])

  // Redirect to correct language if category language doesn't match URL lang
  useEffect(() => {
    if (category && category.language && category.language !== lang) {
      navigate(`/${category.language}/category/${category.slug}`, { replace: true })
    }
  }, [category, lang, navigate])

  const handlePageChange = (newPage: number) => {
    setSearchParams({ page: String(newPage) })
  }

  if (loading) {
    return <PageLoading />
  }

  if (error || !category) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">📁</div>
        <h1 className="text-2xl text-white mb-4">{error || t('blog.category.not_found')}</h1>
        <Button asChild>
          <Link to="/blog">{t('blog.category.back_to_blog')}</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <SEO
        title={t('blog.category.seo_title', { name: category.name })}
        description={category.description || t('blog.category.seo_description', { name: category.name })}
        url={`/category/${category.slug}`}
      />

      {/* Breadcrumbs */}
      <div className="bg-dark-light border-b border-border">
        <div className="container mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-sm text-muted">
            <Link to="/" className="hover:text-white">{t('blog.list.breadcrumb_home')}</Link>
            <ChevronRight className="w-4 h-4" />
            <Link to="/blog" className="hover:text-white">{t('blog.list.breadcrumb_blog')}</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">{category.name}</span>
          </nav>
        </div>
      </div>

      <HeroSection category={category} postsCount={posts.length} />

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
                <h2 className="text-xl text-white mb-2">{t('blog.category.empty_title')}</h2>
                <p className="text-muted mb-6">{t('blog.category.empty_subtitle')}</p>
                <Button asChild>
                  <Link to="/blog">{t('blog.category.all_articles')}</Link>
                </Button>
              </div>
            )}
          </div>

          <BlogSidebar
            categories={sidebar.categories}
            tags={sidebar.tags}
            recentPosts={sidebar.recentPosts}
            currentCategorySlug={slug}
          />
        </div>
      </div>

      {(category.seoTitle || category.seoDescription) && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: category.seoTitle || category.name,
              description: category.seoDescription || category.description,
              url: window.location.href,
            }),
          }}
        />
      )}
    </>
  )
}
