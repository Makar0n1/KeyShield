/**
 * Session Model - Persistent storage for user sessions
 *
 * Stores temporary user state (deal creation, disputes, navigation)
 * that needs to survive bot restarts
 */

const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  // User identification
  telegramId: {
    type: Number,
    required: true,
    index: true
  },

  // Session type: 'create_deal', 'dispute', 'navigation', 'screen_data', 'key_validation'
  type: {
    type: String,
    required: true,
    enum: ['create_deal', 'dispute', 'navigation', 'screen_data', 'key_validation'],
    index: true
  },

  // Session data (flexible JSON storage)
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // Expiration time (auto-cleanup old sessions)
  expiresAt: {
    type: Date,
    required: true,
    index: true
  }
}, {
  timestamps: true
});

// Compound index for fast lookups
sessionSchema.index({ telegramId: 1, type: 1 });

// TTL index - automatically delete expired sessions
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method: Get session by type
sessionSchema.statics.getSession = async function(telegramId, type) {
  const session = await this.findOne({ telegramId, type });
  return session ? session.data : null;
};

// Static method: Set session with auto-expiration
sessionSchema.statics.setSession = async function(telegramId, type, data, ttlHours = 24) {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  await this.findOneAndUpdate(
    { telegramId, type },
    { $set: { data, expiresAt, updatedAt: new Date() } },
    { upsert: true, new: true }
  );
};

// Static method: Delete session
sessionSchema.statics.deleteSession = async function(telegramId, type) {
  await this.deleteOne({ telegramId, type });
};

// Static method: Clear all sessions for user
sessionSchema.statics.clearUserSessions = async function(telegramId) {
  await this.deleteMany({ telegramId });
};

const Session = mongoose.model('Session', sessionSchema);

module.exports = Session;
