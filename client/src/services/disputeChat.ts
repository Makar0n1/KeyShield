import api from './api'

export type DisputeChatRole = 'buyer' | 'seller' | 'arbiter'

export interface DisputeChatFile {
  type: 'photo' | 'video' | 'document' | 'voice' | null
  telegramFileId?: string | null
  safeFileName?: string | null
  hash?: string | null
  size?: number | null
  mimeType?: string | null
}

export interface DisputeChatMessage {
  seq: number
  from: DisputeChatRole
  fromTelegramId: number | null
  text: string
  file?: DisputeChatFile | null
  telegramMessageIds: { buyer: number | null; seller: number | null }
  delivery: {
    buyer: 'delivered' | 'failed' | 'skipped'
    seller: 'delivered' | 'failed' | 'skipped'
  }
  createdAt: string
}

export interface DisputeChatParty {
  telegramId: number
  username?: string
  firstName?: string
}

export interface DisputeChat {
  _id: string
  disputeId: string
  dealId: { _id: string; dealId?: string; productName?: string; amount?: number; asset?: string } | string
  buyerTelegramId: number
  sellerTelegramId: number
  arbiterId: number
  status: 'active' | 'closed'
  resolution: 'refund_buyer' | 'release_seller' | null
  nextSeq: number
  messages: DisputeChatMessage[]
  closedAt: string | null
  createdAt: string
  updatedAt: string
  parties?: { buyer: DisputeChatParty; seller: DisputeChatParty }
}

export const disputeChatService = {
  // Open (or reuse) a chat for the given dispute
  start: async (disputeId: string): Promise<{ chatId: string; status: 'active' | 'closed' }> => {
    const { data } = await api.post(`/admin/disputes/${disputeId}/chat/start`)
    return data
  },

  // List sidebar items
  list: async (status: 'active' | 'closed' = 'active'): Promise<{ chats: DisputeChat[] }> => {
    const { data } = await api.get('/admin/dispute-chats', { params: { status } })
    return data
  },

  // Full chat for initial load
  get: async (chatId: string): Promise<DisputeChat> => {
    const { data } = await api.get(`/admin/dispute-chats/${chatId}`)
    return data.chat
  },

  // Arbiter posts a message
  send: async (chatId: string, text: string): Promise<DisputeChatMessage> => {
    const { data } = await api.post(`/admin/dispute-chats/${chatId}/message`, { text })
    return data.message
  },

  // Resolve chat — finalizes the underlying dispute and wipes Telegram messages
  resolve: async (
    chatId: string,
    decision: 'refund_buyer' | 'release_seller'
  ): Promise<{ success: true }> => {
    const { data } = await api.post(`/admin/dispute-chats/${chatId}/resolve`, { decision })
    return data
  },

  // Opens an SSE connection. Returns the EventSource so caller can close it.
  // Token is passed via query because EventSource doesn't allow custom headers.
  openStream: (chatId: string): EventSource => {
    const token = localStorage.getItem('adminToken') || ''
    return new EventSource(
      `/api/admin/dispute-chats/${chatId}/stream?token=${encodeURIComponent(token)}`
    )
  }
}
