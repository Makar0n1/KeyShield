import { Link } from 'react-router-dom'
import { Calendar, Eye } from 'lucide-react'
import { formatDate, formatNumber } from '@/utils/format'
import type { BlogPost } from '@/types'

interface RelatedPostsProps {
  posts: BlogPost[]
  currentPostId: string
  maxPosts?: number
}

export function RelatedPosts({ posts, currentPostId, maxPosts = 3 }: RelatedPostsProps) {
  // Filter out current post and limit
  const relatedPosts = posts
    .filter((post) => post._id !== currentPostId)
    .slice(0, maxPosts)

  if (relatedPosts.length === 0) {
    return null
  }

  return (
    <section className="mt-12 pt-8 border-t border-border">
      <h2 className="text-2xl font-bold text-white mb-6">
        Похожие статьи
      </h2>

      <div className="grid md:grid-cols-3 gap-6">
        {relatedPosts.map((post) => (
          <Link
            key={post._id}
            to={`/blog/${post.slug}`}
            className="group block"
          >
            <article className="h-full bg-dark-light rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-all duration-300">
              {/* Cover Image */}
              {post.coverImage ? (
                <div className="aspect-video overflow-hidden">
                  <img
                    src={post.coverImage}
                    alt={post.coverImageAlt || post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              ) : (
                <div className="aspect-video bg-dark flex items-center justify-center">
                  <span className="text-4xl">📄</span>
                </div>
              )}

              {/* Content */}
              <div className="p-4">
                {/* Category */}
                {post.category && (
                  <span className="inline-block text-xs text-primary font-medium mb-2">
                    {post.category.name}
                  </span>
                )}

                {/* Title */}
                <h3 className="text-white font-semibold line-clamp-2 group-hover:text-primary transition-colors mb-3">
                  {post.title}
                </h3>

                {/* Meta */}
                <div className="flex items-center gap-4 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatDate(post.publishedAt || post.createdAt)}
                  </span>
                  {post.views !== undefined && (
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {formatNumber(post.views)}
                    </span>
                  )}
                </div>
              </div>
            </article>
          </Link>
        ))}
      </div>

      {/* View All Link */}
      <div className="text-center mt-8">
        <Link
          to="/blog"
          className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors"
        >
          Смотреть все статьи
          <span className="text-lg">→</span>
        </Link>
      </div>
    </section>
  )
}
