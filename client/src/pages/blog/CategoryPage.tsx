import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { blogService } from '@/services/blog'
import { BlogSidebar, PostCard } from '@/components/blog'
import { SEO } from '@/components/SEO'
import { Pagination } from '@/components/ui/pagination'
import { PageLoading } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import type { BlogPost, BlogCategory, BlogSidebarData } from '@/types'

// Collapsible description with text fade (using CSS mask)
function CollapsibleDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false)
  const [measured, setMeasured] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)
  const collapsedHeight = 100 // px - visible height when collapsed

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight)
      setMeasured(true)
    }
  }, [description])

  // Check if content needs collapse (is taller than collapsed height)
  // Only meaningful after measurement
  const needsCollapse = measured && contentHeight > collapsedHeight + 20

  // If short content and measured, show full height; otherwise stay collapsed
  const showFull = measured && !needsCollapse

  // Apply fade mask when collapsed
  const shouldFade = !showFull && !expanded

  return (
    <div className="max-w-3xl">
      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-500 ease-in-out"
        style={{
          maxHeight: showFull ? 'none' : expanded ? contentHeight : collapsedHeight,
          // CSS mask to fade text to transparent at bottom
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

      {/* Toggle button - only show after measurement confirms it's needed */}
      {needsCollapse && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors text-sm font-medium"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-4 h-4" />
              Свернуть
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" />
              Читать полностью
            </>
          )}
        </button>
      )}
    </div>
  )
}

// Hero section with preloaded background image
function HeroSection({ category, postsCount }: { category: BlogCategory; postsCount: number }) {
  const [bgLoaded, setBgLoaded] = useState(!category.coverImage) // true if no image

  // Preload background image
  useEffect(() => {
    if (!category.coverImage) return

    const img = new Image()
    img.onload = () => setBgLoaded(true)
    img.src = category.coverImage
  }, [category.coverImage])

  return (
    <section
      className="relative py-16 overflow-hidden"
      style={{ minHeight: '200px' }}
    >
      {/* Background layer - always render gradient, conditionally add image */}
      <div
        className={`absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-secondary/10 transition-opacity duration-500 ${bgLoaded ? 'opacity-100' : 'opacity-100'}`}
      />

      {/* Background image layer with fade-in */}
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

      {/* Content */}
      <div className="container mx-auto px-4 relative z-10">
        <h1 className="text-4xl font-bold text-white mb-4">{category.name}</h1>
        {category.description && (
          <CollapsibleDescription description={category.description} />
        )}
        <p className="text-muted mt-4">
          {category.postsCount || postsCount} статей в категории
        </p>
      </div>
    </section>
  )
}

export function CategoryPage() {
  const { slug } = useParams<{ slug: string }>()
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
        setError('Категория не найдена')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [slug, page])

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
        <h1 className="text-2xl text-white mb-4">{error || 'Категория не найдена'}</h1>
        <Button asChild>
          <Link to="/blog">Вернуться к блогу</Link>
        </Button>
      </div>
    )
  }

  return (
    <>
      <SEO
        title={`${category.name} — статьи`}
        description={category.description || `Статьи в категории ${category.name}`}
        url={`/category/${category.slug}`}
      />

      {/* Breadcrumbs */}
      <div className="bg-dark-light border-b border-border">
        <div className="container mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-sm text-muted">
            <Link to="/" className="hover:text-white">
              Главная
            </Link>
            <ChevronRight className="w-4 h-4" />
            <Link to="/blog" className="hover:text-white">
              Блог
            </Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white">{category.name}</span>
          </nav>
        </div>
      </div>

      {/* Hero */}
      <HeroSection category={category} postsCount={posts.length} />

      {/* Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          {/* Main Content */}
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
                <h2 className="text-xl text-white mb-2">В этой категории пока нет статей</h2>
                <p className="text-muted mb-6">Попробуйте посмотреть другие категории</p>
                <Button asChild>
                  <Link to="/blog">Все статьи</Link>
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <BlogSidebar
            categories={sidebar.categories}
            tags={sidebar.tags}
            recentPosts={sidebar.recentPosts}
            currentCategorySlug={slug}
          />
        </div>
      </div>

      {/* SEO */}
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
