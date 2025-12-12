import { useState } from 'react'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
import { partnerService } from '@/services/partner'
import { Card, Button, Input } from '@/components/ui'
import { Settings, Key, Eye, EyeOff, Check } from 'lucide-react'

export function PartnerSettingsPage() {
  const { platform } = usePartnerAuth()
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: '',
  })
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (!passwords.current || !passwords.new || !passwords.confirm) {
      setError('Заполните все поля')
      return
    }

    if (passwords.new.length < 6) {
      setError('Новый пароль должен быть не менее 6 символов')
      return
    }

    if (passwords.new !== passwords.confirm) {
      setError('Пароли не совпадают')
      return
    }

    setLoading(true)
    try {
      await partnerService.updatePassword(passwords.current, passwords.new)
      setSuccess(true)
      setPasswords({ current: '', new: '', confirm: '' })
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Ошибка смены пароля')
    } finally {
      setLoading(false)
    }
  }

  const togglePassword = (field: 'current' | 'new' | 'confirm') => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Настройки</h1>
        <p className="text-muted">Управление аккаунтом партнёра</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Profile Info */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Settings size={20} />
            Информация
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-muted mb-1">Название</label>
              <p className="text-white font-medium">{platform?.name}</p>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Код партнёра</label>
              <p className="font-mono text-primary font-medium">{platform?.code}</p>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Логин</label>
              <p className="text-white">{platform?.login}</p>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Комиссия</label>
              <p className="text-white">{platform?.commissionPercent || 0}%</p>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Telegram канал</label>
              <p className="text-white">{platform?.telegramChannel || 'Не указан'}</p>
            </div>
            <div>
              <label className="block text-sm text-muted mb-1">Статус</label>
              <p className={platform?.isActive ? 'text-green-400' : 'text-red-400'}>
                {platform?.isActive ? 'Активен' : 'Неактивен'}
              </p>
            </div>
          </div>
        </Card>

        {/* Change Password */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Key size={20} />
            Смена пароля
          </h2>

          {success && (
            <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center gap-2">
              <Check className="text-green-400" size={18} />
              <p className="text-green-400 text-sm">Пароль успешно изменён</p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Текущий пароль
              </label>
              <div className="relative">
                <Input
                  type={showPasswords.current ? 'text' : 'password'}
                  value={passwords.current}
                  onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                  placeholder="Введите текущий пароль"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => togglePassword('current')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
                >
                  {showPasswords.current ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Новый пароль
              </label>
              <div className="relative">
                <Input
                  type={showPasswords.new ? 'text' : 'password'}
                  value={passwords.new}
                  onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                  placeholder="Введите новый пароль"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => togglePassword('new')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
                >
                  {showPasswords.new ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Подтверждение пароля
              </label>
              <div className="relative">
                <Input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={passwords.confirm}
                  onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                  placeholder="Повторите новый пароль"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => togglePassword('confirm')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
                >
                  {showPasswords.confirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Сохранение...
                </span>
              ) : (
                'Сменить пароль'
              )}
            </Button>
          </form>
        </Card>
      </div>

      {/* Statistics Summary */}
      {platform?.stats && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Статистика</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-dark rounded-lg text-center">
              <p className="text-2xl font-bold text-white">{platform.stats.totalUsers}</p>
              <p className="text-sm text-muted">Пользователей</p>
            </div>
            <div className="p-4 bg-dark rounded-lg text-center">
              <p className="text-2xl font-bold text-white">{platform.stats.totalDeals}</p>
              <p className="text-sm text-muted">Сделок</p>
            </div>
            <div className="p-4 bg-dark rounded-lg text-center">
              <p className="text-2xl font-bold text-white">
                {platform.stats.totalVolume.toLocaleString()}
              </p>
              <p className="text-sm text-muted">Оборот (USDT)</p>
            </div>
            <div className="p-4 bg-dark rounded-lg text-center">
              <p className="text-2xl font-bold text-primary">
                {platform.stats.totalCommission.toLocaleString()}
              </p>
              <p className="text-sm text-muted">Комиссия (USDT)</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
