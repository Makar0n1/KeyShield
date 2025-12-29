const mongoose = require('mongoose');

/**
 * ReferralTransaction - tracks referral bonus earnings
 * Created when a referred user completes a deal
 */
const referralTransactionSchema = new mongoose.Schema({
  // Referrer (who gets the bonus)
  referrerId: {
    type: Number,
    required: true,
    index: true
  },
  // Referee (who completed the deal)
  refereeId: {
    type: Number,
    required: true,
    index: true
  },
  // Deal info
  dealId: {
    type: String,
    required: true,
    index: true
  },
  dealAmount: {
    type: Number,
    required: true
  },
  // Commission info
  serviceCommission: {
    type: Number,
    required: true
  },
  referralPercent: {
    type: Number,
    required: true,
    default: 0.10 // 10%
  },
  // Bonus amount credited
  bonusAmount: {
    type: Number,
    required: true
  },
  // Status
  status: {
    type: String,
    enum: ['credited', 'withdrawn'],
    default: 'credited'
  },
  // Withdrawal reference (if withdrawn)
  withdrawalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReferralWithdrawal',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for finding all transactions for a referrer
referralTransactionSchema.index({ referrerId: 1, createdAt: -1 });

// Prevent duplicate bonuses for same deal+referrer
referralTransactionSchema.index({ dealId: 1, referrerId: 1 }, { unique: true });

module.exports = mongoose.model('ReferralTransaction', referralTransactionSchema);
