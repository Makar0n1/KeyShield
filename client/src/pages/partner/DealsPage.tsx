import { useState, useEffect } from 'react'
import { partnerService } from '@/services/partner'
import type { Deal } from '@/types'
import { Card, Input } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { formatDate, formatNumber } from '@/utils/format'
import { FileText, Search, Filter } from 'lucide-react'

const statusFilters = [
  { value: '', label: 'Все' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'completed', label: 'Завершённые' },
  { value: 'dispute', label: 'Споры' },
  { value: 'cancelled', label: 'Отменённые' },
]

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

export function PartnerDealsPage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchDeals = () => {
    setLoading(true)
    partnerService
      .getDeals({
        page,
        limit: 20,
        status: status || undefined,
        search: search || undefined,
      })
      .then((data) => {
        setDeals(data.deals || [])
        setTotal(data.total || 0)
        setTotalPages(data.totalPages || 1)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchDeals()
  }, [page, status])

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
      fetchDeals()
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Сделки</h1>
          <p className="text-muted">Всего: {total}</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по ID сделки, названию..."
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={18} className="text-muted" />
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => {
                setStatus(filter.value)
                setPage(1)
              }}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                status === filter.value
                  ? 'bg-primary text-white'
                  : 'bg-dark-lighter text-gray-300 hover:bg-dark-light'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Deals List */}
      <Card>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : deals.length === 0 ? (
          <div className="text-center py-12">
            <FileText size={48} className="mx-auto text-muted mb-4" />
            <p className="text-muted">Сделки не найдены</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted">ID</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Товар/Услуга</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Сумма</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Статус</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Дата</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => {
                  const statusInfo = statusLabels[deal.status] || {
                    label: deal.status,
                    variant: 'secondary' as const,
                  }
                  return (
                    <tr key={deal._id} className="border-b border-border hover:bg-dark-lighter/50">
                      <td className="p-4 font-mono text-primary">{deal.dealId}</td>
                      <td className="p-4">
                        <p className="font-medium text-white">{deal.productName}</p>
                        <p className="text-sm text-muted line-clamp-1">{deal.description}</p>
                      </td>
                      <td className="p-4">
                        <p className="font-medium text-white">
                          {formatNumber(deal.amount)} {deal.asset}
                        </p>
                        <p className="text-sm text-muted">
                          Комиссия: {formatNumber(deal.commission)} {deal.asset}
                        </p>
                      </td>
                      <td className="p-4">
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </td>
                      <td className="p-4 text-muted">{formatDate(deal.createdAt)}</td>
                    </tr>
                  )
                })}
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
