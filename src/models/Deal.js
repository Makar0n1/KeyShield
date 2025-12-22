const mongoose = require('mongoose');
const crypto = require('crypto');

const dealSchema = new mongoose.Schema({
  dealId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  creatorRole: {
    type: String,
    enum: ['buyer', 'seller'],
    required: true
  },
  buyerId: {
    type: Number,
    required: true,
    index: true
  },
  sellerId: {
    type: Number,
    required: true,
    index: true
  },
  // Партнерская платформа (наследуется от создателя сделки)
  platformId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Platform',
    default: null,
    index: true
  },
  // Код платформы для быстрого доступа
  platformCode: {
    type: String,
    default: null
  },
  productName: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 5000
  },
  asset: {
    type: String,
    enum: ['USDT', 'TRX'],
    required: true,
    default: 'USDT'
  },
  amount: {
    type: Number,
    required: true,
    min: 10
  },
  commission: {
    type: Number,
    required: true
  },
  commissionType: {
    type: String,
    enum: ['buyer', 'seller', 'split'],
    required: true
  },
  multisigAddress: {
    type: String,
    default: null,
    index: true
  },
  status: {
    type: String,
    enum: [
      'created',
      'waiting_for_seller_wallet', // Waiting for seller to provide wallet (buyer-created deal)
      'waiting_for_buyer_wallet', // Waiting for buyer to provide wallet (seller-created deal)
      'waiting_for_deposit',
      'locked',
      'in_progress',
      'completed',
      'dispute',
      'resolved',
      'cancelled',
      'expired' // Auto-refunded due to deadline + 12h grace period expiration
    ],
    default: 'created',
    index: true
  },
  deadline: {
    type: Date,
    required: true
  },
  uniqueKey: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // SECURITY TODO: These keys should ideally be managed client-side or in secure storage
  // For MVP, storing references/handles here, but mark for security review
  buyerKey: {
    type: String,
    default: null,
    select: false // Don't return by default in queries
  },
  sellerKey: {
    type: String,
    default: null,
    select: false
  },
  arbiterKey: {
    type: String,
    default: null,
    select: false
  },
  // Wallet addresses for payouts
  buyerAddress: {
    type: String,
    default: null
  },
  sellerAddress: {
    type: String,
    default: null
  },
  // Private keys for pseudo-multisig validation
  // Users must input these keys to receive payouts
  buyerPrivateKey: {
    type: String,
    default: null,
    select: false // Never return in queries by default
  },
  sellerPrivateKey: {
    type: String,
    default: null,
    select: false
  },
  // Pending key validation status (for auto-payouts and disputes)
  pendingKeyValidation: {
    type: String,
    enum: [null, 'buyer_refund', 'seller_release', 'seller_payout', 'dispute_buyer', 'dispute_seller'],
    default: null
  },
  depositTxHash: {
    type: String,
    default: null
  },
  depositDetectedAt: {
    type: Date,
    default: null
  },
  actualDepositAmount: {
    type: Number,
    default: null
  },
  // Flag to prevent duplicate deposit notifications on bot restart
  depositNotificationSent: {
    type: Boolean,
    default: false
  },
  // Flag to prevent duplicate deadline expiration notifications (persisted across restarts)
  deadlineNotificationSent: {
    type: Boolean,
    default: false
  },
  // Flag to hide deal from admin dashboard statistics (for test deals)
  isHidden: {
    type: Boolean,
    default: false,
    index: true
  },
  // Operational costs tracking
  operationalCosts: {
    // Activation costs (5 TRX sent, minus what was returned)
    activationTrxSent: { type: Number, default: 5 },      // Initial TRX sent for activation
    activationTxFee: { type: Number, default: 1.1 },      // Transaction fee for sending activation
    activationTrxReturned: { type: Number, default: 0 },  // TRX returned after completion
    activationTrxNet: { type: Number, default: 0 },       // Net activation cost (sent - returned)

    // Energy costs
    energyMethod: { type: String, enum: ['feesaver', 'trx', 'none'], default: 'none' },
    feesaverCostTrx: { type: Number, default: 0 },        // TRX spent on FeeSaver energy rental
    fallbackTrxSent: { type: Number, default: 0 },        // TRX sent for fallback (if FeeSaver failed)
    fallbackTxFee: { type: Number, default: 0 },          // Transaction fee for sending fallback
    fallbackTrxReturned: { type: Number, default: 0 },    // TRX returned from fallback
    fallbackTrxNet: { type: Number, default: 0 },         // Net fallback cost

    // Totals
    totalTrxSpent: { type: Number, default: 0 },          // Total TRX spent on this deal
    totalCostUsd: { type: Number, default: 0 },           // Total cost in USD (at completion time)
    trxPriceAtCompletion: { type: Number, default: 0 }    // TRX price when deal completed
  },
  completedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for checking active deals per user
dealSchema.index({ buyerId: 1, status: 1 });
dealSchema.index({ sellerId: 1, status: 1 });

// Index for deposit monitor queries (optimized for status + multisigAddress)
dealSchema.index({ status: 1, multisigAddress: 1 });

// Index for duplicate deal checking
dealSchema.index({ uniqueKey: 1, status: 1 });

// Index for platform statistics
dealSchema.index({ platformId: 1, status: 1 });

// Index for deadline monitor queries
dealSchema.index({ status: 1, deadline: 1 });

// Static method to generate unique deal ID (ATOMIC - no race conditions!)
// Uses Counter model for guaranteed uniqueness under high load
dealSchema.statics.generateDealId = async function() {
  const Counter = require('./Counter');
  const nextValue = await Counter.getNextValue('deal_id');
  return `DL-${String(nextValue).padStart(6, '0')}`;
};

// Legacy sync version (DEPRECATED - only for backwards compatibility)
// DO NOT USE for new deal creation - use async version above
dealSchema.statics.generateDealIdSync = function() {
  const randomPart = Math.floor(100000 + Math.random() * 900000);
  return `DL-${randomPart}`;
};

// Static method to generate uniqueKey for anti-duplicate
// Now includes timestamp to allow same participants to create multiple deals
dealSchema.statics.generateUniqueKey = function(buyerId, sellerId, description) {
  const timestamp = Date.now();
  const data = `${buyerId}${sellerId}${description}${timestamp}`;
  return crypto.createHash('sha256').update(data).digest('hex');
};

// Static method to calculate commission
// Below 300 USDT: flat 15 USDT
// 300 USDT and above: 5% of amount
dealSchema.statics.calculateCommission = function(amount) {
  const THRESHOLD = 300; // USDT
  const MIN_COMMISSION = 15; // USDT
  const RATE = 0.05; // 5%

  if (amount < THRESHOLD) {
    return MIN_COMMISSION;
  }

  return amount * RATE;
};

// Method to check if deal is in active state
dealSchema.methods.isActive = function() {
  const activeStatuses = ['waiting_for_deposit', 'locked', 'in_progress', 'dispute'];
  return activeStatuses.includes(this.status);
};

// Method to check if user is participant
dealSchema.methods.isParticipant = function(telegramId) {
  return this.buyerId === telegramId || this.sellerId === telegramId;
};

// Method to get user role in deal
dealSchema.methods.getUserRole = function(telegramId) {
  if (this.buyerId === telegramId) return 'buyer';
  if (this.sellerId === telegramId) return 'seller';
  return null;
};

module.exports = mongoose.model('Deal', dealSchema);
