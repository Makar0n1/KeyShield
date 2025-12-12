import api from './api'
import type { Platform, Deal, User } from '@/types'

export interface PartnerStats {
  totalUsers: number
  totalDeals: number
  activeDeals: number
  completedDeals: number
  totalVolume: number
  totalCommission: number
  monthlyStats: Array<{
    month: string
    users: number
    deals: number
    volume: number
    commission: number
  }>
}

export interface PartnerDashboardData {
  platform: Platform
  stats: PartnerStats
  recentDeals: Deal[]
  recentUsers: User[]
}

export const partnerService = {
  // ========== Auth ==========

  login: async (login: string, password: string): Promise<{ token: string; platform: Platform }> => {
    const { data } = await api.post('/partner/login', { login, password })
    return data
  },

  verifyToken: async (): Promise<{ valid: boolean; platform: Platform }> => {
    const { data } = await api.get('/partner/verify')
    return data
  },

  logout: () => {
    localStorage.removeItem('partner_token')
  },

  // ========== Dashboard ==========

  getDashboard: async (): Promise<PartnerDashboardData> => {
    const { data } = await api.get('/partner/dashboard')
    return data
  },

  getStats: async (params?: {
    startDate?: string
    endDate?: string
  }): Promise<PartnerStats> => {
    const { data } = await api.get('/partner/stats', { params })
    return data.stats
  },

  // ========== Users ==========

  getUsers: async (params?: {
    page?: number
    limit?: number
    search?: string
  }): Promise<{ users: User[]; total: number; totalPages: number }> => {
    const { data } = await api.get('/partner/users', { params })
    return data
  },

  // ========== Deals ==========

  getDeals: async (params?: {
    status?: string
    page?: number
    limit?: number
    search?: string
  }): Promise<{ deals: Deal[]; total: number; totalPages: number }> => {
    const { data } = await api.get('/partner/deals', { params })
    return data
  },

  getDeal: async (dealId: string): Promise<Deal> => {
    const { data } = await api.get(`/partner/deals/${dealId}`)
    return data.deal
  },

  // ========== Profile ==========

  getProfile: async (): Promise<Platform> => {
    const { data } = await api.get('/partner/profile')
    return data.platform
  },

  updatePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await api.post('/partner/password', { currentPassword, newPassword })
  },
}
