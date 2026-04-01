import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
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
  const navigate = useNavigate()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/partner/login')
  }

  return (
    <>
      <SEO title="Partner Cabinet" noindex={true} />
      <div className="min-h-screen bg-dark">

        {/* Desktop Sidebar — hidden on mobile */}
        <aside className="fixed top-0 left-0 z-50 h-full w-64 bg-dark-lighter border-r border-border hidden lg:block">
          {/* Logo */}
          <div className="h-16 flex items-center px-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Shield className="w-8 h-8 text-primary" />
              <div>
                <span className="font-bold text-white">Partner</span>
                <p className="text-xs text-muted truncate max-w-[140px]">
                  {platform?.name || 'Cabinet'}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="p-4 space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === '/partner'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-white'
                      : 'text-gray-300 hover:bg-dark-light hover:text-white'
                  }`
                }
              >
                <item.icon size={20} />
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* Platform Info */}
          {platform && (
            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border">
              <div className="bg-dark rounded-lg p-3">
                <p className="text-xs text-muted mb-1">Код партнёра</p>
                <p className="font-mono text-primary font-medium">{platform.code}</p>
                <p className="text-xs text-muted mt-2">
                  Комиссия: {platform.commissionPercent}%
                </p>
              </div>
            </div>
          )}
        </aside>

        {/* Main content */}
        <div className="lg:pl-64">
          {/* Top header */}
          <header className="sticky top-0 z-30 h-14 lg:h-16 bg-dark-lighter border-b border-border">
            <div className="h-full px-4 flex items-center justify-between">
              {/* Mobile logo */}
              <div className="flex items-center gap-2 lg:hidden">
                <Shield className="w-6 h-6 text-primary" />
                <span className="font-bold text-white text-sm">{platform?.name || 'Partner'}</span>
              </div>

              {/* Desktop spacer */}
              <div className="hidden lg:block" />

              {/* Right side — profile dropdown */}
              <div className="ml-auto relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg text-gray-300 hover:bg-dark-light transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">
                    {platform?.name?.charAt(0).toUpperCase() || 'P'}
                  </div>
                  <span className="hidden sm:block text-sm">{platform?.name || 'Partner'}</span>
                  <ChevronDown size={16} />
                </button>

                {dropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setDropdownOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-48 bg-dark-lighter border border-border rounded-lg shadow-lg z-50">
                      <NavLink
                        to="/partner/settings"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-dark-light rounded-t-lg"
                      >
                        <Settings size={16} />
                        Настройки
                      </NavLink>
                      <button
                        onClick={() => {
                          setDropdownOpen(false)
                          handleLogout()
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-dark-light rounded-b-lg"
                      >
                        <LogOut size={16} />
                        Выйти
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* Page content — extra bottom padding on mobile for tab bar */}
          <main className="p-4 lg:p-6 pb-24 lg:pb-6">
            <Outlet />
          </main>
        </div>

        {/* Mobile Tab Bar — fixed bottom, hidden on desktop */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-dark-lighter border-t border-border lg:hidden safe-bottom">
          <div className="flex items-center justify-around h-16">
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === '/partner'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                    isActive
                      ? 'text-primary'
                      : 'text-gray-500 active:text-gray-300'
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
