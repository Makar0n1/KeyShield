import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LangLink as Link } from '@/components/ui/LangLink'
import { ArrowUpDown, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { blogService } from '@/services/blog'
import { BlogSidebar, PostCard } from '@/components/blog'
import { SEO } from '@/components/SEO'
import { Pagination } from '@/components/ui/pagination'
import { PageLoading } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import type { BlogPost, BlogSidebarData } from '@/types'

type SortType = 'newest' | 'popular' | 'oldest'

export function BlogListPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parseInt(searchParams.get('page') || '1')
  const sort = (searchParams.get('sort') as SortType) || 'newest'
  const query = searchParams.get('q') || ''

  const [posts, setPosts] = useState<BlogPost[]>([])
  const [totalPages, setTotalPages] = useState(1)
  const [sidebar, setSidebar] = useState<BlogSidebarData>({
    categories: [],
    tags: [],
    recentPosts: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [postsData, sidebarData] = await Promise.all([
          blogService.getPosts({ page, sort, limit: 9, q: query || undefined }),
          blogService.getSidebar(),
        ])
        setPosts(postsData.posts || [])
        setTotalPages(postsData.totalPages || 1)
        setSidebar(sidebarData)
      } catch (error) {
        console.error('Failed to fetch blog data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [page, sort, query])

  const handleSortChange = (newSort: SortType) => {
    const params = new URLSearchParams()
    params.set('sort', newSort)
    params.set('page', '1')
    if (query) params.set('q', query)
    setSearchParams(params)
  }

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams()
    params.set('sort', sort)
    params.set('page', String(newPage))
    if (query) params.set('q', query)
    setSearchParams(params)
  }

  const sortOptions: { value: SortType; labelKey: string }[] = [
    { value: 'newest', labelKey: 'blog.list.sort_newest' },
    { value: 'popular', labelKey: 'blog.list.sort_popular' },
    { value: 'oldest', labelKey: 'blog.list.sort_oldest' },
  ]

  return (
    <>
      <SEO
        title={query ? t('blog.list.seo_title_search', { query }) : t('blog.list.seo_title')}
        description={t('blog.list.seo_description')}
        url="/blog"
      />

      {/* Breadcrumbs */}
      <div className="bg-dark-light border-b border-border">
        <div className="container mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-sm text-muted">
            <Link to="/" className="hover:text-white">
              {t('blog.list.breadcrumb_home')}
            </Link>
            <ChevronRight className="w-4 h-4" />
            {query ? (
              <>
                <Link to="/blog" className="hover:text-white">
                  {t('blog.list.breadcrumb_blog')}
                </Link>
                <ChevronRight className="w-4 h-4" />
                <span className="text-white truncate max-w-[200px]" title={t('blog.list.breadcrumb_search', { query })}>
                  {t('blog.list.breadcrumb_search', { query })}
                </span>
              </>
            ) : (
              <span className="text-white">{t('blog.list.breadcrumb_blog')}</span>
            )}
          </nav>
        </div>
      </div>

      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/20 via-transparent to-secondary/10 py-16">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-bold text-white mb-4">{t('blog.list.hero_title')}</h1>
          <p className="text-gray-300 max-w-2xl">
            {t('blog.list.hero_subtitle')}
          </p>
        </div>
      </section>

      {/* Content */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          {/* Main Content */}
          <div>
            {/* Search result header */}
            {query && (
              <div className="mb-6">
                <h2 className="text-xl text-white">
                  {t('blog.list.search_results', { query })}
                </h2>
                {!loading && posts.length === 0 && (
                  <p className="text-muted mt-2">{t('blog.list.nothing_found')}</p>
                )}
              </div>
            )}

            {/* Sort Buttons */}
            {!query && (
              <div className="flex items-center gap-2 mb-8">
                <ArrowUpDown className="w-4 h-4 text-muted" />
                {sortOptions.map((option) => (
                  <Button
                    key={option.value}
                    variant={sort === option.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleSortChange(option.value)}
                  >
                    {t(option.labelKey)}
                  </Button>
                ))}
              </div>
            )}

            {loading ? (
              <PageLoading />
            ) : posts.length > 0 ? (
              <>
                {/* Featured Post (first post on first page) */}
                {page === 1 && posts.length > 0 && posts[0].featured && !query && (
                  <div className="mb-8">
                    <PostCard post={posts[0]} featured />
                  </div>
                )}

                {/* Posts Grid */}
                <div className="grid md:grid-cols-2 lg:grid-cols-2 gap-6">
                  {posts
                    .slice(page === 1 && posts[0]?.featured && !query ? 1 : 0)
                    .map((post) => (
                      <PostCard key={post._id} post={post} searchQuery={query || undefined} />
                    ))}
                </div>

                {/* Pagination */}
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
                <h2 className="text-xl text-white mb-2">{t('blog.list.empty_title')}</h2>
                <p className="text-muted">{t('blog.list.empty_subtitle')}</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <BlogSidebar
            categories={sidebar.categories}
            tags={sidebar.tags}
            recentPosts={sidebar.recentPosts}
          />
        </div>
      </div>
    </>
  )
}
