import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
import { partnerService, type PartnerDashboardData } from '@/services/partner'
import { Badge } from '@/components/ui/badge'
import { formatNumber, formatDate } from '@/utils/format'
import { ArrowRight, Copy, CheckCircle2 } from 'lucide-react'

const statusLabels: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  created: { label: 'Создана', variant: 'secondary' },
  waiting_for_seller_wallet: { label: 'Ожидание', variant: 'warning' },
  waiting_for_buyer_wallet: { label: 'Ожидание', variant: 'warning' },
  waiting_for_deposit: { label: 'Депозит', variant: 'warning' },
  locked: { label: 'Locked', variant: 'warning' },
  in_progress: { label: 'В работе', variant: 'success' },
  work_submitted: { label: 'Сдано', variant: 'success' },
  completed: { label: 'Завершена', variant: 'success' },
  dispute: { label: 'Спор', variant: 'destructive' },
  resolved: { label: 'Решена', variant: 'secondary' },
  expired: { label: 'Истекла', variant: 'destructive' },
  cancelled: { label: 'Отменена', variant: 'secondary' },
  refunded: { label: 'Возврат', variant: 'secondary' },
}

export function PartnerDashboardPage() {
  const { platform } = usePartnerAuth()
  const [data, setData] = useState<PartnerDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  const referralLink = data?.referralLink || ''

  const copyLink = () => {
    if (!referralLink) return
    navigator.clipboard.writeText(referralLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    partnerService.getDashboard().then(setData).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  const stats = data?.stats || { totalUsers: 0, totalDeals: 0, activeDeals: 0, completedDeals: 0, totalVolume: 0, totalCommission: 0 }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero */}
      <div className="mb-8 sm:mb-10">
        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--p-text-muted)' }}>Общий оборот</p>
        <h1 className="text-4xl sm:text-5xl font-extralight tracking-tight" style={{ color: 'var(--p-text)' }}>
          {formatNumber(stats.totalVolume)}
          <span className="text-lg sm:text-xl ml-2 font-normal" style={{ color: 'var(--p-text-muted)' }}>USDT</span>
        </h1>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 sm:gap-x-10 gap-y-6 mb-10">
        <div>
          <p className="text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--p-text-muted)' }}>Пользователи</p>
          <p className="text-2xl font-light" style={{ color: 'var(--p-text)' }}>{formatNumber(stats.totalUsers)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--p-text-muted)' }}>Сделки</p>
          <p className="text-2xl font-light" style={{ color: 'var(--p-text)' }}>
            {formatNumber(stats.totalDeals)}
            {stats.activeDeals > 0 && <span className="text-sm text-green-400 ml-1.5 font-normal">{stats.activeDeals} акт.</span>}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--p-text-muted)' }}>Комиссия</p>
          <p className="text-2xl font-light" style={{ color: 'var(--p-text)' }}>{formatNumber(stats.totalCommission)}<span className="text-sm ml-1" style={{ color: 'var(--p-text-muted)' }}>$</span></p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest mb-1" style={{ color: 'var(--p-text-muted)' }}>Ваша доля</p>
          <p className="text-2xl font-light text-primary">{platform?.commissionPercent || 0}%</p>
        </div>
      </div>

      {/* Referral link */}
      {referralLink && (
        <div className="mb-10" style={{ borderTop: '1px solid var(--p-divider)', paddingTop: '1.5rem' }}>
          <p className="text-[11px] uppercase tracking-widest mb-3" style={{ color: 'var(--p-text-muted)' }}>Реферальная ссылка</p>
          <div className="flex items-center gap-3">
            <p className="font-mono text-sm break-all flex-1 select-all" style={{ color: 'var(--p-text-secondary)' }}>{referralLink}</p>
            <button onClick={copyLink} className="shrink-0 transition-colors hover:opacity-70" style={{ color: 'var(--p-text-muted)' }}>
              {copied ? <CheckCircle2 size={18} className="text-green-400" /> : <Copy size={18} />}
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--p-text-faint)' }}>Пользователи по этой ссылке автоматически привяжутся к вашей платформе</p>
        </div>
      )}

      {/* Recent activity */}
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Deals */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--p-text-muted)' }}>Последние сделки</h2>
            <Link to="/partner/deals" className="text-xs flex items-center gap-1 hover:opacity-70 transition-opacity" style={{ color: 'var(--p-text-muted)' }}>
              Все <ArrowRight size={12} />
            </Link>
          </div>
          {data?.recentDeals && data.recentDeals.length > 0 ? (
            <div style={{ borderColor: 'var(--p-divider)' }} className="divide-y">
              {data.recentDeals.slice(0, 6).map((deal) => {
                const statusInfo = statusLabels[deal.status] || { label: deal.status, variant: 'secondary' as const }
                return (
                  <div key={deal._id} className="flex items-center justify-between py-3 first:pt-0" style={{ borderColor: 'var(--p-divider)' }}>
                    <div className="min-w-0 mr-3">
                      <p className="text-sm truncate" style={{ color: 'var(--p-text)' }}>{deal.productName}</p>
                      <p className="text-xs font-mono" style={{ color: 'var(--p-text-faint)' }}>{deal.dealId}</p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2.5">
                      <span className="text-sm tabular-nums" style={{ color: 'var(--p-text-secondary)' }}>{formatNumber(deal.amount)}</span>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm py-6" style={{ color: 'var(--p-text-faint)' }}>Нет сделок</p>
          )}
        </div>

        {/* Users */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] uppercase tracking-widest" style={{ color: 'var(--p-text-muted)' }}>Новые пользователи</h2>
            <Link to="/partner/users" className="text-xs flex items-center gap-1 hover:opacity-70 transition-opacity" style={{ color: 'var(--p-text-muted)' }}>
              Все <ArrowRight size={12} />
            </Link>
          </div>
          {data?.recentUsers && data.recentUsers.length > 0 ? (
            <div style={{ borderColor: 'var(--p-divider)' }} className="divide-y">
              {data.recentUsers.slice(0, 6).map((user) => (
                <div key={user._id} className="flex items-center justify-between py-3 first:pt-0" style={{ borderColor: 'var(--p-divider)' }}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium shrink-0" style={{ background: 'var(--p-avatar-bg)', color: 'var(--p-text-muted)' }}>
                      {user.username?.charAt(0).toUpperCase() || user.firstName?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <p className="text-sm truncate" style={{ color: 'var(--p-text)' }}>
                      {user.username ? `@${user.username}` : user.firstName || `${user.telegramId}`}
                    </p>
                  </div>
                  <span className="text-xs shrink-0 ml-3" style={{ color: 'var(--p-text-faint)' }}>{formatDate(user.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm py-6" style={{ color: 'var(--p-text-faint)' }}>Нет пользователей</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-10 pt-6 flex flex-wrap gap-x-8 gap-y-2 text-xs" style={{ borderTop: '1px solid var(--p-divider)', color: 'var(--p-text-faint)' }}>
        <span>Код: <span className="font-mono" style={{ color: 'var(--p-text-muted)' }}>{platform?.code}</span></span>
        <span>Канал: <span style={{ color: 'var(--p-text-muted)' }}>{platform?.telegramChannel || '—'}</span></span>
        <span>Комиссия: <span style={{ color: 'var(--p-text-muted)' }}>{platform?.commissionPercent}%</span></span>
      </div>
    </div>
  )
}
