import { useState, useEffect } from 'react'
import { configService, type AppConfig } from '@/services/config'

/**
 * Hook to load and use app configuration
 * Config is loaded once and cached for subsequent uses
 */
export function useConfig() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    configService.getConfig()
      .then(setConfig)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return {
    config,
    loading,
    error,
    // Helper functions
    calculateCommission: (amount: number) => configService.calculateCommission(amount, config || undefined),
    getCommissionText: () => configService.getCommissionText(config || undefined)
  }
}
