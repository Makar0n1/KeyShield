import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, ThumbsUp, MessageCircle, Clock } from 'lucide-react'
import type { BlogPost } from '@/types'
import { formatDateShort, formatNumber, stripHtml } from '@/utils/format'
import { Badge } from '@/components/ui/badge'

interface PostCardProps {
  post: BlogPost
  featured?: boolean
  searchQuery?: string
}

// Get text snippet centered around the query match
function getSnippetAroundMatch(text: string, query: string, maxLength = 100): string {
  const plainText = stripHtml(text)
  if (!query || query.length < 3) {
    return plainText.length > maxLength ? plainText.slice(0, maxLength) + '...' : plainText
  }

  const lowerText = plainText.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const index = lowerText.indexOf(lowerQuery)

  if (index === -1) {
    return plainText.length > maxLength ? plainText.slice(0, maxLength) + '...' : plainText
  }

  const halfLength = Math.floor((maxLength - query.length) / 2)
  const start = Math.max(0, index - halfLength)
  const end = Math.min(plainText.length, index + query.length + halfLength)
  let snippet = plainText.slice(start, end)

  if (start > 0) snippet = '...' + snippet
  if (end < plainText.length) snippet = snippet + '...'

  return snippet
}

// Highlight matching text
function highlightText(text: string, query: string) {
  if (!query || query.length < 3) return <>{text}</>

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escapedQuery})`, 'gi')
  const parts = text.split(regex)

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-primary/30 text-white font-semibold rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

// Image with loading state, blur background and contain mode
function CardImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div className={`${className} relative bg-dark-lighter overflow-hidden`}>
      {/* Skeleton placeholder */}
      {!loaded && (
        <div className="absolute inset-0 bg-dark-lighter">
          <div className="absolute inset-0 bg-gradient-to-r from-dark-lighter via-dark-light to-dark-lighter bg-[length:200%_100%] animate-shimmer" />
        </div>
      )}
      {/* Blurred background image */}
      <img
        src={src}
        alt=""
        aria-hidden="true"
        className={`absolute inset-0 w-full h-full object-cover blur-xl scale-110 transition-opacity duration-300 ${loaded ? 'opacity-40' : 'opacity-0'}`}
      />
      {/* Main image - contain mode */}
      <img
        src={src}
        alt={alt}
        className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
      />
    </div>
  )
}

export function PostCard({ post, featured = false, searchQuery }: PostCardProps) {
  const rawExcerpt = post.summary || post.excerpt || stripHtml(post.content).slice(0, 150) + '...'

  // If searching, get snippet around match; otherwise use normal excerpt
  const excerpt = searchQuery
    ? getSnippetAroundMatch(post.summary || post.content || '', searchQuery, 120)
    : rawExcerpt

  // Get title snippet if searching
  const titleDisplay = searchQuery
    ? getSnippetAroundMatch(post.title, searchQuery, 60)
    : post.title

  if (featured) {
    return (
      <article className="bg-dark-light rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-colors group">
        <Link to={`/blog/${post.slug}`} className="block">
          <div className="grid md:grid-cols-2 gap-0">
            {post.coverImage && (
              <CardImage
                src={post.coverImage}
                alt={post.title}
                className="h-64 md:h-full"
              />
            )}
            <div className="p-8 flex flex-col justify-center">
              <div className="flex items-center gap-2 mb-4">
                {post.category && (
                  <Badge variant="primary">{post.category.name}</Badge>
                )}
                {post.featured && <Badge variant="secondary">Избранное</Badge>}
              </div>
              <h2 className="text-2xl font-bold text-white group-hover:text-primary transition-colors mb-4">
                {searchQuery ? highlightText(titleDisplay, searchQuery) : post.title}
              </h2>
              <p className="text-muted line-clamp-3 mb-6">
                {searchQuery ? highlightText(excerpt, searchQuery) : excerpt}
              </p>
              <div className="flex items-center gap-4 text-sm text-muted">
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {formatDateShort(post.publishedAt || post.createdAt)}
                </span>
                {post.readTime && (
                  <span>{post.readTime} мин чтения</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-sm text-muted mt-4">
                <span className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  {formatNumber(post.views)}
                </span>
                <span className="flex items-center gap-1">
                  <ThumbsUp className="w-4 h-4" />
                  {formatNumber(post.likes)}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-4 h-4" />
                  {formatNumber(post.commentsCount)}
                </span>
              </div>
            </div>
          </div>
        </Link>
      </article>
    )
  }

  return (
    <article className="bg-dark-light rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-colors group">
      <Link to={`/blog/${post.slug}`} className="block">
        {post.coverImage && (
          <CardImage
            src={post.coverImage}
            alt={post.title}
            className="h-48"
          />
        )}
        <div className="p-6">
          <div className="flex items-center gap-2 text-sm mb-3">
            {post.category && (
              <span className="text-primary font-medium">{post.category.name}</span>
            )}
            <span className="text-muted">
              {formatDateShort(post.publishedAt || post.createdAt)}
            </span>
            {post.readTime && (
              <span className="text-muted">• {post.readTime} мин</span>
            )}
          </div>
          <h2 className="text-xl font-semibold text-white group-hover:text-primary transition-colors mb-2 line-clamp-2">
            {searchQuery ? highlightText(titleDisplay, searchQuery) : post.title}
          </h2>
          <p className="text-muted line-clamp-2 mb-4">
            {searchQuery ? highlightText(excerpt, searchQuery) : excerpt}
          </p>
          <div className="flex items-center gap-4 text-sm text-muted">
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              {formatNumber(post.views)}
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="w-4 h-4" />
              {formatNumber(post.likes)}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="w-4 h-4" />
              {formatNumber(post.commentsCount)}
            </span>
          </div>
        </div>
      </Link>
    </article>
  )
}
