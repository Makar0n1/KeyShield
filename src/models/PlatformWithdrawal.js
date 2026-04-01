const mongoose = require('mongoose');
const Counter = require('./Counter');

const platformWithdrawalSchema = new mongoose.Schema({
  // Unique withdrawal ID (PW-00001)
  withdrawalId: {
    type: String,
    unique: true,
    index: true
  },
  // Platform requesting withdrawal
  platformId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Platform',
    required: true,
    index: true
  },
  // Platform name for display
  platformName: {
    type: String,
    default: null
  },
  // Amount to withdraw
  amount: {
    type: Number,
    required: true,
    min: 10
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
platformWithdrawalSchema.pre('save', async function(next) {
  if (!this.withdrawalId) {
    const counter = await Counter.findOneAndUpdate(
      { name: 'platformWithdrawal' },
      { $inc: { value: 1 } },
      { upsert: true, new: true }
    );
    this.withdrawalId = `PW-${String(counter.value).padStart(5, '0')}`;
  }
  next();
});

platformWithdrawalSchema.index({ status: 1, createdAt: -1 });

platformWithdrawalSchema.statics.getPendingCount = async function() {
  return this.countDocuments({ status: 'pending' });
};

platformWithdrawalSchema.statics.getPlatformPendingWithdrawal = async function(platformId) {
  return this.findOne({ platformId, status: { $in: ['pending', 'processing'] } });
};

module.exports = mongoose.model('PlatformWithdrawal', platformWithdrawalSchema);
