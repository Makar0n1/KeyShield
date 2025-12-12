import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { adminService } from '@/services/admin'
import type { Transaction } from '@/types'
import { Card, Button, Input } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { formatCurrency, formatDateShort } from '@/utils/format'
import { Search, ExternalLink, Filter } from 'lucide-react'

const typeLabels: Record<string, string> = {
  deposit: 'Депозит',
  payout: 'Выплата',
  refund: 'Возврат',
  commission: 'Комиссия',
}

const typeVariants: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'primary'> = {
  deposit: 'primary',
  payout: 'success',
  refund: 'warning',
  commission: 'default',
}

const statusVariants: Record<string, 'default' | 'success' | 'warning' | 'destructive'> = {
  pending: 'warning',
  confirmed: 'success',
  failed: 'destructive',
}

const typeFilters = [
  { value: '', label: 'Все' },
  { value: 'deposit', label: 'Депозиты' },
  { value: 'payout', label: 'Выплаты' },
  { value: 'refund', label: 'Возвраты' },
  { value: 'commission', label: 'Комиссии' },
]

export function AdminTransactionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [dealIdSearch, setDealIdSearch] = useState(searchParams.get('dealId') || '')

  const page = parseInt(searchParams.get('page') || '1')
  const type = searchParams.get('type') || ''

  useEffect(() => {
    setLoading(true)
    adminService
      .getTransactions({
        page,
        limit: 20,
        type: type || undefined,
        dealId: searchParams.get('dealId') || undefined,
      })
      .then((data) => {
        setTransactions(data.transactions as Transaction[])
        setTotal(data.total)
        setTotalPages(Math.ceil(data.total / 20))
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [page, type, searchParams])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams(searchParams)
    if (dealIdSearch) {
      params.set('dealId', dealIdSearch)
    } else {
      params.delete('dealId')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  const handleTypeFilter = (newType: string) => {
    const params = new URLSearchParams(searchParams)
    if (newType) {
      params.set('type', newType)
    } else {
      params.delete('type')
    }
    params.set('page', '1')
    setSearchParams(params)
  }

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams)
    params.set('page', String(newPage))
    setSearchParams(params)
  }

  const truncateHash = (hash: string) => {
    if (hash.length <= 20) return hash
    return `${hash.slice(0, 10)}...${hash.slice(-10)}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Транзакции</h1>
          <p className="text-muted">Всего: {total}</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search by deal ID */}
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
              <Input
                type="text"
                value={dealIdSearch}
                onChange={(e) => setDealIdSearch(e.target.value)}
                placeholder="ID сделки..."
                className="pl-10"
              />
            </div>
            <Button type="submit">Поиск</Button>
          </form>

          {/* Type filter */}
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-muted" />
            <div className="flex flex-wrap gap-2">
              {typeFilters.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => handleTypeFilter(filter.value)}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    type === filter.value
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
        ) : transactions.length === 0 ? (
          <div className="text-center py-12 text-muted">Транзакции не найдены</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted">Тип</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Сделка</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Сумма</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">TX Hash</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">От</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Кому</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Статус</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Дата</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx._id} className="border-b border-border hover:bg-dark-lighter/50">
                    <td className="p-4">
                      <Badge variant={typeVariants[tx.type] || 'default'}>
                        {typeLabels[tx.type] || tx.type}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Link
                        to={`/admin/deals/${tx.dealId}`}
                        className="text-primary hover:underline font-mono text-sm"
                      >
                        {tx.dealId}
                      </Link>
                    </td>
                    <td className="p-4">
                      <span className="text-white font-medium">
                        {formatCurrency(tx.amount, tx.asset)}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-gray-300">
                          {truncateHash(tx.txHash)}
                        </span>
                        <a
                          href={`https://tronscan.org/#/transaction/${tx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary-light"
                          title="Открыть в Tronscan"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-xs text-muted">
                        {truncateHash(tx.fromAddress || '')}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="font-mono text-xs text-muted">
                        {truncateHash(tx.toAddress || '')}
                      </span>
                    </td>
                    <td className="p-4">
                      <Badge variant={statusVariants[tx.status] || 'default'}>
                        {tx.status}
                      </Badge>
                      {tx.block !== undefined && (
                        <span className="text-xs text-muted ml-1">
                          (блок {tx.block})
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-sm text-muted">
                      {formatDateShort(tx.timestamp)}
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
