const mongoose = require('mongoose');

const multisigWalletSchema = new mongoose.Schema({
  dealId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deal',
    required: true,
    unique: true,
    index: true
  },
  address: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  buyerPublicKey: {
    type: String,
    required: true
  },
  sellerPublicKey: {
    type: String,
    required: true
  },
  arbiterPublicKey: {
    type: String,
    required: true
  },
  // Private key of the multisig wallet itself
  // SECURITY TODO: Should be encrypted or stored in secure vault
  privateKey: {
    type: String,
    required: true,
    select: false // Don't return by default in queries
  },
  threshold: {
    type: Number,
    required: true,
    default: 2
  },
  // Full permission set JSON as configured in TRON
  permissionsJson: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  // Track current balance (updated by deposit monitor)
  balances: {
    TRX: {
      type: Number,
      default: 0
    },
    USDT: {
      type: Number,
      default: 0
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for searching by address
multisigWalletSchema.index({ address: 1 });

module.exports = mongoose.model('MultisigWallet', multisigWalletSchema);
