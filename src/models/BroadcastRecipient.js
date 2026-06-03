/**
 * BroadcastRecipient — per-user delivery record for each broadcast.
 *
 * Makes broadcasts idempotent across re-sends: when "Send" is pressed
 * again on a completed broadcast, the service skips telegramIds that
 * already have status='sent' for this broadcast and only targets the
 * rest (new eligible users + retries of previously failed/skipped).
 *
 * One record per (broadcastId, telegramId) — compound unique index
 * enforces uniqueness; upsert is used at write time.
 *
 * Status:
 *   sent     — delivered to Telegram successfully
 *   failed   — sendPhoto threw an error (bot blocked, network, etc.)
 *   skipped  — user was in a critical flow (create_deal/dispute/...),
 *              broadcast skipped to avoid disrupting them
 */

const mongoose = require('mongoose');

const broadcastRecipientSchema = new mongoose.Schema({
  broadcastId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Broadcast',
    required: true,
    index: true
  },
  telegramId: {
    type: Number,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['sent', 'failed', 'skipped'],
    required: true
  },
  // Last delivery attempt timestamp (overwritten on re-send retries)
  sentAt: {
    type: Date,
    default: Date.now
  },
  // Last error message for failed/skipped — helps debugging
  error: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// One record per (broadcast, user). Upserts target this constraint.
broadcastRecipientSchema.index(
  { broadcastId: 1, telegramId: 1 },
  { unique: true }
);

module.exports = mongoose.model('BroadcastRecipient', broadcastRecipientSchema);
