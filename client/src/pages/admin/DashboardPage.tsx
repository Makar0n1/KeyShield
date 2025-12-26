import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { adminService } from '@/services/admin'
import type { AdminStats, BotStatusProgress } from '@/types'
import { Card, Button } from '@/components/ui'
import { formatNumber, formatCurrency } from '@/utils/format'
import {
  FileText,
  Users,
  Scale,
  TrendingUp,
  DollarSign,
  Activity,
  Zap,
  Wallet,
  PiggyBank,
  Percent,
  AlertTriangle,
  CheckCircle,
  XCircle,
  UserPlus,
  UserX,
  Bot,
  RefreshCw,
  Loader2,
} from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  icon: React.ReactNode
  subtitle?: string
  trend?: string
  trendUp?: boolean
  link?: string
  color?: 'default' | 'green' | 'red' | 'blue' | 'orange' | 'purple'
}

const colorClasses = {
  default: 'text-primary/60',
  green: 'text-green-500',
  red: 'text-red-500',
  blue: 'text-blue-500',
  orange: 'text-orange-500',
  purple: 'text-purple-500',
}

function StatCard({ title, value, icon, subtitle, trend, trendUp, link, color = 'default' }: StatCardProps) {
  const content = (
    <Card className="p-6 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-muted text-sm mb-1">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {subtitle && <p className="text-xs text-muted mt-1">{subtitle}</p>}
          {trend && (
            <p className={`text-xs mt-2 ${trendUp ? 'text-green-400' : 'text-red-400'}`}>
              {trendUp ? '↑' : '↓'} {trend}
            </p>
          )}
        </div>
        <div className={colorClasses[color]}>{icon}</div>
      </div>
    </Card>
  )

  if (link) {
    return <Link to={link}>{content}</Link>
  }
  return content
}

export function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Bot status check state
  const [botCheckProgress, setBotCheckProgress] = useState<BotStatusProgress | null>(null)
  const [botCheckStarting, setBotCheckStarting] = useState(false)

  // Poll for progress when check is running
  const pollProgress = useCallback(async () => {
    try {
      const progress = await adminService.getBotStatusProgress()
      setBotCheckProgress(progress)

      // If still running, poll again
      if (progress.isRunning) {
        setTimeout(pollProgress, 2000)
      } else if (progress.completedAt) {
        // Refresh stats when complete
        adminService.getStats().then(setStats)
      }
    } catch (err) {
      console.error('Failed to get progress:', err)
    }
  }, [])

  // Start bot status check
  const handleStartBotCheck = async () => {
    try {
      setBotCheckStarting(true)
      const result = await adminService.startBotStatusCheck()
      setBotCheckProgress(result.progress)
      // Start polling
      setTimeout(pollProgress, 2000)
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { progress?: BotStatusProgress } } }
      if (error.response?.status === 409) {
        // Already running, start polling
        setBotCheckProgress(error.response.data?.progress || null)
        pollProgress()
      } else {
        console.error('Failed to start check:', err)
      }
    } finally {
      setBotCheckStarting(false)
    }
  }

  // Check if there's an ongoing check on mount
  useEffect(() => {
    adminService.getBotStatusProgress().then((progress) => {
      setBotCheckProgress(progress)
      if (progress.isRunning) {
        pollProgress()
      }
    }).catch(() => {})
  }, [pollProgress])

  useEffect(() => {
    adminService
      .getStats()
      .then(setStats)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">Ошибка загрузки статистики: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-primary hover:underline"
        >
          Попробовать снова
        </button>
      </div>
    )
  }

  if (!stats) return null

  const finance = stats.finance
  const partners = stats.partners
  const deals = stats.deals

  // Parse values
  const netProfit = parseFloat(finance?.netProfit || '0')
  const pureProfit = parseFloat(partners?.pureProfit || '0')
  const trxSpent = parseFloat(finance?.totalTrxSpent || '0')
  const trxSpentUsdt = parseFloat(finance?.totalTrxSpentUsdt || '0')
  const totalCommission = parseFloat(finance?.totalCommission || '0')
  const totalVolume = parseFloat(finance?.totalVolume || '0')
  const trxRate = finance?.trxRate || 0
  const avgCostPerDeal = parseFloat(finance?.avgCostPerDeal || '0')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Дашборд</h1>
        <p className="text-muted">Обзор статистики KeyShield</p>
      </div>

      {/* Deals Stats */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FileText size={20} />
          Сделки
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            title="Всего"
            value={formatNumber(deals?.total || 0)}
            icon={<FileText size={24} />}
            link="/admin/deals"
          />
          <StatCard
            title="Активные"
            value={formatNumber(deals?.active || 0)}
            icon={<Activity size={24} />}
            color="blue"
            link="/admin/deals?status=active"
          />
          <StatCard
            title="Завершённые"
            value={formatNumber(deals?.completed || 0)}
            icon={<CheckCircle size={24} />}
            color="green"
            link="/admin/deals?status=completed"
          />
          <StatCard
            title="Споры"
            value={formatNumber(deals?.disputed || 0)}
            icon={<Scale size={24} />}
            color="orange"
            link="/admin/disputes?status=pending"
          />
          <StatCard
            title="Решённые"
            value={formatNumber(deals?.resolved || 0)}
            icon={<CheckCircle size={24} />}
            color="purple"
          />
          <StatCard
            title="Истёкшие"
            value={formatNumber(deals?.expired || 0)}
            icon={<XCircle size={24} />}
            color="red"
          />
        </div>
      </div>

      {/* Financial Stats - Main */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <DollarSign size={20} />
          Финансы
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Общий объём"
            value={formatCurrency(totalVolume)}
            icon={<TrendingUp size={24} />}
            subtitle={`${deals?.finished || 0} завершённых сделок`}
          />
          <StatCard
            title="Валовая прибыль"
            value={formatCurrency(totalCommission)}
            icon={<DollarSign size={24} />}
            subtitle="Все собранные комиссии"
            color="green"
          />
          <StatCard
            title="Расходы TRX"
            value={`${trxSpent.toFixed(2)} TRX`}
            icon={<Zap size={24} />}
            subtitle={`≈ ${formatCurrency(trxSpentUsdt)}`}
            color="red"
          />
          <StatCard
            title="Чистая прибыль"
            value={formatCurrency(netProfit)}
            icon={<Wallet size={24} />}
            subtitle="Комиссии − Расходы"
            color={netProfit >= 0 ? 'blue' : 'red'}
          />
        </div>
      </div>

      {/* Partners & Pure Profit */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Partner payouts */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Percent size={20} />
            Партнёрские выплаты
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted">Активных партнёров</span>
              <span className="text-white font-medium">{partners?.count || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted">К выплате партнёрам</span>
              <span className="text-orange-400 font-medium">
                {formatCurrency(parseFloat(partners?.totalPayouts || '0'))}
              </span>
            </div>
            <div className="border-t border-border pt-4 flex justify-between items-center">
              <span className="text-white font-semibold">Чистейшая прибыль</span>
              <span className={`text-2xl font-bold ${pureProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(pureProfit)}
              </span>
            </div>
            <p className="text-xs text-muted">
              Чистая прибыль − Выплаты партнёрам = То, что идёт на сервисный кошелёк
            </p>
          </div>
        </Card>

        {/* Operational Costs Breakdown */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <PiggyBank size={20} />
            Детализация расходов
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted">Текущий курс TRX</span>
              <span className="text-white font-medium">
                {trxRate > 0 ? `$${trxRate.toFixed(6)}` : <span className="text-yellow-400">Загрузка...</span>}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted">Средний расход на сделку</span>
              <span className="text-white font-medium">{formatCurrency(avgCostPerDeal)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted">Сделок с FeeSaver</span>
              <span className="text-green-400 font-medium">{finance?.feesaverDeals || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted">Сделок с TRX fallback</span>
              <span className="text-orange-400 font-medium">{finance?.fallbackDeals || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted">Сделок с данными о расходах</span>
              <span className="text-white font-medium">
                {finance?.dealsWithCostData || 0} / {deals?.finished || 0}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* User Analytics */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Users size={20} />
          Пользователи
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard
            title="Всего"
            value={formatNumber(stats.userAnalytics?.totalUsers || stats.users?.total || 0)}
            icon={<Users size={24} />}
            link="/admin/users"
          />
          <StatCard
            title="Активны сегодня"
            value={formatNumber(stats.userAnalytics?.activeToday || 0)}
            icon={<Activity size={24} />}
            color="green"
          />
          <StatCard
            title="Активны за неделю"
            value={formatNumber(stats.userAnalytics?.activeWeek || 0)}
            icon={<Activity size={24} />}
            color="blue"
          />
          <StatCard
            title="Новых сегодня"
            value={formatNumber(stats.userAnalytics?.newToday || 0)}
            icon={<UserPlus size={24} />}
            color="purple"
          />
          <StatCard
            title="Новых за неделю"
            value={formatNumber(stats.userAnalytics?.newWeek || 0)}
            icon={<UserPlus size={24} />}
            color="blue"
          />
        </div>

        {/* Second row - problem users */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
          <StatCard
            title="Заблокировали бота"
            value={formatNumber(stats.userAnalytics?.blockedBot || 0)}
            icon={<Bot size={24} />}
            color="orange"
            link="/admin/users?botBlocked=true"
          />
          <StatCard
            title="Забанены"
            value={formatNumber(stats.userAnalytics?.banned || stats.users?.banned || 0)}
            icon={<UserX size={24} />}
            color="red"
            link="/admin/users?blacklisted=true"
          />
          <StatCard
            title="Активны за месяц"
            value={formatNumber(stats.userAnalytics?.activeMonth || 0)}
            icon={<Activity size={24} />}
            subtitle={`${stats.userAnalytics?.totalUsers ? Math.round((stats.userAnalytics.activeMonth / stats.userAnalytics.totalUsers) * 100) : 0}% от всех`}
          />
        </div>

        {/* Bot Status Check */}
        <Card className="p-4 mt-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <RefreshCw size={20} className="text-muted" />
              <div>
                <p className="text-white font-medium">Проверка статусов бота</p>
                <p className="text-muted text-sm">
                  Проверяет, кто заблокировал бота (безопасно, без отправки сообщений)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {botCheckProgress?.isRunning ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin text-primary" />
                    <span className="text-sm text-muted">
                      {botCheckProgress.checked}/{botCheckProgress.total} ({botCheckProgress.percent}%)
                    </span>
                  </div>
                  <div className="w-32 h-2 bg-dark-lighter rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300"
                      style={{ width: `${botCheckProgress.percent}%` }}
                    />
                  </div>
                </div>
              ) : botCheckProgress?.completedAt ? (
                <div className="text-sm text-muted">
                  Найдено заблокировавших: <span className="text-orange-400 font-medium">{botCheckProgress.blocked}</span>
                </div>
              ) : null}
              <Button
                onClick={handleStartBotCheck}
                disabled={botCheckStarting || botCheckProgress?.isRunning}
                variant="secondary"
                className="whitespace-nowrap"
              >
                {botCheckStarting ? (
                  <Loader2 size={16} className="animate-spin mr-2" />
                ) : (
                  <RefreshCw size={16} className="mr-2" />
                )}
                {botCheckProgress?.isRunning ? 'Проверка...' : 'Обновить статусы'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Partner Details */}
      {partners?.details && partners.details.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp size={20} />
            Статистика по партнёрам
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="pb-3 font-medium">Платформа</th>
                  <th className="pb-3 font-medium">Код</th>
                  <th className="pb-3 font-medium text-right">Сделок</th>
                  <th className="pb-3 font-medium text-right">Комиссии</th>
                  <th className="pb-3 font-medium text-right">Расходы</th>
                  <th className="pb-3 font-medium text-right">Чистая</th>
                  <th className="pb-3 font-medium text-right">%</th>
                  <th className="pb-3 font-medium text-right">К выплате</th>
                </tr>
              </thead>
              <tbody>
                {partners.details.map((p) => (
                  <tr key={p.code} className="border-b border-border/50">
                    <td className="py-3 text-white">{p.name}</td>
                    <td className="py-3 text-primary font-mono">{p.code}</td>
                    <td className="py-3 text-right text-gray-300">{p.deals}</td>
                    <td className="py-3 text-right text-green-400">{formatCurrency(p.commission)}</td>
                    <td className="py-3 text-right text-red-400">{formatCurrency(p.costUsd)}</td>
                    <td className={`py-3 text-right ${p.netProfit >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                      {formatCurrency(p.netProfit)}
                    </td>
                    <td className="py-3 text-right text-muted">{p.percent}%</td>
                    <td className="py-3 text-right text-orange-400 font-medium">
                      {formatCurrency(p.payout)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Быстрые действия</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/admin/disputes?status=pending"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary border border-primary/30 rounded-lg hover:bg-primary/20 transition-colors"
          >
            <Scale size={16} />
            Открытые споры ({deals?.disputed || 0})
          </Link>
          <Link
            to="/admin/platforms"
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded-lg hover:bg-orange-500/20 transition-colors"
          >
            <Percent size={16} />
            Партнёры ({partners?.count || 0})
          </Link>
          <Link
            to="/admin/users?blacklisted=true"
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/20 transition-colors"
          >
            <AlertTriangle size={16} />
            Забаненные
          </Link>
          <Link
            to="/admin/users?botBlocked=true"
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500/10 text-orange-400 border border-orange-500/30 rounded-lg hover:bg-orange-500/20 transition-colors"
          >
            <Bot size={16} />
            Заблокировали бота ({stats.userAnalytics?.blockedBot || 0})
          </Link>
          <Link
            to="/admin/exports"
            className="inline-flex items-center gap-2 px-4 py-2 bg-dark-lighter text-gray-300 border border-border rounded-lg hover:border-primary/50 transition-colors"
          >
            Экспорт отчётов
          </Link>
        </div>
      </Card>
    </div>
  )
}
