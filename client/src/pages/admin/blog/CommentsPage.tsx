import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { blogAdminService } from '@/services/blog'
import type { BlogComment } from '@/types'
import { Card } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { formatDate, truncate } from '@/utils/format'
import { MessageSquare, Check, X, Trash2, Filter, ExternalLink } from 'lucide-react'

const statusFilters = [
  { value: '', label: 'Все' },
  { value: 'pending', label: 'На модерации' },
  { value: 'approved', label: 'Одобренные' },
  { value: 'hidden', label: 'Скрытые' },
]

export function BlogCommentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [comments, setComments] = useState<BlogComment[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  const page = parseInt(searchParams.get('page') || '1')
  const status = searchParams.get('status') || ''

  const fetchComments = () => {
    setLoading(true)
    blogAdminService
      .getAllComments({ page, limit: 20, status: status || undefined })
      .then((data) => {
        setComments(data.comments || [])
        setTotal(data.total || 0)
        setTotalPages(data.totalPages || 1)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchComments()
  }, [page, status])

  const handleStatusFilter = (newStatus: string) => {
    const params = new URLSearchParams(searchParams)
    if (newStatus) {
      params.set('status', newStatus)
    } else {
      params.delete('status')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', String(newPage))
    setSearchParams(params)
  }

  const handleApprove = async (comment: BlogComment) => {
    try {
      await blogAdminService.updateCommentStatus(comment._id, 'approved')
      fetchComments()
    } catch (error) {
      console.error('Approve error:', error)
      alert('Ошибка одобрения')
    }
  }

  const handleHide = async (comment: BlogComment) => {
    try {
      await blogAdminService.updateCommentStatus(comment._id, 'hidden')
      fetchComments()
    } catch (error) {
      console.error('Hide error:', error)
      alert('Ошибка скрытия')
    }
  }

  const handleDelete = async (comment: BlogComment) => {
    if (!confirm('Удалить комментарий?')) return
    try {
      await blogAdminService.deleteComment(comment._id)
      fetchComments()
    } catch (error) {
      console.error('Delete error:', error)
      alert('Ошибка удаления')
    }
  }

  const getStatusBadge = (commentStatus: string) => {
    switch (commentStatus) {
      case 'approved':
        return <Badge variant="success">Одобрен</Badge>
      case 'hidden':
        return <Badge variant="secondary">Скрыт</Badge>
      case 'pending':
      default:
        return <Badge variant="warning">На модерации</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Комментарии</h1>
          <p className="text-muted">Всего: {total}</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-muted" />
          <div className="flex gap-2 flex-wrap">
            {statusFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => handleStatusFilter(filter.value)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  status === filter.value
                    ? 'bg-primary text-white'
                    : 'bg-dark-lighter text-gray-300 hover:bg-dark-light'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Comments List */}
      <Card>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare size={48} className="mx-auto text-muted mb-4" />
            <p className="text-muted">Комментарии не найдены</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {comments.map((comment) => (
              <div key={comment._id} className="p-4 hover:bg-dark-lighter/50">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                      {comment.authorName.charAt(0).toUpperCase()}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                      <span className="font-medium text-white">{comment.authorName}</span>
                      {comment.authorEmail && (
                        <span className="text-sm text-muted">{comment.authorEmail}</span>
                      )}
                      {getStatusBadge(comment.status)}
                    </div>

                    <p className="text-gray-300 mb-3 whitespace-pre-wrap">
                      {comment.content}
                    </p>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-muted">
                      <span>{formatDate(comment.createdAt)}</span>
                      {comment.post && (
                        <>
                          <span className="hidden sm:inline">•</span>
                          <Link
                            to={`/blog/${typeof comment.post === 'string' ? comment.post : comment.post.slug}`}
                            target="_blank"
                            className="flex items-center gap-1 text-primary hover:text-primary-light"
                          >
                            {typeof comment.post === 'string'
                              ? 'Статья'
                              : truncate(comment.post.title, 40)}
                            <ExternalLink size={14} />
                          </Link>
                        </>
                      )}
                      <span className="hidden sm:inline">•</span>
                      <span>
                        👍 {comment.likes} | 👎 {comment.dislikes}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {comment.status !== 'approved' && (
                      <button
                        onClick={() => handleApprove(comment)}
                        className="p-2 text-green-400 hover:text-green-300 hover:bg-dark-lighter rounded-lg transition-colors"
                        title="Одобрить"
                      >
                        <Check size={18} />
                      </button>
                    )}
                    {comment.status !== 'hidden' && (
                      <button
                        onClick={() => handleHide(comment)}
                        className="p-2 text-yellow-400 hover:text-yellow-300 hover:bg-dark-lighter rounded-lg transition-colors"
                        title="Скрыть"
                      >
                        <X size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(comment)}
                      className="p-2 text-red-400 hover:text-red-300 hover:bg-dark-lighter rounded-lg transition-colors"
                      title="Удалить"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      )}
    </div>
  )
}
