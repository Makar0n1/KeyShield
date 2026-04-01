import { useState, useEffect } from 'react'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
import { partnerService } from '@/services/partner'
import { Card, Button, Input } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/utils/format'
import {
  Wallet,
  Send,
  DollarSign,
  Clock,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Copy,
} from 'lucide-react'

const statusConfig: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  pending: { label: 'Ожидает', variant: 'warning' },
  processing: { label: 'В обработке', variant: 'warning' },
  completed: { label: 'Выполнена', variant: 'success' },
  rejected: { label: 'Отклонена', variant: 'destructive' },
}

export function PartnerWithdrawalsPage() {
  const { platform } = usePartnerAuth()
  const [withdrawals, setWithdrawals] = useState<any[]>([])
  const [availableBalance, setAvailableBalance] = useState(0)
  const [savedWallet, setSavedWallet] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copied, setCopied] = useState(false)

  const [amount, setAmount] = useState('')
  const [walletAddress, setWalletAddress] = useState('')

  const fetchData = async () => {
    try {
      const data = await partnerService.getWithdrawals()
      setWithdrawals(data.withdrawals)
      setAvailableBalance(data.availableBalance)
      setSavedWallet(data.walletAddress)
      if (data.walletAddress && !walletAddress) {
        setWalletAddress(data.walletAddress)
      }
    } catch (err) {
      console.error('Failed to fetch withdrawals:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount < 10) {
      setError('Минимальная сумма вывода: 10 USDT')
      return
    }
    if (numAmount > availableBalance) {
      setError('Сумма превышает доступный баланс')
      return
    }
    if (!walletAddress || !walletAddress.startsWith('T') || walletAddress.length !== 34) {
      setError('Введите корректный адрес кошелька TRC-20')
      return
    }

    setSubmitting(true)
    try {
      const result = await partnerService.requestWithdrawal(numAmount, walletAddress)
      setSuccess(`Заявка ${result.withdrawal.withdrawalId} создана! Ожидайте обработки.`)
      setAmount('')
      fetchData()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Ошибка при создании заявки')
    } finally {
      setSubmitting(false)
    }
  }

  const copyWallet = (address: string) => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const hasPending = withdrawals.some(w => w.status === 'pending' || w.status === 'processing')
  const pendingWithdrawal = withdrawals.find(w => w.status === 'pending' || w.status === 'processing')

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">Вывод средств</h1>
        <p className="text-sm text-muted">Партнёрская комиссия: {platform?.commissionPercent || 0}% от чистой прибыли</p>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card className="p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 shrink-0">
              <Wallet className="text-primary" size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-muted">Всего заработано</p>
              <p className="text-lg sm:text-2xl font-bold text-white truncate">
                {(platform?.stats?.platformEarnings || 0).toFixed(2)}
                <span className="text-sm font-normal text-muted ml-1">USDT</span>
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-green-500/10 shrink-0">
              <Send className="text-green-400" size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-muted">Выведено</p>
              <p className="text-lg sm:text-2xl font-bold text-white truncate">
                {(platform?.stats?.withdrawnTotal || 0).toFixed(2)}
                <span className="text-sm font-normal text-muted ml-1">USDT</span>
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-yellow-500/10 shrink-0">
              <DollarSign className="text-yellow-400" size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-muted">Доступно к выводу</p>
              <p className="text-lg sm:text-2xl font-bold text-green-400 truncate">
                {availableBalance.toFixed(2)}
                <span className="text-sm font-normal text-green-400/60 ml-1">USDT</span>
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Active Pending Withdrawal */}
      {hasPending && pendingWithdrawal && (
        <Card className="p-4 sm:p-6 border-yellow-500/20">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10 shrink-0 mt-0.5">
              <Clock className="text-yellow-400" size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-yellow-400 mb-1">Активная заявка</p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-sm">
                <span className="text-white font-mono">{pendingWithdrawal.withdrawalId}</span>
                <span className="text-muted">{pendingWithdrawal.amount.toFixed(2)} USDT</span>
                <Badge variant={statusConfig[pendingWithdrawal.status]?.variant || 'warning'}>
                  {statusConfig[pendingWithdrawal.status]?.label || pendingWithdrawal.status}
                </Badge>
              </div>
              <p className="text-xs text-muted mt-2">Дождитесь обработки текущей заявки перед созданием новой</p>
            </div>
          </div>
        </Card>
      )}

      {/* Withdrawal Form */}
      {!hasPending && availableBalance >= 10 && (
        <Card className="p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Send size={18} />
            Запросить вывод
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg flex items-start gap-2">
              <CheckCircle2 size={16} className="text-green-400 shrink-0 mt-0.5" />
              <p className="text-green-400 text-sm">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Сумма (USDT)
              </label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    type="number"
                    step="0.01"
                    min="10"
                    max={availableBalance}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="Минимум 10"
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAmount(availableBalance.toFixed(2))}
                  className="shrink-0 px-4"
                >
                  MAX
                </Button>
              </div>
              <p className="text-xs text-muted mt-1">
                Доступно: {availableBalance.toFixed(2)} USDT
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Кошелёк TRC-20
              </label>
              <Input
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                placeholder="T..."
              />
              {savedWallet && walletAddress !== savedWallet && (
                <button
                  type="button"
                  className="text-xs text-primary mt-2 hover:underline flex items-center gap-1"
                  onClick={() => setWalletAddress(savedWallet)}
                >
                  <Wallet size={12} />
                  Использовать сохранённый: {savedWallet.slice(0, 8)}...{savedWallet.slice(-4)}
                </button>
              )}
            </div>

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Отправка...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Send size={16} />
                  Запросить вывод
                </span>
              )}
            </Button>

            <p className="text-xs text-muted text-center">
              Выплаты обрабатываются в течение 24-48 часов
            </p>
          </form>
        </Card>
      )}

      {/* Not enough balance */}
      {availableBalance < 10 && !hasPending && (
        <Card className="p-4 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-dark-lighter shrink-0 mt-0.5">
              <Wallet className="text-muted" size={18} />
            </div>
            <div>
              <p className="text-white font-medium mb-1">Недостаточно средств</p>
              <p className="text-sm text-muted">
                Минимальная сумма для вывода: <span className="text-white">10 USDT</span>.
                Осталось накопить: <span className="text-yellow-400">{(10 - availableBalance).toFixed(2)} USDT</span>
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Withdrawal History */}
      {withdrawals.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-white mb-3 sm:mb-4">История выводов</h2>

          {/* Desktop table */}
          <Card className="overflow-hidden hidden sm:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 text-sm font-medium text-muted">ID</th>
                    <th className="text-left p-4 text-sm font-medium text-muted">Дата</th>
                    <th className="text-left p-4 text-sm font-medium text-muted">Сумма</th>
                    <th className="text-left p-4 text-sm font-medium text-muted">Кошелёк</th>
                    <th className="text-left p-4 text-sm font-medium text-muted">Статус</th>
                    <th className="text-right p-4 text-sm font-medium text-muted">TX</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawals.map((w) => {
                    const config = statusConfig[w.status] || statusConfig.pending
                    return (
                      <tr key={w._id} className="border-b border-border hover:bg-dark-lighter/50">
                        <td className="p-4 font-mono text-sm text-primary">{w.withdrawalId}</td>
                        <td className="p-4 text-sm text-gray-300">{formatDate(w.createdAt)}</td>
                        <td className="p-4 text-sm font-medium text-white">{w.amount.toFixed(2)} USDT</td>
                        <td className="p-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-sm text-gray-400">
                              {w.walletAddress.slice(0, 6)}...{w.walletAddress.slice(-4)}
                            </span>
                            <button
                              onClick={() => copyWallet(w.walletAddress)}
                              className="p-1 text-gray-500 hover:text-white rounded transition-colors"
                            >
                              <Copy size={13} />
                            </button>
                          </div>
                        </td>
                        <td className="p-4">
                          <Badge variant={config.variant}>{config.label}</Badge>
                        </td>
                        <td className="p-4 text-right">
                          {w.txHash ? (
                            <a
                              href={`https://tronscan.org/#/transaction/${w.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                            >
                              <ExternalLink size={14} />
                              <span className="font-mono">{w.txHash.slice(0, 8)}...</span>
                            </a>
                          ) : w.status === 'rejected' && w.adminNotes ? (
                            <span className="text-xs text-red-400">{w.adminNotes}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {withdrawals.map((w) => {
              const config = statusConfig[w.status] || statusConfig.pending
              return (
                <Card key={w._id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-sm text-primary">{w.withdrawalId}</span>
                    <Badge variant={config.variant}>{config.label}</Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted">Сумма</span>
                      <span className="text-sm font-medium text-white">{w.amount.toFixed(2)} USDT</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted">Дата</span>
                      <span className="text-sm text-gray-300">{formatDate(w.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted">Кошелёк</span>
                      <button
                        onClick={() => copyWallet(w.walletAddress)}
                        className="text-sm font-mono text-gray-400 hover:text-white flex items-center gap-1"
                      >
                        {w.walletAddress.slice(0, 6)}...{w.walletAddress.slice(-4)}
                        <Copy size={12} />
                      </button>
                    </div>

                    {w.txHash && (
                      <div className="pt-2 border-t border-border/50">
                        <a
                          href={`https://tronscan.org/#/transaction/${w.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline flex items-center gap-1.5 text-sm"
                        >
                          <ExternalLink size={14} />
                          Транзакция: {w.txHash.slice(0, 10)}...
                        </a>
                      </div>
                    )}

                    {w.status === 'rejected' && w.adminNotes && (
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-xs text-red-400">Причина: {w.adminNotes}</p>
                      </div>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {withdrawals.length === 0 && (
        <Card className="p-8 sm:p-12 text-center">
          <Wallet className="mx-auto text-muted mb-3" size={40} />
          <p className="text-white font-medium mb-1">Нет выводов</p>
          <p className="text-sm text-muted">История выводов будет отображаться здесь</p>
        </Card>
      )}

      {/* Copied toast */}
      {copied && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-dark-lighter border border-border rounded-lg text-sm text-white shadow-lg z-50 flex items-center gap-2">
          <CheckCircle2 size={14} className="text-green-400" />
          Адрес скопирован
        </div>
      )}
    </div>
  )
}
