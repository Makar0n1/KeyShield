import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
import { usePartnerTheme } from '@/contexts/PartnerThemeContext'
import { SEO } from '@/components/SEO'
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  LogOut,
  Shield,
  ChevronDown,
  Wallet,
  Sun,
  Moon,
} from 'lucide-react'

const navigation = [
  { name: 'Дашборд', shortName: 'Главная', href: '/partner', icon: LayoutDashboard },
  { name: 'Пользователи', shortName: 'Юзеры', href: '/partner/users', icon: Users },
  { name: 'Сделки', shortName: 'Сделки', href: '/partner/deals', icon: FileText },
  { name: 'Вывод средств', shortName: 'Вывод', href: '/partner/withdrawals', icon: Wallet },
  { name: 'Настройки', shortName: 'Ещё', href: '/partner/settings', icon: Settings },
]

export function PartnerLayout() {
  const { platform, logout } = usePartnerAuth()
  const { toggle, isDark } = usePartnerTheme()
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/partner/login')
  }

  return (
    <>
      <SEO title="Partner Cabinet" noindex={true} />
      <div className="min-h-screen" style={{ background: 'var(--p-bg)', color: 'var(--p-text)' }}>

        {/* Desktop Sidebar */}
        <aside
          className="fixed top-0 left-0 z-50 h-full w-64 hidden lg:flex lg:flex-col"
          style={{ background: 'var(--p-chrome-bg)', borderRight: '1px solid var(--p-chrome-border)' }}
        >
          <div className="h-16 flex items-center px-5" style={{ borderBottom: '1px solid var(--p-chrome-border)' }}>
            <div className="flex items-center gap-2.5">
              <Shield className="w-7 h-7 text-primary" />
              <div>
                <span className="font-semibold text-sm" style={{ color: 'var(--p-chrome-text)' }}>KeyShield</span>
                <p className="text-[11px] truncate max-w-[140px]" style={{ color: 'var(--p-chrome-text-muted)' }}>
                  {platform?.name || 'Partner'}
                </p>
              </div>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-0.5">
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === '/partner'}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                style={({ isActive }) => ({
                  background: isActive ? 'var(--p-chrome-active)' : 'transparent',
                  color: isActive ? '#ffffff' : 'var(--p-chrome-text)',
                  fontWeight: isActive ? 500 : 400,
                })}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.classList.contains('active'))
                    e.currentTarget.style.background = 'var(--p-chrome-hover)'
                }}
                onMouseLeave={(e) => {
                  const isActive = e.currentTarget.getAttribute('aria-current') === 'page'
                  if (!isActive) e.currentTarget.style.background = 'transparent'
                }}
              >
                <item.icon size={18} />
                {item.name}
              </NavLink>
            ))}
          </nav>

          <div className="p-4" style={{ borderTop: '1px solid var(--p-chrome-border)' }}>
            <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--p-chrome-text-muted)' }}>
              <span className="font-mono">{platform?.code}</span>
              <span>{platform?.commissionPercent}%</span>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="lg:pl-64">
          <header
            className="sticky top-0 z-30 h-14 lg:h-16"
            style={{ background: 'var(--p-chrome-bg)', borderBottom: '1px solid var(--p-chrome-border)' }}
          >
            <div className="h-full px-4 flex items-center justify-between">
              <div className="flex items-center gap-2 lg:hidden">
                <Shield className="w-5 h-5 text-primary" />
                <span className="font-semibold text-sm" style={{ color: 'var(--p-chrome-text)' }}>{platform?.name || 'Partner'}</span>
              </div>
              <div className="hidden lg:block" />

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={toggle}
                  className="p-2 rounded-lg transition-colors"
                  style={{ color: 'var(--p-chrome-text-muted)' }}
                  title={isDark ? 'Светлая тема' : 'Тёмная тема'}
                >
                  {isDark ? <Sun size={18} /> : <Moon size={18} />}
                </button>

                <div className="relative">
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors"
                    style={{ color: 'var(--p-chrome-text)' }}
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                      {platform?.name?.charAt(0).toUpperCase() || 'P'}
                    </div>
                    <span className="hidden sm:block text-sm">{platform?.name}</span>
                    <ChevronDown size={14} style={{ color: 'var(--p-chrome-text-muted)' }} />
                  </button>

                  {dropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                      <div
                        className="absolute right-0 mt-2 w-48 rounded-lg shadow-xl z-50 overflow-hidden"
                        style={{ background: 'var(--p-chrome-bg)', border: '1px solid var(--p-chrome-border)' }}
                      >
                        <NavLink
                          to="/partner/settings"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm transition-colors"
                          style={{ color: 'var(--p-text-secondary)' }}
                        >
                          <Settings size={15} />
                          Настройки
                        </NavLink>
                        <button
                          onClick={() => { setDropdownOpen(false); handleLogout() }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 transition-colors"
                        >
                          <LogOut size={15} />
                          Выйти
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </header>

          <main className="p-4 lg:p-6 pb-24 lg:pb-6">
            <Outlet />
          </main>
        </div>

        {/* Mobile Tab Bar */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 lg:hidden safe-bottom"
          style={{ background: 'var(--p-chrome-bg)', borderTop: '1px solid var(--p-chrome-border)' }}
        >
          <div className="flex items-center justify-around h-16">
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === '/partner'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                    isActive ? 'text-primary' : ''
                  }`
                }
                style={({ isActive }) => ({
                  color: isActive ? undefined : 'var(--p-chrome-text-muted)',
                })}
              >
                {({ isActive }) => (
                  <>
                    <item.icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                    <span className="text-[10px] font-medium leading-tight">{item.shortName}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </>
  )
}
