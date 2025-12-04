require('dotenv').config();

module.exports = {
  // Deal constraints
  MIN_DEAL_AMOUNT: 50, // Minimum deal amount is 50 USDT

  // Commission settings
  COMMISSION_RATE: 0.05, // 5% commission rate
  MIN_COMMISSION_USDT: 15, // Minimum commission is 15 USDT
  COMMISSION_THRESHOLD: 300, // Below 300 USDT = flat 15 USDT, above = 5%

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
