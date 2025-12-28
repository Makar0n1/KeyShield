require('dotenv').config();

module.exports = {
  // Deal constraints
  MIN_DEAL_AMOUNT: 50, // Minimum deal amount is 50 USDT

  // Commission settings - NEW PRICING MODEL (effective 27.12.2025)
  // Tier 1: 0-150 USDT = 6 USDT fixed
  COMMISSION_TIER_1_MAX: parseInt(process.env.COMMISSION_TIER_1_MAX) || 150,
  COMMISSION_TIER_1_FIXED: parseFloat(process.env.COMMISSION_TIER_1_FIXED) || 6,

  // Tier 2: 150-500 USDT = 3.5%
  COMMISSION_TIER_2_MAX: parseInt(process.env.COMMISSION_TIER_2_MAX) || 500,
  COMMISSION_TIER_2_RATE: parseFloat(process.env.COMMISSION_TIER_2_RATE) || 0.035,

  // Tier 3: 500-1500 USDT = 3%
  COMMISSION_TIER_3_MAX: parseInt(process.env.COMMISSION_TIER_3_MAX) || 1500,
  COMMISSION_TIER_3_RATE: parseFloat(process.env.COMMISSION_TIER_3_RATE) || 0.03,

  // Tier 4: 1500+ USDT = 2.5%
  COMMISSION_TIER_4_RATE: parseFloat(process.env.COMMISSION_TIER_4_RATE) || 0.025,

  // Deposit tolerance
  DEPOSIT_TOLERANCE_MINUS: 2, // Allow up to -2 USDT difference
  DEPOSIT_TOLERANCE_PLUS: 999999, // Allow overpayment (goes to service wallet)

  // Deal statuses that are considered "active"
  ACTIVE_DEAL_STATUSES: [
    'waiting_for_deposit',
    'locked',
    'in_progress',
    'dispute'
  ],

  // Auto-ban settings
  AUTO_BAN_LOSS_STREAK: 3,

  // Deposit monitoring
  DEPOSIT_CHECK_INTERVAL: parseInt(process.env.DEPOSIT_CHECK_INTERVAL) || 30000, // 30 seconds

  // Service wallet
  SERVICE_WALLET_ADDRESS: process.env.SERVICE_WALLET_ADDRESS,

  // Arbiter settings
  ARBITER_ADDRESS: process.env.ARBITER_ADDRESS,

  // Assets
  SUPPORTED_ASSETS: ['USDT'],

  // Multisig
  MULTISIG_THRESHOLD: 2,

  // File upload limits (for later)
  MAX_FILE_SIZE: 20 * 1024 * 1024, // 20MB
  ALLOWED_FILE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'application/pdf'],

  // Deadline options (in hours)
  DEADLINE_OPTIONS: {
    '24h': 24,
    '48h': 48,
    '3d': 72,
    '7d': 168,
    '14d': 336
  }
};
