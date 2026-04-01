import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { adminService } from '@/services/admin'
import { Card } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { formatDateShort } from '@/utils/format'
import {
  Filter,
  CheckCircle,
  XCircle,
  ExternalLink,
  Copy,
  Clock,
  DollarSign,
  Building2,
  TrendingUp,
} from 'lucide-react'

const statusFilters = [
  { value: '', label: 'Все' },
  { value: 'pending', label: 'Ожидают' },
  { value: 'completed', label: 'Выполнены' },
  { value: 'rejected', label: 'Отклонены' },
]

const statusLabels: Record<string, { label: string; variant: 'default' | 'warning' | 'success' | 'destructive' }> = {
  pending: { label: 'Ожидает', variant: 'warning' },
  processing: { label: 'В обработке', variant: 'default' },
  completed: { label: 'Выполнена', variant: 'success' },
  rejected: { label: 'Отклонена', variant: 'destructive' },
}

export function AdminPartnerWithdrawalsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [withdrawals, setWithdrawals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Modal state
  const [actionModal, setActionModal] = useState<{
    type: 'complete' | 'reject' | null
    withdrawal: any | null
  }>({ type: null, withdrawal: null })
  const [actionInput, setActionInput] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const status = searchParams.get('status') || ''

  // Stats computed from withdrawals
  const pendingCount = withdrawals.filter(w => w.status === 'pending').length
  const totalPaidOut = withdrawals
    .filter(w => w.status === 'completed')
    .reduce((sum, w) => sum + w.amount, 0)
  const totalPending = withdrawals
    .filter(w => w.status === 'pending')
    .reduce((sum, w) => sum + w.amount, 0)
  const partnersCount = new Set(withdrawals.map(w => w.platformId)).size

  const fetchWithdrawals = () => {
    setLoading(true)
    adminService
      .getPartnerWithdrawals({
        status: status || undefined,
      })
      .then((data) => {
        setWithdrawals(data)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchWithdrawals()
  }, [status])

  const handleStatusFilter = (newStatus: string) => {
    const params = new URLSearchParams(searchParams)
    if (newStatus) {
      params.set('status', newStatus)
    } else {
      params.delete('status')
    }
    setSearchParams(params)
  }

  const openCompleteModal = (withdrawal: any) => {
    setActionModal({ type: 'complete', withdrawal })
    setActionInput('')
  }

  const openRejectModal = (withdrawal: any) => {
    setActionModal({ type: 'reject', withdrawal })
    setActionInput('')
  }

  const handleActionConfirm = async () => {
    if (!actionModal.withdrawal) return
    if (!actionInput.trim()) {
      alert(actionModal.type === 'complete' ? 'Введите хеш транзакции' : 'Введите причину отклонения')
      return
    }

    setActionLoading(true)
    try {
      if (actionModal.type === 'complete') {
        await adminService.completePartnerWithdrawal(actionModal.withdrawal._id, actionInput.trim())
      } else {
        await adminService.rejectPartnerWithdrawal(actionModal.withdrawal._id, actionInput.trim())
      }
      setActionModal({ type: null, withdrawal: null })
      fetchWithdrawals()
    } catch (error) {
      console.error('Action error:', error)
      alert('Ошибка при выполнении действия')
    } finally {
      setActionLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const filtered = status
    ? withdrawals.filter(w => w.status === status)
    : withdrawals

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Выводы партнёров</h1>
          <p className="text-muted">Всего заявок: {withdrawals.length}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <Clock className="text-yellow-500" size={20} />
            </div>
            <div>
              <p className="text-sm text-muted">Ожидают</p>
              <p className="text-xl font-bold text-white">{pendingCount}</p>
              {totalPending > 0 && (
                <p className="text-xs text-yellow-400">{totalPending.toFixed(2)} USDT</p>
              )}
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <DollarSign className="text-green-500" size={20} />
            </div>
            <div>
              <p className="text-sm text-muted">Выплачено</p>
              <p className="text-xl font-bold text-white">{totalPaidOut.toFixed(2)} $</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Building2 className="text-blue-500" size={20} />
            </div>
            <div>
              <p className="text-sm text-muted">Партнёров</p>
              <p className="text-xl font-bold text-white">{partnersCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <TrendingUp className="text-purple-500" size={20} />
            </div>
            <div>
              <p className="text-sm text-muted">Всего заявок</p>
              <p className="text-xl font-bold text-white">{withdrawals.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Filter size={18} className="text-muted" />
          <div className="flex gap-2 flex-wrap">
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
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted">Заявки не найдены</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-4 text-sm font-medium text-muted">ID</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Партнёр</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Сумма</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Кошелёк</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Статус</th>
                  <th className="text-left p-4 text-sm font-medium text-muted">Дата</th>
                  <th className="text-right p-4 text-sm font-medium text-muted">Действия</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((withdrawal) => {
                  const statusInfo = statusLabels[withdrawal.status] || statusLabels.pending
                  const isPending = withdrawal.status === 'pending'
                  const shortWallet = withdrawal.walletAddress.slice(0, 8) + '...' + withdrawal.walletAddress.slice(-6)

                  return (
                    <tr key={withdrawal._id} className="border-b border-border hover:bg-dark-lighter/50">
                      <td className="p-4">
                        <span className="font-mono text-sm text-primary">{withdrawal.withdrawalId}</span>
                      </td>
                      <td className="p-4">
                        <span className="text-white font-medium">{withdrawal.platformName || '—'}</span>
                      </td>
                      <td className="p-4">
                        <span className="font-medium text-white">{withdrawal.amount.toFixed(2)} USDT</span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-gray-300">{shortWallet}</span>
                          <button
                            onClick={() => copyToClipboard(withdrawal.walletAddress)}
                            className="p-1 text-gray-500 hover:text-white rounded transition-colors"
                            title="Копировать адрес"
                          >
                            <Copy size={14} />
                          </button>
                          <a
                            href={`https://tronscan.org/#/address/${withdrawal.walletAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-gray-500 hover:text-primary rounded transition-colors"
                            title="Открыть в TronScan"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      </td>
                      <td className="p-4">
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        {withdrawal.txHash && (
                          <a
                            href={`https://tronscan.org/#/transaction/${withdrawal.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block mt-1 text-xs text-primary hover:underline"
                          >
                            TX: {withdrawal.txHash.slice(0, 8)}...
                          </a>
                        )}
                        {withdrawal.status === 'rejected' && withdrawal.adminNotes && (
                          <p className="mt-1 text-xs text-red-400">{withdrawal.adminNotes}</p>
                        )}
                      </td>
                      <td className="p-4 text-sm text-muted">
                        {formatDateShort(withdrawal.createdAt)}
                        {withdrawal.completedAt && (
                          <p className="text-xs text-green-400 mt-1">
                            Выплачено: {formatDateShort(withdrawal.completedAt)}
                          </p>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          {isPending && (
                            <>
                              <button
                                onClick={() => openCompleteModal(withdrawal)}
                                className="p-2 text-green-400 hover:text-green-300 hover:bg-dark-lighter rounded-lg transition-colors"
                                title="Выплатить (ввести TX hash)"
                              >
                                <CheckCircle size={18} />
                              </button>
                              <button
                                onClick={() => openRejectModal(withdrawal)}
                                className="p-2 text-red-400 hover:text-red-300 hover:bg-dark-lighter rounded-lg transition-colors"
                                title="Отклонить"
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

      {/* Action Modal */}
      {actionModal.type && actionModal.withdrawal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-light rounded-xl p-6 max-w-md w-full border border-border">
            <h3 className="text-xl font-semibold text-white mb-4">
              {actionModal.type === 'complete' ? 'Завершение выплаты' : 'Отклонение заявки'}
            </h3>

            <div className="mb-4 p-3 bg-dark-lighter rounded-lg space-y-1">
              <p className="text-sm text-muted">
                Заявка: <span className="text-white">{actionModal.withdrawal.withdrawalId}</span>
              </p>
              <p className="text-sm text-muted">
                Партнёр: <span className="text-white">{actionModal.withdrawal.platformName}</span>
              </p>
              <p className="text-sm text-muted">
                Сумма: <span className="text-white font-medium">{actionModal.withdrawal.amount.toFixed(2)} USDT</span>
              </p>
              <p className="text-sm text-muted">
                Кошелёк: <span className="text-white font-mono text-xs">{actionModal.withdrawal.walletAddress}</span>
              </p>
            </div>

            {actionModal.type === 'complete' && (
              <div className="mb-4 p-3 bg-dark-lighter rounded-lg">
                <button
                  onClick={() => copyToClipboard(actionModal.withdrawal.walletAddress)}
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  <Copy size={14} />
                  Скопировать адрес кошелька
                </button>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm text-muted mb-2">
                {actionModal.type === 'complete' ? 'Хеш транзакции (TX Hash)' : 'Причина отклонения'}
              </label>
              <input
                type="text"
                value={actionInput}
                onChange={(e) => setActionInput(e.target.value)}
                placeholder={actionModal.type === 'complete' ? 'Введите TX hash...' : 'Введите причину...'}
                className="w-full px-4 py-2 bg-dark border border-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setActionModal({ type: null, withdrawal: null })}
                className="flex-1 px-4 py-2 bg-dark-lighter text-white rounded-lg hover:bg-dark-light transition-colors"
                disabled={actionLoading}
              >
                Отмена
              </button>
              <button
                onClick={handleActionConfirm}
                className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
                  actionModal.type === 'complete'
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-red-600 hover:bg-red-500 text-white'
                }`}
                disabled={actionLoading}
              >
                {actionLoading ? 'Загрузка...' : actionModal.type === 'complete' ? 'Выплачено' : 'Отклонить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
