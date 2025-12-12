import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { adminService } from '@/services/admin'
import type { Deal, DealStatus } from '@/types'
import { Card, Button, Input } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { formatCurrency, formatDateShort, truncate } from '@/utils/format'
import { Search, Eye, Download, Filter } from 'lucide-react'

const statusLabels: Record<DealStatus, string> = {
  created: 'Создана',
  waiting_for_seller_wallet: 'Ожидание кошелька продавца',
  waiting_for_buyer_wallet: 'Ожидание кошелька покупателя',
  waiting_for_deposit: 'Ожидание депозита',
  locked: 'Заблокирована',
  in_progress: 'В работе',
  work_submitted: 'Работа сдана',
  completed: 'Завершена',
  dispute: 'Спор',
  resolved: 'Спор решён',
  expired: 'Истекла',
  cancelled: 'Отменена',
  refunded: 'Возврат',
}

const statusVariants: Record<DealStatus, 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  created: 'default',
  waiting_for_seller_wallet: 'warning',
  waiting_for_buyer_wallet: 'warning',
  waiting_for_deposit: 'warning',
  locked: 'primary',
  in_progress: 'primary',
  work_submitted: 'secondary',
  completed: 'success',
  dispute: 'destructive',
  resolved: 'success',
  expired: 'destructive',
  cancelled: 'default',
  refunded: 'warning',
}

const statusFilters = [
  { value: '', label: 'Все' },
  { value: 'active', label: 'Активные' },
  { value: 'completed', label: 'Завершённые' },
  { value: 'dispute', label: 'Споры' },
  { value: 'cancelled', label: 'Отменённые' },
]

export function AdminDealsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [deals, setDeals] = useState<Deal[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(searchParams.get('search') || '')

  const page = parseInt(searchParams.get('page') || '1')
  const status = searchParams.get('status') || ''

  useEffect(() => {
    setLoading(true)
    adminService
      .getDeals({
        page,
        limit: 20,
        status: status || undefined,
        search: searchParams.get('search') || undefined,
      })
      .then((data) => {
        setDeals(data.deals)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [page, status, searchParams])

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

  const handleStatusFilter = (newStatus: string) => {
    const params = new URLSearchParams(searchParams)
    if (newStatus) {
      params.set('status', newStatus)
    } else {
      params.delete('status')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', String(newPage))
    setSearchParams(params)
  }

  const handleExport = async (dealId: string) => {
    const userIdentifier = prompt('Введите Telegram ID или @username участника сделки:')
    if (!userIdentifier) return
    try {
      const { blob } = await adminService.exportDealPdf(dealId, userIdentifier.trim())
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `deal-${dealId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export error:', error)
      alert('Ошибка экспорта. Проверьте данные.')
    }
  }

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
                placeholder="ID сделки, username..."
                className="pl-10"
              />
            </div>
            <Button type="submit">Поиск</Button>
          </form>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-muted" />
            <div className="flex flex-wrap gap-2">
              {statusFilters.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => handleStatusFilter(filter.value)}
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
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : deals.length === 0 ? (
          <div className="text-center py-12 text-muted">Сделки не найдены</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted">ID</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Товар</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Сумма</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Статус</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Дата</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Платформа</th>
                  <th className="text-right p-4 text-sm font-medium text-muted">Действия</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => (
                  <tr key={deal._id} className="border-b border-border hover:bg-dark-lighter/50">
                    <td className="p-4">
                      <span className="font-mono text-sm text-gray-300">{deal.dealId}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-white">{truncate(deal.productName, 30)}</span>
                    </td>
                    <td className="p-4">
                      <span className="text-white font-medium">
                        {formatCurrency(deal.amount, deal.asset)}
                      </span>
                      <span className="block text-xs text-muted">
                        Ком: {formatCurrency(deal.commission, deal.asset)}
                      </span>
                    </td>
                    <td className="p-4">
                      <Badge variant={statusVariants[deal.status]}>
                        {statusLabels[deal.status] || deal.status}
                      </Badge>
                    </td>
                    <td className="p-4 text-sm text-muted">
                      {formatDateShort(deal.createdAt)}
                    </td>
                    <td className="p-4 text-sm text-muted">
                      {deal.platformCode || '—'}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/admin/deals/${deal._id}`}
                          className="p-2 text-gray-400 hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
                          title="Детали"
                        >
                          <Eye size={18} />
                        </Link>
                        <button
                          onClick={() => handleExport(deal._id)}
                          className="p-2 text-gray-400 hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
                          title="Экспорт PDF"
                        >
                          <Download size={18} />
                        </button>
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
