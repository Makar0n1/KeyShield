import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { BlogCategory, BlogTag, BlogPost } from '@/types'
import { formatDateShort } from '@/utils/format'
import { Input } from '@/components/ui/input'
import { blogService } from '@/services/blog'

interface BlogSidebarProps {
  categories: BlogCategory[]
  tags: BlogTag[]
  recentPosts: BlogPost[]
  currentCategorySlug?: string
  currentTagSlug?: string
}

// Strip HTML tags from content
function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}

// Check if text contains query
function containsQuery(text: string, query: string): boolean {
  if (!text || !query || query.length < 3) return false
  return stripHtml(text).toLowerCase().includes(query.toLowerCase())
}

// Get text snippet centered around the query match
function getSnippetAroundMatch(text: string, query: string, maxLength = 60): string {
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

// Highlight matching text with <mark> tags
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

export function BlogSidebar({
  categories,
  tags,
  recentPosts,
  currentCategorySlug,
  currentTagSlug,
}: BlogSidebarProps) {
  const { t } = useTranslation()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<BlogPost[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const performSearch = useCallback(async (query: string) => {
    if (query.length < 3) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    setIsSearching(true)
    try {
      const results = await blogService.search(query, 8)
      setSearchResults(results)
      setShowResults(true)
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }, [])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchQuery(value)

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (value.length >= 3) {
      searchTimeoutRef.current = setTimeout(() => {
        performSearch(value)
      }, 300)
    } else {
      setSearchResults([])
      setShowResults(false)
    }
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleResultClick = (slug: string) => {
    setShowResults(false)
    setSearchQuery('')
    navigate(`/blog/${slug}`)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      setShowResults(false)
      navigate(`/blog?q=${encodeURIComponent(searchQuery.trim())}`)
    }
  }

  return (
    <aside className="space-y-8">
      {/* Search */}
      <div className="bg-dark-light rounded-xl p-6 border border-border" ref={searchContainerRef}>
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Search className="w-4 h-4" />
          {t('blog.sidebar.search')}
        </h3>
        <form onSubmit={handleSubmit} className="relative">
          <div className="relative">
            <Input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              placeholder={t('blog.sidebar.search_placeholder')}
              className="w-full pr-10"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {isSearching ? (
                <Loader2 className="w-4 h-4 text-muted animate-spin" />
              ) : (
                <Search className="w-4 h-4 text-muted" />
              )}
            </div>
          </div>

          {/* Search Results Dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="absolute z-50 top-full left-0 mt-2 bg-dark border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 w-full lg:w-[400px]">
              <div className="max-h-[320px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {searchResults.map((post) => {
                  const titleHasMatch = containsQuery(post.title, searchQuery)
                  const summaryHasMatch = containsQuery(post.summary || '', searchQuery)
                  const contentHasMatch = containsQuery(post.content || '', searchQuery)

                  const titleDisplay = titleHasMatch
                    ? getSnippetAroundMatch(post.title, searchQuery, 40)
                    : post.title.length > 45 ? post.title.slice(0, 45) + '...' : post.title

                  let excerptText: string
                  let highlightExcerpt = false

                  if (titleHasMatch) {
                    const plainSummary = stripHtml(post.summary || post.content || '')
                    excerptText = plainSummary.slice(0, 80)
                    if (plainSummary.length > 80) excerptText += '...'
                  } else if (summaryHasMatch) {
                    excerptText = getSnippetAroundMatch(post.summary || '', searchQuery, 60)
                    highlightExcerpt = true
                  } else if (contentHasMatch) {
                    excerptText = getSnippetAroundMatch(post.content || '', searchQuery, 60)
                    highlightExcerpt = true
                  } else {
                    const plainSummary = stripHtml(post.summary || post.content || '')
                    excerptText = plainSummary.slice(0, 80)
                    if (plainSummary.length > 80) excerptText += '...'
                  }

                  return (
                    <button
                      key={post._id}
                      type="button"
                      onClick={() => handleResultClick(post.slug)}
                      className="w-full text-left p-3 hover:bg-dark-light transition-colors border-b border-border last:border-b-0 flex gap-3"
                    >
                      {post.coverImage ? (
                        <div className="w-14 h-14 rounded-lg flex-shrink-0 relative overflow-hidden bg-dark-lighter">
                          <img src={post.coverImage} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover blur-lg scale-110 opacity-40" />
                          <img src={post.coverImage} alt="" className="absolute inset-0 w-full h-full object-contain" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 bg-dark-lighter rounded-lg flex items-center justify-center text-xl flex-shrink-0">📄</div>
                      )}
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <h4 className={`text-sm text-white font-medium ${titleHasMatch ? 'truncate' : 'line-clamp-1'}`}>
                          {titleHasMatch ? highlightText(titleDisplay, searchQuery) : titleDisplay}
                        </h4>
                        <p className={`text-xs text-muted mt-1 ${highlightExcerpt ? 'line-clamp-3' : 'line-clamp-2'}`}>
                          {highlightExcerpt ? highlightText(excerptText, searchQuery) : excerptText}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowResults(false)
                  navigate(`/blog?q=${encodeURIComponent(searchQuery.trim())}`)
                }}
                className="w-full p-3 text-center text-sm text-primary hover:bg-dark-light transition-colors border-t border-border"
              >
                {t('blog.sidebar.show_all_results')}
              </button>
            </div>
          )}

          {showResults && searchQuery.length >= 3 && searchResults.length === 0 && !isSearching && (
            <div className="absolute z-50 top-full left-0 right-0 mt-2 bg-dark border border-border rounded-xl shadow-xl p-4 text-center text-muted text-sm">
              {t('blog.sidebar.nothing_found')}
            </div>
          )}
        </form>
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div className="bg-dark-light rounded-xl p-6 border border-border">
          <h3 className="text-white font-semibold mb-4">{t('blog.sidebar.categories')}</h3>
          <ul className="space-y-2 max-h-[140px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            <li>
              <Link
                to="/blog"
                className={`flex items-center justify-between py-1.5 px-2 rounded transition-colors ${
                  !currentCategorySlug
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted hover:text-white hover:bg-dark-lighter'
                }`}
              >
                <span>{t('blog.sidebar.all_articles')}</span>
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
                    <span className="text-xs bg-dark px-2 py-0.5 rounded">{cat.postsCount}</span>
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
          <h3 className="text-white font-semibold mb-4">{t('blog.sidebar.recent_posts')}</h3>
          <ul className="space-y-4 max-h-[150px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {recentPosts.map((post) => (
              <li key={post._id}>
                <Link to={`/blog/${post.slug}`} className="flex gap-3 group">
                  {post.coverImage ? (
                    <div className="w-16 h-16 rounded-lg flex-shrink-0 relative overflow-hidden bg-dark">
                      <img src={post.coverImage} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover blur-lg scale-110 opacity-40" />
                      <img src={post.coverImage} alt={post.coverImageAlt || post.title} className="absolute inset-0 w-full h-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-16 h-16 bg-dark rounded-lg flex items-center justify-center text-2xl flex-shrink-0">📄</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm text-white group-hover:text-primary line-clamp-2 transition-colors">{post.title}</h4>
                    <p className="text-xs text-muted mt-1">{formatDateShort(post.publishedAt || post.createdAt)}</p>
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
          <h3 className="text-white font-semibold mb-4">{t('blog.sidebar.tags')}</h3>
          <div className="flex flex-wrap gap-2 max-h-[100px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
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
