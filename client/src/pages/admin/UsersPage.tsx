import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { adminService } from '@/services/admin'
import type { User } from '@/types'
import { Card, Button, Input } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { formatDateShort } from '@/utils/format'
import { Search, Eye, Ban, CheckCircle, Filter, Bot, Gift } from 'lucide-react'

export function AdminUsersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(searchParams.get('search') || '')

  const page = parseInt(searchParams.get('page') || '1')
  const blacklisted = searchParams.get('blacklisted') === 'true'
  const botBlocked = searchParams.get('botBlocked') || ''

  const fetchUsers = () => {
    setLoading(true)
    adminService
      .getUsers({
        page,
        limit: 20,
        search: searchParams.get('search') || undefined,
        blacklisted: blacklisted || undefined,
        botBlocked: botBlocked || undefined,
      })
      .then((data) => {
        setUsers(data.users)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchUsers()
  }, [page, blacklisted, botBlocked, searchParams])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams(searchParams)
    if (search) {
      params.set('search', search)
    } else {
      params.delete('search')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  const handleFilterBlacklisted = (show: boolean) => {
    const params = new URLSearchParams(searchParams)
    if (show) {
      params.set('blacklisted', 'true')
    } else {
      params.delete('blacklisted')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  const handleFilterBotBlocked = (value: string) => {
    const params = new URLSearchParams(searchParams)
    if (value) {
      params.set('botBlocked', value)
    } else {
      params.delete('botBlocked')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', String(newPage))
    setSearchParams(params)
  }

  const handleBan = async (telegramId: number) => {
    const reason = prompt('Причина блокировки:')
    if (!reason) return
    try {
      await adminService.banUser(telegramId, reason)
      fetchUsers()
    } catch (error) {
      console.error('Ban error:', error)
    }
  }

  const handleUnban = async (telegramId: number) => {
    if (!confirm('Разблокировать пользователя?')) return
    try {
      await adminService.unbanUser(telegramId)
      fetchUsers()
    } catch (error) {
      console.error('Unban error:', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Пользователи</h1>
          <p className="text-muted">Всего: {total}</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
              <Input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Telegram ID, username..."
                className="pl-10"
              />
            </div>
            <Button type="submit">Поиск</Button>
          </form>

          {/* Filter - Blacklisted */}
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-muted" />
            <div className="flex gap-2">
              <button
                onClick={() => handleFilterBlacklisted(false)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  !blacklisted
                    ? 'bg-primary text-white'
                    : 'bg-dark-lighter text-gray-300 hover:bg-dark-light'
                }`}
              >
                Все
              </button>
              <button
                onClick={() => handleFilterBlacklisted(true)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  blacklisted
                    ? 'bg-red-500 text-white'
                    : 'bg-dark-lighter text-gray-300 hover:bg-dark-light'
                }`}
              >
                Забанены
              </button>
            </div>
          </div>

          {/* Filter - Bot Blocked */}
          <div className="flex items-center gap-2">
            <Bot size={18} className="text-muted" />
            <div className="flex gap-2">
              <button
                onClick={() => handleFilterBotBlocked('')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  botBlocked === ''
                    ? 'bg-primary text-white'
                    : 'bg-dark-lighter text-gray-300 hover:bg-dark-light'
                }`}
              >
                Все
              </button>
              <button
                onClick={() => handleFilterBotBlocked('false')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  botBlocked === 'false'
                    ? 'bg-green-500 text-white'
                    : 'bg-dark-lighter text-gray-300 hover:bg-dark-light'
                }`}
              >
                Бот активен
              </button>
              <button
                onClick={() => handleFilterBotBlocked('true')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  botBlocked === 'true'
                    ? 'bg-orange-500 text-white'
                    : 'bg-dark-lighter text-gray-300 hover:bg-dark-light'
                }`}
              >
                Бот заблокирован
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-muted">Пользователи не найдены</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted">ID</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Username</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Имя</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Источник</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Споры</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Статус</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Бот</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Посл. действие</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Регистрация</th>
                  <th className="text-right p-4 text-sm font-medium text-muted">Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id} className="border-b border-border hover:bg-dark-lighter/50">
                    <td className="p-4">
                      <span className="font-mono text-sm text-gray-300">{user.telegramId}</span>
                    </td>
                    <td className="p-4">
                      {user.username ? (
                        <a
                          href={`https://t.me/${user.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          @{user.username}
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="p-4 text-white">
                      {user.firstName || '—'} {user.lastName || ''}
                    </td>
                    <td className="p-4">
                      {user.referrer ? (
                        <Link
                          to={`/admin/users/${user.referrer.telegramId}`}
                          className="flex items-center gap-1 text-purple-400 hover:text-purple-300 text-sm"
                          title={`Реферер: ${user.referrer.referralCode}`}
                        >
                          <Gift size={14} />
                          <span>{user.referrer.username ? `@${user.referrer.username}` : user.referrer.firstName || user.referrer.referralCode}</span>
                        </Link>
                      ) : user.source?.startsWith('fb:') ? (
                        <Badge variant="default" className="bg-blue-600 text-xs">
                          FB
                        </Badge>
                      ) : user.platformCode ? (
                        <Badge variant="secondary" className="text-xs">
                          {user.platformCode}
                        </Badge>
                      ) : (
                        <span className="text-muted text-sm">—</span>
                      )}
                    </td>
                    <td className="p-4 text-sm">
                      <span className="text-green-400">+{user.disputeStats.totalWon}</span>
                      {' / '}
                      <span className="text-red-400">-{user.disputeStats.totalLost}</span>
                      {user.disputeStats.lossStreak > 0 && (
                        <span className="text-yellow-400 ml-1">
                          (серия: {user.disputeStats.lossStreak})
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      {user.blacklisted ? (
                        <Badge variant="destructive">Забанен</Badge>
                      ) : (
                        <Badge variant="success">Активен</Badge>
                      )}
                    </td>
                    <td className="p-4">
                      {user.botBlocked ? (
                        <Badge variant="warning" className="bg-orange-500/20 text-orange-400 border-orange-500/30">
                          Заблокирован
                        </Badge>
                      ) : (
                        <Badge variant="success" className="bg-green-500/20 text-green-400 border-green-500/30">
                          Активен
                        </Badge>
                      )}
                    </td>
                    <td className="p-4 text-sm">
                      {user.lastActionType ? (
                        <div>
                          <span className="text-gray-300 text-xs">{user.lastActionType}</span>
                          {user.lastActionAt && (
                            <span className="block text-muted text-xs">
                              {formatDateShort(user.lastActionAt)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-muted">
                      {formatDateShort(user.createdAt)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/admin/users/${user.telegramId}`}
                          className="p-2 text-gray-400 hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
                          title="Детали"
                        >
                          <Eye size={18} />
                        </Link>
                        {user.blacklisted ? (
                          <button
                            onClick={() => handleUnban(user.telegramId)}
                            className="p-2 text-green-400 hover:text-green-300 hover:bg-dark-lighter rounded-lg transition-colors"
                            title="Разблокировать"
                          >
                            <CheckCircle size={18} />
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBan(user.telegramId)}
                            className="p-2 text-red-400 hover:text-red-300 hover:bg-dark-lighter rounded-lg transition-colors"
                            title="Заблокировать"
                          >
                            <Ban size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      )}
    </div>
  )
}
