import api from './api'
import type {
  Deal,
  User,
  Dispute,
  Platform,
  AdminStats,
  ApiResponse,
} from '@/types'

export const adminService = {
  // ========== Auth ==========

  login: async (username: string, password: string): Promise<{ token: string }> => {
    const { data } = await api.post('/admin/login', { username, password })
    return data
  },

  verifyToken: async (): Promise<{ valid: boolean; admin: { username: string } }> => {
    const { data } = await api.get('/admin/verify')
    return data
  },

  // ========== Dashboard Stats ==========

  getStats: async (): Promise<AdminStats> => {
    const { data } = await api.get('/admin/stats')
    // Server returns full structure directly, add legacy fields for compatibility
    return {
      ...data,
      // Legacy fields
      totalDeals: data.deals?.total || 0,
      activeDeals: data.deals?.active || 0,
      completedDeals: data.deals?.completed || 0,
      totalVolume: parseFloat(data.finance?.totalVolume || '0'),
      totalCommission: parseFloat(data.finance?.totalCommission || '0'),
      totalUsers: data.users?.total || 0,
      activeDisputes: data.deals?.disputed || 0,
      todayDeals: 0, // TODO: Add to backend if needed
      todayVolume: 0, // TODO: Add to backend if needed
    }
  },

  // ========== Deals ==========

  getDeals: async (params?: {
    status?: string
    page?: number
    limit?: number
    search?: string
  }): Promise<{ deals: Deal[]; total: number; totalPages: number }> => {
    const { data } = await api.get('/admin/deals', { params })
    return data
  },

  getDeal: async (id: string): Promise<Deal> => {
    const { data } = await api.get(`/admin/deals/${id}`)
    return data.deal
  },

  updateDealStatus: async (id: string, status: string): Promise<ApiResponse> => {
    const { data } = await api.put(`/admin/deals/${id}/status`, { status })
    return data
  },

  toggleDealHidden: async (id: string): Promise<{ success: boolean; deal: { _id: string; dealId: string; isHidden: boolean } }> => {
    const { data } = await api.post(`/admin/deals/${id}/toggle-hidden`)
    return data
  },

  // ========== Users ==========

  getUsers: async (params?: {
    page?: number
    limit?: number
    search?: string
    blacklisted?: boolean
  }): Promise<{ users: User[]; total: number; totalPages: number }> => {
    const { data } = await api.get('/admin/users', { params })
    return data
  },

  getUser: async (telegramId: number): Promise<User> => {
    const { data } = await api.get(`/admin/users/${telegramId}`)
    return data.user
  },

  banUser: async (telegramId: number, reason: string): Promise<ApiResponse> => {
    const { data } = await api.post(`/admin/users/${telegramId}/ban`, { reason })
    return data
  },

  unbanUser: async (telegramId: number): Promise<ApiResponse> => {
    const { data } = await api.post(`/admin/users/${telegramId}/unban`)
    return data
  },

  // ========== Disputes ==========

  getDisputes: async (params?: {
    status?: string
    page?: number
    limit?: number
  }): Promise<{ disputes: Dispute[]; total: number; totalPages: number }> => {
    const { data } = await api.get('/admin/disputes', { params })
    return data
  },

  getDispute: async (id: string): Promise<Dispute> => {
    const { data } = await api.get(`/admin/disputes/${id}`)
    return data.dispute
  },

  resolveDispute: async (
    id: string,
    decision: { winner: 'buyer' | 'seller'; reason: string }
  ): Promise<ApiResponse> => {
    const { data } = await api.post(`/admin/disputes/${id}/resolve`, decision)
    return data
  },

  cancelDispute: async (id: string, deadlineHours: number): Promise<ApiResponse> => {
    const { data } = await api.post(`/admin/disputes/${id}/cancel`, { deadlineHours })
    return data
  },

  // ========== Platforms/Partners ==========

  getPlatforms: async (): Promise<Platform[]> => {
    const { data } = await api.get('/admin/platforms')
    return data.platforms || []
  },

  getPlatform: async (id: string): Promise<Platform> => {
    const { data } = await api.get(`/admin/platforms/${id}`)
    return data.platform
  },

  createPlatform: async (platform: Partial<Platform>): Promise<Platform> => {
    const { data } = await api.post('/admin/platforms', platform)
    return data.platform
  },

  updatePlatform: async (id: string, platform: Partial<Platform>): Promise<Platform> => {
    const { data } = await api.put(`/admin/platforms/${id}`, platform)
    return data.platform
  },

  deletePlatform: async (id: string): Promise<void> => {
    await api.delete(`/admin/platforms/${id}`)
  },

  togglePlatformStatus: async (id: string): Promise<Platform> => {
    const { data } = await api.post(`/admin/platforms/${id}/toggle`)
    return data.platform
  },

  // ========== Exports ==========

  exportDealPdf: async (dealId: string, userIdentifier: string): Promise<{ blob: Blob; filename: string }> => {
    const response = await api.get(`/admin/export/deal/${dealId}`, {
      params: { userIdentifier },
      responseType: 'blob',
    })
    const contentDisposition = response.headers['content-disposition']
    let filename = `KeyShield_Deal_${dealId}.pdf`
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";\n]+)"?/)
      if (match) filename = match[1]
    }
    return { blob: response.data, filename }
  },

  exportUserPdf: async (userIdentifier: string): Promise<{ blob: Blob; filename: string }> => {
    const response = await api.get(`/admin/export/user/${userIdentifier}`, {
      responseType: 'blob',
    })
    const contentDisposition = response.headers['content-disposition']
    let filename = `KeyShield_User_${userIdentifier.replace('@', '')}.pdf`
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";\n]+)"?/)
      if (match) filename = match[1]
    }
    return { blob: response.data, filename }
  },

  exportDealsReport: async (params: {
    startDate: string
    endDate: string
    format: 'pdf' | 'csv'
  }): Promise<Blob> => {
    const { data } = await api.get('/admin/export/deals', {
      params,
      responseType: 'blob',
    })
    return data
  },

  getExportHistory: async (): Promise<{ exports: Array<Record<string, unknown>> }> => {
    const { data } = await api.get('/admin/export/history')
    return data
  },

  deleteExport: async (id: string): Promise<void> => {
    await api.delete(`/admin/export/${id}`)
  },

  downloadExport: async (id: string): Promise<{ blob: Blob; filename: string }> => {
    const response = await api.get(`/admin/export/${id}/download`, {
      responseType: 'blob',
    })
    const contentDisposition = response.headers['content-disposition']
    let filename = 'export.pdf'
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^";\n]+)"?/)
      if (match) {
        filename = match[1]
      }
    }
    return { blob: response.data, filename }
  },

  // ========== Transaction Logs ==========

  getTransactions: async (params?: {
    type?: string
    dealId?: string
    page?: number
    limit?: number
  }): Promise<{ transactions: Array<unknown>; total: number }> => {
    const { data } = await api.get('/admin/transactions', { params })
    return data
  },

  // ========== System ==========

  getSystemInfo: async (): Promise<{ version: string; uptime: number; memory: object }> => {
    const { data } = await api.get('/admin/system/info')
    return data
  },

  checkIp: async (ip: string): Promise<{ result: object }> => {
    const { data } = await api.get('/admin/system/ip-check', { params: { ip } })
    return data
  },
}
