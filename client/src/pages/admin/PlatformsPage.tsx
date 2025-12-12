import { useState, useEffect } from 'react'
import { adminService } from '@/services/admin'
import type { Platform } from '@/types'
import { Card, Button, Input } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDateShort, formatNumber } from '@/utils/format'
import {
  Plus,
  Edit,
  Trash2,
  Power,
  Copy,
  ExternalLink,
  Building2,
  Users,
  FileText,
  DollarSign,
  Zap,
  Wallet,
  Percent,
} from 'lucide-react'

interface PlatformFormData {
  name: string
  telegramChannel: string
  login: string
  password: string
  commissionPercent: number
}

const initialFormData: PlatformFormData = {
  name: '',
  telegramChannel: '',
  login: '',
  password: '',
  commissionPercent: 10,
}

export function AdminPlatformsPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null)
  const [formData, setFormData] = useState<PlatformFormData>(initialFormData)
  const [submitting, setSubmitting] = useState(false)

  const fetchPlatforms = () => {
    setLoading(true)
    adminService
      .getPlatforms()
      .then(setPlatforms)
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchPlatforms()
  }, [])

  const handleOpenForm = (platform?: Platform) => {
    if (platform) {
      setEditingPlatform(platform)
      setFormData({
        name: platform.name,
        telegramChannel: platform.telegramChannel || '',
        login: platform.login,
        password: '',
        commissionPercent: platform.commissionPercent,
      })
    } else {
      setEditingPlatform(null)
      setFormData(initialFormData)
    }
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    setEditingPlatform(null)
    setFormData(initialFormData)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (editingPlatform) {
        await adminService.updatePlatform(editingPlatform._id, {
          name: formData.name,
          telegramChannel: formData.telegramChannel,
          login: formData.login,
          ...(formData.password && { password: formData.password }),
          commissionPercent: formData.commissionPercent,
        })
      } else {
        await adminService.createPlatform({
          name: formData.name,
          telegramChannel: formData.telegramChannel,
          login: formData.login,
          password: formData.password,
          commissionPercent: formData.commissionPercent,
        })
      }
      handleCloseForm()
      fetchPlatforms()
    } catch (error) {
      console.error('Save error:', error)
      alert('Ошибка сохранения')
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggle = async (platform: Platform) => {
    try {
      await adminService.togglePlatformStatus(platform._id)
      fetchPlatforms()
    } catch (error) {
      console.error('Toggle error:', error)
    }
  }

  const handleDelete = async (platform: Platform) => {
    if (!confirm(`Удалить платформу "${platform.name}"?`)) return
    try {
      await adminService.deletePlatform(platform._id)
      fetchPlatforms()
    } catch (error) {
      console.error('Delete error:', error)
      alert('Ошибка удаления')
    }
  }

  const handleCopyCode = async (code: string) => {
    await navigator.clipboard.writeText(code)
  }

  const handleCopyLink = async (code: string) => {
    const link = `https://t.me/keyshield_bot?start=ref_${code}`
    await navigator.clipboard.writeText(link)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Платформы</h1>
          <p className="text-muted">Управление партнёрскими платформами</p>
        </div>
        <Button onClick={() => handleOpenForm()}>
          <Plus size={18} className="mr-2" />
          Добавить платформу
        </Button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg p-6">
            <h2 className="text-xl font-semibold text-white mb-6">
              {editingPlatform ? 'Редактировать платформу' : 'Новая платформа'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Название
                </label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Название платформы"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Telegram канал
                </label>
                <Input
                  type="text"
                  value={formData.telegramChannel}
                  onChange={(e) => setFormData({ ...formData, telegramChannel: e.target.value })}
                  placeholder="@channel или https://t.me/channel"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Логин
                  </label>
                  <Input
                    type="text"
                    value={formData.login}
                    onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                    placeholder="Логин для входа"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    {editingPlatform ? 'Новый пароль' : 'Пароль'}
                  </label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={editingPlatform ? 'Оставьте пустым' : 'Пароль'}
                    required={!editingPlatform}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Комиссия (% от чистой прибыли)
                </label>
                <Input
                  type="number"
                  value={formData.commissionPercent}
                  onChange={(e) => setFormData({ ...formData, commissionPercent: parseInt(e.target.value) })}
                  min={0}
                  max={100}
                  required
                />
              </div>
              <div className="flex gap-3 pt-4">
                <Button type="button" variant="secondary" onClick={handleCloseForm} className="flex-1">
                  Отмена
                </Button>
                <Button type="submit" disabled={submitting} className="flex-1">
                  {submitting ? 'Сохранение...' : 'Сохранить'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Platforms Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : platforms.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 size={48} className="mx-auto text-muted mb-4" />
          <p className="text-muted">Платформы не найдены</p>
          <Button onClick={() => handleOpenForm()} className="mt-4">
            Создать первую платформу
          </Button>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {platforms.map((platform) => (
            <Card key={platform._id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{platform.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-sm text-primary">{platform.code}</span>
                    <button
                      onClick={() => handleCopyCode(platform.code)}
                      className="text-muted hover:text-white transition-colors"
                      title="Копировать код"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
                <Badge variant={platform.isActive ? 'success' : 'destructive'}>
                  {platform.isActive ? 'Активна' : 'Отключена'}
                </Badge>
              </div>

              {/* Stats */}
              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Users size={14} className="text-muted" />
                    <span className="text-gray-300">{formatNumber(platform.stats.totalUsers)} юзеров</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-muted" />
                    <span className="text-gray-300">{formatNumber(platform.stats.totalDeals)} сделок</span>
                  </div>
                </div>

                {/* Financial Stats */}
                <div className="bg-dark rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted flex items-center gap-1">
                      <DollarSign size={12} />
                      Объём:
                    </span>
                    <span className="text-white">{formatCurrency(platform.stats.totalVolume)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted flex items-center gap-1">
                      <DollarSign size={12} />
                      Комиссии:
                    </span>
                    <span className="text-green-400">{formatCurrency(platform.stats.totalCommission)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted flex items-center gap-1">
                      <Zap size={12} />
                      Расходы TRX:
                    </span>
                    <span className="text-red-400">
                      {(platform.stats.totalTrxSpent || 0).toFixed(1)} TRX
                      <span className="text-xs text-gray-500 ml-1">
                        (≈{formatCurrency(platform.stats.totalTrxSpentUsdt || 0)})
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2">
                    <span className="text-white font-medium flex items-center gap-1">
                      <Wallet size={12} />
                      Чистая:
                    </span>
                    <span className={`font-medium ${(platform.stats.netProfit || 0) >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                      {formatCurrency(platform.stats.netProfit || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between bg-orange-500/10 rounded p-2 -mx-1">
                    <span className="text-orange-300 flex items-center gap-1">
                      <Percent size={12} />
                      К выплате ({platform.commissionPercent}%):
                    </span>
                    <span className="text-orange-400 font-bold">
                      {formatCurrency(platform.stats.platformEarnings || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Info */}
              <div className="text-sm text-muted mb-4 space-y-1">
                {platform.telegramChannel && (
                  <a
                    href={platform.telegramChannel.startsWith('http') ? platform.telegramChannel : `https://t.me/${platform.telegramChannel.replace('@', '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    {platform.telegramChannel}
                    <ExternalLink size={12} />
                  </a>
                )}
                <p>Создана: {formatDateShort(platform.createdAt)}</p>
              </div>

              {/* Referral Link */}
              <div className="mb-4">
                <button
                  onClick={() => handleCopyLink(platform.code)}
                  className="w-full text-left p-3 bg-dark rounded-lg text-sm font-mono text-gray-300 hover:bg-dark-lighter transition-colors truncate"
                  title="Копировать реферальную ссылку"
                >
                  t.me/keyshield_bot?start=ref_{platform.code}
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleOpenForm(platform)}
                  className="flex-1"
                >
                  <Edit size={16} className="mr-1" />
                  Изменить
                </Button>
                <Button
                  variant={platform.isActive ? 'destructive' : 'success'}
                  size="sm"
                  onClick={() => handleToggle(platform)}
                >
                  <Power size={16} />
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(platform)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
