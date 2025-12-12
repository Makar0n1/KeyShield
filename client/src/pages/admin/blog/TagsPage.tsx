import { useState, useEffect } from 'react'
import { blogAdminService } from '@/services/blog'
import type { BlogTag } from '@/types'
import { Card, Button, Input } from '@/components/ui'
import { formatDateShort, slugify } from '@/utils/format'
import { Plus, Edit, Trash2, Save, X, Tag } from 'lucide-react'

interface TagFormData {
  name: string
  slug: string
  description: string
  color: string
}

const initialFormData: TagFormData = {
  name: '',
  slug: '',
  description: '',
  color: '#6366f1',
}

const colorOptions = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
]

export function BlogTagsPage() {
  const [tags, setTags] = useState<BlogTag[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTag, setEditingTag] = useState<BlogTag | null>(null)
  const [formData, setFormData] = useState<TagFormData>(initialFormData)
  const [saving, setSaving] = useState(false)

  const fetchTags = () => {
    setLoading(true)
    blogAdminService
      .getAllTags()
      .then(setTags)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchTags()
  }, [])

  const handleOpenForm = (tag?: BlogTag) => {
    if (tag) {
      setEditingTag(tag)
      setFormData({
        name: tag.name,
        slug: tag.slug,
        description: tag.description || '',
        color: tag.color || '#6366f1',
      })
    } else {
      setEditingTag(null)
      setFormData(initialFormData)
    }
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setEditingTag(null)
    setFormData(initialFormData)
  }

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      slug: editingTag ? formData.slug : slugify(name),
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      alert('Введите название тега')
      return
    }

    setSaving(true)
    try {
      const data = {
        name: formData.name,
        slug: formData.slug || slugify(formData.name),
        description: formData.description,
        color: formData.color,
      }

      if (editingTag) {
        await blogAdminService.updateTag(editingTag._id, data)
      } else {
        await blogAdminService.createTag(data)
      }

      handleCloseForm()
      fetchTags()
    } catch (error) {
      console.error('Save error:', error)
      alert('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (tag: BlogTag) => {
    if (tag.postsCount && tag.postsCount > 0) {
      alert(`Нельзя удалить тег с ${tag.postsCount} статьями`)
      return
    }
    if (!confirm(`Удалить тег "${tag.name}"?`)) return

    try {
      await blogAdminService.deleteTag(tag._id)
      fetchTags()
    } catch (error) {
      console.error('Delete error:', error)
      alert('Ошибка удаления')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Теги</h1>
          <p className="text-muted">Управление тегами блога</p>
        </div>
        <Button onClick={() => handleOpenForm()}>
          <Plus size={18} className="mr-2" />
          Новый тег
        </Button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <Card className="w-full max-w-md p-6 my-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">
                {editingTag ? 'Редактировать тег' : 'Новый тег'}
              </h2>
              <button
                onClick={handleCloseForm}
                className="p-2 text-muted hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Название *
                </label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="Название тега"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  URL (slug)
                </label>
                <Input
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="url-slug"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Описание
                </label>
                <Input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Описание тега"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Цвет
                </label>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        formData.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-dark scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="button" variant="secondary" onClick={handleCloseForm} className="flex-1">
                  Отмена
                </Button>
                <Button type="submit" disabled={saving} className="flex-1">
                  <Save size={16} className="mr-2" />
                  {saving ? 'Сохранение...' : 'Сохранить'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Tags Grid */}
      <Card className="p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : tags.length === 0 ? (
          <div className="text-center py-12">
            <Tag size={48} className="mx-auto text-muted mb-4" />
            <p className="text-muted">Теги не найдены</p>
            <Button onClick={() => handleOpenForm()} className="mt-4">
              Создать первый тег
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {tags.map((tag) => (
              <div
                key={tag._id}
                className="group flex items-center gap-2 px-4 py-2 bg-dark-lighter rounded-lg border border-border hover:border-primary/50 transition-colors"
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color || '#6366f1' }}
                />
                <span className="text-white font-medium">{tag.name}</span>
                <span className="text-muted text-sm">({tag.postsCount || 0})</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                  <button
                    onClick={() => handleOpenForm(tag)}
                    className="p-1 text-gray-400 hover:text-white hover:bg-dark rounded transition-colors"
                    title="Редактировать"
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(tag)}
                    className="p-1 text-red-400 hover:text-red-300 hover:bg-dark rounded transition-colors"
                    title="Удалить"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Stats Table */}
      {tags.length > 0 && (
        <Card className="overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-medium text-white">Статистика тегов</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted">Тег</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Slug</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Статей</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Создан</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((tag) => (
                  <tr key={tag._id} className="border-b border-border hover:bg-dark-lighter/50">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: tag.color || '#6366f1' }}
                        />
                        <span className="text-white font-medium">{tag.name}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-sm text-muted">{tag.slug}</span>
                    </td>
                    <td className="p-4 text-muted">{tag.postsCount || 0}</td>
                    <td className="p-4 text-sm text-muted">
                      {tag.createdAt ? formatDateShort(tag.createdAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
