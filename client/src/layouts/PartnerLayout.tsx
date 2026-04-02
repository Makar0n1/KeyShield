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
          style={{ background: 'var(--p-chrome)', borderRight: '1px solid var(--p-chrome-border)' }}
        >
          {/* Logo */}
          <div className="h-16 flex items-center px-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
            <div className="flex items-center gap-2.5">
              <Shield className="w-7 h-7 text-white/90" />
              <div>
                <span className="font-semibold text-white text-sm">KeyShield</span>
                <p className="text-[11px] text-white/60 truncate max-w-[140px]">
                  {platform?.name || 'Partner'}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-0.5">
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === '/partner'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-white/20 text-white font-medium'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`
                }
              >
                <item.icon size={18} />
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* Bottom info */}
          <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            <div className="flex items-center justify-between text-[11px] text-white/50">
              <span className="font-mono">{platform?.code}</span>
              <span>{platform?.commissionPercent}%</span>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="lg:pl-64">
          {/* Top header */}
          <header
            className="sticky top-0 z-30 h-14 lg:h-16"
            style={{ background: 'var(--p-chrome)', borderBottom: '1px solid var(--p-chrome-border)' }}
          >
            <div className="h-full px-4 flex items-center justify-between">
              {/* Mobile logo */}
              <div className="flex items-center gap-2 lg:hidden">
                <Shield className="w-5 h-5 text-white/90" />
                <span className="font-semibold text-white text-sm">{platform?.name || 'Partner'}</span>
              </div>

              {/* Desktop spacer */}
              <div className="hidden lg:block" />

              {/* Right side */}
              <div className="ml-auto flex items-center gap-2">
                {/* Theme toggle */}
                <button
                  onClick={toggle}
                  className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  title={isDark ? 'Светлая тема' : 'Тёмная тема'}
                >
                  {isDark ? <Sun size={18} /> : <Moon size={18} />}
                </button>

                {/* Profile dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-white/20 text-white flex items-center justify-center text-xs font-bold">
                      {platform?.name?.charAt(0).toUpperCase() || 'P'}
                    </div>
                    <span className="hidden sm:block text-sm text-white/80">{platform?.name}</span>
                    <ChevronDown size={14} className="text-white/50" />
                  </button>

                  {dropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                      <div
                        className="absolute right-0 mt-2 w-48 rounded-lg shadow-xl z-50 overflow-hidden"
                        style={{ background: 'var(--p-bg)', border: '1px solid var(--p-divider)' }}
                      >
                        <NavLink
                          to="/partner/settings"
                          onClick={() => setDropdownOpen(false)}
                          className="flex items-center gap-2 px-4 py-2.5 text-sm hover:opacity-70 transition-opacity"
                          style={{ color: 'var(--p-text-secondary)' }}
                        >
                          <Settings size={15} />
                          Настройки
                        </NavLink>
                        <button
                          onClick={() => { setDropdownOpen(false); handleLogout() }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:opacity-70 transition-opacity"
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

          {/* Page content */}
          <main className="p-4 lg:p-6 pb-24 lg:pb-6">
            <Outlet />
          </main>
        </div>

        {/* Mobile Tab Bar */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-40 lg:hidden safe-bottom"
          style={{ background: 'var(--p-chrome)', borderTop: '1px solid var(--p-chrome-border)' }}
        >
          <div className="flex items-center justify-around h-16">
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === '/partner'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                    isActive ? 'text-white' : 'text-white/40 active:text-white/70'
                  }`
                }
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
