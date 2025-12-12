import { useState, useEffect, useCallback } from 'react'
import { X, Upload, Loader2, Search, GripVertical, Trash2 } from 'lucide-react'
import { blogAdminService } from '@/services/blog'

interface MediaFile {
  filename: string
  originalName: string
  url: string
  size: number
  uploadedAt: string
}

export interface GalleryImage {
  url: string
  alt: string
}

interface ImageGalleryModalProps {
  isOpen: boolean
  onClose: () => void
  onInsert: (images: GalleryImage[]) => void
}

export function ImageGalleryModal({ isOpen, onClose, onInsert }: ImageGalleryModalProps) {
  const [media, setMedia] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedImages, setSelectedImages] = useState<GalleryImage[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const loadMedia = useCallback(async () => {
    try {
      setLoading(true)
      const result = await blogAdminService.getAllMedia({ limit: 100 })
      setMedia(result.media || [])
    } catch (err) {
      console.error('Error loading media:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadMedia()
      setSelectedImages([])
    }
  }, [isOpen, loadMedia])

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue
        await blogAdminService.uploadMedia(file)
      }
      await loadMedia()
    } catch (err) {
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleUpload(e.dataTransfer.files)
  }

  const toggleImage = (url: string) => {
    setSelectedImages((prev) => {
      const exists = prev.find((img) => img.url === url)
      if (exists) {
        return prev.filter((img) => img.url !== url)
      }
      return [...prev, { url, alt: '' }]
    })
  }

  const updateAlt = (url: string, alt: string) => {
    setSelectedImages((prev) =>
      prev.map((img) => (img.url === url ? { ...img, alt } : img))
    )
  }

  const removeImage = (url: string) => {
    setSelectedImages((prev) => prev.filter((img) => img.url !== url))
  }

  const handleDragStart = (index: number) => {
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return

    const newImages = [...selectedImages]
    const draggedImage = newImages[dragIndex]
    newImages.splice(dragIndex, 1)
    newImages.splice(index, 0, draggedImage)
    setSelectedImages(newImages)
    setDragIndex(index)
  }

  const handleDragEnd = () => {
    setDragIndex(null)
  }

  const filteredMedia = media.filter((m) =>
    m.originalName.toLowerCase().includes(search.toLowerCase())
  )

  const handleInsert = () => {
    if (selectedImages.length >= 2) {
      onInsert(selectedImages)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-dark-lighter border border-border rounded-xl w-full max-w-5xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-white">Создать галерею</h2>
            <p className="text-sm text-muted">Выберите минимум 2 изображения для галереи</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left side - Image selection */}
          <div className="flex-1 flex flex-col border-r border-border">
            {/* Search & Upload */}
            <div className="flex items-center gap-4 p-4 border-b border-border">
              <div className="relative flex-1">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  size={18}
                />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск..."
                  className="w-full bg-dark border border-border rounded-lg pl-10 pr-4 py-2 text-white placeholder-muted focus:outline-none focus:border-primary"
                />
              </div>
              <label className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg cursor-pointer hover:bg-primary/80 transition-colors">
                {uploading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Upload size={18} />
                )}
                <span>Загрузить</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleUpload(e.target.files)}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>

            {/* Images grid */}
            <div
              className={`flex-1 overflow-y-auto p-4 ${dragOver ? 'bg-primary/10' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 size={32} className="animate-spin text-primary" />
                </div>
              ) : filteredMedia.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                  <Upload size={48} className="mb-4" />
                  <p>Нет изображений</p>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3">
                  {filteredMedia.map((file) => {
                    const isSelected = selectedImages.some((img) => img.url === file.url)
                    const selectedIndex = selectedImages.findIndex(
                      (img) => img.url === file.url
                    )
                    return (
                      <button
                        key={file.filename}
                        onClick={() => toggleImage(file.url)}
                        className={`
                          relative aspect-square rounded-lg overflow-hidden border-2 transition-all
                          ${
                            isSelected
                              ? 'border-primary ring-2 ring-primary/30'
                              : 'border-transparent hover:border-gray-600'
                          }
                        `}
                      >
                        <img
                          src={file.url}
                          alt={file.originalName}
                          className="w-full h-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute top-2 right-2 bg-primary rounded-full w-6 h-6 flex items-center justify-center text-white text-sm font-medium">
                            {selectedIndex + 1}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right side - Selected images order */}
          <div className="w-80 flex flex-col">
            <div className="p-4 border-b border-border">
              <h3 className="font-medium text-white">
                Порядок изображений ({selectedImages.length})
              </h3>
              <p className="text-xs text-muted mt-1">Перетащите для изменения порядка</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedImages.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">
                  Выберите изображения слева
                </p>
              ) : (
                selectedImages.map((img, index) => (
                  <div
                    key={img.url}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`
                      flex items-center gap-3 p-2 bg-dark rounded-lg border border-border
                      ${dragIndex === index ? 'opacity-50' : ''}
                      cursor-grab active:cursor-grabbing
                    `}
                  >
                    <GripVertical size={16} className="text-gray-500 flex-shrink-0" />
                    <img
                      src={img.url}
                      alt=""
                      className="w-12 h-12 object-cover rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        value={img.alt}
                        onChange={(e) => updateAlt(img.url, e.target.value)}
                        placeholder="Alt текст..."
                        className="w-full bg-transparent border-none text-sm text-white placeholder-muted focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeImage(img.url)
                      }}
                      className="text-gray-400 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Insert button */}
            <div className="p-4 border-t border-border">
              <button
                onClick={handleInsert}
                disabled={selectedImages.length < 2}
                className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Вставить галерею ({selectedImages.length} фото)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
