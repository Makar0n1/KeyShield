import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
import { partnerService, type PartnerDashboardData } from '@/services/partner'
import { Badge } from '@/components/ui/badge'
import { formatNumber, formatDate } from '@/utils/format'
import { ArrowRight, Copy, CheckCircle2, ExternalLink } from 'lucide-react'

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
    partnerService
      .getDashboard()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  const stats = data?.stats || {
    totalUsers: 0,
    totalDeals: 0,
    activeDeals: 0,
    completedDeals: 0,
    totalVolume: 0,
    totalCommission: 0,
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero — big numbers */}
      <div className="mb-8 sm:mb-10">
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">Общий оборот</p>
        <h1 className="text-4xl sm:text-5xl font-extralight text-white tracking-tight">
          {formatNumber(stats.totalVolume)}
          <span className="text-lg sm:text-xl text-gray-500 ml-2 font-normal">USDT</span>
        </h1>
      </div>

      {/* Metric row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 sm:gap-x-10 gap-y-6 mb-10">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Пользователи</p>
          <p className="text-2xl font-light text-white">{formatNumber(stats.totalUsers)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Сделки</p>
          <p className="text-2xl font-light text-white">
            {formatNumber(stats.totalDeals)}
            {stats.activeDeals > 0 && (
              <span className="text-sm text-green-400 ml-1.5 font-normal">{stats.activeDeals} акт.</span>
            )}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Комиссия</p>
          <p className="text-2xl font-light text-white">{formatNumber(stats.totalCommission)}<span className="text-sm text-gray-500 ml-1">$</span></p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-1">Ваша доля</p>
          <p className="text-2xl font-light text-primary">{platform?.commissionPercent || 0}%</p>
        </div>
      </div>

      {/* Referral link */}
      {referralLink && (
        <div className="mb-10">
          <div className="border-t border-white/[0.06] pt-6">
            <p className="text-[11px] uppercase tracking-widest text-gray-500 mb-3">Реферальная ссылка</p>
            <div className="flex items-center gap-3">
              <p className="font-mono text-sm text-gray-300 break-all flex-1 select-all">{referralLink}</p>
              <button
                onClick={copyLink}
                className="shrink-0 text-gray-500 hover:text-white transition-colors"
                title="Скопировать"
              >
                {copied ? <CheckCircle2 size={18} className="text-green-400" /> : <Copy size={18} />}
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-2">Пользователи по этой ссылке автоматически привяжутся к вашей платформе</p>
          </div>
        </div>
      )}

      {/* Recent activity — two columns */}
      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">

        {/* Deals */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] uppercase tracking-widest text-gray-500">Последние сделки</h2>
            <Link to="/partner/deals" className="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1">
              Все <ArrowRight size={12} />
            </Link>
          </div>

          {data?.recentDeals && data.recentDeals.length > 0 ? (
            <div className="divide-y divide-white/[0.06]">
              {data.recentDeals.slice(0, 6).map((deal) => {
                const statusInfo = statusLabels[deal.status] || { label: deal.status, variant: 'secondary' as const }
                return (
                  <div key={deal._id} className="flex items-center justify-between py-3 first:pt-0">
                    <div className="min-w-0 mr-3">
                      <p className="text-sm text-white truncate">{deal.productName}</p>
                      <p className="text-xs text-gray-600 font-mono">{deal.dealId}</p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2.5">
                      <span className="text-sm tabular-nums text-gray-300">{formatNumber(deal.amount)}</span>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-600 py-6">Нет сделок</p>
          )}
        </div>

        {/* Users */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[11px] uppercase tracking-widest text-gray-500">Новые пользователи</h2>
            <Link to="/partner/users" className="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1">
              Все <ArrowRight size={12} />
            </Link>
          </div>

          {data?.recentUsers && data.recentUsers.length > 0 ? (
            <div className="divide-y divide-white/[0.06]">
              {data.recentUsers.slice(0, 6).map((user) => (
                <div key={user._id} className="flex items-center justify-between py-3 first:pt-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-white/[0.06] text-gray-400 flex items-center justify-center text-xs font-medium shrink-0">
                      {user.username?.charAt(0).toUpperCase() || user.firstName?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <p className="text-sm text-white truncate">
                      {user.username ? `@${user.username}` : user.firstName || `${user.telegramId}`}
                    </p>
                  </div>
                  <span className="text-xs text-gray-600 shrink-0 ml-3">{formatDate(user.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-600 py-6">Нет пользователей</p>
          )}
        </div>
      </div>

      {/* Footer info */}
      <div className="border-t border-white/[0.06] mt-10 pt-6 flex flex-wrap gap-x-8 gap-y-2 text-xs text-gray-600">
        <span>Код: <span className="text-gray-400 font-mono">{platform?.code}</span></span>
        <span>Канал: <span className="text-gray-400">{platform?.telegramChannel || '—'}</span></span>
        <span>Комиссия: <span className="text-gray-400">{platform?.commissionPercent}%</span></span>
      </div>
    </div>
  )
}
