import { useState, useEffect, useCallback } from 'react'
import { partnerService } from '@/services/partner'
import type { User } from '@/types'
import { Input } from '@/components/ui'
import { Pagination } from '@/components/ui/pagination'
import { formatDate } from '@/utils/format'
import { Search } from 'lucide-react'

export function PartnerUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchUsers = useCallback(() => {
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
  }, [page, search])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  useEffect(() => {
    if (page !== 1) setPage(1)
  }, [search])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-medium text-white">Пользователи</h1>
        <p className="text-sm text-gray-500">Всего: {total}</p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
        <Input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск..."
          className="pl-9 text-sm"
        />
      </div>

      {/* Users */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : users.length === 0 ? (
        <p className="text-sm text-gray-600 py-12">Пользователи не найдены</p>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {users.map((user) => (
            <div key={user._id} className="flex items-center py-3.5 gap-3">
              <div className="w-8 h-8 rounded-full bg-white/[0.06] text-gray-400 flex items-center justify-center text-xs font-medium shrink-0">
                {user.username?.charAt(0).toUpperCase() || user.firstName?.charAt(0).toUpperCase() || '?'}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">
                  {user.username ? `@${user.username}` : user.firstName || 'Без имени'}
                  {user.blacklisted && <span className="text-red-400 text-xs ml-2">blocked</span>}
                </p>
                <p className="text-xs text-gray-600 font-mono">{user.telegramId}</p>
              </div>

              <div className="text-right shrink-0 hidden sm:block">
                <p className="text-xs text-gray-500">{formatDate(user.createdAt)}</p>
                {user.lastActivity && (
                  <p className="text-[11px] text-gray-600">акт. {formatDate(user.lastActivity)}</p>
                )}
              </div>

              <div className="text-right shrink-0 sm:hidden">
                <p className="text-xs text-gray-500">{formatDate(user.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center mt-6">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
