import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, ThumbsUp, MessageCircle, Clock } from 'lucide-react'
import type { BlogPost } from '@/types'
import { formatDateShort, formatNumber, stripHtml } from '@/utils/format'
import { Badge } from '@/components/ui/badge'

interface PostCardProps {
  post: BlogPost
  featured?: boolean
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

export function PostCard({ post, featured = false }: PostCardProps) {
  const excerpt = post.summary || post.excerpt || stripHtml(post.content).slice(0, 150) + '...'

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
                {post.title}
              </h2>
              <p className="text-muted line-clamp-3 mb-6">{excerpt}</p>
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
            {post.title}
          </h2>
          <p className="text-muted line-clamp-2 mb-4">{excerpt}</p>
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
