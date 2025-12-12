import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
import { partnerService, type PartnerDashboardData } from '@/services/partner'
import { Card } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { formatNumber, formatDate } from '@/utils/format'
import {
  Users,
  FileText,
  DollarSign,
  TrendingUp,
  ArrowRight,
  Activity,
} from 'lucide-react'

const statusLabels: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  created: { label: 'Создана', variant: 'secondary' },
  waiting_for_seller_wallet: { label: 'Ожидание кошелька', variant: 'warning' },
  waiting_for_buyer_wallet: { label: 'Ожидание кошелька', variant: 'warning' },
  waiting_for_deposit: { label: 'Ожидание депозита', variant: 'warning' },
  locked: { label: 'Заблокирована', variant: 'warning' },
  in_progress: { label: 'В работе', variant: 'success' },
  work_submitted: { label: 'Работа сдана', variant: 'success' },
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
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
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

  const statCards = [
    {
      title: 'Пользователи',
      value: formatNumber(stats.totalUsers),
      icon: Users,
      color: 'text-blue-400',
      bgColor: 'bg-blue-400/10',
    },
    {
      title: 'Всего сделок',
      value: formatNumber(stats.totalDeals),
      icon: FileText,
      color: 'text-purple-400',
      bgColor: 'bg-purple-400/10',
    },
    {
      title: 'Активные сделки',
      value: formatNumber(stats.activeDeals),
      icon: Activity,
      color: 'text-green-400',
      bgColor: 'bg-green-400/10',
    },
    {
      title: 'Оборот (USDT)',
      value: formatNumber(stats.totalVolume),
      icon: DollarSign,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-400/10',
    },
    {
      title: 'Комиссия (USDT)',
      value: formatNumber(stats.totalCommission),
      icon: TrendingUp,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Дашборд</h1>
        <p className="text-muted">
          Добро пожаловать, {platform?.name || 'Партнёр'}!
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={stat.color} size={20} />
              </div>
              <div>
                <p className="text-sm text-muted">{stat.title}</p>
                <p className="text-xl font-bold text-white">{stat.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Recent activity */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Deals */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Последние сделки</h2>
            <Link
              to="/partner/deals"
              className="text-sm text-primary hover:text-primary-light flex items-center gap-1"
            >
              Все сделки <ArrowRight size={14} />
            </Link>
          </div>

          {data?.recentDeals && data.recentDeals.length > 0 ? (
            <div className="space-y-3">
              {data.recentDeals.slice(0, 5).map((deal) => {
                const statusInfo = statusLabels[deal.status] || { label: deal.status, variant: 'secondary' as const }
                return (
                  <div
                    key={deal._id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <div>
                      <p className="font-medium text-white">{deal.productName}</p>
                      <p className="text-sm text-muted">{deal.dealId}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-white">
                        {formatNumber(deal.amount)} {deal.asset}
                      </p>
                      <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-center text-muted py-8">Нет сделок</p>
          )}
        </Card>

        {/* Recent Users */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Новые пользователи</h2>
            <Link
              to="/partner/users"
              className="text-sm text-primary hover:text-primary-light flex items-center gap-1"
            >
              Все пользователи <ArrowRight size={14} />
            </Link>
          </div>

          {data?.recentUsers && data.recentUsers.length > 0 ? (
            <div className="space-y-3">
              {data.recentUsers.slice(0, 5).map((user) => (
                <div
                  key={user._id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold">
                      {user.username?.charAt(0).toUpperCase() || user.firstName?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div>
                      <p className="font-medium text-white">
                        {user.username ? `@${user.username}` : user.firstName || `ID: ${user.telegramId}`}
                      </p>
                      <p className="text-sm text-muted">{formatDate(user.createdAt)}</p>
                    </div>
                  </div>
                  {user.blacklisted && <Badge variant="destructive">Заблокирован</Badge>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted py-8">Нет пользователей</p>
          )}
        </Card>
      </div>

      {/* Partner Info */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Информация о партнёрстве</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="p-4 bg-dark rounded-lg">
            <p className="text-sm text-muted mb-1">Код партнёра</p>
            <p className="font-mono text-lg font-bold text-primary">{platform?.code}</p>
          </div>
          <div className="p-4 bg-dark rounded-lg">
            <p className="text-sm text-muted mb-1">Ваша комиссия</p>
            <p className="text-lg font-bold text-white">{platform?.commissionPercent || 0}%</p>
          </div>
          <div className="p-4 bg-dark rounded-lg">
            <p className="text-sm text-muted mb-1">Telegram канал</p>
            <p className="text-lg font-bold text-white">
              {platform?.telegramChannel || 'Не указан'}
            </p>
          </div>
        </div>
      </Card>
    </div>
  )
}
