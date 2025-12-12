import { useState, useEffect, useRef } from 'react'
import { blogAdminService } from '@/services/blog'
import { Card, Button } from '@/components/ui'
import { Pagination } from '@/components/ui/pagination'
import { formatDateShort, formatFileSize } from '@/utils/format'
import { Upload, Trash2, Copy, Check, Image, X, ExternalLink } from 'lucide-react'

interface MediaFile {
  _id: string
  filename: string
  originalName: string
  url: string
  size: number
  mimeType: string
  createdAt: string
}

export function BlogMediaPage() {
  const [media, setMedia] = useState<MediaFile[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchMedia = () => {
    setLoading(true)
    blogAdminService
      .getAllMedia({ page, limit: 24 })
      .then((data) => {
        setMedia(data.media || [])
        setTotal(data.total || 0)
        setTotalPages(data.totalPages || 1)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchMedia()
  }, [page])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        await blogAdminService.uploadMedia(file)
      }
      fetchMedia()
    } catch (error) {
      console.error('Upload error:', error)
      alert('Ошибка загрузки')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDelete = async (file: MediaFile) => {
    if (!confirm(`Удалить "${file.originalName}"?`)) return

    try {
      await blogAdminService.deleteMedia(file.filename)
      if (selectedFile?._id === file._id) {
        setSelectedFile(null)
      }
      fetchMedia()
    } catch (error) {
      console.error('Delete error:', error)
      alert('Ошибка удаления')
    }
  }

  const handleCopyUrl = async (file: MediaFile) => {
    try {
      await navigator.clipboard.writeText(file.url)
      setCopiedId(file._id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      console.error('Copy error:', error)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const files = e.dataTransfer.files
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          await blogAdminService.uploadMedia(file)
        }
      }
      fetchMedia()
    } catch (error) {
      console.error('Upload error:', error)
      alert('Ошибка загрузки')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Медиа</h1>
          <p className="text-muted">Всего файлов: {total}</p>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleUpload}
            className="hidden"
          />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <Upload size={18} className="mr-2" />
            {uploading ? 'Загрузка...' : 'Загрузить'}
          </Button>
        </div>
      </div>

      {/* Upload Zone */}
      <Card
        className="p-8 border-2 border-dashed border-border hover:border-primary/50 transition-colors"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <Upload size={48} className="mx-auto text-muted mb-4" />
          <p className="text-white font-medium mb-2">Перетащите изображения сюда</p>
          <p className="text-muted text-sm">или нажмите кнопку "Загрузить"</p>
        </div>
      </Card>

      {/* Media Grid */}
      <Card className="p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : media.length === 0 ? (
          <div className="text-center py-12">
            <Image size={48} className="mx-auto text-muted mb-4" />
            <p className="text-muted">Медиафайлы не найдены</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {media.map((file) => (
              <div
                key={file._id}
                className={`group relative aspect-square bg-dark rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${
                  selectedFile?._id === file._id
                    ? 'border-primary'
                    : 'border-transparent hover:border-primary/50'
                }`}
                onClick={() => setSelectedFile(file)}
              >
                <img
                  src={file.url}
                  alt={file.originalName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCopyUrl(file)
                    }}
                    className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
                    title="Скопировать URL"
                  >
                    {copiedId === file._id ? (
                      <Check size={16} className="text-green-400" />
                    ) : (
                      <Copy size={16} className="text-white" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(file)
                    }}
                    className="p-2 bg-red-500/50 hover:bg-red-500/70 rounded-lg transition-colors"
                    title="Удалить"
                  >
                    <Trash2 size={16} className="text-white" />
                  </button>
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
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Selected File Details */}
      {selectedFile && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">Детали файла</h2>
              <button
                onClick={() => setSelectedFile(null)}
                className="p-2 text-muted hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="aspect-video bg-dark rounded-lg overflow-hidden">
                <img
                  src={selectedFile.url}
                  alt={selectedFile.originalName}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-muted mb-1">Имя файла</label>
                  <p className="text-white break-all">{selectedFile.originalName}</p>
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Размер</label>
                  <p className="text-white">{formatFileSize(selectedFile.size)}</p>
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Тип</label>
                  <p className="text-white">{selectedFile.mimeType}</p>
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">Загружен</label>
                  <p className="text-white">{formatDateShort(selectedFile.createdAt)}</p>
                </div>
                <div>
                  <label className="block text-sm text-muted mb-1">URL</label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-dark rounded text-sm text-gray-300 break-all">
                      {selectedFile.url}
                    </code>
                    <button
                      onClick={() => handleCopyUrl(selectedFile)}
                      className="p-2 text-muted hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
                    >
                      {copiedId === selectedFile._id ? (
                        <Check size={18} className="text-green-400" />
                      ) : (
                        <Copy size={18} />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <a
                    href={selectedFile.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1"
                  >
                    <Button variant="secondary" className="w-full">
                      <ExternalLink size={16} className="mr-2" />
                      Открыть
                    </Button>
                  </a>
                  <Button
                    variant="destructive"
                    onClick={() => handleDelete(selectedFile)}
                    className="flex-1"
                  >
                    <Trash2 size={16} className="mr-2" />
                    Удалить
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
