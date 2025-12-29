const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    default: null
  },
  firstName: {
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: ['buyer', 'seller', 'both'],
    default: 'both'
  },
  // Партнерская платформа (откуда пришёл пользователь)
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
  // Источник регистрации
  source: {
    type: String,
    default: 'direct' // 'direct' или код платформы
  },
  // ============================================
  // REFERRAL SYSTEM
  // ============================================
  // Unique referral code for this user (e.g., KS-A1B2C3)
  referralCode: {
    type: String,
    unique: true,
    sparse: true, // Allow null values
    index: true
  },
  // Who referred this user (telegramId)
  referredBy: {
    type: Number,
    default: null,
    index: true
  },
  // Referral balance (accumulated, not yet withdrawn)
  referralBalance: {
    type: Number,
    default: 0
  },
  // Total earned from referrals (lifetime)
  referralTotalEarned: {
    type: Number,
    default: 0
  },
  // Total withdrawn
  referralWithdrawnTotal: {
    type: Number,
    default: 0
  },
  // Wallet for referral payouts (can be different from deal wallets)
  referralWallet: {
    type: String,
    default: null
  },
  // Referral statistics
  referralStats: {
    totalInvited: {
      type: Number,
      default: 0
    },
    activeReferrals: {
      type: Number,
      default: 0 // Referrals who completed at least one deal
    }
  },
  blacklisted: {
    type: Boolean,
    default: false,
    index: true
  },
  disputeStats: {
    totalWon: {
      type: Number,
      default: 0
    },
    totalLost: {
      type: Number,
      default: 0
    },
    lossStreak: {
      type: Number,
      default: 0
    }
  },
  notes: {
    type: String,
    default: ''
  },
  // Main bot message ID for single-message navigation
  mainMessageId: {
    type: Number,
    default: null
  },
  // Navigation stack for Back button (persistent)
  navigationStack: {
    type: [{
      screen: String,
      text: String,
      keyboard: mongoose.Schema.Types.Mixed
    }],
    default: []
  },
  // Current screen data (persistent)
  currentScreen: {
    type: String,
    default: null
  },
  currentScreenData: {
    text: String,
    keyboard: mongoose.Schema.Types.Mixed
  },
  // Pending wallet for balance warning flow
  pendingWallet: {
    type: String,
    default: null
  },
  pendingDealId: {
    type: String,
    default: null
  },
  // Saved email for transaction receipts
  email: {
    type: String,
    default: null
  },
  // Saved USDT wallets (max 5)
  wallets: {
    type: [{
      address: {
        type: String,
        required: true
      },
      name: {
        type: String,
        default: null
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    default: [],
    validate: {
      validator: function(wallets) {
        return wallets.length <= 5;
      },
      message: 'Максимум 5 сохранённых кошельков'
    }
  },
  // Last activity timestamp for cleanup
  lastActivity: {
    type: Date,
    default: Date.now
  },
  // Bot blocked status (when user blocks the bot)
  botBlocked: {
    type: Boolean,
    default: false,
    index: true
  },
  botBlockedAt: {
    type: Date,
    default: null
  },
  // Last action tracking
  lastActionType: {
    type: String,
    default: null
  },
  lastActionAt: {
    type: Date,
    default: null
  },
  // Session counter (increments on each /start)
  sessionCount: {
    type: Number,
    default: 0
  },
  // Activity statistics
  stats: {
    dealsCreated: {
      type: Number,
      default: 0
    },
    dealsCompleted: {
      type: Number,
      default: 0
    },
    totalVolume: {
      type: Number,
      default: 0
    },
    commandsUsed: {
      type: Number,
      default: 0
    },
    buttonsClicked: {
      type: Number,
      default: 0
    }
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

// Index for searching by username
userSchema.index({ username: 1 });

// Method to check if user can create deals
userSchema.methods.canCreateDeal = function() {
  return !this.blacklisted;
};

// Wallet management methods
const MAX_WALLETS = 5;

// Add a wallet (returns error message if failed, null if success)
userSchema.methods.addWallet = async function(address, name = null) {
  if (this.wallets.length >= MAX_WALLETS) {
    return `Достигнут лимит (${MAX_WALLETS}) сохранённых кошельков. Удалите один, чтобы добавить новый.`;
  }

  // Check for duplicate address
  const exists = this.wallets.some(w => w.address.toLowerCase() === address.toLowerCase());
  if (exists) {
    return 'Этот адрес уже сохранён.';
  }

  this.wallets.push({
    address,
    name: name && name.trim() ? name.trim() : null,
    createdAt: new Date()
  });

  await this.save();
  return null; // Success
};

// Remove a wallet by address
userSchema.methods.removeWallet = async function(address) {
  const index = this.wallets.findIndex(w => w.address.toLowerCase() === address.toLowerCase());
  if (index === -1) {
    return 'Кошелёк не найден.';
  }

  this.wallets.splice(index, 1);
  await this.save();
  return null; // Success
};

// Get wallet by address
userSchema.methods.getWallet = function(address) {
  return this.wallets.find(w => w.address.toLowerCase() === address.toLowerCase());
};

// Check if can add more wallets
userSchema.methods.canAddWallet = function() {
  return this.wallets.length < MAX_WALLETS;
};

// Method to update dispute stats after resolution
userSchema.methods.updateDisputeStats = async function(won) {
  if (won) {
    this.disputeStats.totalWon += 1;
    this.disputeStats.lossStreak = 0; // Reset streak on win
  } else {
    this.disputeStats.totalLost += 1;
    this.disputeStats.lossStreak += 1;

    // Auto-ban after 3 consecutive losses
    if (this.disputeStats.lossStreak >= 3) {
      this.blacklisted = true;
    }
  }

  await this.save();
};

// ============================================
// REFERRAL METHODS
// ============================================

// Generate unique referral code
userSchema.methods.generateReferralCode = async function() {
  if (this.referralCode) {
    return this.referralCode; // Already has one
  }

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars (0, O, I, 1)
  let code;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    // Generate random 6-char code
    let randomPart = '';
    for (let i = 0; i < 6; i++) {
      randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    code = `KS-${randomPart}`;

    // Check if unique
    const existing = await mongoose.model('User').findOne({ referralCode: code });
    if (!existing) {
      this.referralCode = code;
      await this.save();
      return code;
    }
    attempts++;
  }

  // Fallback: use telegramId-based code
  code = `KS-${this.telegramId.toString(36).toUpperCase().slice(-6).padStart(6, 'X')}`;
  this.referralCode = code;
  await this.save();
  return code;
};

// Get referral link
userSchema.methods.getReferralLink = async function() {
  const code = await this.generateReferralCode();
  const botUsername = process.env.BOT_USERNAME || 'KeyShieldBot';
  return `https://t.me/${botUsername}?start=ref_${code}`;
};

// Credit referral bonus
userSchema.methods.creditReferralBonus = async function(amount) {
  this.referralBalance += amount;
  this.referralTotalEarned += amount;
  await this.save();
};

// Check if can withdraw (min 10 USDT, no pending withdrawal)
userSchema.methods.canWithdrawReferral = function() {
  return this.referralBalance >= 10;
};

module.exports = mongoose.model('User', userSchema);
