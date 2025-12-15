import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { blogAdminService } from '@/services/blog'
import type { BlogCategory, BlogTag } from '@/types'
import { Card, Button, Input, Textarea, RichTextEditor, MediaPickerModal } from '@/components/ui'
import { slugify } from '@/utils/format'
import {
  ArrowLeft,
  Save,
  Image,
  Plus,
  X,
  Send,
  ImagePlus,
} from 'lucide-react'

interface PostFormData {
  title: string
  slug: string
  summary: string
  content: string
  coverImage: string
  coverImageAlt: string
  categoryId: string
  tagIds: string[]
  status: 'draft' | 'published'
  seoTitle: string
  seoDescription: string
  seoKeywords: string
  faq: Array<{ question: string; answer: string }>
  notifySubscribers: boolean
}

const initialFormData: PostFormData = {
  title: '',
  slug: '',
  summary: '',
  content: '',
  coverImage: '',
  coverImageAlt: '',
  categoryId: '',
  tagIds: [],
  status: 'draft',
  seoTitle: '',
  seoDescription: '',
  seoKeywords: '',
  faq: [],
  notifySubscribers: false,
}

export function BlogPostEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isNew = !id

  const [formData, setFormData] = useState<PostFormData>(initialFormData)
  const [categories, setCategories] = useState<BlogCategory[]>([])
  const [tags, setTags] = useState<BlogTag[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'content' | 'seo' | 'faq'>('content')
  const [showCoverPicker, setShowCoverPicker] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      try {
        // Load categories and tags
        const [cats, tgs] = await Promise.all([
          blogAdminService.getAllCategories(),
          blogAdminService.getAllTags(),
        ])
        setCategories(cats || [])
        setTags(tgs || [])

        // Load post if editing
        if (!isNew && id) {
          const post = await blogAdminService.getPostById(id)
          setFormData({
            title: post.title,
            slug: post.slug,
            summary: post.summary || '',
            content: post.content,
            coverImage: post.coverImage || '',
            coverImageAlt: post.coverImageAlt || '',
            categoryId: post.category?._id || '',
            tagIds: post.tags?.map((t) => t._id) || [],
            status: post.status,
            seoTitle: post.seoTitle || '',
            seoDescription: post.seoDescription || '',
            seoKeywords: post.seoKeywords || '',
            faq: post.faq || [],
            notifySubscribers: false,
          })
        }
      } catch (err) {
        console.error('Load error:', err)
        if (!isNew) {
          navigate('/admin/blog/posts')
        }
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [id, isNew, navigate])

  const handleTitleChange = (title: string) => {
    setFormData({
      ...formData,
      title,
      slug: isNew ? slugify(title) : formData.slug,
    })
  }

  const handleTagToggle = (tagId: string) => {
    const newTagIds = formData.tagIds.includes(tagId)
      ? formData.tagIds.filter((id) => id !== tagId)
      : [...formData.tagIds, tagId]
    setFormData({ ...formData, tagIds: newTagIds })
  }

  const handleAddFaq = () => {
    setFormData({
      ...formData,
      faq: [...formData.faq, { question: '', answer: '' }],
    })
  }

  const handleRemoveFaq = (index: number) => {
    setFormData({
      ...formData,
      faq: formData.faq.filter((_, i) => i !== index),
    })
  }

  const handleFaqChange = (index: number, field: 'question' | 'answer', value: string) => {
    const newFaq = [...formData.faq]
    newFaq[index][field] = value
    setFormData({ ...formData, faq: newFaq })
  }

  const handleSave = async (publish = false) => {
    if (!formData.title.trim()) {
      alert('Введите заголовок')
      return
    }
    if (!formData.content.trim()) {
      alert('Введите содержимое')
      return
    }
    if (formData.seoTitle.length > 70) {
      alert('SEO Title слишком длинный (максимум 70 символов)')
      setActiveTab('seo')
      return
    }
    if (formData.seoDescription.length > 160) {
      alert('SEO Description слишком длинный (максимум 160 символов)')
      setActiveTab('seo')
      return
    }

    setSaving(true)
    try {
      const postData = {
        title: formData.title,
        slug: formData.slug || slugify(formData.title),
        summary: formData.summary,
        content: formData.content,
        coverImage: formData.coverImage,
        coverImageAlt: formData.coverImageAlt,
        category: formData.categoryId || undefined,
        tags: formData.tagIds,
        status: publish ? 'published' : formData.status,
        seoTitle: formData.seoTitle,
        seoDescription: formData.seoDescription,
        seoKeywords: formData.seoKeywords,
        faq: formData.faq.filter((f) => f.question && f.answer),
        notifySubscribers: publish && formData.notifySubscribers,
      }

      if (isNew) {
        await blogAdminService.createPost(postData)
      } else {
        await blogAdminService.updatePost(id!, postData)
      }

      navigate('/admin/blog')
    } catch (error) {
      console.error('Save error:', error)
      alert('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/admin/blog"
            className="p-2 text-muted hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-white">
            {isNew ? 'Новая статья' : 'Редактирование статьи'}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => handleSave(false)} variant="secondary" disabled={saving}>
            <Save size={18} className="mr-2" />
            Сохранить черновик
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving}>
            <Send size={18} className="mr-2" />
            Опубликовать
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tabs */}
          <div className="flex gap-2 border-b border-border pb-2">
            {['content', 'seo', 'faq'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as typeof activeTab)}
                className={`px-4 py-2 rounded-t-lg transition-colors ${
                  activeTab === tab
                    ? 'bg-dark-lighter text-white'
                    : 'text-muted hover:text-white'
                }`}
              >
                {tab === 'content' && 'Контент'}
                {tab === 'seo' && 'SEO'}
                {tab === 'faq' && 'FAQ'}
              </button>
            ))}
          </div>

          {/* Content Tab */}
          {activeTab === 'content' && (
            <Card className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Заголовок *
                </label>
                <Input
                  type="text"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Заголовок статьи"
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
                  Краткое описание
                </label>
                <Textarea
                  value={formData.summary}
                  onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
                  placeholder="Краткое описание для превью"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Содержимое *
                </label>
                <RichTextEditor
                  value={formData.content}
                  onChange={(content) => setFormData({ ...formData, content })}
                  placeholder="Начните писать статью..."
                />
              </div>
            </Card>
          )}

          {/* SEO Tab */}
          {activeTab === 'seo' && (
            <Card className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  SEO Title
                </label>
                <Input
                  type="text"
                  value={formData.seoTitle}
                  onChange={(e) => setFormData({ ...formData, seoTitle: e.target.value })}
                  placeholder="SEO заголовок (по умолчанию используется заголовок статьи)"
                  className={formData.seoTitle.length > 70 ? 'border-red-500 focus:border-red-500' : ''}
                />
                <p className={`text-xs mt-1 ${formData.seoTitle.length > 70 ? 'text-red-500' : 'text-muted'}`}>
                  {formData.seoTitle.length}/70 символов
                  {formData.seoTitle.length > 70 && ' — слишком длинный заголовок'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  SEO Description
                </label>
                <Textarea
                  value={formData.seoDescription}
                  onChange={(e) => setFormData({ ...formData, seoDescription: e.target.value })}
                  placeholder="Meta description (150-160 символов)"
                  rows={3}
                  className={formData.seoDescription.length > 160 ? 'border-red-500 focus:border-red-500' : ''}
                />
                <p className={`text-xs mt-1 ${formData.seoDescription.length > 160 ? 'text-red-500' : 'text-muted'}`}>
                  {formData.seoDescription.length}/160 символов
                  {formData.seoDescription.length > 160 && ' — слишком длинное описание'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  SEO Keywords
                </label>
                <Input
                  type="text"
                  value={formData.seoKeywords}
                  onChange={(e) => setFormData({ ...formData, seoKeywords: e.target.value })}
                  placeholder="ключевые, слова, через, запятую"
                />
              </div>
            </Card>
          )}

          {/* FAQ Tab */}
          {activeTab === 'faq' && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">FAQ секция</h3>
                <Button onClick={handleAddFaq} size="sm">
                  <Plus size={16} className="mr-1" />
                  Добавить вопрос
                </Button>
              </div>
              {formData.faq.length === 0 ? (
                <p className="text-muted text-center py-8">
                  FAQ не добавлены. Нажмите "Добавить вопрос" для создания.
                </p>
              ) : (
                <div className="space-y-4">
                  {formData.faq.map((item, index) => (
                    <div key={index} className="p-4 bg-dark rounded-lg space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <Input
                            type="text"
                            value={item.question}
                            onChange={(e) => handleFaqChange(index, 'question', e.target.value)}
                            placeholder="Вопрос"
                          />
                        </div>
                        <button
                          onClick={() => handleRemoveFaq(index)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-dark-lighter rounded-lg transition-colors"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      <Textarea
                        value={item.answer}
                        onChange={(e) => handleFaqChange(index, 'answer', e.target.value)}
                        placeholder="Ответ"
                        rows={3}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Cover Image */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Обложка</h3>
            {formData.coverImage ? (
              <div className="space-y-4">
                <img
                  src={formData.coverImage}
                  alt="Cover"
                  className="w-full aspect-video object-cover rounded-lg"
                />
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowCoverPicker(true)}
                    className="flex-1"
                  >
                    <ImagePlus size={16} className="mr-1" />
                    Изменить
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setFormData({ ...formData, coverImage: '', coverImageAlt: '' })}
                  >
                    <X size={16} />
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowCoverPicker(true)}
                className="w-full border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors"
              >
                <Image size={32} className="mx-auto text-muted mb-2" />
                <p className="text-muted text-sm">Нажмите для загрузки</p>
              </button>
            )}
            {formData.coverImage && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Alt текст
                </label>
                <Input
                  type="text"
                  value={formData.coverImageAlt}
                  onChange={(e) => setFormData({ ...formData, coverImageAlt: e.target.value })}
                  placeholder="Описание изображения"
                />
              </div>
            )}
          </Card>

          {/* Category */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Категория</h3>
            <select
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
              className="w-full h-10 bg-dark border border-border rounded-lg px-3 text-white focus:outline-none focus:border-primary"
            >
              <option value="">Без категории</option>
              {categories.map((cat) => (
                <option key={cat._id} value={cat._id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </Card>

          {/* Tags */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Теги</h3>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <button
                  key={tag._id}
                  onClick={() => handleTagToggle(tag._id)}
                  className={`px-3 py-1 text-sm rounded-full transition-colors ${
                    formData.tagIds.includes(tag._id)
                      ? 'bg-primary text-white'
                      : 'bg-dark text-muted hover:text-white'
                  }`}
                >
                  {tag.name}
                </button>
              ))}
              {tags.length === 0 && (
                <p className="text-muted text-sm">Теги не созданы</p>
              )}
            </div>
          </Card>

          {/* Publish Options */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-white mb-4">Публикация</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Статус
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'draft' | 'published' })}
                  className="w-full h-10 bg-dark border border-border rounded-lg px-3 text-white focus:outline-none focus:border-primary"
                >
                  <option value="draft">Черновик</option>
                  <option value="published">Опубликована</option>
                </select>
              </div>
              {/* Показываем чекбокс уведомлений только для новых статей при публикации */}
              {isNew && formData.status === 'published' && (
                <div className="pt-2 border-t border-border">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.notifySubscribers}
                      onChange={(e) => setFormData({ ...formData, notifySubscribers: e.target.checked })}
                      className="w-5 h-5 mt-0.5 rounded border-border text-primary focus:ring-primary"
                    />
                    <div>
                      <span className="text-sm text-white font-medium flex items-center gap-2">
                        📢 Уведомить пользователей бота
                      </span>
                      <p className="text-xs text-muted mt-1">
                        Отправит уведомление всем активным пользователям бота о новой публикации
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

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
