import api from './api'

export interface AppConfig {
  commission: {
    rate: number      // 0.05 = 5%
    minUsdt: number   // 15 USDT
    threshold: number // 300 USDT
  }
  trx: {
    multisigActivation: number // 5 TRX
    fallbackAmount: number     // 30 TRX
    currentPrice: number       // Current TRX price in USD
  }
}

// Default values (same as server defaults)
const defaultConfig: AppConfig = {
  commission: {
    rate: 0.05,
    minUsdt: 15,
    threshold: 300
  },
  trx: {
    multisigActivation: 5,
    fallbackAmount: 30,
    currentPrice: 0.28 // Fallback price
  }
}

// Cache config to avoid repeated requests
let cachedConfig: AppConfig | null = null
let fetchPromise: Promise<AppConfig> | null = null

export const configService = {
  /**
   * Get app configuration from server
   * Caches the result for subsequent calls
   */
  getConfig: async (): Promise<AppConfig> => {
    // Return cached if available
    if (cachedConfig) {
      return cachedConfig
    }

    // If already fetching, return the same promise
    if (fetchPromise) {
      return fetchPromise
    }

    // Fetch from server
    fetchPromise = api.get('/api/config')
      .then(({ data }) => {
        cachedConfig = data
        return data
      })
      .catch((err) => {
        console.warn('Failed to load config, using defaults:', err.message)
        cachedConfig = defaultConfig
        return defaultConfig
      })
      .finally(() => {
        fetchPromise = null
      })

    return fetchPromise
  },

  /**
   * Get cached config synchronously (returns defaults if not loaded yet)
   */
  getCachedConfig: (): AppConfig => {
    return cachedConfig || defaultConfig
  },

  /**
   * Clear cache (useful for testing or force reload)
   */
  clearCache: () => {
    cachedConfig = null
    fetchPromise = null
  },

  /**
   * Calculate commission for a deal amount
   */
  calculateCommission: (amount: number, config?: AppConfig): number => {
    const cfg = config || cachedConfig || defaultConfig
    if (amount <= cfg.commission.threshold) {
      return cfg.commission.minUsdt
    }
    return amount * cfg.commission.rate
  },

  /**
   * Format commission display text
   */
  getCommissionText: (config?: AppConfig): string => {
    const cfg = config || cachedConfig || defaultConfig
    return `До ${cfg.commission.threshold} USDT — ${cfg.commission.minUsdt} USDT, выше — ${cfg.commission.rate * 100}%`
  }
}
