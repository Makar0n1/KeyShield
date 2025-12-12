import { useState, useEffect } from 'react'
import { partnerService } from '@/services/partner'
import type { User } from '@/types'
import { Card, Input } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { formatDate } from '@/utils/format'
import { Users, Search, UserCheck, UserX } from 'lucide-react'

export function PartnerUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchUsers = () => {
    setLoading(true)
    partnerService
      .getUsers({ page, limit: 20, search: search || undefined })
      .then((data) => {
        setUsers(data.users || [])
        setTotal(data.total || 0)
        setTotalPages(data.totalPages || 1)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchUsers()
  }, [page])

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      fetchUsers()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Пользователи</h1>
          <p className="text-muted">Всего: {total}</p>
        </div>
      </div>

      {/* Search */}
      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по ID, username, имени..."
            className="pl-10"
          />
        </div>
      </Card>

      {/* Users List */}
      <Card>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <Users size={48} className="mx-auto text-muted mb-4" />
            <p className="text-muted">Пользователи не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted">Пользователь</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Telegram ID</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Роль</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Статус</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Регистрация</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Активность</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user._id} className="border-b border-border hover:bg-dark-lighter/50">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold">
                          {user.username?.charAt(0).toUpperCase() ||
                            user.firstName?.charAt(0).toUpperCase() ||
                            '?'}
                        </div>
                        <div>
                          <p className="font-medium text-white">
                            {user.username ? `@${user.username}` : user.firstName || 'Без имени'}
                          </p>
                          {user.firstName && user.username && (
                            <p className="text-sm text-muted">
                              {user.firstName} {user.lastName || ''}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-mono text-gray-300">{user.telegramId}</td>
                    <td className="p-4">
                      <Badge variant="secondary">
                        {user.role === 'buyer'
                          ? 'Покупатель'
                          : user.role === 'seller'
                            ? 'Продавец'
                            : 'Оба'}
                      </Badge>
                    </td>
                    <td className="p-4">
                      {user.blacklisted ? (
                        <div className="flex items-center gap-1 text-red-400">
                          <UserX size={16} />
                          <span>Заблокирован</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-green-400">
                          <UserCheck size={16} />
                          <span>Активен</span>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-muted">{formatDate(user.createdAt)}</td>
                    <td className="p-4 text-muted">
                      {user.lastActivity ? formatDate(user.lastActivity) : '—'}
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
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
