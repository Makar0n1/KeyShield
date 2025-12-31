import { useState, useEffect, useRef } from 'react'
import { adminService } from '@/services/admin'
import type { Broadcast } from '@/types'
import { Card, Button, Input, Textarea } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { formatDate } from '@/utils/format'
import {
  Plus,
  Send,
  Trash2,
  Image as ImageIcon,
  Megaphone,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  Eye,
  FlaskConical,
} from 'lucide-react'

const statusLabels: Record<string, { label: string; variant: 'default' | 'warning' | 'success' | 'destructive' }> = {
  draft: { label: 'Черновик', variant: 'default' },
  sending: { label: 'Отправка...', variant: 'warning' },
  completed: { label: 'Отправлено', variant: 'success' },
  failed: { label: 'Ошибка', variant: 'destructive' },
}

export function BroadcastsPage() {
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)

  // Create form
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({ title: '', text: '', isTest: false, testUserId: '' })
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Preview modal
  const [previewBroadcast, setPreviewBroadcast] = useState<Broadcast | null>(null)

  // Sending progress
  const [sendingId, setSendingId] = useState<string | null>(null)

  const fetchBroadcasts = async () => {
    setLoading(true)
    try {
      const data = await adminService.getBroadcasts({ page, limit: 10 })
      setBroadcasts(data.broadcasts)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch (error) {
      console.error('Error fetching broadcasts:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBroadcasts()
  }, [page])

  // Poll for sending progress
  useEffect(() => {
    if (!sendingId) return

    const interval = setInterval(async () => {
      try {
        const { broadcast } = await adminService.getBroadcastProgress(sendingId)
        setBroadcasts(prev =>
          prev.map(b => (b._id === sendingId ? { ...b, ...broadcast } : b))
        )

        if (broadcast.status !== 'sending') {
          setSendingId(null)
        }
      } catch {
        setSendingId(null)
      }
    }, 2000)

    return () => clearInterval(interval)
  }, [sendingId])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedImage(file)
      const reader = new FileReader()
      reader.onload = () => setImagePreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim() || !formData.text.trim() || !selectedImage) {
      alert('Заполните все поля и выберите изображение')
      return
    }

    if (formData.isTest && !formData.testUserId.trim()) {
      alert('Укажите Telegram ID пользователя для тестовой рассылки')
      return
    }

    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('title', formData.title)
      fd.append('text', formData.text)
      fd.append('image', selectedImage)
      fd.append('isTest', String(formData.isTest))
      if (formData.isTest) {
        fd.append('testUserId', formData.testUserId.trim())
      }

      await adminService.createBroadcast(fd)
      setShowForm(false)
      setFormData({ title: '', text: '', isTest: false, testUserId: '' })
      setSelectedImage(null)
      setImagePreview(null)
      fetchBroadcasts()
    } catch (error) {
      console.error('Error creating broadcast:', error)
      alert('Ошибка создания рассылки')
    } finally {
      setSaving(false)
    }
  }

  const handleSend = async (id: string) => {
    const broadcast = broadcasts.find(b => b._id === id)
    const confirmMsg = broadcast?.isTest
      ? `Отправить тестовую рассылку пользователю ${broadcast.testUserId}?`
      : 'Отправить рассылку всем активным пользователям?'

    if (!confirm(confirmMsg)) return

    try {
      await adminService.sendBroadcast(id)
      setSendingId(id)
      fetchBroadcasts()
    } catch (error) {
      console.error('Error sending broadcast:', error)
      alert('Ошибка отправки рассылки')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Удалить рассылку?')) return

    try {
      await adminService.deleteBroadcast(id)
      fetchBroadcasts()
    } catch (error) {
      console.error('Error deleting broadcast:', error)
      alert('Ошибка удаления')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Megaphone size={24} />
            Маркетинговые рассылки
          </h1>
          <p className="text-muted">Всего: {total}</p>
        </div>
        <Button onClick={() => setShowForm(true)}>
          <Plus size={18} className="mr-2" />
          Создать рассылку
        </Button>
      </div>

      {/* Create Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Новая рассылка</h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1 text-muted hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Заголовок *
                </label>
                <Input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Заголовок рассылки"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Текст сообщения *
                </label>
                <Textarea
                  value={formData.text}
                  onChange={e => setFormData({ ...formData, text: e.target.value })}
                  placeholder="Текст маркетингового сообщения..."
                  rows={4}
                  maxLength={1000}
                />
                <p className="text-xs text-muted mt-1">{formData.text.length}/1000</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Изображение *
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleImageChange}
                  className="hidden"
                />
                {imagePreview ? (
                  <div className="relative">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full aspect-video object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedImage(null)
                        setImagePreview(null)
                      }}
                      className="absolute top-2 right-2 p-1 bg-dark/80 rounded-full text-white hover:bg-dark"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors"
                  >
                    <ImageIcon size={32} className="mx-auto text-muted mb-2" />
                    <p className="text-muted text-sm">Нажмите для загрузки (макс. 5МБ)</p>
                  </button>
                )}
              </div>

              {/* Test mode */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isTest}
                    onChange={e => setFormData({ ...formData, isTest: e.target.checked })}
                    className="w-5 h-5 rounded border-border bg-dark-lighter text-primary focus:ring-primary"
                  />
                  <div>
                    <span className="text-white font-medium">Тестовая рассылка</span>
                    <p className="text-xs text-muted">Отправить только одному пользователю для проверки</p>
                  </div>
                </label>

                {formData.isTest && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Telegram ID получателя
                    </label>
                    <Input
                      type="text"
                      value={formData.testUserId}
                      onChange={e => setFormData({ ...formData, testUserId: e.target.value })}
                      placeholder="Например: 349177382"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowForm(false)}
                  className="flex-1"
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? (
                    <>
                      <Loader2 size={18} className="mr-2 animate-spin" />
                      Сохранение...
                    </>
                  ) : (
                    'Создать черновик'
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Preview Modal */}
      {previewBroadcast && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-0 overflow-hidden">
            {/* Image with blur background */}
            <div className="relative w-full aspect-video overflow-hidden">
              {/* Blurred background */}
              <img
                src={previewBroadcast.imageUrl}
                alt=""
                className="absolute inset-0 w-full h-full object-cover blur-xl scale-110"
              />
              {/* Foreground image */}
              <img
                src={previewBroadcast.imageUrl}
                alt={previewBroadcast.title}
                className="relative w-full h-full object-contain"
              />
            </div>
            <div className="p-4">
              <h3 className="text-lg font-bold text-white mb-2">
                {previewBroadcast.title}
              </h3>
              <p className="text-gray-300 whitespace-pre-wrap">{previewBroadcast.text}</p>
              <div className="mt-4 flex justify-end">
                <Button variant="secondary" onClick={() => setPreviewBroadcast(null)}>
                  Закрыть
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Broadcasts List */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : broadcasts.length === 0 ? (
          <div className="text-center py-12 text-muted">
            Рассылки не найдены. Создайте первую!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted">Заголовок</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Статус</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Статистика</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Создано</th>
                  <th className="text-right p-4 text-sm font-medium text-muted">Действия</th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map(broadcast => {
                  const status = statusLabels[broadcast.status] || statusLabels.draft
                  return (
                    <tr key={broadcast._id} className="border-b border-border hover:bg-dark-lighter/50">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {/* Thumbnail with blur background */}
                          <div className="relative w-16 h-10 rounded overflow-hidden flex-shrink-0">
                            <img
                              src={broadcast.imageUrl}
                              alt=""
                              className="absolute inset-0 w-full h-full object-cover blur-md scale-110"
                            />
                            <img
                              src={broadcast.imageUrl}
                              alt={broadcast.title}
                              className="relative w-full h-full object-contain"
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-white font-medium">{broadcast.title}</p>
                              {broadcast.isTest && (
                                <span className="inline-flex items-center gap-1 text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">
                                  <FlaskConical size={10} />
                                  ТЕСТ
                                </span>
                              )}
                            </div>
                            <p className="text-muted text-sm line-clamp-1">
                              {broadcast.isTest && broadcast.testUserId
                                ? `ID: ${broadcast.testUserId} • `
                                : ''
                              }
                              {broadcast.text.substring(0, 50)}...
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant={status.variant}>
                          {broadcast.status === 'sending' ? (
                            <Loader2 size={12} className="mr-1 animate-spin" />
                          ) : broadcast.status === 'completed' ? (
                            <CheckCircle size={12} className="mr-1" />
                          ) : broadcast.status === 'failed' ? (
                            <AlertCircle size={12} className="mr-1" />
                          ) : (
                            <Clock size={12} className="mr-1" />
                          )}
                          {status.label}
                        </Badge>
                      </td>
                      <td className="p-4 text-sm">
                        {broadcast.status !== 'draft' ? (
                          <div className="space-y-1">
                            <p className="text-white">
                              Всего: {broadcast.stats.totalUsers}
                            </p>
                            <p className="text-green-400">
                              Отправлено: {broadcast.stats.sent}
                            </p>
                            {broadcast.stats.failed > 0 && (
                              <p className="text-red-400">
                                Ошибок: {broadcast.stats.failed}
                              </p>
                            )}
                            {broadcast.stats.skipped > 0 && (
                              <p className="text-yellow-400">
                                Пропущено: {broadcast.stats.skipped}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="p-4 text-sm text-muted">
                        {formatDate(broadcast.createdAt)}
                        {broadcast.completedAt && (
                          <p className="text-xs">
                            Отправлено: {formatDate(broadcast.completedAt)}
                          </p>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setPreviewBroadcast(broadcast)}
                            className="p-2 text-gray-400 hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
                            title="Предпросмотр"
                          >
                            <Eye size={18} />
                          </button>
                          {broadcast.status === 'draft' && (
                            <>
                              <button
                                onClick={() => handleSend(broadcast._id)}
                                className="p-2 text-green-400 hover:text-green-300 hover:bg-dark-lighter rounded-lg transition-colors"
                                title="Отправить"
                              >
                                <Send size={18} />
                              </button>
                              <button
                                onClick={() => handleDelete(broadcast._id)}
                                className="p-2 text-red-400 hover:text-red-300 hover:bg-dark-lighter rounded-lg transition-colors"
                                title="Удалить"
                              >
                                <Trash2 size={18} />
                              </button>
                            </>
                          )}
                          {(broadcast.status === 'completed' || broadcast.status === 'failed') && (
                            <button
                              onClick={() => handleDelete(broadcast._id)}
                              className="p-2 text-red-400 hover:text-red-300 hover:bg-dark-lighter rounded-lg transition-colors"
                              title="Удалить"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
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
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  )
}
