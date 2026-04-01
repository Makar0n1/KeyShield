import { useState } from 'react'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
import { partnerService } from '@/services/partner'
import { Button, Input } from '@/components/ui'
import { Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react'

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
      setError('Минимум 6 символов')
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
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-medium text-white">Настройки</h1>
      </div>

      {/* Profile info */}
      <div className="mb-10">
        <h2 className="text-[11px] uppercase tracking-widest text-gray-500 mb-4">Аккаунт</h2>
        <div className="divide-y divide-white/[0.06]">
          <div className="flex items-center justify-between py-3.5">
            <span className="text-sm text-gray-400">Название</span>
            <span className="text-sm text-white">{platform?.name}</span>
          </div>
          <div className="flex items-center justify-between py-3.5">
            <span className="text-sm text-gray-400">Код</span>
            <span className="text-sm text-primary font-mono">{platform?.code}</span>
          </div>
          <div className="flex items-center justify-between py-3.5">
            <span className="text-sm text-gray-400">Логин</span>
            <span className="text-sm text-white">{platform?.login}</span>
          </div>
          <div className="flex items-center justify-between py-3.5">
            <span className="text-sm text-gray-400">Комиссия</span>
            <span className="text-sm text-white">{platform?.commissionPercent || 0}%</span>
          </div>
          <div className="flex items-center justify-between py-3.5">
            <span className="text-sm text-gray-400">Telegram канал</span>
            <span className="text-sm text-white">{platform?.telegramChannel || '—'}</span>
          </div>
          <div className="flex items-center justify-between py-3.5">
            <span className="text-sm text-gray-400">Статус</span>
            <span className={`text-sm ${platform?.isActive ? 'text-green-400' : 'text-red-400'}`}>
              {platform?.isActive ? 'Активен' : 'Неактивен'}
            </span>
          </div>
        </div>
      </div>

      {/* Stats */}
      {platform?.stats && (
        <div className="mb-10">
          <h2 className="text-[11px] uppercase tracking-widest text-gray-500 mb-4">Статистика</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-4">
            <div>
              <p className="text-2xl font-light text-white">{platform.stats.totalUsers}</p>
              <p className="text-xs text-gray-500">Пользователей</p>
            </div>
            <div>
              <p className="text-2xl font-light text-white">{platform.stats.totalDeals}</p>
              <p className="text-xs text-gray-500">Сделок</p>
            </div>
            <div>
              <p className="text-2xl font-light text-white">{platform.stats.totalVolume?.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Оборот (USDT)</p>
            </div>
            <div>
              <p className="text-2xl font-light text-primary">{platform.stats.totalCommission?.toLocaleString()}</p>
              <p className="text-xs text-gray-500">Комиссия (USDT)</p>
            </div>
          </div>
        </div>
      )}

      {/* Change password */}
      <div className="border-t border-white/[0.06] pt-8">
        <h2 className="text-[11px] uppercase tracking-widest text-gray-500 mb-5">Смена пароля</h2>

        {success && (
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 size={14} className="text-green-400" />
            <p className="text-sm text-green-400">Пароль изменён</p>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle size={14} className="text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
          {(['current', 'new', 'confirm'] as const).map((field) => (
            <div key={field}>
              <label className="block text-xs text-gray-500 mb-1.5">
                {field === 'current' ? 'Текущий пароль' : field === 'new' ? 'Новый пароль' : 'Подтверждение'}
              </label>
              <div className="relative">
                <Input
                  type={showPasswords[field] ? 'text' : 'password'}
                  value={passwords[field]}
                  onChange={(e) => setPasswords({ ...passwords, [field]: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => togglePassword(field)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                >
                  {showPasswords[field] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          ))}

          <Button type="submit" disabled={loading} className="px-6">
            {loading ? 'Сохранение...' : 'Сменить пароль'}
          </Button>
        </form>
      </div>
    </div>
  )
}
