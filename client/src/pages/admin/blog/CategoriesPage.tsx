import { useState, useEffect } from 'react'
import { blogAdminService } from '@/services/blog'
import type { BlogCategory } from '@/types'
import { Card, Button, Input, Textarea, RichTextEditor, MediaPickerModal } from '@/components/ui'
import { formatDateShort, slugify } from '@/utils/format'
import { Plus, Edit, Trash2, Save, X, FolderOpen, Image, Trash } from 'lucide-react'

interface CategoryFormData {
  name: string
  slug: string
  description: string
  coverImage: string
  coverImageAlt: string
  seoTitle: string
  seoDescription: string
  sortOrder: number
}

const initialFormData: CategoryFormData = {
  name: '',
  slug: '',
  description: '',
  coverImage: '',
  coverImageAlt: '',
  seoTitle: '',
  seoDescription: '',
  sortOrder: 0,
}

export function BlogCategoriesPage() {
  const [categories, setCategories] = useState<BlogCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<BlogCategory | null>(null)
  const [formData, setFormData] = useState<CategoryFormData>(initialFormData)
  const [saving, setSaving] = useState(false)
  const [showCoverPicker, setShowCoverPicker] = useState(false)

  const fetchCategories = () => {
    setLoading(true)
    blogAdminService
      .getAllCategories()
      .then(setCategories)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  const handleOpenForm = (category?: BlogCategory) => {
    if (category) {
      setEditingCategory(category)
      setFormData({
        name: category.name,
        slug: category.slug,
        description: category.description || '',
        coverImage: category.coverImage || '',
        coverImageAlt: category.coverImageAlt || '',
        seoTitle: category.seoTitle || '',
        seoDescription: category.seoDescription || '',
        sortOrder: category.sortOrder,
      })
    } else {
      setEditingCategory(null)
      setFormData(initialFormData)
    }
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setEditingCategory(null)
    setFormData(initialFormData)
  }

  const handleNameChange = (name: string) => {
    setFormData({
      ...formData,
      name,
      slug: editingCategory ? formData.slug : slugify(name),
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      alert('Введите название категории')
      return
    }
    if (formData.seoTitle.length > 70) {
      alert('SEO Title слишком длинный (максимум 70 символов)')
      return
    }
    if (formData.seoDescription.length > 160) {
      alert('SEO Description слишком длинный (максимум 160 символов)')
      return
    }

    setSaving(true)
    try {
      const data = {
        name: formData.name,
        slug: formData.slug || slugify(formData.name),
        description: formData.description,
        coverImage: formData.coverImage,
        coverImageAlt: formData.coverImageAlt,
        seoTitle: formData.seoTitle,
        seoDescription: formData.seoDescription,
        sortOrder: formData.sortOrder,
      }

      if (editingCategory) {
        await blogAdminService.updateCategory(editingCategory._id, data)
      } else {
        await blogAdminService.createCategory(data)
      }

      handleCloseForm()
      fetchCategories()
    } catch (error) {
      console.error('Save error:', error)
      alert('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (category: BlogCategory) => {
    if (category.postsCount && category.postsCount > 0) {
      alert(`Нельзя удалить категорию с ${category.postsCount} статьями`)
      return
    }
    if (!confirm(`Удалить категорию "${category.name}"?`)) return

    try {
      await blogAdminService.deleteCategory(category._id)
      fetchCategories()
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
          <h1 className="text-2xl font-bold text-white">Категории</h1>
          <p className="text-muted">Управление категориями блога</p>
        </div>
        <Button onClick={() => handleOpenForm()}>
          <Plus size={18} className="mr-2" />
          Новая категория
        </Button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <Card className="w-full max-w-2xl p-6 my-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">
                {editingCategory ? 'Редактировать категорию' : 'Новая категория'}
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
                  placeholder="Название категории"
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
                <RichTextEditor
                  value={formData.description}
                  onChange={(description) => setFormData({ ...formData, description })}
                  placeholder="Описание категории..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Обложка
                </label>
                {formData.coverImage ? (
                  <div className="space-y-3">
                    <div className="relative rounded-lg overflow-hidden border border-border">
                      <img
                        src={formData.coverImage}
                        alt={formData.coverImageAlt || 'Обложка категории'}
                        className="w-full h-40 object-cover"
                      />
                      <div className="absolute top-2 right-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowCoverPicker(true)}
                          className="p-2 bg-dark/80 text-white rounded-lg hover:bg-dark transition-colors"
                          title="Изменить"
                        >
                          <Image size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, coverImage: '', coverImageAlt: '' })}
                          className="p-2 bg-red-500/80 text-white rounded-lg hover:bg-red-500 transition-colors"
                          title="Удалить"
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    </div>
                    <Input
                      type="text"
                      value={formData.coverImageAlt}
                      onChange={(e) => setFormData({ ...formData, coverImageAlt: e.target.value })}
                      placeholder="Alt текст для изображения"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCoverPicker(true)}
                    className="w-full h-32 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-2 text-muted hover:border-primary hover:text-primary transition-colors"
                  >
                    <Image size={24} />
                    <span className="text-sm">Выбрать из медиатеки</span>
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Порядок сортировки
                </label>
                <Input
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div className="border-t border-border pt-4 mt-4">
                <h3 className="text-sm font-medium text-gray-300 mb-4">SEO</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      SEO Title
                    </label>
                    <Input
                      type="text"
                      value={formData.seoTitle}
                      onChange={(e) => setFormData({ ...formData, seoTitle: e.target.value })}
                      placeholder="SEO заголовок"
                      className={formData.seoTitle.length > 70 ? 'border-red-500 focus:border-red-500' : ''}
                    />
                    <p className={`text-xs mt-1 ${formData.seoTitle.length > 70 ? 'text-red-500' : 'text-muted'}`}>
                      {formData.seoTitle.length}/70 символов
                      {formData.seoTitle.length > 70 && ' — слишком длинный'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      SEO Description
                    </label>
                    <Textarea
                      value={formData.seoDescription}
                      onChange={(e) => setFormData({ ...formData, seoDescription: e.target.value })}
                      placeholder="Meta description"
                      rows={2}
                      className={formData.seoDescription.length > 160 ? 'border-red-500 focus:border-red-500' : ''}
                    />
                    <p className={`text-xs mt-1 ${formData.seoDescription.length > 160 ? 'text-red-500' : 'text-muted'}`}>
                      {formData.seoDescription.length}/160 символов
                      {formData.seoDescription.length > 160 && ' — слишком длинное'}
                    </p>
                  </div>
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

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-12">
            <FolderOpen size={48} className="mx-auto text-muted mb-4" />
            <p className="text-muted">Категории не найдены</p>
            <Button onClick={() => handleOpenForm()} className="mt-4">
              Создать первую категорию
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted">Название</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Slug</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Статей</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Порядок</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Создана</th>
                  <th className="text-right p-4 text-sm font-medium text-muted">Действия</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category._id} className="border-b border-border hover:bg-dark-lighter/50">
                    <td className="p-4">
                      <span className="text-white font-medium">{category.name}</span>
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-sm text-muted">{category.slug}</span>
                    </td>
                    <td className="p-4 text-muted">
                      {category.postsCount || 0}
                    </td>
                    <td className="p-4 text-muted">
                      {category.sortOrder}
                    </td>
                    <td className="p-4 text-sm text-muted">
                      {category.createdAt ? formatDateShort(category.createdAt) : '—'}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenForm(category)}
                          className="p-2 text-gray-400 hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
                          title="Редактировать"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(category)}
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

      {/* Cover Image Picker Modal */}
      <MediaPickerModal
        isOpen={showCoverPicker}
        onClose={() => setShowCoverPicker(false)}
        onSelect={(url) => {
          setFormData({ ...formData, coverImage: url })
          setShowCoverPicker(false)
        }}
      />
    </div>
  )
}
