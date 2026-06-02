import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, ChevronRight, Inbox } from 'lucide-react'
import { disputeChatService, type DisputeChat } from '@/services/disputeChat'
import { formatDate } from '@/utils/format'

type Tab = 'active' | 'closed'

export function AdminDisputeChatsListPage() {
  const [tab, setTab] = useState<Tab>('active')
  const [chats, setChats] = useState<DisputeChat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (currentTab: Tab) => {
    setLoading(true)
    setError(null)
    try {
      const { chats } = await disputeChatService.list(currentTab)
      setChats(chats)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить чаты')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(tab)
  }, [tab, load])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <MessageSquare size={24} />
          Чаты споров
        </h1>
        <p className="text-muted text-sm">Анонимизированные чат-арбитражи между сторонами сделок</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-dark-lighter">
        {(['active', 'closed'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-primary text-white'
                : 'border-transparent text-muted hover:text-white'
            }`}
          >
            {t === 'active' ? 'Активные' : 'Закрытые'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : error ? (
        <Card className="p-6 text-center text-red-400">{error}</Card>
      ) : chats.length === 0 ? (
        <Card className="p-12 text-center">
          <Inbox size={40} className="mx-auto text-muted mb-2" />
          <p className="text-muted">
            {tab === 'active' ? 'Активных чатов нет' : 'Закрытых чатов нет'}
          </p>
          {tab === 'active' && (
            <p className="text-xs text-muted mt-2">
              Открыть чат можно со страницы конкретного спора
            </p>
          )}
        </Card>
      ) : (
        <div className="space-y-2">
          {chats.map((c) => {
            const deal = typeof c.dealId === 'object' ? c.dealId : null
            const lastMsg = c.messages[c.messages.length - 1]
            return (
              <Link
                key={c._id}
                to={`/admin/dispute-chats/${c._id}`}
                className="block"
              >
                <Card className="p-4 hover:border-primary/40 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={c.status === 'active' ? 'warning' : 'success'}>
                          {c.status === 'active' ? 'Активный' : 'Закрыт'}
                        </Badge>
                        {deal?.dealId && (
                          <span className="text-sm font-mono text-white">{deal.dealId}</span>
                        )}
                        <span className="text-xs text-muted">
                          {c.messages.length} сообщ.
                        </span>
                      </div>
                      <div className="text-sm text-white truncate">
                        {deal?.productName || 'без названия'}
                      </div>
                      <div className="text-xs text-muted mt-1">
                        Покупатель <span className="font-mono">{c.buyerTelegramId}</span>
                        {' · '}Продавец <span className="font-mono">{c.sellerTelegramId}</span>
                        {lastMsg && (
                          <> · последнее: {formatDate(lastMsg.createdAt)}</>
                        )}
                        {!lastMsg && <> · открыт: {formatDate(c.createdAt)}</>}
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-muted shrink-0" />
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
