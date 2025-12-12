import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { blogAdminService } from '@/services/blog'
import type { BlogPost } from '@/types'
import { Card, Button } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { formatDateShort, truncate } from '@/utils/format'
import { Plus, Edit, Trash2, Eye, Filter, Bell } from 'lucide-react'

const statusFilters = [
  { value: '', label: 'Все' },
  { value: 'published', label: 'Опубликованные' },
  { value: 'draft', label: 'Черновики' },
]

export function BlogPostsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [posts, setPosts] = useState<BlogPost[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  const page = parseInt(searchParams.get('page') || '1')
  const status = searchParams.get('status') || ''

  const fetchPosts = () => {
    setLoading(true)
    blogAdminService
      .getAllPosts({
        page,
        limit: 20,
        status: status || undefined,
      })
      .then((data) => {
        setPosts(data.posts || [])
        setTotal(data.total || 0)
        setTotalPages(data.totalPages || 1)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchPosts()
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

  const handleDelete = async (post: BlogPost) => {
    if (!confirm(`Удалить статью "${post.title}"?`)) return
    try {
      await blogAdminService.deletePost(post._id)
      fetchPosts()
    } catch (error) {
      console.error('Delete error:', error)
      alert('Ошибка удаления')
    }
  }

  const handleNotify = async (post: BlogPost) => {
    if (!confirm(`Разослать уведомление о статье "${post.title}" всем пользователям бота?`)) return
    try {
      const result = await blogAdminService.notifyUsers(post._id)
      alert(`Уведомления отправлены!\n\nУспешно: ${result.sent}\nОшибок: ${result.failed}\nПропущено: ${result.skipped}`)
    } catch (error) {
      console.error('Notify error:', error)
      alert('Ошибка отправки уведомлений')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Статьи блога</h1>
          <p className="text-muted">Всего: {total}</p>
        </div>
        <Button asChild>
          <Link to="/admin/blog/posts/new">
            <Plus size={18} className="mr-2" />
            Новая статья
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-muted" />
          <div className="flex gap-2">
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

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12 text-muted">
            Статьи не найдены
            <div className="mt-4">
              <Button asChild>
                <Link to="/admin/blog/posts/new">Создать первую статью</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted">Обложка</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Заголовок</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Категория</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Статус</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Просмотры</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Дата</th>
                  <th className="text-right p-4 text-sm font-medium text-muted">Действия</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post._id} className="border-b border-border hover:bg-dark-lighter/50">
                    <td className="p-4">
                      {post.coverImage ? (
                        <img
                          src={post.coverImage}
                          alt={post.title}
                          className="w-16 h-10 object-cover rounded"
                        />
                      ) : (
                        <div className="w-16 h-10 bg-dark rounded flex items-center justify-center text-muted text-xl">
                          📄
                        </div>
                      )}
                    </td>
                    <td className="p-4">
                      <span className="text-white font-medium">{truncate(post.title, 50)}</span>
                      <span className="block text-xs text-muted font-mono">{post.slug}</span>
                    </td>
                    <td className="p-4">
                      {post.category ? (
                        <Badge variant="secondary">{post.category.name}</Badge>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="p-4">
                      <Badge variant={post.status === 'published' ? 'success' : 'warning'}>
                        {post.status === 'published' ? 'Опубликована' : 'Черновик'}
                      </Badge>
                    </td>
                    <td className="p-4 text-muted">
                      👁 {post.views} | 👍 {post.likes}
                    </td>
                    <td className="p-4 text-sm text-muted">
                      {formatDateShort(post.publishedAt || post.createdAt)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={`/blog/${post.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 text-gray-400 hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
                          title="Просмотр"
                        >
                          <Eye size={18} />
                        </a>
                        {post.status === 'published' && (
                          <button
                            onClick={() => handleNotify(post)}
                            className="p-2 text-yellow-400 hover:text-yellow-300 hover:bg-dark-lighter rounded-lg transition-colors"
                            title="Отправить уведомление"
                          >
                            <Bell size={18} />
                          </button>
                        )}
                        <Link
                          to={`/admin/blog/posts/${post._id}`}
                          className="p-2 text-gray-400 hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
                          title="Редактировать"
                        >
                          <Edit size={18} />
                        </Link>
                        <button
                          onClick={() => handleDelete(post)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-dark-lighter rounded-lg transition-colors"
                          title="Удалить"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
