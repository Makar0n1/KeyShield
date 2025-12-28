import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { adminService } from '@/services/admin'
import { configService } from '@/services/config'
import type { Deal, DealStatus, Dispute } from '@/types'
import { Card, Button } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/utils/format'
import {
  ArrowLeft,
  Download,
  User,
  Wallet,
  Clock,
  FileText,
  ExternalLink,
  Copy,
  Check,
  Receipt,
} from 'lucide-react'

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className="p-1 text-muted hover:text-white transition-colors"
      title="Копировать"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

function AddressLink({ address }: { address: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm">{address}</span>
      <CopyButton text={address} />
      <a
        href={`https://tronscan.org/#/address/${address}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:text-primary-light"
        title="Открыть в Tronscan"
      >
        <ExternalLink size={14} />
      </a>
    </div>
  )
}

export function AdminDealDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const [deal, setDeal] = useState<Deal | null>(null)
  const [dispute, setDispute] = useState<Dispute | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Get config defaults for fallback values
  const config = configService.getCachedConfig()

  useEffect(() => {
    // Preload config on mount
    configService.getConfig()
  }, [])

  useEffect(() => {
    if (!id) return
    adminService
      .getDeal(id)
      .then(async (dealData) => {
        setDeal(dealData)
        // If deal has dispute status, try to load the dispute
        if (['dispute', 'resolved'].includes(dealData.status)) {
          try {
            const disputes = await adminService.getDisputes({ limit: 100 })
            const dealDispute = disputes.disputes.find(
              (d) => (typeof d.dealId === 'object' ? d.dealId._id : d.dealId) === dealData._id
            )
            if (dealDispute) {
              setDispute(dealDispute)
            }
          } catch (e) {
            // Ignore dispute loading errors
          }
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  const handleExport = async () => {
    if (!deal) return
    const userIdentifier = prompt('Введите Telegram ID или @username участника сделки:')
    if (!userIdentifier) return
    try {
      const { blob } = await adminService.exportDealPdf(deal._id, userIdentifier.trim())
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `deal-${deal.dealId}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export error:', err)
      alert('Ошибка экспорта. Проверьте данные.')
    }
  }

  const handleDownloadReceipt = async (recipientType: 'buyer' | 'seller') => {
    if (!deal) return
    // Use the same exportDealPdf endpoint with user identifier
    const userIdentifier = recipientType === 'buyer' ? String(deal.buyerId) : String(deal.sellerId)
    try {
      const { blob, filename } = await adminService.exportDealPdf(deal._id, userIdentifier)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Receipt download error:', err)
      alert('Ошибка скачивания чека.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !deal) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">{error || 'Сделка не найдена'}</p>
        <Link to="/admin/deals" className="text-primary hover:underline">
          ← Вернуться к списку
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/admin/deals"
            className="p-2 text-muted hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">Сделка #{deal.dealId}</h1>
              <Badge variant={statusVariants[deal.status]}>
                {statusLabels[deal.status] || deal.status}
              </Badge>
            </div>
            <p className="text-muted">Создана {formatDate(deal.createdAt)}</p>
          </div>
        </div>
        <Button onClick={handleExport} variant="secondary">
          <Download size={18} className="mr-2" />
          Экспорт PDF
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Main Info */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <FileText size={20} />
            Информация о сделке
          </h2>
          <dl className="space-y-4">
            <div>
              <dt className="text-muted text-sm">Товар/Услуга</dt>
              <dd className="text-white font-medium">{deal.productName}</dd>
            </div>
            <div>
              <dt className="text-muted text-sm">Описание</dt>
              <dd className="text-gray-300">{deal.description}</dd>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-muted text-sm">Сумма</dt>
                <dd className="text-white font-medium text-lg">
                  {formatCurrency(deal.amount, deal.asset)}
                </dd>
              </div>
              <div>
                <dt className="text-muted text-sm">Комиссия</dt>
                <dd className="text-white">
                  {formatCurrency(deal.commission, deal.asset)}
                  <span className="text-muted text-sm ml-1">({deal.commissionType})</span>
                </dd>
              </div>
            </div>
            {deal.platformCode && (
              <div>
                <dt className="text-muted text-sm">Платформа</dt>
                <dd className="text-white">{deal.platformCode}</dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Participants */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <User size={20} />
            Участники
          </h2>
          <dl className="space-y-4">
            <div>
              <dt className="text-muted text-sm">Покупатель (ID)</dt>
              <dd className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-mono">{deal.buyerId}</span>
                <Link
                  to={`/admin/users/${deal.buyerId}`}
                  className="text-primary hover:underline text-sm"
                >
                  Профиль →
                </Link>
                <button
                  onClick={() => handleDownloadReceipt('buyer')}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded transition-colors"
                  title="Скачать чек покупателя"
                >
                  <Receipt size={12} />
                  Чек
                </button>
              </dd>
            </div>
            <div>
              <dt className="text-muted text-sm">Продавец (ID)</dt>
              <dd className="flex items-center gap-2 flex-wrap">
                <span className="text-white font-mono">{deal.sellerId}</span>
                <Link
                  to={`/admin/users/${deal.sellerId}`}
                  className="text-primary hover:underline text-sm"
                >
                  Профиль →
                </Link>
                <button
                  onClick={() => handleDownloadReceipt('seller')}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600/20 text-green-400 hover:bg-green-600/30 rounded transition-colors"
                  title="Скачать чек продавца"
                >
                  <Receipt size={12} />
                  Чек
                </button>
              </dd>
            </div>
            <div>
              <dt className="text-muted text-sm">Инициатор</dt>
              <dd className="text-white capitalize">{deal.initiatorRole}</dd>
            </div>
            {/* Show dispute initiator if deal has dispute */}
            {dispute && (
              <div className="pt-2 mt-2 border-t border-border">
                <dt className="text-muted text-sm">Инициатор спора</dt>
                <dd className="flex items-center gap-2">
                  <span className="text-red-400 font-mono">{dispute.openedBy}</span>
                  <Link
                    to={`/admin/users/${dispute.openedBy}`}
                    className="text-primary hover:underline text-sm"
                  >
                    Профиль →
                  </Link>
                  <Badge variant="destructive" className="ml-2">
                    {dispute.openedBy === deal.buyerId ? 'Покупатель' : 'Продавец'}
                  </Badge>
                </dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Wallets */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Wallet size={20} />
            Кошельки
          </h2>
          <dl className="space-y-4">
            {deal.multisigAddress && (
              <div>
                <dt className="text-muted text-sm">Multisig адрес</dt>
                <dd className="text-primary">
                  <AddressLink address={deal.multisigAddress} />
                </dd>
              </div>
            )}
            {deal.buyerAddress && (
              <div>
                <dt className="text-muted text-sm">Кошелёк покупателя</dt>
                <dd className="text-gray-300">
                  <AddressLink address={deal.buyerAddress} />
                </dd>
              </div>
            )}
            {deal.sellerAddress && (
              <div>
                <dt className="text-muted text-sm">Кошелёк продавца</dt>
                <dd className="text-gray-300">
                  <AddressLink address={deal.sellerAddress} />
                </dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Timeline */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Clock size={20} />
            Хронология
          </h2>
          <dl className="space-y-4">
            <div>
              <dt className="text-muted text-sm">Создана</dt>
              <dd className="text-white">{formatDate(deal.createdAt, 'd MMMM yyyy, HH:mm')}</dd>
            </div>
            <div>
              <dt className="text-muted text-sm">Дедлайн</dt>
              <dd className="text-white">{formatDate(deal.deadline, 'd MMMM yyyy, HH:mm')}</dd>
            </div>
            {deal.completedAt && (
              <div>
                <dt className="text-muted text-sm">Завершена</dt>
                <dd className="text-white">{formatDate(deal.completedAt, 'd MMMM yyyy, HH:mm')}</dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Transactions */}
        {(deal.depositTxHash || deal.payoutTxHash) && (
          <Card className="p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white mb-4">Транзакции</h2>
            <dl className="space-y-4">
              {deal.depositTxHash && (
                <div>
                  <dt className="text-muted text-sm">Депозит</dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-mono text-sm text-gray-300">{deal.depositTxHash}</span>
                    <a
                      href={`https://tronscan.org/#/transaction/${deal.depositTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary-light"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </dd>
                </div>
              )}
              {deal.payoutTxHash && (
                <div>
                  <dt className="text-muted text-sm">Выплата</dt>
                  <dd className="flex items-center gap-2">
                    <span className="font-mono text-sm text-gray-300">{deal.payoutTxHash}</span>
                    <a
                      href={`https://tronscan.org/#/transaction/${deal.payoutTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary-light"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </Card>
        )}

        {/* Work Submission */}
        {deal.workSubmission && (
          <Card className="p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white mb-4">Сданная работа</h2>
            <p className="text-gray-300">{deal.workSubmission.description}</p>
            <p className="text-muted text-sm mt-2">
              Сдана: {formatDate(deal.workSubmission.submittedAt, 'd MMMM yyyy, HH:mm')}
            </p>
          </Card>
        )}

        {/* Operational Costs - Detailed breakdown */}
        {deal.operationalCosts && (
          <Card className="p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              💰 Операционные расходы
            </h2>

            <div className="grid sm:grid-cols-2 gap-6">
              {/* Activation Costs */}
              <div className="bg-dark rounded-lg p-4">
                <h3 className="text-sm font-medium text-muted uppercase mb-3">Активация мультисига</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">Отправлено на мультисиг:</span>
                    <span className="text-orange-400">{deal.operationalCosts.activationTrxSent || config?.trx?.multisigActivation || 1} TRX</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Комиссия за отправку:</span>
                    <span className="text-orange-400">{deal.operationalCosts.activationTxFee || 1.1} TRX</span>
                  </div>
                  <div className="flex justify-between border-t border-border/50 pt-2 mt-2">
                    <span className="text-white font-medium">Итого активация:</span>
                    <span className="text-orange-400 font-medium">
                      {((deal.operationalCosts.activationTrxSent || 1) + (deal.operationalCosts.activationTxFee || 1.1)).toFixed(2)} TRX
                    </span>
                  </div>
                </div>
              </div>

              {/* Energy & Bandwidth Costs */}
              <div className="bg-dark rounded-lg p-4">
                <h3 className="text-sm font-medium text-muted uppercase mb-3">
                  Ресурсы: {' '}
                  {deal.operationalCosts.energyMethod === 'feesaver' ? (
                    <span className="text-green-400">FeeSaver (динамическая аренда)</span>
                  ) : deal.operationalCosts.energyMethod === 'trx' ? (
                    <span className="text-orange-400">TRX Fallback</span>
                  ) : (
                    <span className="text-gray-500">Не указано</span>
                  )}
                </h3>
                <div className="space-y-2 text-sm">
                  {deal.operationalCosts.energyMethod === 'feesaver' ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted">📶 Bandwidth (1000 bw):</span>
                        <span className="text-blue-400">{(deal.operationalCosts.feesaverBandwidthCostTrx || 0).toFixed(2)} TRX</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">⚡ Энергия (динамически):</span>
                        <span className="text-green-400">{(deal.operationalCosts.feesaverEnergyCostTrx || 0).toFixed(2)} TRX</span>
                      </div>
                      <div className="flex justify-between border-t border-border/50 pt-2 mt-2">
                        <span className="text-white font-medium">Итого FeeSaver:</span>
                        <span className="text-green-400 font-medium">{(deal.operationalCosts.feesaverCostTrx || 0).toFixed(2)} TRX</span>
                      </div>
                    </>
                  ) : deal.operationalCosts.energyMethod === 'trx' ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted">Отправлено на мультисиг:</span>
                        <span className="text-orange-400">{deal.operationalCosts.fallbackTrxSent || config?.trx?.fallbackAmount || 30} TRX</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">Комиссия за отправку:</span>
                        <span className="text-orange-400">{deal.operationalCosts.fallbackTxFee || 1.1} TRX</span>
                      </div>
                      {(deal.operationalCosts.fallbackTrxReturned || 0) > 0 && (
                        <div className="flex justify-between text-green-400">
                          <span className="text-muted">Возвращено:</span>
                          <span>-{(deal.operationalCosts.fallbackTrxReturned || 0).toFixed(2)} TRX</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-border/50 pt-2 mt-2">
                        <span className="text-white font-medium">Итого fallback:</span>
                        <span className="text-orange-400 font-medium">
                          {(deal.operationalCosts.fallbackTrxNet || 0).toFixed(2)} TRX
                        </span>
                      </div>
                    </>
                  ) : (
                    <p className="text-gray-500">Нет данных об энергии</p>
                  )}
                </div>
              </div>
            </div>

            {/* Cost Breakdown Summary */}
            <div className="mt-4 p-4 bg-dark-lighter rounded-lg border border-border">
              <h4 className="text-sm font-medium text-white mb-3">Разбивка расходов:</h4>
              <div className="space-y-1 text-sm font-mono">
                <div className="flex justify-between">
                  <span className="text-muted">Активация (отправка + комиссия):</span>
                  <span className="text-orange-400">
                    +{((deal.operationalCosts.activationTrxSent || 1) + (deal.operationalCosts.activationTxFee || 1.1)).toFixed(2)} TRX
                  </span>
                </div>
                {deal.operationalCosts.energyMethod === 'feesaver' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted">📶 Bandwidth:</span>
                      <span className="text-blue-400">+{(deal.operationalCosts.feesaverBandwidthCostTrx || 0).toFixed(2)} TRX</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted">⚡ Энергия:</span>
                      <span className="text-green-400">+{(deal.operationalCosts.feesaverEnergyCostTrx || 0).toFixed(2)} TRX</span>
                    </div>
                  </>
                )}
                {deal.operationalCosts.energyMethod === 'trx' && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted">Fallback (отправка + комиссия):</span>
                      <span className="text-orange-400">
                        +{((deal.operationalCosts.fallbackTrxSent || 30) + (deal.operationalCosts.fallbackTxFee || 1.1)).toFixed(2)} TRX
                      </span>
                    </div>
                    {(deal.operationalCosts.fallbackTrxReturned || 0) > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted">Возвращено:</span>
                        <span className="text-green-400">-{(deal.operationalCosts.fallbackTrxReturned || 0).toFixed(2)} TRX</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Total Costs */}
            <div className="mt-4 bg-purple-900/30 border-2 border-purple-500/50 rounded-lg p-4">
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="flex justify-between sm:flex-col">
                  <span className="text-white font-medium">Всего TRX:</span>
                  <span className="text-red-400 font-bold text-lg">{(deal.operationalCosts.totalTrxSpent || 0).toFixed(2)} TRX</span>
                </div>
                <div className="flex justify-between sm:flex-col">
                  <span className="text-white font-medium">Курс TRX:</span>
                  <span className="text-muted">
                    {deal.operationalCosts.trxPriceAtCompletion
                      ? `$${deal.operationalCosts.trxPriceAtCompletion.toFixed(4)}`
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between sm:flex-col">
                  <span className="text-white font-bold">Всего USD:</span>
                  <span className="text-red-400 font-bold text-lg">${(deal.operationalCosts.totalCostUsd || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Net Profit for this deal - only show for completed deals */}
            {deal.commission && deal.operationalCosts.totalCostUsd !== undefined &&
             ['completed', 'resolved', 'expired', 'refunded'].includes(deal.status) && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex justify-between items-center">
                  <span className="text-white font-medium">Чистая прибыль по сделке:</span>
                  <span className={`font-bold text-xl ${
                    (deal.commission - (deal.operationalCosts.totalCostUsd || 0)) >= 0
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}>
                    ${(deal.commission - (deal.operationalCosts.totalCostUsd || 0)).toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-muted mt-1">
                  Комиссия ({formatCurrency(deal.commission, deal.asset)}) − Расходы (${(deal.operationalCosts.totalCostUsd || 0).toFixed(2)})
                </p>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
