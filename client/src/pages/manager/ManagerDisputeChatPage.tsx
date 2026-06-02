import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Card, Button } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft, Send, MessageSquare, CheckCircle, Scale, AlertTriangle,
  FileText, ExternalLink,
} from 'lucide-react'
import {
  managerService,
  type AnonymizedChat,
  type AnonymizedChatMessage,
} from '@/services/manager'
import { formatDate } from '@/utils/format'

export function ManagerDisputeChatPage() {
  const { chatId } = useParams<{ chatId: string }>()
  const navigate = useNavigate()

  const [chat, setChat] = useState<AnonymizedChat | null>(null)
  const [sidebarChats, setSidebarChats] = useState<AnonymizedChat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [resolving, setResolving] = useState(false)

  const eventSourceRef = useRef<EventSource | null>(null)
  const feedRef = useRef<HTMLDivElement | null>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight
    })
  }, [])

  const loadSidebar = useCallback(async () => {
    try {
      const { chats } = await managerService.listChats('active')
      setSidebarChats(chats)
    } catch (err) { console.error(err) }
  }, [])

  const loadChat = useCallback(async () => {
    if (!chatId) return
    setLoading(true)
    setError(null)
    try {
      const c = await managerService.getChat(chatId)
      setChat(c)
      scrollToBottom()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить чат')
    } finally {
      setLoading(false)
    }
  }, [chatId, scrollToBottom])

  useEffect(() => { loadSidebar() }, [loadSidebar])
  useEffect(() => { loadChat() }, [loadChat])

  useEffect(() => {
    if (!chatId) return
    eventSourceRef.current?.close()
    const es = managerService.openStream(chatId)
    eventSourceRef.current = es

    es.addEventListener('message', (evt) => {
      try {
        const msg: AnonymizedChatMessage = JSON.parse((evt as MessageEvent).data)
        setChat((prev) => {
          if (!prev) return prev
          if (prev.messages.some((m) => m.seq === msg.seq)) return prev
          return { ...prev, messages: [...prev.messages, msg] }
        })
        scrollToBottom()
      } catch (err) { console.error('SSE parse error:', err) }
    })

    es.addEventListener('closed', () => {
      loadSidebar()
      navigate('/manager/disputes')
    })

    es.onerror = (err) => console.warn('SSE issue:', err)

    return () => { es.close(); eventSourceRef.current = null }
  }, [chatId, navigate, loadSidebar, scrollToBottom])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || !chatId || sending) return
    setSending(true)
    try {
      const msg = await managerService.sendMessage(chatId, text)
      setChat((prev) => {
        if (!prev) return prev
        if (prev.messages.some((m) => m.seq === msg.seq)) return prev
        return { ...prev, messages: [...prev.messages, msg] }
      })
      setInput('')
      scrollToBottom()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Не удалось отправить')
    } finally { setSending(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSend() }
  }

  const handleResolve = async (decision: 'refund_buyer' | 'release_seller') => {
    if (!chatId) return
    const label = decision === 'refund_buyer' ? 'покупателя' : 'продавца'
    if (!confirm(`Закрыть чат и решить спор в пользу ${label}? Вся переписка будет удалена из бота.`)) return
    setResolving(true)
    try {
      await managerService.resolveChat(chatId, decision)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Ошибка')
      setResolving(false)
    }
  }

  if (loading && !chat) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !chat) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 mb-4">{error || 'Чат не найден'}</p>
        <Link to="/manager/disputes" className="text-primary hover:underline">← К списку</Link>
      </div>
    )
  }

  const deal = chat.deal && 'dealId' in chat.deal ? chat.deal : null
  const isClosed = chat.status === 'closed'

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to={`/manager/disputes/${chat.disputeId}`}
            className="p-2 text-muted hover:text-white hover:bg-dark-lighter rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <MessageSquare size={22} /> Чат-арбитраж
              </h1>
              <Badge variant={isClosed ? 'success' : 'warning'}>
                {isClosed ? 'Закрыт' : 'Активный'}
              </Badge>
            </div>
            <p className="text-muted text-sm">
              {deal?.dealId && <>Сделка <span className="font-mono">{deal.dealId}</span></>}
              {deal && 'productName' in deal && deal.productName && <> · {deal.productName}</>}
              {deal && 'amount' in deal && deal.amount != null && deal.asset && <> · {deal.amount} {deal.asset}</>}
            </p>
          </div>
        </div>
        {!isClosed && (
          <div className="flex gap-2">
            <Button onClick={() => handleResolve('refund_buyer')} variant="success" disabled={resolving}>
              <CheckCircle size={18} className="mr-2" /> В пользу покупателя
            </Button>
            <Button onClick={() => handleResolve('release_seller')} variant="secondary" disabled={resolving}>
              <CheckCircle size={18} className="mr-2" /> В пользу продавца
            </Button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        <Card className="p-3 h-[70vh] overflow-y-auto">
          <h3 className="text-sm font-semibold text-muted px-2 mb-2 flex items-center gap-2">
            <Scale size={14} /> Активные чаты ({sidebarChats.length})
          </h3>
          <div className="space-y-1">
            {sidebarChats.map((c) => {
              const cDeal = c.deal && 'dealId' in c.deal ? c.deal : null
              const isCurrent = c._id === chatId
              return (
                <Link key={c._id} to={`/manager/dispute-chats/${c._id}`}
                  className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                    isCurrent ? 'bg-primary/20 text-white' : 'text-gray-300 hover:bg-dark-lighter'
                  }`}>
                  <div className="font-mono text-xs">{cDeal?.dealId || c._id.slice(-6)}</div>
                  <div className="text-xs text-muted truncate">
                    {(cDeal && 'productName' in cDeal && cDeal.productName) || 'без названия'}
                  </div>
                </Link>
              )
            })}
            {sidebarChats.length === 0 && (
              <p className="text-xs text-muted px-2 py-4">Других активных чатов нет</p>
            )}
          </div>
        </Card>

        <Card className="p-0 flex flex-col h-[70vh]">
          <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {chat.messages.length === 0 && (
              <p className="text-center text-muted py-12">Сообщений пока нет. Напишите первым.</p>
            )}
            {chat.messages.map((m) => (
              <MessageBubble key={m.seq} message={m} chatId={chat._id} />
            ))}
          </div>

          {!isClosed ? (
            <div className="border-t border-dark-lighter p-3">
              <div className="flex gap-2 items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Сообщение от арбитра (Ctrl+Enter — отправить)"
                  rows={2}
                  className="flex-1 bg-dark-lighter text-white rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={sending}
                />
                <Button onClick={handleSend} disabled={sending || !input.trim()} variant="default">
                  <Send size={16} />
                </Button>
              </div>
              <p className="text-xs text-muted mt-1">
                Сообщение придёт обеим сторонам как «⚖️ Арбитр». Личные данные сторон скрыты.
              </p>
            </div>
          ) : (
            <div className="border-t border-dark-lighter p-4 text-center text-sm text-muted">
              Чат закрыт. {chat.resolution && `Решение: в пользу ${chat.resolution === 'refund_buyer' ? 'покупателя' : 'продавца'}.`}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function MessageBubble({ message: m, chatId }: { message: AnonymizedChatMessage; chatId: string }) {
  const isArbiter = m.from === 'arbiter'
  const label = m.from === 'arbiter' ? '⚖️ Арбитр (Вы)' : `👤 ${m.fromRoleLabel}`

  const alignment = isArbiter ? 'items-end' : 'items-start'
  const bubbleColor = isArbiter
    ? 'bg-primary/20 border-primary/40'
    : m.from === 'buyer'
      ? 'bg-blue-500/15 border-blue-500/30'
      : 'bg-green-500/15 border-green-500/30'

  const file = m.file && m.file.kind ? m.file : null
  const fileUrl = file ? managerService.fileUrl(chatId, m.seq) : null

  const undelivered =
    (m.from !== 'buyer' && m.delivery?.buyer === 'failed') ||
    (m.from !== 'seller' && m.delivery?.seller === 'failed')

  return (
    <div className={`flex flex-col ${alignment}`}>
      <div className={`max-w-[80%] border rounded-lg p-3 ${bubbleColor}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-white">{label}</span>
          <span className="text-xs text-muted">#{m.seq}</span>
          {undelivered && (
            <span className="flex items-center gap-1 text-xs text-orange-400">
              <AlertTriangle size={12} /> не доставлено
            </span>
          )}
        </div>

        {file && fileUrl && (
          <FilePreview file={file} url={fileUrl} />
        )}

        {m.text && (
          <div className="text-sm text-white whitespace-pre-wrap break-words mt-2">{m.text}</div>
        )}
        <div className="text-[10px] text-muted mt-1">{formatDate(m.createdAt)}</div>
      </div>
    </div>
  )
}

function FilePreview({ file, url }: { file: NonNullable<AnonymizedChatMessage['file']>; url: string }) {
  const sizeLabel = file.size ? ` · ${(file.size / 1024).toFixed(1)} KB` : ''
  const nameLabel = file.safeFileName ? ` · ${file.safeFileName}` : ''

  if (file.kind === 'photo') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={url} alt={file.safeFileName || 'photo'}
          className="max-w-full max-h-80 rounded border border-dark-lighter" />
        <div className="text-[10px] text-muted mt-1">photo{nameLabel}{sizeLabel}</div>
      </a>
    )
  }
  if (file.kind === 'video') {
    return (
      <div>
        <video src={url} controls preload="metadata"
          className="max-w-full max-h-80 rounded border border-dark-lighter" />
        <div className="text-[10px] text-muted mt-1">video{nameLabel}{sizeLabel}</div>
      </div>
    )
  }
  if (file.kind === 'voice') {
    return (
      <div>
        <audio src={url} controls preload="metadata" className="w-full" />
        <div className="text-[10px] text-muted mt-1">voice{sizeLabel}</div>
      </div>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 bg-dark-lighter rounded border border-dark-lighter hover:border-primary/40 transition-colors text-sm">
      <FileText size={18} className="text-muted" />
      <span className="text-white truncate">{file.safeFileName || 'document'}</span>
      <span className="text-xs text-muted ml-auto">{sizeLabel.replace(/^ · /, '')}</span>
      <ExternalLink size={14} className="text-muted" />
    </a>
  )
}
