import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
import { usePartnerTheme } from '@/contexts/PartnerThemeContext'
import { SEO } from '@/components/SEO'
import { Eye, EyeOff, Sun, Moon } from 'lucide-react'

export function PartnerLoginPage() {
  const navigate = useNavigate()
  const { login } = usePartnerAuth()
  const { toggle, isDark } = usePartnerTheme()
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
      <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ background: 'var(--p-bg)' }}>
        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="absolute top-4 right-4 p-2 rounded-lg transition-colors hover:opacity-70"
          style={{ color: 'var(--p-text-muted)' }}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="w-full max-w-xs">
          <div className="mb-10 text-center">
            <h1 className="text-2xl font-extralight tracking-tight mb-1" style={{ color: 'var(--p-text)' }}>KeyShield</h1>
            <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--p-text-muted)' }}>Partner</p>
          </div>

          {error && <p className="text-sm text-red-400 text-center mb-5">{error}</p>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--p-text-muted)' }}>Логин</label>
              <input
                type="text"
                value={formData.login}
                onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                placeholder="Введите логин"
                autoComplete="username"
                autoFocus
                className="w-full h-10 px-3 rounded-lg text-sm outline-none transition-colors focus:ring-1 focus:ring-primary"
                style={{ background: 'var(--p-input-bg)', border: '1px solid var(--p-input-border)', color: 'var(--p-text)' }}
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-widest mb-2" style={{ color: 'var(--p-text-muted)' }}>Пароль</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Введите пароль"
                  autoComplete="current-password"
                  className="w-full h-10 px-3 pr-10 rounded-lg text-sm outline-none transition-colors focus:ring-1 focus:ring-primary"
                  style={{ background: 'var(--p-input-bg)', border: '1px solid var(--p-input-border)', color: 'var(--p-text)' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors hover:opacity-70"
                  style={{ color: 'var(--p-text-muted)' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium rounded-full transition-colors disabled:opacity-50"
              style={{ background: 'var(--p-pill-active-bg)', color: 'var(--p-pill-active-text)' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full" />
                  Вход
                </span>
              ) : 'Войти'}
            </button>
          </form>

          <p className="mt-8 text-center text-[11px]" style={{ color: 'var(--p-text-faint)' }}>
            Для получения доступа свяжитесь с администрацией
          </p>
        </div>
      </div>
    </>
  )
}
