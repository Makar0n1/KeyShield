import { useState, useEffect } from 'react'
import { blogAdminService } from '@/services/blog'
import { Card, Button, Input } from '@/components/ui'
import { Settings, Save, Check } from 'lucide-react'

interface BlogSettings {
  siteTitle: string
  siteDescription: string
  postsPerPage: number
  allowComments: boolean
  moderateComments: boolean
}

export function BlogSettingsPage() {
  const [settings, setSettings] = useState<BlogSettings>({
    siteTitle: '',
    siteDescription: '',
    postsPerPage: 10,
    allowComments: true,
    moderateComments: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    blogAdminService
      .getSettings()
      .then((data) => {
        if (data) {
          setSettings(data)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setSaving(true)

    try {
      await blogAdminService.updateSettings(settings)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Ошибка сохранения')
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
      <div>
        <h1 className="text-2xl font-bold text-white">Настройки блога</h1>
        <p className="text-muted">Основные настройки блога</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="p-6 space-y-6">
          {/* Success message */}
          {success && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
              <Check className="text-green-400" size={18} />
              <p className="text-green-400 text-sm">Настройки сохранены</p>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Site Info */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Settings size={20} />
              Основные настройки
            </h2>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Название блога
              </label>
              <Input
                type="text"
                value={settings.siteTitle}
                onChange={(e) => setSettings({ ...settings, siteTitle: e.target.value })}
                placeholder="Например: Блог KeyShield"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Описание
              </label>
              <textarea
                value={settings.siteDescription}
                onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
                placeholder="Краткое описание блога для SEO"
                rows={3}
                className="w-full bg-dark border border-border rounded-lg px-4 py-2 text-white placeholder-muted focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Статей на странице
              </label>
              <Input
                type="number"
                min={1}
                max={50}
                value={settings.postsPerPage}
                onChange={(e) =>
                  setSettings({ ...settings, postsPerPage: parseInt(e.target.value) || 10 })
                }
              />
            </div>
          </div>

          {/* Comments Settings */}
          <div className="space-y-4 pt-4 border-t border-border">
            <h2 className="text-lg font-semibold text-white">Комментарии</h2>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.allowComments}
                onChange={(e) => setSettings({ ...settings, allowComments: e.target.checked })}
                className="w-5 h-5 rounded border-border bg-dark text-primary focus:ring-primary focus:ring-offset-dark"
              />
              <span className="text-gray-300">Разрешить комментарии</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.moderateComments}
                onChange={(e) => setSettings({ ...settings, moderateComments: e.target.checked })}
                className="w-5 h-5 rounded border-border bg-dark text-primary focus:ring-primary focus:ring-offset-dark"
              />
              <span className="text-gray-300">Модерация комментариев перед публикацией</span>
            </label>
          </div>

          {/* Submit */}
          <div className="pt-4 border-t border-border">
            <Button type="submit" disabled={saving}>
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Сохранение...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Save size={18} />
                  Сохранить
                </span>
              )}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
