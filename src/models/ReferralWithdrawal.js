const mongoose = require('mongoose');
const Counter = require('./Counter');

/**
 * ReferralWithdrawal - tracks withdrawal requests for referral bonuses
 */
const referralWithdrawalSchema = new mongoose.Schema({
  // Unique withdrawal ID (REF-00001)
  withdrawalId: {
    type: String,
    unique: true,
    index: true
  },
  // User requesting withdrawal
  userId: {
    type: Number,
    required: true,
    index: true
  },
  // Username for display
  username: {
    type: String,
    default: null
  },
  // Amount to withdraw
  amount: {
    type: Number,
    required: true,
    min: 10 // Minimum withdrawal
  },
  // Destination wallet
  walletAddress: {
    type: String,
    required: true
  },
  // Status workflow: pending -> processing -> completed/rejected
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'rejected'],
    default: 'pending',
    index: true
  },
  // Admin notes (reason for rejection, etc.)
  adminNotes: {
    type: String,
    default: null
  },
  // Transaction hash after completion
  txHash: {
    type: String,
    default: null
  },
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  processingStartedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Generate withdrawal ID before save
referralWithdrawalSchema.pre('save', async function(next) {
  if (!this.withdrawalId) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'referralWithdrawal' },
      { $inc: { value: 1 } },
      { upsert: true, new: true }
    );
    this.withdrawalId = `REF-${String(counter.value).padStart(5, '0')}`;
  }
  next();
});

// Index for admin listing
referralWithdrawalSchema.index({ status: 1, createdAt: -1 });

// Static method to get pending count
referralWithdrawalSchema.statics.getPendingCount = async function() {
  return this.countDocuments({ status: 'pending' });
};

// Static method to get user's pending withdrawal
referralWithdrawalSchema.statics.getUserPendingWithdrawal = async function(userId) {
  return this.findOne({ userId, status: { $in: ['pending', 'processing'] } });
};

module.exports = mongoose.model('ReferralWithdrawal', referralWithdrawalSchema);
