const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: Number,
    default: null,
    index: true
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  ip: {
    type: String,
    default: null
  },
  // Reference fields for easier querying
  dealId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deal',
    default: null,
    index: true
  },
  disputeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dispute',
    default: null
  }
});

// Compound indexes for common queries
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ dealId: 1, timestamp: -1 });

// Static method to log action
auditLogSchema.statics.log = async function(userId, action, details = {}, options = {}) {
  const logEntry = new this({
    userId,
    action,
    details,
    ip: options.ip || null,
    dealId: options.dealId || null,
    disputeId: options.disputeId || null
  });

  await logEntry.save();
  return logEntry;
};

// Static method for common log actions
auditLogSchema.statics.logDealCreated = function(userId, dealId, details) {
  return this.log(userId, 'create_deal', details, { dealId });
};

auditLogSchema.statics.logDepositDetected = function(dealId, details) {
  return this.log(null, 'deposit_detected', details, { dealId });
};

auditLogSchema.statics.logDisputeOpened = function(userId, dealId, disputeId, details) {
  return this.log(userId, 'open_dispute', details, { dealId, disputeId });
};

auditLogSchema.statics.logArbitrageDecision = function(arbiterId, dealId, disputeId, details) {
  return this.log(arbiterId, 'arbiter_decision', details, { dealId, disputeId });
};

auditLogSchema.statics.logUserBanned = function(adminId, bannedUserId, details) {
  return this.log(adminId, 'ban_user', { ...details, bannedUserId });
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
