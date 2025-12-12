import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
import { SEO } from '@/components/SEO'
import { Card, Button, Input } from '@/components/ui'
import { Shield, Eye, EyeOff } from 'lucide-react'

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
      <SEO title="Вход в кабинет партнёра" noindex={true} />
      <div className="min-h-screen bg-dark flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/20 text-primary mb-4">
            <Shield size={32} />
          </div>
          <h1 className="text-2xl font-bold text-white">Кабинет партнёра</h1>
          <p className="text-muted mt-2">Войдите в свой аккаунт</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm text-center">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Логин
            </label>
            <Input
              type="text"
              value={formData.login}
              onChange={(e) => setFormData({ ...formData, login: e.target.value })}
              placeholder="Введите логин"
              autoComplete="username"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Вход...
              </span>
            ) : (
              'Войти'
            )}
          </Button>
        </form>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-muted">
          Для получения доступа свяжитесь с администрацией
        </p>
      </Card>
    </div>
    </>
  )
}
