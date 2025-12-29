import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/utils/cn'
import { SEO } from '@/components/SEO'
import {
  LayoutDashboard,
  FileText,
  Users,
  Scale,
  Download,
  Activity,
  Building2,
  Globe,
  BookOpen,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Gift,
} from 'lucide-react'

const mainNavItems = [
  { path: '/admin', icon: LayoutDashboard, label: 'Дашборд', exact: true },
  { path: '/admin/deals', icon: FileText, label: 'Сделки' },
  { path: '/admin/users', icon: Users, label: 'Пользователи' },
  { path: '/admin/disputes', icon: Scale, label: 'Споры' },
  { path: '/admin/referrals', icon: Gift, label: 'Рефералы' },
  { path: '/admin/exports', icon: Download, label: 'Экспорт' },
  { path: '/admin/transactions', icon: Activity, label: 'Транзакции' },
  { path: '/admin/platforms', icon: Building2, label: 'Платформы' },
  { path: '/admin/ip-check', icon: Globe, label: 'IP Check' },
]

const blogNavItems = [
  { path: '/admin/blog', icon: BookOpen, label: 'Статьи', exact: true },
  { path: '/admin/blog/categories', icon: FileText, label: 'Категории' },
  { path: '/admin/blog/tags', icon: FileText, label: 'Теги' },
  { path: '/admin/blog/media', icon: FileText, label: 'Медиа' },
  { path: '/admin/blog/comments', icon: FileText, label: 'Комментарии' },
  { path: '/admin/blog/settings', icon: FileText, label: 'Настройки' },
]

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [blogExpanded, setBlogExpanded] = useState(false)
  const { admin, logout, verifyAuth, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    verifyAuth().then((valid) => {
      if (!valid) {
        navigate('/admin/login')
      }
    })
  }, [verifyAuth, navigate])

  useEffect(() => {
    // Expand blog section if on blog route
    if (location.pathname.startsWith('/admin/blog')) {
      setBlogExpanded(true)
    }
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    navigate('/admin/login')
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
      {/* Always noindex admin pages - never index regardless of global setting */}
      <SEO title="Admin Panel" noindex={true} />

      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-dark-light border-b border-border z-50 flex items-center px-4">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-white p-2 hover:bg-dark-lighter rounded-lg"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <span className="ml-4 text-white font-semibold">KeyShield Admin</span>
      </header>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-64 bg-dark-light border-r border-border z-50 transform transition-transform lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-border">
          <span className="text-xl font-bold text-white">🔐 KeyShield</span>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto h-[calc(100vh-8rem)]">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
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

          {/* Blog section */}
          <div className="pt-4">
            <button
              onClick={() => setBlogExpanded(!blogExpanded)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-400 hover:text-white rounded-lg hover:bg-dark-lighter transition-colors"
            >
              <span className="flex items-center gap-3">
                <BookOpen size={18} />
                Блог
              </span>
              <ChevronDown
                size={16}
                className={cn('transition-transform', blogExpanded && 'rotate-180')}
              />
            </button>
            {blogExpanded && (
              <div className="ml-4 mt-1 space-y-1">
                {blogNavItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.exact}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-4 py-2 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-primary/20 text-primary'
                          : 'text-gray-400 hover:text-white hover:bg-dark-lighter'
                      )
                    }
                    onClick={() => setSidebarOpen(false)}
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* User section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-medium">
                {admin?.username?.[0]?.toUpperCase() || 'A'}
              </div>
              <span className="text-sm text-white">{admin?.username || 'Admin'}</span>
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

      {/* Main content */}
      <main className="lg:ml-64 pt-16 lg:pt-0 min-h-screen">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
