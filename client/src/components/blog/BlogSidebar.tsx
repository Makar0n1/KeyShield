import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import type { BlogCategory, BlogTag, BlogPost } from '@/types'
import { formatDateShort } from '@/utils/format'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface BlogSidebarProps {
  categories: BlogCategory[]
  tags: BlogTag[]
  recentPosts: BlogPost[]
  currentCategorySlug?: string
  currentTagSlug?: string
}

export function BlogSidebar({
  categories,
  tags,
  recentPosts,
  currentCategorySlug,
  currentTagSlug,
}: BlogSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/blog?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <aside className="space-y-8">
      {/* Search */}
      <div className="bg-dark-light rounded-xl p-6 border border-border">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Search className="w-4 h-4" />
          Поиск
        </h3>
        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск статей..."
            className="flex-1"
          />
          <Button type="submit" size="icon">
            <Search className="w-4 h-4" />
          </Button>
        </form>
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div className="bg-dark-light rounded-xl p-6 border border-border">
          <h3 className="text-white font-semibold mb-4">📁 Категории</h3>
          <ul className="space-y-2">
            <li>
              <Link
                to="/blog"
                className={`flex items-center justify-between py-1.5 px-2 rounded transition-colors ${
                  !currentCategorySlug
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted hover:text-white hover:bg-dark-lighter'
                }`}
              >
                <span>Все статьи</span>
              </Link>
            </li>
            {categories.map((cat) => (
              <li key={cat._id}>
                <Link
                  to={`/category/${cat.slug}`}
                  className={`flex items-center justify-between py-1.5 px-2 rounded transition-colors ${
                    currentCategorySlug === cat.slug
                      ? 'bg-primary/20 text-primary'
                      : 'text-muted hover:text-white hover:bg-dark-lighter'
                  }`}
                >
                  <span>{cat.name}</span>
                  {cat.postsCount !== undefined && (
                    <span className="text-xs bg-dark px-2 py-0.5 rounded">
                      {cat.postsCount}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent Posts */}
      {recentPosts.length > 0 && (
        <div className="bg-dark-light rounded-xl p-6 border border-border">
          <h3 className="text-white font-semibold mb-4">📝 Последние статьи</h3>
          <ul className="space-y-4">
            {recentPosts.map((post) => (
              <li key={post._id}>
                <Link to={`/blog/${post.slug}`} className="flex gap-3 group">
                  {post.coverImage ? (
                    <img
                      src={post.coverImage}
                      alt={post.coverImageAlt || post.title}
                      className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-dark rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
                      📄
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm text-white group-hover:text-primary line-clamp-2 transition-colors">
                      {post.title}
                    </h4>
                    <p className="text-xs text-muted mt-1">
                      {formatDateShort(post.publishedAt || post.createdAt)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="bg-dark-light rounded-xl p-6 border border-border">
          <h3 className="text-white font-semibold mb-4">🏷️ Теги</h3>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Link
                key={tag._id}
                to={`/tag/${tag.slug}`}
                className={`text-sm px-3 py-1 rounded-full transition-colors ${
                  currentTagSlug === tag.slug
                    ? 'bg-primary text-white'
                    : 'bg-dark text-muted hover:text-white hover:bg-dark-lighter'
                }`}
              >
                {tag.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
