import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { adminService } from '@/services/admin'
import type { Dispute, Deal } from '@/types'
import { Card } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { DeadlineSelectModal } from '@/components/ui/DeadlineSelectModal'
import { formatDateShort, truncate } from '@/utils/format'
import { Eye, Filter, CheckCircle, XCircle } from 'lucide-react'

const statusFilters = [
  { value: '', label: 'Все' },
  { value: 'open', label: 'Открытые' },
  { value: 'in_review', label: 'На рассмотрении' },
  { value: 'resolved', label: 'Решённые' },
]

export function AdminDisputesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)

  // Modal state
  const [cancelModalOpen, setCancelModalOpen] = useState(false)
  const [cancelDisputeId, setCancelDisputeId] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const page = parseInt(searchParams.get('page') || '1')
  const status = searchParams.get('status') || ''

  const fetchDisputes = () => {
    setLoading(true)
    adminService
      .getDisputes({
        page,
        limit: 20,
        status: status || undefined,
      })
      .then((data) => {
        setDisputes(data.disputes)
        setTotal(data.total)
        setTotalPages(data.totalPages)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchDisputes()
  }, [page, status])

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

  const handleResolve = async (disputeId: string, winner: 'buyer' | 'seller') => {
    const reason = prompt(`Причина решения в пользу ${winner === 'buyer' ? 'покупателя' : 'продавца'}:`)
    if (!reason) return
    try {
      await adminService.resolveDispute(disputeId, { winner, reason })
      fetchDisputes()
    } catch (error) {
      console.error('Resolve error:', error)
      alert('Ошибка при решении спора')
    }
  }

  const openCancelModal = (disputeId: string) => {
    setCancelDisputeId(disputeId)
    setCancelModalOpen(true)
  }

  const handleCancelConfirm = async (deadlineHours: number) => {
    if (!cancelDisputeId) return
    setCancelling(true)
    try {
      await adminService.cancelDispute(cancelDisputeId, deadlineHours)
      setCancelModalOpen(false)
      setCancelDisputeId(null)
      fetchDisputes()
    } catch (error) {
      console.error('Cancel error:', error)
      alert('Ошибка при отмене спора')
    } finally {
      setCancelling(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Споры</h1>
          <p className="text-muted">Всего: {total}</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-muted" />
          <div className="flex gap-2">
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
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : disputes.length === 0 ? (
          <div className="text-center py-12 text-muted">Споры не найдены</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted">Сделка</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Инициатор</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Причина</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Доказательства</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Статус</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Дата</th>
                  <th className="text-right p-4 text-sm font-medium text-muted">Действия</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((dispute: any) => {
                  const deal = typeof dispute.dealId === 'object' ? dispute.dealId as Deal : null
                  // Используем реальные поля из модели Dispute
                  const openedBy = dispute.openedBy || dispute.initiatorId
                  const reasonText = dispute.reasonText || dispute.reason || ''
                  const media = dispute.media || dispute.evidence || []
                  const isOpen = dispute.status === 'open' || dispute.status === 'in_review' || dispute.status === 'pending'
                  const winner = dispute.decision === 'refund_buyer' ? 'buyer'
                    : dispute.decision === 'release_seller' ? 'seller'
                    : dispute.winner

                  return (
                    <tr key={dispute._id} className="border-b border-border hover:bg-dark-lighter/50">
                      <td className="p-4">
                        {deal ? (
                          <Link
                            to={`/admin/deals/${deal._id}`}
                            className="text-primary hover:underline font-mono text-sm"
                          >
                            {deal.dealId}
                          </Link>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        <Link
                          to={`/admin/users/${openedBy}`}
                          className="text-white hover:text-primary"
                        >
                          {openedBy}
                        </Link>
                      </td>
                      <td className="p-4">
                        <span className="text-gray-300">{truncate(reasonText, 50)}</span>
                      </td>
                      <td className="p-4 text-sm text-muted">
                        {media.length || 0} файлов
                      </td>
                      <td className="p-4">
                        {isOpen ? (
                          <Badge variant="warning">
                            {dispute.status === 'in_review' ? 'На рассмотрении' : 'Открыт'}
                          </Badge>
                        ) : (
                          <Badge variant="success">
                            {winner === 'buyer' ? 'Покупатель' : 'Продавец'}
                          </Badge>
                        )}
                      </td>
                      <td className="p-4 text-sm text-muted">
                        {formatDateShort(dispute.createdAt)}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/admin/disputes/${dispute._id}`}
                            className="p-2 text-gray-400 hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
                            title="Детали"
                          >
                            <Eye size={18} />
                          </Link>
                          {isOpen && (
                            <>
                              <button
                                onClick={() => handleResolve(dispute._id, 'buyer')}
                                className="p-2 text-green-400 hover:text-green-300 hover:bg-dark-lighter rounded-lg transition-colors"
                                title="В пользу покупателя"
                              >
                                <CheckCircle size={18} />
                              </button>
                              <button
                                onClick={() => handleResolve(dispute._id, 'seller')}
                                className="p-2 text-blue-400 hover:text-blue-300 hover:bg-dark-lighter rounded-lg transition-colors"
                                title="В пользу продавца"
                              >
                                <CheckCircle size={18} />
                              </button>
                              <button
                                onClick={() => openCancelModal(dispute._id)}
                                className="p-2 text-red-400 hover:text-red-300 hover:bg-dark-lighter rounded-lg transition-colors"
                                title="Отменить спор"
                              >
                                <XCircle size={18} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
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
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      )}

      {/* Cancel Dispute Modal */}
      <DeadlineSelectModal
        isOpen={cancelModalOpen}
        onClose={() => {
          setCancelModalOpen(false)
          setCancelDisputeId(null)
        }}
        onConfirm={handleCancelConfirm}
        loading={cancelling}
      />
    </div>
  )
}
