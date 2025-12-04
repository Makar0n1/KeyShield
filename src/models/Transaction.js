const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  dealId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deal',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['deposit', 'release', 'refund', 'fee'],
    required: true,
    index: true
  },
  asset: {
    type: String,
    enum: ['USDT', 'TRX'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  txHash: {
    type: String,
    default: null,
    index: true
  },
  rawTx: {
    type: String,
    default: null
  },
  signedBy: [{
    type: String,
    enum: ['buyer', 'seller', 'arbiter']
  }],
  block: {
    type: Number,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed'],
    default: 'pending',
    index: true
  },
  explorerLink: {
    type: String,
    default: null
  },
  // Additional metadata
  fromAddress: {
    type: String,
    default: null
  },
  toAddress: {
    type: String,
    default: null
  },
  errorMessage: {
    type: String,
    default: null
  }
});

// Compound indexes for querying
transactionSchema.index({ dealId: 1, type: 1 });
transactionSchema.index({ dealId: 1, status: 1 });
transactionSchema.index({ txHash: 1 });

// Method to generate explorer link
transactionSchema.methods.generateExplorerLink = function() {
  if (this.txHash) {
    this.explorerLink = `https://tronscan.org/#/transaction/${this.txHash}`;
  }
};

// Static method to create explorer link
transactionSchema.statics.createExplorerLink = function(txHash) {
  return `https://tronscan.org/#/transaction/${txHash}`;
};

module.exports = mongoose.model('Transaction', transactionSchema);
