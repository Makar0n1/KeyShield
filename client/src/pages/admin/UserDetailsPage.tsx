import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { adminService } from '@/services/admin'
import type { User, Deal } from '@/types'
import { Card, Button } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatCurrency } from '@/utils/format'
import {
  ArrowLeft,
  Download,
  Ban,
  CheckCircle,
  User as UserIcon,
  FileText,
  Scale,
  ExternalLink,
} from 'lucide-react'

export function AdminUserDetailsPage() {
  const { telegramId } = useParams<{ telegramId: string }>()
  const [user, setUser] = useState<User | null>(null)
  const [deals, setDeals] = useState<Deal[]>([])
  const [totalDeals, setTotalDeals] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUser = async () => {
    if (!telegramId) return
    try {
      const userData = await adminService.getUser(parseInt(telegramId))
      setUser(userData)
      // Also fetch user's deals - search by telegramId (now works with buyerId/sellerId)
      const dealsData = await adminService.getDeals({ search: telegramId, limit: 10 })
      setDeals(dealsData.deals)
      setTotalDeals(dealsData.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUser()
  }, [telegramId])

  const handleBan = async () => {
    if (!user) return
    const reason = prompt('Причина блокировки:')
    if (!reason) return
    try {
      await adminService.banUser(user.telegramId, reason)
      fetchUser()
    } catch (error) {
      console.error('Ban error:', error)
    }
  }

  const handleUnban = async () => {
    if (!user) return
    if (!confirm('Разблокировать пользователя?')) return
    try {
      await adminService.unbanUser(user.telegramId)
      fetchUser()
    } catch (error) {
      console.error('Unban error:', error)
    }
  }

  const handleExport = async () => {
    if (!user) return
    try {
      const { blob } = await adminService.exportUserPdf(String(user.telegramId))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `user-${user.telegramId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export error:', err)
      alert('Ошибка экспорта')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">{error || 'Пользователь не найден'}</p>
        <Link to="/admin/users" className="text-primary hover:underline">
          ← Вернуться к списку
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/admin/users"
            className="p-2 text-muted hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">
                {user.firstName || 'Пользователь'} {user.lastName || ''}
              </h1>
              {user.blacklisted ? (
                <Badge variant="destructive">Заблокирован</Badge>
              ) : (
                <Badge variant="success">Активен</Badge>
              )}
            </div>
            <p className="text-muted">ID: {user.telegramId}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="secondary">
            <Download size={18} className="mr-2" />
            Экспорт
          </Button>
          {user.blacklisted ? (
            <Button onClick={handleUnban} variant="success">
              <CheckCircle size={18} className="mr-2" />
              Разблокировать
            </Button>
          ) : (
            <Button onClick={handleBan} variant="destructive">
              <Ban size={18} className="mr-2" />
              Заблокировать
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* User Info */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <UserIcon size={20} />
            Информация
          </h2>
          <dl className="space-y-4">
            <div>
              <dt className="text-muted text-sm">Telegram ID</dt>
              <dd className="text-white font-mono">{user.telegramId}</dd>
            </div>
            {user.username && (
              <div>
                <dt className="text-muted text-sm">Username</dt>
                <dd>
                  <a
                    href={`https://t.me/${user.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    @{user.username}
                    <ExternalLink size={14} />
                  </a>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-muted text-sm">Роль</dt>
              <dd>
                <Badge variant="secondary" className="capitalize">
                  {user.role}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted text-sm">Регистрация</dt>
              <dd className="text-white">{formatDate(user.createdAt)}</dd>
            </div>
            {user.lastActivity && (
              <div>
                <dt className="text-muted text-sm">Последняя активность</dt>
                <dd className="text-white">{formatDate(user.lastActivity)}</dd>
              </div>
            )}
            {user.platformCode && (
              <div>
                <dt className="text-muted text-sm">Платформа</dt>
                <dd className="text-white">{user.platformCode}</dd>
              </div>
            )}
            {user.source && user.source !== 'direct' && (
              <div>
                <dt className="text-muted text-sm">Источник</dt>
                <dd>
                  {user.source.startsWith('fb:') ? (
                    <Badge variant="default" className="bg-blue-600">
                      Facebook: {user.source.replace('fb:', '')}
                    </Badge>
                  ) : (
                    <span className="text-white">{user.source}</span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Dispute Stats */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Scale size={20} />
            Статистика споров
          </h2>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 bg-dark rounded-lg">
              <p className="text-3xl font-bold text-green-400">{user.disputeStats.totalWon}</p>
              <p className="text-muted text-sm">Выиграно</p>
            </div>
            <div className="text-center p-4 bg-dark rounded-lg">
              <p className="text-3xl font-bold text-red-400">{user.disputeStats.totalLost}</p>
              <p className="text-muted text-sm">Проиграно</p>
            </div>
            <div className="text-center p-4 bg-dark rounded-lg">
              <p className="text-3xl font-bold text-yellow-400">{user.disputeStats.lossStreak}</p>
              <p className="text-muted text-sm">Серия поражений</p>
            </div>
          </div>
          {user.disputeStats.lossStreak >= 2 && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-yellow-400 text-sm">
                ⚠️ Пользователь близок к автоматической блокировке (3 проигранных спора подряд)
              </p>
            </div>
          )}
          {user.blacklistReason && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg mt-4">
              <p className="text-red-400 text-sm">
                <strong>Причина блокировки:</strong> {user.blacklistReason}
              </p>
            </div>
          )}
        </Card>

        {/* Recent Deals */}
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <FileText size={20} />
              Последние сделки
              {totalDeals > 0 && (
                <Badge variant="secondary" className="ml-2">{totalDeals}</Badge>
              )}
            </h2>
            <Link to={`/admin/deals?search=${user.telegramId}`} className="text-primary hover:underline text-sm">
              Все сделки →
            </Link>
          </div>
          {deals.length === 0 ? (
            <p className="text-muted text-center py-8">Сделок не найдено</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-3 text-sm font-medium text-muted">ID</th>
                    <th className="text-left p-3 text-sm font-medium text-muted">Товар</th>
                    <th className="text-left p-3 text-sm font-medium text-muted">Сумма</th>
                    <th className="text-left p-3 text-sm font-medium text-muted">Статус</th>
                    <th className="text-left p-3 text-sm font-medium text-muted">Роль</th>
                  </tr>
                </thead>
                <tbody>
                  {deals.map((deal) => (
                    <tr key={deal._id} className="border-b border-border hover:bg-dark-lighter/50">
                      <td className="p-3">
                        <Link to={`/admin/deals/${deal._id}`} className="text-primary hover:underline font-mono text-sm">
                          {deal.dealId}
                        </Link>
                      </td>
                      <td className="p-3 text-white">{deal.productName}</td>
                      <td className="p-3 text-white">{formatCurrency(deal.amount, deal.asset)}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{deal.status}</Badge>
                      </td>
                      <td className="p-3 text-muted">
                        {deal.buyerId === user.telegramId ? 'Покупатель' : 'Продавец'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
