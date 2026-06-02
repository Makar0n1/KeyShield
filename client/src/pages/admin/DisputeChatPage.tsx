import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Card, Button } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Send, MessageSquare, CheckCircle, Scale, AlertTriangle } from 'lucide-react'
import {
  disputeChatService,
  type DisputeChat,
  type DisputeChatMessage,
} from '@/services/disputeChat'
import { formatDate } from '@/utils/format'

export function AdminDisputeChatPage() {
  const { chatId } = useParams<{ chatId: string }>()
  const navigate = useNavigate()

  const [chat, setChat] = useState<DisputeChat | null>(null)
  const [sidebarChats, setSidebarChats] = useState<DisputeChat[]>([])
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
      const { chats } = await disputeChatService.list('active')
      setSidebarChats(chats)
    } catch (err) {
      console.error('Failed to load sidebar:', err)
    }
  }, [])

  const loadChat = useCallback(async () => {
    if (!chatId) return
    setLoading(true)
    setError(null)
    try {
      const c = await disputeChatService.get(chatId)
      setChat(c)
      scrollToBottom()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить чат')
    } finally {
      setLoading(false)
    }
  }, [chatId, scrollToBottom])

  // Initial load + sidebar
  useEffect(() => {
    loadSidebar()
  }, [loadSidebar])

  useEffect(() => {
    loadChat()
  }, [loadChat])

  // SSE stream — re-opens whenever chatId changes
  useEffect(() => {
    if (!chatId) return

    // Close any existing stream first
    eventSourceRef.current?.close()

    const es = disputeChatService.openStream(chatId)
    eventSourceRef.current = es

    es.addEventListener('message', (evt) => {
      try {
        const msg: DisputeChatMessage = JSON.parse((evt as MessageEvent).data)
        setChat((prev) => {
          if (!prev) return prev
          // De-dupe by seq (in case of reconnect overlap)
          if (prev.messages.some((m) => m.seq === msg.seq)) return prev
          return { ...prev, messages: [...prev.messages, msg] }
        })
        scrollToBottom()
      } catch (err) {
        console.error('SSE parse error:', err)
      }
    })

    es.addEventListener('closed', () => {
      // Chat closed by resolve — refresh sidebar and jump out
      loadSidebar()
      navigate('/admin/disputes')
    })

    es.onerror = (err) => {
      // EventSource auto-reconnects; just log
      console.warn('SSE connection issue:', err)
    }

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [chatId, navigate, loadSidebar, scrollToBottom])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || !chatId || sending) return
    setSending(true)
    try {
      const msg = await disputeChatService.send(chatId, text)
      // Optimistically append (SSE will de-dupe on echo)
      setChat((prev) => {
        if (!prev) return prev
        if (prev.messages.some((m) => m.seq === msg.seq)) return prev
        return { ...prev, messages: [...prev.messages, msg] }
      })
      setInput('')
      scrollToBottom()
    } catch (err) {
      console.error('Send error:', err)
      alert(err instanceof Error ? err.message : 'Не удалось отправить')
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleResolve = async (decision: 'refund_buyer' | 'release_seller') => {
    if (!chatId) return
    const label = decision === 'refund_buyer' ? 'покупателя' : 'продавца'
    if (!confirm(`Закрыть чат и решить спор в пользу ${label}? Вся переписка будет удалена из бота.`)) return
    setResolving(true)
    try {
      await disputeChatService.resolve(chatId, decision)
      // SSE 'closed' event will trigger navigation; no need to do it here
    } catch (err) {
      console.error('Resolve error:', err)
      alert(err instanceof Error ? err.message : 'Ошибка при закрытии чата')
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
        <Link to="/admin/disputes" className="text-primary hover:underline">
          ← К списку споров
        </Link>
      </div>
    )
  }

  const deal = typeof chat.dealId === 'object' ? chat.dealId : null
  const isClosed = chat.status === 'closed'

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to={`/admin/disputes/${chat.disputeId}`}
            className="p-2 text-muted hover:text-white hover:bg-dark-lighter rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <MessageSquare size={22} />
                Чат-арбитраж
              </h1>
              <Badge variant={isClosed ? 'success' : 'warning'}>
                {isClosed ? 'Закрыт' : 'Активный'}
              </Badge>
            </div>
            <p className="text-muted text-sm">
              {deal?.dealId && <>Сделка <span className="font-mono">{deal.dealId}</span> · </>}
              Покупатель <span className="font-mono">{chat.buyerTelegramId}</span>
              {' · '}Продавец <span className="font-mono">{chat.sellerTelegramId}</span>
            </p>
          </div>
        </div>
        {!isClosed && (
          <div className="flex gap-2">
            <Button
              onClick={() => handleResolve('refund_buyer')}
              variant="success"
              disabled={resolving}
            >
              <CheckCircle size={18} className="mr-2" />
              В пользу покупателя
            </Button>
            <Button
              onClick={() => handleResolve('release_seller')}
              variant="secondary"
              disabled={resolving}
            >
              <CheckCircle size={18} className="mr-2" />
              В пользу продавца
            </Button>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-4">
        {/* Sidebar: active chats */}
        <Card className="p-3 h-[70vh] overflow-y-auto">
          <h3 className="text-sm font-semibold text-muted px-2 mb-2 flex items-center gap-2">
            <Scale size={14} />
            Активные чаты ({sidebarChats.length})
          </h3>
          <div className="space-y-1">
            {sidebarChats.map((c) => {
              const cDeal = typeof c.dealId === 'object' ? c.dealId : null
              const isCurrent = c._id === chatId
              return (
                <Link
                  key={c._id}
                  to={`/admin/dispute-chats/${c._id}`}
                  className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                    isCurrent ? 'bg-primary/20 text-white' : 'text-gray-300 hover:bg-dark-lighter'
                  }`}
                >
                  <div className="font-mono text-xs">
                    {cDeal?.dealId || c._id.slice(-6)}
                  </div>
                  <div className="text-xs text-muted truncate">
                    {cDeal?.productName || 'без названия'}
                  </div>
                </Link>
              )
            })}
            {sidebarChats.length === 0 && (
              <p className="text-xs text-muted px-2 py-4">Других активных чатов нет</p>
            )}
          </div>
        </Card>

        {/* Chat feed + input */}
        <Card className="p-0 flex flex-col h-[70vh]">
          <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {chat.messages.length === 0 && (
              <p className="text-center text-muted py-12">Сообщений пока нет. Напишите первым.</p>
            )}
            {chat.messages.map((m) => (
              <MessageBubble key={m.seq} message={m} />
            ))}
          </div>

          {/* Input */}
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
                <Button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  variant="default"
                >
                  <Send size={16} />
                </Button>
              </div>
              <p className="text-xs text-muted mt-1">
                Сообщение придёт обеим сторонам как «⚖️ Арбитр». Ваши @username сторон видны только вам.
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

function MessageBubble({ message: m }: { message: DisputeChatMessage }) {
  const isArbiter = m.from === 'arbiter'
  const label =
    m.from === 'buyer' ? '👤 Покупатель'
    : m.from === 'seller' ? '👤 Продавец'
    : '⚖️ Арбитр (Вы)'

  const alignment = isArbiter ? 'items-end' : 'items-start'
  const bubbleColor = isArbiter
    ? 'bg-primary/20 border-primary/40'
    : m.from === 'buyer'
      ? 'bg-blue-500/15 border-blue-500/30'
      : 'bg-green-500/15 border-green-500/30'

  const hasFile = m.file && m.file.type
  const undelivered =
    (!isArbiter && m.delivery?.buyer === 'failed' && m.from !== 'buyer') ||
    (!isArbiter && m.delivery?.seller === 'failed' && m.from !== 'seller') ||
    (isArbiter && (m.delivery?.buyer === 'failed' || m.delivery?.seller === 'failed'))

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
        {hasFile && (
          <div className="text-xs text-muted mb-1">
            📎 {m.file?.type} · {m.file?.safeFileName || ''}
            {m.file?.size ? ` · ${(m.file.size / 1024).toFixed(1)} KB` : ''}
          </div>
        )}
        {m.text && (
          <div className="text-sm text-white whitespace-pre-wrap break-words">{m.text}</div>
        )}
        <div className="text-[10px] text-muted mt-1">{formatDate(m.createdAt)}</div>
      </div>
    </div>
  )
}
