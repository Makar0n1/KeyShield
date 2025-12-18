import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ChevronRight, Eye, ThumbsUp, ThumbsDown, Clock, Calendar } from 'lucide-react'
import { blogService } from '@/services/blog'
import { getVisitorId } from '@/utils/visitor'
import { formatDate, formatNumber } from '@/utils/format'
import {
  BlogSidebar,
  CommentSection,
  ShareButtons,
  TableOfContents,
  FaqAccordion,
  ArticleCTA,
  RelatedPosts,
  BlogContent,
} from '@/components/blog'
import { SEO, generateArticleSchema, generateFAQSchema, generateBreadcrumbSchema } from '@/components/SEO'
import { Badge } from '@/components/ui/badge'
import { PageLoading } from '@/components/ui/loading'
import { Button } from '@/components/ui/button'
import type { BlogPost, BlogComment, BlogSidebarData } from '@/types'

// Cover image with skeleton placeholder - fixed height, contain mode
function CoverImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="relative w-full h-[300px] md:h-[400px] rounded-xl mb-8 overflow-hidden bg-dark-light">
      {/* Skeleton placeholder */}
      {!loaded && (
        <div className="absolute inset-0 bg-dark-light animate-pulse">
          <div className="absolute inset-0 bg-gradient-to-r from-dark-light via-dark-lighter to-dark-light bg-[length:200%_100%] animate-shimmer" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

// Isolated voting component - has its own state, doesn't cause parent re-render
function VoteButtons({ postId, initialLikes, initialDislikes }: {
  postId: string
  initialLikes: number
  initialDislikes: number
}) {
  const [likes, setLikes] = useState(initialLikes)
  const [dislikes, setDislikes] = useState(initialDislikes)
  const [userVote, setUserVote] = useState<'like' | 'dislike' | null>(null)
  const [isVoting, setIsVoting] = useState(false)

  const handleVote = async (voteType: 'like' | 'dislike') => {
    if (isVoting) return
    setIsVoting(true)

    const visitorId = getVisitorId()

    try {
      const result = await blogService.vote('post', postId, voteType, visitorId)
      setLikes(result.likes)
      setDislikes(result.dislikes)
      setUserVote(voteType)
    } catch {
      // Silently fail
    } finally {
      setIsVoting(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <span className="text-muted">Оцените статью:</span>
      <button
        onClick={() => handleVote('like')}
        disabled={isVoting}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
          userVote === 'like'
            ? 'bg-secondary/20 text-secondary'
            : 'bg-dark-light text-muted hover:text-secondary'
        } ${isVoting ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <ThumbsUp className="w-4 h-4" />
        {formatNumber(likes)}
      </button>
      <button
        onClick={() => handleVote('dislike')}
        disabled={isVoting}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
          userVote === 'dislike'
            ? 'bg-red-500/20 text-red-400'
            : 'bg-dark-light text-muted hover:text-red-400'
        } ${isVoting ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <ThumbsDown className="w-4 h-4" />
        {formatNumber(dislikes)}
      </button>
    </div>
  )
}

// Storage key for scroll position
const getScrollKey = (slug: string) => `blog-scroll-${slug}`

export function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const [post, setPost] = useState<BlogPost | null>(null)
  const [comments, setComments] = useState<BlogComment[]>([])
  const [sidebar, setSidebar] = useState<BlogSidebarData>({
    categories: [],
    tags: [],
    recentPosts: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Track if we've restored scroll position
  const scrollRestoredRef = useRef(false)

  const fetchComments = useCallback(async () => {
    if (!slug) return
    try {
      const data = await blogService.getComments(slug)
      setComments(data)
    } catch {
      // Silently fail
    }
  }, [slug])

  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return
      setLoading(true)
      setError('')
      scrollRestoredRef.current = false

      try {
        const [postData, sidebarData] = await Promise.all([
          blogService.getPost(slug),
          blogService.getSidebar(),
        ])
        setPost(postData)
        setSidebar(sidebarData)
        await fetchComments()
      } catch {
        setError('Статья не найдена')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [slug, fetchComments])

  // Restore scroll position after content loads with smooth scroll
  useEffect(() => {
    if (!loading && post && slug && !scrollRestoredRef.current) {
      scrollRestoredRef.current = true
      const savedScroll = sessionStorage.getItem(getScrollKey(slug))
      if (savedScroll) {
        const scrollY = parseInt(savedScroll, 10)
        // Wait for images and content to render, then smooth scroll
        requestAnimationFrame(() => {
          setTimeout(() => {
            window.scrollTo({
              top: scrollY,
              behavior: 'smooth'
            })
          }, 150)
        })
      }
    }
  }, [loading, post, slug])

  // Save scroll position on scroll (debounced)
  useEffect(() => {
    if (!slug) return

    let timeoutId: ReturnType<typeof setTimeout>
    const handleScroll = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        sessionStorage.setItem(getScrollKey(slug), String(window.scrollY))
      }, 100)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [slug])

  // Clean up old scroll positions on unmount (keep only current)
  useEffect(() => {
    return () => {
      // Keep scroll position for current article (for back navigation)
      // Clear others to prevent storage bloat
      const keysToRemove: string[] = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i)
        if (key?.startsWith('blog-scroll-') && key !== getScrollKey(slug || '')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach(key => sessionStorage.removeItem(key))
    }
  }, [slug])

  if (loading) {
    return <PageLoading />
  }

  if (error || !post) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">📄</div>
        <h1 className="text-2xl text-white mb-4">{error || 'Статья не найдена'}</h1>
        <Button asChild>
          <Link to="/blog">Вернуться к блогу</Link>
        </Button>
      </div>
    )
  }

  // Generate schema for SEO
  const schemas = [
    generateArticleSchema({
      title: post.title,
      description: post.seoDescription || post.excerpt || '',
      image: post.coverImage,
      url: `/blog/${post.slug}`,
      publishedTime: post.publishedAt || post.createdAt,
      modifiedTime: post.updatedAt,
      likes: post.likes,
      dislikes: post.dislikes,
      commentCount: comments.length,
    }),
    generateBreadcrumbSchema([
      { name: 'Главная', url: '/' },
      { name: 'Блог', url: '/blog' },
      ...(post.category ? [{ name: post.category.name, url: `/category/${post.category.slug}` }] : []),
      { name: post.title, url: `/blog/${post.slug}` },
    ]),
    ...(post.faq && post.faq.length > 0 ? [generateFAQSchema(post.faq)] : []),
  ]

  return (
    <>
      <SEO
        title={post.seoTitle || post.title}
        description={post.seoDescription || post.excerpt}
        image={post.coverImage}
        url={`/blog/${post.slug}`}
        type="article"
        publishedTime={post.publishedAt || post.createdAt}
        modifiedTime={post.updatedAt}
        schema={schemas}
      />

      {/* Breadcrumbs */}
      <div className="bg-dark-light border-b border-border">
        <div className="container mx-auto px-4 py-3">
          <nav className="flex items-center gap-1.5 sm:gap-2 text-sm text-muted overflow-x-auto scrollbar-hide">
            <Link to="/" className="hover:text-white shrink-0">
              Главная
            </Link>
            <ChevronRight className="w-4 h-4 shrink-0 opacity-50" />
            <Link to="/blog" className="hover:text-white shrink-0">
              Блог
            </Link>
            {post.category && (
              <>
                <ChevronRight className="w-4 h-4 shrink-0 opacity-50" />
                <Link
                  to={`/category/${post.category.slug}`}
                  className="hover:text-white shrink-0 max-w-[120px] sm:max-w-[200px] truncate"
                  title={post.category.name}
                >
                  {post.category.name}
                </Link>
              </>
            )}
            {/* Article title */}
            <ChevronRight className="w-4 h-4 shrink-0 opacity-50" />
            <span className="text-white shrink-0 max-w-[150px] sm:max-w-[250px] truncate" title={post.title}>
              {post.title}
            </span>
          </nav>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
          {/* Main Content */}
          <article className="min-w-0">
            {/* Header */}
            <header className="mb-8 overflow-hidden">
              {post.category && (
                <Link to={`/category/${post.category.slug}`}>
                  <Badge variant="primary" className="mb-4">
                    {post.category.name}
                  </Badge>
                </Link>
              )}
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-4">
                {post.title}
              </h1>

              {/* Meta */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted mb-6">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(post.publishedAt || post.createdAt)}
                </span>
                {post.readTime && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {post.readTime} мин чтения
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  {formatNumber(post.views)} просмотров
                </span>
              </div>

              {/* Cover Image with placeholder */}
              {post.coverImage && (
                <CoverImage
                  src={post.coverImage}
                  alt={post.coverImageAlt || post.title}
                />
              )}

              {/* Table of Contents - collapsible, under cover image */}
              <TableOfContents content={post.content} className="mb-8" />
            </header>

            {/* Content - isolated component to prevent re-renders */}
            <BlogContent
              content={post.content}
              postId={post._id}
              recentPosts={sidebar.recentPosts}
            />

            {/* CTA Block - Call to action */}
            <ArticleCTA />

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-8 pt-8 border-t border-border">
                <span className="text-muted">Теги:</span>
                {post.tags.map((tag) => (
                  <Link
                    key={tag._id}
                    to={`/tag/${tag.slug}`}
                    className="text-sm bg-dark-light text-muted hover:text-white px-3 py-1 rounded-full transition-colors"
                  >
                    #{tag.name}
                  </Link>
                ))}
              </div>
            )}

            {/* Voting & Sharing */}
            <div className="flex flex-wrap items-center justify-between gap-4 mt-8 pt-8 border-t border-border">
              <VoteButtons
                postId={post._id}
                initialLikes={post.likes}
                initialDislikes={post.dislikes}
              />

              <ShareButtons postId={post._id} title={post.title} />
            </div>

            {/* FAQ */}
            {post.faq && post.faq.length > 0 && (
              <FaqAccordion items={post.faq} />
            )}

            {/* Comments */}
            {post.allowComments !== false && (
              <CommentSection
                postSlug={post.slug}
                comments={comments}
                onCommentAdded={fetchComments}
              />
            )}

            {/* Related Posts */}
            <RelatedPosts
              posts={sidebar.recentPosts}
              currentPostId={post._id}
              maxPosts={3}
            />
          </article>

          {/* Sidebar */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <BlogSidebar
                categories={sidebar.categories}
                tags={sidebar.tags}
                recentPosts={sidebar.recentPosts.filter((p) => p._id !== post._id)}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
