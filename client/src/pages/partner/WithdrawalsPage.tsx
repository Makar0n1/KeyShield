import { useState, useEffect } from 'react'
import { usePartnerAuth } from '@/contexts/PartnerAuthContext'
import { partnerService } from '@/services/partner'
import { Button, Input } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/utils/format'
import {
  Send,
  Clock,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Copy,
  ArrowUpRight,
  Wallet,
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
  const [showForm, setShowForm] = useState(false)

  const [amount, setAmount] = useState('')

  const fetchData = async () => {
    try {
      const data = await partnerService.getWithdrawals()
      setWithdrawals(data.withdrawals)
      setAvailableBalance(data.availableBalance)
      setSavedWallet(data.walletAddress)
    } catch (err) {
      console.error('Failed to fetch withdrawals:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const numAmount = parseFloat(amount)
    if (!numAmount || numAmount < 10) {
      setError('Минимальная сумма: 10 USDT')
      return
    }
    if (numAmount > availableBalance) {
      setError('Превышает доступный баланс')
      return
    }
    if (!savedWallet) {
      setError('Сначала укажите кошелёк в настройках')
      return
    }

    setSubmitting(true)
    try {
      const result = await partnerService.requestWithdrawal(numAmount, savedWallet)
      setSuccess(`Заявка ${result.withdrawal.withdrawalId} создана`)
      setAmount('')
      setShowForm(false)
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
  const totalWithdrawn = platform?.stats?.withdrawnTotal || 0
  const totalEarned = platform?.stats?.platformEarnings || 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Balance hero */}
      <div className="mb-8 sm:mb-10">
        <p className="text-xs uppercase tracking-widest p-text-muted mb-1">Доступно к выводу</p>
        <h1 className="text-4xl sm:text-5xl font-extralight tracking-tight">
          <span className={availableBalance >= 10 ? 'text-green-400' : 'p-text'}>{availableBalance.toFixed(2)}</span>
          <span className="text-lg sm:text-xl p-text-muted ml-2 font-normal">USDT</span>
        </h1>
      </div>

      {/* Earnings row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4 mb-8">
        <div>
          <p className="text-[11px] uppercase tracking-widest p-text-muted mb-1">Заработано</p>
          <p className="text-xl font-light p-text">{totalEarned.toFixed(2)}<span className="text-sm p-text-muted ml-1">$</span></p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-widest p-text-muted mb-1">Выведено</p>
          <p className="text-xl font-light p-text">{totalWithdrawn.toFixed(2)}<span className="text-sm p-text-muted ml-1">$</span></p>
        </div>
        <div className="hidden sm:block">
          <p className="text-[11px] uppercase tracking-widest p-text-muted mb-1">Комиссия</p>
          <p className="text-xl font-light text-primary">{platform?.commissionPercent || 0}%</p>
        </div>
      </div>

      {/* Pending withdrawal notice */}
      {hasPending && pendingWithdrawal && (
        <div className="border-t border-[var(--p-divider)] pt-5 mb-8">
          <div className="flex items-start gap-3">
            <Clock size={16} className="text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm p-text">Активная заявка <span className="font-mono p-text-secondary">{pendingWithdrawal.withdrawalId}</span></p>
              <p className="text-xs p-text-muted mt-0.5">{pendingWithdrawal.amount.toFixed(2)} USDT — ожидайте обработки</p>
            </div>
          </div>
        </div>
      )}

      {/* Withdraw action */}
      {!hasPending && availableBalance >= 10 && !savedWallet && (
        <div className="mb-8">
          <p className="text-sm p-text-secondary mb-2">Для вывода средств необходимо указать кошелёк</p>
          <a
            href="/partner/settings"
            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-full transition-colors"
            style={{ background: 'var(--p-btn-accent)', color: 'var(--p-btn-accent-text)' }}
          >
            <Wallet size={14} />
            Указать кошелёк в настройках
          </a>
        </div>
      )}

      {!hasPending && availableBalance >= 10 && savedWallet && !showForm && (
        <div className="mb-8">
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-full transition-colors"
            style={{ background: 'var(--p-pill-active-bg)', color: 'var(--p-pill-active-text)' }}
          >
            <ArrowUpRight size={16} />
            Запросить вывод
          </button>
        </div>
      )}

      {/* Withdraw form */}
      {showForm && (
        <div className="border-t border-[var(--p-divider)] pt-6 mb-8">
          {error && (
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle size={14} className="text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 size={14} className="text-green-400 shrink-0" />
              <p className="text-sm text-green-400">{success}</p>
            </div>
          )}

          {/* Wallet preview */}
          <div className="flex items-center gap-2 mb-4 text-xs p-text-muted">
            <Wallet size={13} />
            <span>Вывод на: <span className="font-mono p-text-secondary">{savedWallet?.slice(0, 8)}...{savedWallet?.slice(-6)}</span></span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
            <div>
              <label className="block text-[11px] uppercase tracking-widest p-text-muted mb-2">Сумма</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="10"
                  max={availableBalance}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="10.00"
                />
                <button
                  type="button"
                  onClick={() => setAmount(availableBalance.toFixed(2))}
                  className="shrink-0 px-3 py-2 text-xs uppercase tracking-wider p-text-secondary border rounded-lg transition-colors"
                  style={{ borderColor: 'var(--p-pill-border)' }}
                >
                  Max
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" disabled={submitting} className="px-6">
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                    Отправка
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Send size={14} />
                    Отправить
                  </span>
                )}
              </Button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setError('') }}
                className="text-sm p-text-muted transition-colors"
              >
                Отмена
              </button>
            </div>

            <p className="text-xs p-text-faint">Обработка: 24-48 часов</p>
          </form>
        </div>
      )}

      {/* Not enough */}
      {availableBalance < 10 && !hasPending && (
        <div className="mb-8 text-sm p-text-muted">
          Минимум для вывода: 10 USDT. Осталось накопить: <span className="p-text-secondary">{(10 - availableBalance).toFixed(2)} USDT</span>
        </div>
      )}

      {/* History */}
      {withdrawals.length > 0 && (
        <div className="border-t border-[var(--p-divider)] pt-6">
          <h2 className="text-[11px] uppercase tracking-widest p-text-muted mb-4">История выводов</h2>

          <div className="divide-y [&>*]:border-[var(--p-divider)]">
            {withdrawals.map((w) => {
              const config = statusConfig[w.status] || statusConfig.pending
              return (
                <div key={w._id} className="py-3.5 first:pt-0 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs p-text-secondary">{w.withdrawalId}</span>
                      <Badge variant={config.variant}>{config.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs p-text-faint">
                      <span>{formatDate(w.createdAt)}</span>
                      <button
                        onClick={() => copyWallet(w.walletAddress)}
                        className="font-mono hover:p-text-secondary transition-colors flex items-center gap-1"
                      >
                        {w.walletAddress.slice(0, 6)}...{w.walletAddress.slice(-4)}
                        <Copy size={10} />
                      </button>
                    </div>
                    {w.status === 'rejected' && w.adminNotes && (
                      <p className="text-xs text-red-400/70 mt-1">{w.adminNotes}</p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm tabular-nums p-text">{w.amount.toFixed(2)} <span className="p-text-muted text-xs">USDT</span></p>
                    {w.txHash && (
                      <a
                        href={`https://tronscan.org/#/transaction/${w.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5 mt-0.5"
                      >
                        TX <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {withdrawals.length === 0 && (
        <div className="border-t border-[var(--p-divider)] pt-6 text-sm p-text-faint">
          Нет выводов
        </div>
      )}

      {/* Copied toast */}
      {copied && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-full text-xs p-text z-50 flex items-center gap-1.5">
          <CheckCircle2 size={12} className="text-green-400" />
          Скопировано
        </div>
      )}
    </div>
  )
}
