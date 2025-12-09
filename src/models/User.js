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
  // Last activity timestamp for cleanup
  lastActivity: {
    type: Date,
    default: Date.now
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

module.exports = mongoose.model('User', userSchema);
