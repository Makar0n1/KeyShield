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
  referralLink?: string
}

export const partnerService = {
  // ========== Auth ==========

  login: async (login: string, password: string): Promise<{ token: string; platform: Platform }> => {
    const { data } = await api.post('/partner/api/login', { login, password })
    return data
  },

  verifyToken: async (): Promise<{ valid: boolean; platform: Platform }> => {
    const { data } = await api.get('/partner/api/verify')
    return data
  },

  logout: () => {
    localStorage.removeItem('partner_token')
  },

  // ========== Dashboard ==========

  getDashboard: async (): Promise<PartnerDashboardData> => {
    const { data } = await api.get('/partner/api/dashboard')
    return data
  },

  getStats: async (params?: {
    startDate?: string
    endDate?: string
  }): Promise<PartnerStats> => {
    const { data } = await api.get('/partner/api/stats', { params })
    return data.stats
  },

  // ========== Users ==========

  getUsers: async (params?: {
    page?: number
    limit?: number
    search?: string
  }): Promise<{ users: User[]; total: number; totalPages: number }> => {
    const { data } = await api.get('/partner/api/users', { params })
    return data
  },

  // ========== Deals ==========

  getDeals: async (params?: {
    status?: string
    page?: number
    limit?: number
    search?: string
  }): Promise<{ deals: Deal[]; total: number; totalPages: number }> => {
    const { data } = await api.get('/partner/api/deals', { params })
    return data
  },

  getDeal: async (dealId: string): Promise<Deal> => {
    const { data } = await api.get(`/partner/api/deals/${dealId}`)
    return data.deal
  },

  // ========== Profile ==========

  getProfile: async (): Promise<Platform> => {
    const { data } = await api.get('/partner/api/profile')
    return data.platform
  },

  updatePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
    await api.post('/partner/api/password', { currentPassword, newPassword })
  },

  // ========== Withdrawals ==========

  getWithdrawals: async (): Promise<{
    withdrawals: any[]
    availableBalance: number
    walletAddress: string | null
  }> => {
    const { data } = await api.get('/partner/api/withdrawals')
    return data
  },

  requestWithdrawal: async (amount: number, walletAddress: string): Promise<any> => {
    const { data } = await api.post('/partner/api/withdrawal/request', { amount, walletAddress })
    return data
  },

  updateWallet: async (walletAddress: string, password: string): Promise<void> => {
    await api.post('/partner/api/wallet', { walletAddress, password })
  },

  deleteWallet: async (password: string): Promise<void> => {
    await api.post('/partner/api/wallet/delete', { password })
  },
}
