const mongoose = require('mongoose');
const { encrypt, decrypt, isEnabled: encryptionEnabled } = require('../utils/encryption');

// Fields to encrypt/decrypt automatically
const ENCRYPTED_FIELDS = ['privateKey', 'buyerPublicKey', 'sellerPublicKey', 'arbiterPublicKey'];

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

// ─── Encryption hooks ───────────────────────────────────
multisigWalletSchema.pre('save', function () {
  if (!encryptionEnabled()) return;
  for (const field of ENCRYPTED_FIELDS) {
    if (this[field]) this[field] = encrypt(this[field]);
  }
});

function decryptDoc(doc) {
  if (!doc || !encryptionEnabled()) return;
  for (const field of ENCRYPTED_FIELDS) {
    if (doc[field]) doc[field] = decrypt(doc[field]);
  }
}

multisigWalletSchema.post('find', (docs) => docs.forEach(decryptDoc));
multisigWalletSchema.post('findOne', decryptDoc);
multisigWalletSchema.post('findOneAndUpdate', decryptDoc);

module.exports = mongoose.model('MultisigWallet', multisigWalletSchema);
