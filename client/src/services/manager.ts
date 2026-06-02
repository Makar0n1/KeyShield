import api from './api'

// =====================================================
// Manager auth + anonymized dispute API
// All payloads here are pre-anonymized server-side.
// =====================================================

export interface ManagerProfile {
  id: string
  username: string
  displayName: string
}

export interface AnonymizedDeal {
  _id: string
  dealId: string
  productName: string
  description: string
  asset: string
  amount: number
  commission: number
  commissionType: string
  deadline: string
  status: string
  multisigAddress?: string | null
  depositTxHash?: string | null
  depositDetectedAt?: string | null
  actualDepositAmount?: number | null
  createdAt: string
}

export interface AnonymizedDisputeComment {
  role: 'buyer' | 'seller' | 'arbiter' | null
  roleLabel: string
  text: string
  media: string[]
  createdAt: string
}

export interface AnonymizedDispute {
  _id: string
  deal: AnonymizedDeal | null
  openedByRole: 'buyer' | 'seller' | null
  openedByRoleLabel: string | null
  reasonText: string
  media: string[]
  comments: AnonymizedDisputeComment[]
  status: 'open' | 'in_review' | 'resolved' | string
  decision: 'refund_buyer' | 'release_seller' | null
  resolvedAt: string | null
  createdAt: string
}

export type ChatFileKind = 'photo' | 'video' | 'document' | 'voice'

export interface AnonymizedChatMessage {
  seq: number
  from: 'buyer' | 'seller' | 'arbiter'
  fromRoleLabel: string
  text: string
  file?: {
    kind: ChatFileKind
    safeFileName: string | null
    size: number | null
    mimeType: string | null
  } | null
  delivery: {
    buyer: 'delivered' | 'failed' | 'skipped'
    seller: 'delivered' | 'failed' | 'skipped'
  }
  createdAt: string
}

export interface AnonymizedChat {
  _id: string
  disputeId: string
  deal: AnonymizedDeal | { _id: string } | null
  status: 'active' | 'closed'
  resolution: 'refund_buyer' | 'release_seller' | null
  nextSeq: number
  messages: AnonymizedChatMessage[]
  closedAt: string | null
  createdAt: string
}

export const managerService = {
  // ---- Auth ----
  login: async (username: string, password: string) => {
    const { data } = await api.post('/manager/login', { username, password })
    return data as { success: boolean; token: string; manager: ManagerProfile }
  },

  verify: async () => {
    const { data } = await api.get('/manager/verify')
    return data as { valid: boolean; manager: ManagerProfile }
  },

  // ---- Disputes ----
  listDisputes: async (params?: { status?: string; page?: number; limit?: number }) => {
    const { data } = await api.get('/manager/disputes', { params })
    return data as { disputes: AnonymizedDispute[]; total: number; totalPages: number }
  },

  getDispute: async (id: string) => {
    const { data } = await api.get(`/manager/disputes/${id}`)
    return data.dispute as AnonymizedDispute
  },

  resolveDispute: async (id: string, winner: 'buyer' | 'seller', reason: string) => {
    const { data } = await api.post(`/manager/disputes/${id}/resolve`, { winner, reason })
    return data
  },

  // ---- Chats ----
  startChat: async (disputeId: string) => {
    const { data } = await api.post(`/manager/disputes/${disputeId}/chat/start`)
    return data as { chatId: string; status: 'active' | 'closed' }
  },

  listChats: async (status: 'active' | 'closed' = 'active') => {
    const { data } = await api.get('/manager/dispute-chats', { params: { status } })
    return data as { chats: AnonymizedChat[] }
  },

  getChat: async (chatId: string) => {
    const { data } = await api.get(`/manager/dispute-chats/${chatId}`)
    return data.chat as AnonymizedChat
  },

  sendMessage: async (chatId: string, text: string) => {
    const { data } = await api.post(`/manager/dispute-chats/${chatId}/message`, { text })
    return data.message as AnonymizedChatMessage
  },

  resolveChat: async (chatId: string, decision: 'refund_buyer' | 'release_seller') => {
    const { data } = await api.post(`/manager/dispute-chats/${chatId}/resolve`, { decision })
    return data
  },

  // SSE — token via query, EventSource can't set headers
  openStream: (chatId: string): EventSource => {
    const token = localStorage.getItem('managerToken') || ''
    return new EventSource(
      `/api/manager/dispute-chats/${chatId}/stream?token=${encodeURIComponent(token)}`
    )
  },

  fileUrl: (chatId: string, seq: number): string => {
    const token = localStorage.getItem('managerToken') || ''
    return `/api/manager/dispute-chats/${chatId}/files/${seq}?token=${encodeURIComponent(token)}`
  }
}
