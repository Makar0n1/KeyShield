import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { adminService } from '@/services/admin'
import type { Dispute, Deal } from '@/types'
import { Card, Button } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatCurrency } from '@/utils/format'
import {
  ArrowLeft,
  Scale,
  FileText,
  Image,
  CheckCircle,
  XCircle,
  ExternalLink,
} from 'lucide-react'

export function AdminDisputeDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const [dispute, setDispute] = useState<Dispute | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)

  const fetchDispute = async () => {
    if (!id) return
    try {
      const data = await adminService.getDispute(id)
      setDispute(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDispute()
  }, [id])

  const handleResolve = async (winner: 'buyer' | 'seller') => {
    if (!dispute) return
    const reason = prompt(`Причина решения в пользу ${winner === 'buyer' ? 'покупателя' : 'продавца'}:`)
    if (!reason) return
    setResolving(true)
    try {
      await adminService.resolveDispute(dispute._id, { winner, reason })
      fetchDispute()
    } catch (error) {
      console.error('Resolve error:', error)
      alert('Ошибка при решении спора')
    } finally {
      setResolving(false)
    }
  }

  const handleCancel = async () => {
    if (!dispute) return
    const reason = prompt('Причина отмены спора:')
    if (!reason) return
    setResolving(true)
    try {
      await adminService.cancelDispute(dispute._id, reason)
      fetchDispute()
    } catch (error) {
      console.error('Cancel error:', error)
      alert('Ошибка при отмене спора')
    } finally {
      setResolving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !dispute) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">{error || 'Спор не найден'}</p>
        <Link to="/admin/disputes" className="text-primary hover:underline">
          ← Вернуться к списку
        </Link>
      </div>
    )
  }

  const deal = typeof dispute.dealId === 'object' ? dispute.dealId as Deal : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/admin/disputes"
            className="p-2 text-muted hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">Спор</h1>
              {dispute.status === 'open' || dispute.status === 'pending' || dispute.status === 'in_review' ? (
                <Badge variant="warning">
                  {dispute.status === 'in_review' ? 'На рассмотрении' : 'Открыт'}
                </Badge>
              ) : (
                <Badge variant="success">Решён</Badge>
              )}
            </div>
            <p className="text-muted">Создан {formatDate(dispute.createdAt)}</p>
          </div>
        </div>
        {(dispute.status === 'open' || dispute.status === 'pending' || dispute.status === 'in_review') && (
          <div className="flex gap-2">
            <Button
              onClick={() => handleResolve('buyer')}
              variant="success"
              disabled={resolving}
            >
              <CheckCircle size={18} className="mr-2" />
              Покупателю
            </Button>
            <Button
              onClick={() => handleResolve('seller')}
              variant="secondary"
              disabled={resolving}
            >
              <CheckCircle size={18} className="mr-2" />
              Продавцу
            </Button>
            <Button
              onClick={handleCancel}
              variant="destructive"
              disabled={resolving}
            >
              <XCircle size={18} className="mr-2" />
              Отменить
            </Button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Dispute Info */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Scale size={20} />
            Информация о споре
          </h2>
          <dl className="space-y-4">
            <div>
              <dt className="text-muted text-sm">Инициатор</dt>
              <dd className="flex items-center gap-2">
                <span className="text-white font-mono">{dispute.openedBy || dispute.initiatorId}</span>
                <Link
                  to={`/admin/users/${dispute.openedBy || dispute.initiatorId}`}
                  className="text-primary hover:underline text-sm"
                >
                  Профиль →
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-muted text-sm">Причина</dt>
              <dd className="text-gray-300 whitespace-pre-wrap">{dispute.reasonText || dispute.reason || 'Не указана'}</dd>
            </div>
            {dispute.status === 'resolved' && (
              <>
                <div>
                  <dt className="text-muted text-sm">Решение</dt>
                  <dd className="text-white">
                    В пользу{' '}
                    <Badge variant={dispute.winner === 'buyer' ? 'success' : 'primary'}>
                      {dispute.winner === 'buyer' ? 'покупателя' : 'продавца'}
                    </Badge>
                  </dd>
                </div>
                {dispute.decision && (
                  <div>
                    <dt className="text-muted text-sm">Обоснование</dt>
                    <dd className="text-gray-300">{dispute.decision}</dd>
                  </div>
                )}
                {dispute.resolvedAt && (
                  <div>
                    <dt className="text-muted text-sm">Дата решения</dt>
                    <dd className="text-white">{formatDate(dispute.resolvedAt)}</dd>
                  </div>
                )}
              </>
            )}
          </dl>
        </Card>

        {/* Deal Info */}
        {deal && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <FileText size={20} />
              Связанная сделка
            </h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-muted text-sm">ID сделки</dt>
                <dd>
                  <Link
                    to={`/admin/deals/${deal._id}`}
                    className="text-primary hover:underline font-mono"
                  >
                    {deal.dealId}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-muted text-sm">Товар/Услуга</dt>
                <dd className="text-white">{deal.productName}</dd>
              </div>
              <div>
                <dt className="text-muted text-sm">Сумма</dt>
                <dd className="text-white font-medium">
                  {formatCurrency(deal.amount, deal.asset)}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-muted text-sm">Покупатель</dt>
                  <dd>
                    <Link
                      to={`/admin/users/${deal.buyerId}`}
                      className="text-white hover:text-primary"
                    >
                      {deal.buyerId}
                    </Link>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted text-sm">Продавец</dt>
                  <dd>
                    <Link
                      to={`/admin/users/${deal.sellerId}`}
                      className="text-white hover:text-primary"
                    >
                      {deal.sellerId}
                    </Link>
                  </dd>
                </div>
              </div>
            </dl>
          </Card>
        )}

        {/* Evidence */}
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Image size={20} />
            Доказательства инициатора ({(dispute.media || dispute.evidence)?.length || 0})
          </h2>
          {(dispute.media || dispute.evidence) && (dispute.media || dispute.evidence).length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(dispute.media || dispute.evidence || []).map((url, idx) => (
                <a
                  key={idx}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block relative aspect-square bg-dark rounded-lg overflow-hidden group"
                >
                  <img
                    src={url}
                    alt={`Доказательство ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ExternalLink className="text-white" size={24} />
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <p className="text-muted text-center py-8">Доказательства не предоставлены</p>
          )}
        </Card>

        {/* Counter Evidence */}
        {dispute.counterEvidence && dispute.counterEvidence.length > 0 && (
          <Card className="p-6 lg:col-span-2">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Image size={20} />
              Доказательства ответчика ({dispute.counterEvidence.length})
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {dispute.counterEvidence.map((url, idx) => (
                <a
                  key={idx}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block relative aspect-square bg-dark rounded-lg overflow-hidden group"
                >
                  <img
                    src={url}
                    alt={`Доказательство ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ExternalLink className="text-white" size={24} />
                  </div>
                </a>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
