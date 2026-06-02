import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { managerService, type AnonymizedDispute } from '@/services/manager'
import { Card, Button } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatCurrency } from '@/utils/format'
import {
  ArrowLeft, Scale, FileText, Image as ImageIcon, MessageSquare,
  CheckCircle, ExternalLink, File, Video, Mic,
} from 'lucide-react'

export function ManagerDisputeDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [dispute, setDispute] = useState<AnonymizedDispute | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [openingChat, setOpeningChat] = useState(false)

  const fetchDispute = async () => {
    if (!id) return
    try {
      const data = await managerService.getDispute(id)
      setDispute(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchDispute() }, [id])

  const handleResolve = async (winner: 'buyer' | 'seller') => {
    if (!dispute) return
    const reason = prompt(`Причина решения в пользу ${winner === 'buyer' ? 'покупателя' : 'продавца'}:`)
    if (!reason) return
    setResolving(true)
    try {
      await managerService.resolveDispute(dispute._id, winner, reason)
      fetchDispute()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка при решении')
    } finally {
      setResolving(false)
    }
  }

  const handleOpenChat = async () => {
    if (!dispute) return
    setOpeningChat(true)
    try {
      const { chatId } = await managerService.startChat(dispute._id)
      navigate(`/manager/dispute-chats/${chatId}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Не удалось открыть чат')
    } finally {
      setOpeningChat(false)
    }
  }

  const getFileType = (url: string): 'image' | 'video' | 'audio' | 'document' => {
    const u = url.toLowerCase()
    if (u.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i)) return 'image'
    if (u.match(/\.(mp4|webm|mov|avi)(\?|$)/i)) return 'video'
    if (u.match(/\.(mp3|ogg|wav|oga)(\?|$)/i)) return 'audio'
    if (u.includes('/photos/') || u.includes('api.telegram.org/file/')) return 'image'
    return 'document'
  }

  const renderMedia = (url: string, idx: number) => {
    const t = getFileType(url)
    return (
      <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
        className="block relative aspect-square bg-dark rounded-lg overflow-hidden group">
        {t === 'image' ? (
          <img src={url} alt={`Доказательство ${idx + 1}`} className="w-full h-full object-cover" />
        ) : t === 'video' ? (
          <div className="w-full h-full flex items-center justify-center bg-dark-lighter"><Video size={48} className="text-muted" /></div>
        ) : t === 'audio' ? (
          <div className="w-full h-full flex items-center justify-center bg-dark-lighter"><Mic size={48} className="text-muted" /></div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-dark-lighter"><File size={48} className="text-muted" /></div>
        )}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <ExternalLink className="text-white" size={24} />
        </div>
        <div className="absolute bottom-2 right-2 text-xs text-white bg-black/70 px-2 py-1 rounded">#{idx + 1}</div>
      </a>
    )
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
        <Link to="/manager/disputes" className="text-primary hover:underline">← К списку</Link>
      </div>
    )
  }

  const isOpen = dispute.status === 'open' || dispute.status === 'in_review'

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/manager/disputes" className="p-2 text-muted hover:text-white hover:bg-dark-lighter rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">Спор</h1>
              <Badge variant={
                dispute.status === 'resolved' ? 'success' :
                dispute.status === 'in_review' ? 'warning' : 'default'
              }>
                {dispute.status === 'resolved' ? 'Решён' : dispute.status === 'in_review' ? 'На рассмотрении' : 'Открыт'}
              </Badge>
            </div>
            <p className="text-muted text-sm">Открыл: {dispute.openedByRoleLabel || '—'} · {formatDate(dispute.createdAt)}</p>
          </div>
        </div>
        {isOpen && (
          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleOpenChat} variant="default" disabled={openingChat || resolving}>
              <MessageSquare size={18} className="mr-2" />
              {openingChat ? 'Открываем...' : 'Открыть чат'}
            </Button>
            <Button onClick={() => handleResolve('buyer')} variant="success" disabled={resolving}>
              <CheckCircle size={18} className="mr-2" /> Покупателю
            </Button>
            <Button onClick={() => handleResolve('seller')} variant="secondary" disabled={resolving}>
              <CheckCircle size={18} className="mr-2" /> Продавцу
            </Button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Dispute info */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Scale size={20} /> Информация о споре
          </h2>
          <dl className="space-y-4">
            <div>
              <dt className="text-muted text-sm">Инициатор</dt>
              <dd className="text-white">{dispute.openedByRoleLabel || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted text-sm">Причина</dt>
              <dd className="text-gray-300 whitespace-pre-wrap">{dispute.reasonText || '—'}</dd>
            </div>
            {dispute.status === 'resolved' && dispute.decision && (
              <div>
                <dt className="text-muted text-sm">Решение</dt>
                <dd className="text-white">
                  В пользу <Badge variant={dispute.decision === 'refund_buyer' ? 'success' : 'default'}>
                    {dispute.decision === 'refund_buyer' ? 'покупателя' : 'продавца'}
                  </Badge>
                </dd>
              </div>
            )}
            {dispute.resolvedAt && (
              <div>
                <dt className="text-muted text-sm">Дата решения</dt>
                <dd className="text-white">{formatDate(dispute.resolvedAt)}</dd>
              </div>
            )}
          </dl>
        </Card>

        {/* Deal info (anonymized) */}
        {dispute.deal && (
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <FileText size={20} /> Сделка
            </h2>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted">Номер</dt>
                <dd className="text-white font-mono">{dispute.deal.dealId}</dd>
              </div>
              <div>
                <dt className="text-muted">Товар/Услуга</dt>
                <dd className="text-white">{dispute.deal.productName}</dd>
              </div>
              <div>
                <dt className="text-muted">Описание</dt>
                <dd className="text-gray-300 whitespace-pre-wrap">{dispute.deal.description}</dd>
              </div>
              <div>
                <dt className="text-muted">Сумма</dt>
                <dd className="text-white font-medium">{formatCurrency(dispute.deal.amount, dispute.deal.asset)}</dd>
              </div>
              <div>
                <dt className="text-muted">Комиссия</dt>
                <dd className="text-white">{dispute.deal.commission} {dispute.deal.asset} ({dispute.deal.commissionType})</dd>
              </div>
              <div>
                <dt className="text-muted">Дедлайн</dt>
                <dd className="text-white">{formatDate(dispute.deal.deadline)}</dd>
              </div>
              {dispute.deal.multisigAddress && (
                <div>
                  <dt className="text-muted">Мультисиг (эскроу-адрес)</dt>
                  <dd className="text-white font-mono text-xs break-all">{dispute.deal.multisigAddress}</dd>
                </div>
              )}
              {dispute.deal.depositTxHash && (
                <div>
                  <dt className="text-muted">Hash депозита</dt>
                  <dd className="text-white font-mono text-xs break-all">{dispute.deal.depositTxHash}</dd>
                </div>
              )}
              {dispute.deal.actualDepositAmount != null && (
                <div>
                  <dt className="text-muted">Фактически депонировано</dt>
                  <dd className="text-white">{dispute.deal.actualDepositAmount} {dispute.deal.asset}</dd>
                </div>
              )}
            </dl>
          </Card>
        )}

        {/* Evidence */}
        <Card className="p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <ImageIcon size={20} /> Доказательства ({dispute.media?.length || 0})
          </h2>
          {dispute.media && dispute.media.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {dispute.media.map(renderMedia)}
            </div>
          ) : (
            <p className="text-muted text-center py-8">Доказательства не предоставлены</p>
          )}
        </Card>
      </div>
    </div>
  )
}
