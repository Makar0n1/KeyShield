import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useManagerAuthStore } from '@/stores/managerAuthStore'
import { Button, Input } from '@/components/ui'
import { SEO } from '@/components/SEO'
import { Eye, EyeOff, Lock, User } from 'lucide-react'

export function ManagerLoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { login, isLoading, error, clearError } = useManagerAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()
    const ok = await login(username, password)
    if (ok) navigate('/manager/disputes')
  }

  return (
    <>
      <SEO title="Кабинет менеджера" noindex />
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">⚖️ KeyShield</h1>
            <p className="text-muted">Кабинет менеджера</p>
          </div>

          <div className="bg-dark-light rounded-xl border border-border p-8">
            <h2 className="text-xl font-semibold text-white mb-6">Вход для менеджера</h2>

            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Логин</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
                  <Input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Введите логин"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Пароль</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <><span className="animate-spin mr-2">⏳</span>Вход...</> : 'Войти'}
              </Button>
            </form>
          </div>

          <div className="mt-6 text-center text-xs text-muted">
            Менеджер видит только споры. Личные данные сторон скрыты.
          </div>
        </div>
      </div>
    </>
  )
}
