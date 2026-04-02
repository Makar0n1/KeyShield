import { useState, useEffect, useCallback } from 'react'
import { partnerService } from '@/services/partner'
import type { Deal } from '@/types'
import { Input } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { formatDate, formatNumber } from '@/utils/format'
import { Search } from 'lucide-react'

const statusFilters = [
  { value: '', label: 'Все' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'completed', label: 'Завершённые' },
  { value: 'dispute', label: 'Споры' },
  { value: 'cancelled', label: 'Отменённые' },
]

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

export function PartnerDealsPage() {
  const [deals, setDeals] = useState<Deal[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchDeals = useCallback(() => {
    setLoading(true)
    partnerService
      .getDeals({ page, limit: 20, status: status || undefined, search: search || undefined })
      .then((data) => {
        setDeals(data.deals || [])
        setTotal(data.total || 0)
        setTotalPages(data.totalPages || 1)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [page, status, search])

  useEffect(() => { fetchDeals() }, [fetchDeals])

  useEffect(() => {
    if (page !== 1) setPage(1)
  }, [search, status])

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-medium p-text">Сделки</h1>
        <p className="text-sm p-text-muted">Всего: {total}</p>
      </div>

      {/* Search + filters */}
      <div className="mb-6 space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 p-text-muted" size={16} />
          <Input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск..."
            className="pl-9 text-sm"
          />
        </div>

        <div className="flex gap-1.5 flex-wrap">
          {statusFilters.map((filter) => (
            <button
              key={filter.value}
              onClick={() => { setStatus(filter.value); setPage(1) }}
              className={`px-3 py-1.5 text-xs rounded-full transition-colors ${
                status === filter.value
                  ? 'bg-[var(--p-pill-active-bg)] text-[var(--p-pill-active-text)]'
                  : 'p-text-secondary hover:p-text border border-[var(--p-divider)]'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Deals */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : deals.length === 0 ? (
        <p className="text-sm p-text-faint py-12">Сделки не найдены</p>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden sm:block divide-y [&>*]:border-[var(--p-divider)]">
            {deals.map((deal) => {
              const statusInfo = statusLabels[deal.status] || { label: deal.status, variant: 'secondary' as const }
              return (
                <div key={deal._id} className="flex items-center py-3.5 gap-4">
                  <div className="w-24 shrink-0">
                    <span className="font-mono text-xs p-text-secondary">{deal.dealId}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm p-text truncate">{deal.productName}</p>
                    <p className="text-xs p-text-faint truncate">{deal.description}</p>
                  </div>
                  <div className="text-right shrink-0 w-28">
                    <p className="text-sm tabular-nums p-text">{formatNumber(deal.amount)} {deal.asset}</p>
                    <p className="text-[11px] p-text-faint">ком. {formatNumber(deal.commission)}</p>
                  </div>
                  <div className="w-24 shrink-0 text-right">
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </div>
                  <div className="w-20 shrink-0 text-right">
                    <span className="text-xs p-text-faint">{formatDate(deal.createdAt)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Mobile */}
          <div className="sm:hidden divide-y [&>*]:border-[var(--p-divider)]">
            {deals.map((deal) => {
              const statusInfo = statusLabels[deal.status] || { label: deal.status, variant: 'secondary' as const }
              return (
                <div key={deal._id} className="py-3.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm p-text truncate mr-2">{deal.productName}</span>
                    <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs p-text-muted">
                    <span className="font-mono">{deal.dealId}</span>
                    <span className="tabular-nums">{formatNumber(deal.amount)} {deal.asset}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {totalPages > 1 && (
        <div className="flex justify-center mt-6">
          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  )
}
