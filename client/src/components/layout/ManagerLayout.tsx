import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useManagerAuthStore } from '@/stores/managerAuthStore'
import { cn } from '@/utils/cn'
import { SEO } from '@/components/SEO'
import { Scale, MessageSquare, LogOut, Menu, X } from 'lucide-react'

const navItems = [
  { path: '/manager/disputes', icon: Scale, label: 'Споры' },
  { path: '/manager/dispute-chats', icon: MessageSquare, label: 'Чаты споров' },
]

export function ManagerLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { manager, logout, verifyAuth, isAuthenticated } = useManagerAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    verifyAuth().then((valid) => {
      if (!valid) navigate('/manager/login')
    })
  }, [verifyAuth, navigate])

  const handleLogout = () => {
    logout()
    navigate('/manager/login')
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <SEO title="Кабинет менеджера" noindex={true} />

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-dark-light border-b border-border z-50 flex items-center px-4">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-white p-2 hover:bg-dark-lighter rounded-lg"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <span className="ml-4 text-white font-semibold">KeyShield · Менеджер</span>
      </header>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-64 bg-dark-light border-r border-border z-50 transform transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="h-16 flex items-center px-6 border-b border-border">
          <span className="text-xl font-bold text-white">⚖️ Менеджер</span>
        </div>

        <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-8rem)]">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-primary text-white'
                    : 'text-gray-400 hover:text-white hover:bg-dark-lighter'
                )
              }
              onClick={() => setSidebarOpen(false)}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium shrink-0">
                {manager?.username?.[0]?.toUpperCase() || 'M'}
              </div>
              <span className="text-sm text-white truncate">
                {manager?.displayName || manager?.username || 'Менеджер'}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-red-400 p-2 rounded-lg hover:bg-dark-lighter transition-colors"
              title="Выйти"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
