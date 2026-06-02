import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { managerService, type ManagerProfile } from '@/services/manager'

interface ManagerAuthState {
  token: string | null
  manager: ManagerProfile | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  verifyAuth: () => Promise<boolean>
  clearError: () => void
}

export const useManagerAuthStore = create<ManagerAuthState>()(
  persist(
    (set, get) => ({
      token: null,
      manager: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (username, password) => {
        set({ isLoading: true, error: null })
        try {
          const res = await managerService.login(username, password)
          localStorage.setItem('managerToken', res.token)
          set({
            token: res.token,
            manager: res.manager,
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
        localStorage.removeItem('managerToken')
        set({ token: null, manager: null, isAuthenticated: false, error: null })
      },

      verifyAuth: async () => {
        const token = localStorage.getItem('managerToken')
        if (!token) {
          set({ isAuthenticated: false, token: null, manager: null })
          return false
        }
        try {
          const { valid, manager } = await managerService.verify()
          if (valid) {
            set({ token, manager, isAuthenticated: true })
            return true
          }
          get().logout()
          return false
        } catch {
          get().logout()
          return false
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: 'manager-auth-storage',
      partialize: (state) => ({
        token: state.token,
        manager: state.manager,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
