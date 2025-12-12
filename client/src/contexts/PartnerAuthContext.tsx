import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { partnerService } from '@/services/partner'
import type { Platform } from '@/types'

interface PartnerAuthContextType {
  platform: Platform | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (login: string, password: string) => Promise<void>
  logout: () => void
}

const PartnerAuthContext = createContext<PartnerAuthContextType | null>(null)

export function PartnerAuthProvider({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('partner_token')
    if (token) {
      partnerService
        .verifyToken()
        .then((data) => {
          if (data.valid) {
            setPlatform(data.platform)
          } else {
            localStorage.removeItem('partner_token')
          }
        })
        .catch(() => {
          localStorage.removeItem('partner_token')
        })
        .finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = async (loginStr: string, password: string) => {
    const data = await partnerService.login(loginStr, password)
    localStorage.setItem('partner_token', data.token)
    setPlatform(data.platform)
  }

  const logout = () => {
    partnerService.logout()
    setPlatform(null)
  }

  return (
    <PartnerAuthContext.Provider
      value={{
        platform,
        isAuthenticated: !!platform,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </PartnerAuthContext.Provider>
  )
}

export function usePartnerAuth() {
  const context = useContext(PartnerAuthContext)
  if (!context) {
    throw new Error('usePartnerAuth must be used within PartnerAuthProvider')
  }
  return context
}
