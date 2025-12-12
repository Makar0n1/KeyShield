import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { adminService } from '@/services/admin'

interface AdminUser {
  username: string
  role?: 'admin' | 'superadmin'
}

interface AuthState {
  token: string | null
  admin: AdminUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  verifyAuth: () => Promise<boolean>
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      admin: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null })
        try {
          const { token } = await adminService.login(username, password)
          localStorage.setItem('adminToken', token)
          set({
            token,
            admin: { username },
            isAuthenticated: true,
            isLoading: false,
          })
          return true
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Login failed'
          set({ error: message, isLoading: false })
          return false
        }
      },

      logout: () => {
        localStorage.removeItem('adminToken')
        set({
          token: null,
          admin: null,
          isAuthenticated: false,
          error: null,
        })
      },

      verifyAuth: async () => {
        const token = localStorage.getItem('adminToken')
        if (!token) {
          set({ isAuthenticated: false, token: null, admin: null })
          return false
        }

        try {
          const { valid, admin } = await adminService.verifyToken()
          if (valid) {
            set({ token, admin, isAuthenticated: true })
            return true
          } else {
            get().logout()
            return false
          }
        } catch {
          get().logout()
          return false
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        admin: state.admin,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
