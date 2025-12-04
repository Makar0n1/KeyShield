const mongoose = require('mongoose');

const mediaFileSchema = new mongoose.Schema({
  dealId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deal',
    required: true,
    index: true
  },
  userId: {
    type: Number,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['photo', 'video', 'document', 'voice', 'audio'],
    required: true
  },
  url: {
    type: String,
    required: true
  },
  // Original Telegram file_id for reference
  telegramFileId: {
    type: String,
    default: null
  },
  fileName: {
    type: String,
    default: null
  },
  fileSize: {
    type: Number,
    default: null
  },
  mimeType: {
    type: String,
    default: null
  },
  // For dispute evidence
  disputeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dispute',
    default: null,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound indexes
mediaFileSchema.index({ dealId: 1, createdAt: -1 });
mediaFileSchema.index({ disputeId: 1 });

module.exports = mongoose.model('MediaFile', mediaFileSchema);
