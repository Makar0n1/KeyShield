import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
import { SEO } from '@/components/SEO'
import { Input } from '@/components/ui'
import { Eye, EyeOff } from 'lucide-react'

export function PartnerLoginPage() {
  const navigate = useNavigate()
  const { login } = usePartnerAuth()
  const [formData, setFormData] = useState({ login: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.login.trim() || !formData.password.trim()) {
      setError('Заполните все поля')
      return
    }

    setLoading(true)
    try {
      await login(formData.login.trim(), formData.password)
      navigate('/partner')
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Неверный логин или пароль')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <SEO title="Partner — KeyShield" noindex={true} />
      <div className="min-h-screen bg-dark flex items-center justify-center p-4">
        <div className="w-full max-w-xs">
          {/* Header */}
          <div className="mb-10 text-center">
            <h1 className="text-2xl font-extralight text-white tracking-tight mb-1">KeyShield</h1>
            <p className="text-xs uppercase tracking-widest text-gray-500">Partner</p>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400 text-center mb-5">{error}</p>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-2">
                Логин
              </label>
              <Input
                type="text"
                value={formData.login}
                onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                placeholder="Введите логин"
                autoComplete="username"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-widest text-gray-500 mb-2">
                Пароль
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Введите пароль"
                  className="pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-white text-black text-sm font-medium rounded-full hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full" />
                  Вход
                </span>
              ) : (
                'Войти'
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-[11px] text-gray-600">
            Для получения доступа свяжитесь с администрацией
          </p>
        </div>
      </div>
    </>
  )
}
