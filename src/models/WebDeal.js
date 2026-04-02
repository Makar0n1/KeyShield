const mongoose = require('mongoose');
const crypto = require('crypto');

/**
 * WebDeal — draft deal created from the website
 * When user clicks the generated link → bot picks up the draft and creates a real deal
 */
const webDealSchema = new mongoose.Schema({
  // Unique token for deep link
  token: {
    type: String,
    unique: true,
    index: true,
    default: () => crypto.randomBytes(16).toString('hex')
  },

  // Deal parameters (filled on website)
  creatorRole: {
    type: String,
    enum: ['buyer', 'seller'],
    required: true
  },
  productName: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    default: '',
    maxlength: 2000
  },
  amount: {
    type: Number,
    required: true,
    min: 50
  },
  asset: {
    type: String,
    default: 'USDT'
  },
  deadlineHours: {
    type: Number,
    default: 72,
    enum: [24, 48, 72, 168, 336]
  },
  commissionType: {
    type: String,
    enum: ['buyer', 'seller', 'split'],
    default: 'buyer'
  },

  // Status
  status: {
    type: String,
    enum: ['pending', 'claimed', 'expired'],
    default: 'pending',
    index: true
  },

  // Who claimed this draft
  claimedBy: {
    type: Number, // telegramId
    default: null
  },
  claimedAt: {
    type: Date,
    default: null
  },

  // Tracking
  source: {
    type: String,
    default: 'website'
  },

  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  }
}, {
  timestamps: true
});

// TTL index — auto-delete expired drafts after 30 days
webDealSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

webDealSchema.methods.claim = async function(telegramId) {
  if (this.status !== 'pending') {
    throw new Error('Draft already claimed');
  }
  if (new Date() > this.expiresAt) {
    this.status = 'expired';
    await this.save();
    throw new Error('Draft expired');
  }
  this.status = 'claimed';
  this.claimedBy = telegramId;
  this.claimedAt = new Date();
  await this.save();
};

module.exports = mongoose.model('WebDeal', webDealSchema);
