import { useState, useEffect, useCallback } from 'react'
import { X, Upload, Check, Loader2, Search } from 'lucide-react'
import { blogAdminService } from '@/services/blog'

interface MediaFile {
  filename: string
  originalName: string
  url: string
  size: number
  uploadedAt: string
}

interface MediaPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (url: string) => void
  multiple?: boolean
  onSelectMultiple?: (urls: string[]) => void
}

export function MediaPickerModal({
  isOpen,
  onClose,
  onSelect,
  multiple = false,
  onSelectMultiple,
}: MediaPickerModalProps) {
  const [media, setMedia] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [dragOver, setDragOver] = useState(false)

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
      setSelected([])
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

  const handleSelect = (url: string) => {
    if (multiple) {
      setSelected((prev) =>
        prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
      )
    } else {
      onSelect(url)
    }
  }

  const handleConfirmMultiple = () => {
    if (onSelectMultiple && selected.length > 0) {
      onSelectMultiple(selected)
    }
    onClose()
  }

  const filteredMedia = media.filter((m) =>
    m.originalName.toLowerCase().includes(search.toLowerCase())
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-dark-lighter border border-border rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-white">Выбор изображения</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Search & Upload */}
        <div className="flex items-center gap-4 p-4 border-b border-border">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
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

        {/* Content */}
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
              <p>Перетащите изображения сюда или нажмите "Загрузить"</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
              {filteredMedia.map((file) => (
                <button
                  key={file.filename}
                  onClick={() => handleSelect(file.url)}
                  className={`
                    relative aspect-square rounded-lg overflow-hidden border-2 transition-all
                    ${
                      selected.includes(file.url)
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
                  {selected.includes(file.url) && (
                    <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                      <div className="bg-primary rounded-full p-1">
                        <Check size={16} className="text-white" />
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer for multiple selection */}
        {multiple && (
          <div className="flex items-center justify-between p-4 border-t border-border">
            <span className="text-gray-400">
              Выбрано: {selected.length}
            </span>
            <button
              onClick={handleConfirmMultiple}
              disabled={selected.length === 0}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Вставить
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
