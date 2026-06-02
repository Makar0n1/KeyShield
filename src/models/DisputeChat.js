/**
 * DisputeChat Model
 *
 * Stores the anonymized arbitration chat between buyer, seller and arbiter
 * (arbiter participates via admin panel). Created when the arbiter escalates
 * an existing Dispute to "chat mode" because the initial evidence is
 * insufficient. Messages are mirrored in real-time to the panel via SSE.
 *
 * After resolve:
 *   - All bot-sent messages are deleted from both parties' Telegram chats
 *   - The chat document itself is kept (status='closed') for audit
 *   - Existing disputeService.resolveDispute is called to finalize the deal
 */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Monotonic sequence number — assigned via atomic $inc on the parent doc.
  // Guarantees strict global order even under concurrent posts from both sides.
  seq: {
    type: Number,
    required: true
  },
  from: {
    type: String,
    enum: ['buyer', 'seller', 'arbiter'],
    required: true
  },
  // null for arbiter (arbiter has no telegramId in chat context)
  fromTelegramId: {
    type: Number,
    default: null
  },
  text: {
    type: String,
    default: '',
    maxlength: 2000
  },
  // Optional file attachment. Validated through fileSecurityService before save.
  file: {
    type: {
      type: String,
      enum: ['photo', 'video', 'document', 'voice', null],
      default: null
    },
    telegramFileId: { type: String, default: null },
    safeFileName: { type: String, default: null },
    hash: { type: String, default: null },
    size: { type: Number, default: null },
    mimeType: { type: String, default: null }
  },
  // Tracks the Telegram message_id created on each party's chat by the relay.
  // null for the side that originated the message (their own message was
  // already deleted by ctx.deleteMessage in the handler).
  telegramMessageIds: {
    buyer: { type: Number, default: null },
    seller: { type: Number, default: null }
  },
  // Per-side delivery status. Lets the admin UI show "❌ не доставлено" for
  // sides that have blocked the bot.
  delivery: {
    buyer: {
      type: String,
      enum: ['delivered', 'failed', 'skipped'],
      default: 'skipped'
    },
    seller: {
      type: String,
      enum: ['delivered', 'failed', 'skipped'],
      default: 'skipped'
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const disputeChatSchema = new mongoose.Schema({
  disputeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dispute',
    required: true,
    index: true
  },
  // Denormalized for fast lookups + cross-reference in resolve flow
  dealId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deal',
    required: true,
    index: true
  },
  buyerTelegramId: {
    type: Number,
    required: true
  },
  sellerTelegramId: {
    type: Number,
    required: true
  },
  arbiterId: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'closed'],
    default: 'active',
    index: true
  },
  resolution: {
    type: String,
    enum: ['refund_buyer', 'release_seller', null],
    default: null
  },
  // Monotonic counter incremented atomically on each new message.
  nextSeq: {
    type: Number,
    default: 1
  },
  messages: [messageSchema],
  // Message ids of the intro notice ("Арбитр открыл чат") on each side —
  // tracked separately so they're wiped along with the chat on resolve.
  introMessageIds: {
    buyer: { type: Number, default: null },
    seller: { type: Number, default: null }
  },
  closedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Used by admin panel "active chats" sidebar — newest first
disputeChatSchema.index({ status: 1, createdAt: -1 });

// One active chat per dispute (arbiter can't open two chats for the same dispute)
disputeChatSchema.index(
  { disputeId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

module.exports = mongoose.model('DisputeChat', disputeChatSchema);
