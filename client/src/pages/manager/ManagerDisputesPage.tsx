import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { managerService, type AnonymizedDispute } from '@/services/manager'
import { Card } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { formatDateShort, truncate } from '@/utils/format'
import { Eye, Filter, Scale } from 'lucide-react'

const statusFilters = [
  { value: '', label: 'Все' },
  { value: 'open', label: 'Открытые' },
  { value: 'in_review', label: 'На рассмотрении' },
  { value: 'resolved', label: 'Решённые' },
]

export function ManagerDisputesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [disputes, setDisputes] = useState<AnonymizedDispute[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  const page = parseInt(searchParams.get('page') || '1')
  const status = searchParams.get('status') || ''

  useEffect(() => {
    setLoading(true)
    managerService.listDisputes({ page, limit: 20, status: status || undefined })
      .then((data) => {
        setDisputes(data.disputes)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [page, status])

  const setStatus = (s: string) => {
    const p = new URLSearchParams(searchParams)
    if (s) p.set('status', s); else p.delete('status')
    p.set('page', '1')
    setSearchParams(p)
  }

  const setPage = (n: number) => {
    const p = new URLSearchParams(searchParams)
    p.set('page', String(n))
    setSearchParams(p)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Scale size={24} /> Споры
        </h1>
        <p className="text-muted text-sm">
          Все данные участников анонимизированы — вы видите только номер сделки, товар и сумму.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter size={16} className="text-muted" />
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              status === f.value
                ? 'bg-primary text-white border-primary'
                : 'text-muted border-dark-lighter hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : disputes.length === 0 ? (
        <Card className="p-12 text-center text-muted">Споров нет</Card>
      ) : (
        <div className="space-y-2">
          {disputes.map((d) => (
            <Link key={d._id} to={`/manager/disputes/${d._id}`}>
              <Card className="p-4 hover:border-primary/40 transition-colors">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant={
                        d.status === 'resolved' ? 'success' :
                        d.status === 'in_review' ? 'warning' : 'default'
                      }>
                        {d.status === 'open' ? 'Открыт' : d.status === 'in_review' ? 'На рассмотрении' : 'Решён'}
                      </Badge>
                      {d.deal?.dealId && (
                        <span className="text-sm font-mono text-white">{d.deal.dealId}</span>
                      )}
                      {d.openedByRoleLabel && (
                        <span className="text-xs text-muted">открыл: {d.openedByRoleLabel}</span>
                      )}
                    </div>
                    <div className="text-sm text-white truncate">{d.deal?.productName || 'без названия'}</div>
                    <div className="text-xs text-muted mt-1">
                      {d.deal?.amount} {d.deal?.asset} · {truncate(d.reasonText, 80)} · {formatDateShort(d.createdAt)}
                    </div>
                  </div>
                  <Eye size={20} className="text-muted shrink-0 mt-1" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {total > 0 && (
        <p className="text-xs text-muted text-center">Всего: {total}</p>
      )}
    </div>
  )
}
