/**
 * Username Sync Middleware
 *
 * Automatically updates user's username in database on every interaction.
 * This ensures we always have the current username for:
 * - Arbitration (contacting users)
 * - Deal notifications
 * - Finding counterparty by @username
 *
 * Uses in-memory cache to avoid DB writes on every request.
 * Only writes to DB if username actually changed.
 */

const User = require('../../models/User');

class UsernameSync {
  constructor() {
    // Cache: userId -> { username, lastChecked }
    // Avoids DB lookups on every request
    this.cache = new Map();

    // How often to re-check DB (5 minutes)
    this.cacheTtlMs = 5 * 60 * 1000;

    // Cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  /**
   * Sync username if changed
   * @returns {boolean} true if username was updated
   */
  async sync(ctx) {
    const telegramId = ctx.from?.id;
    const currentUsername = ctx.from?.username || null;
    const firstName = ctx.from?.first_name || null;

    if (!telegramId) return false;

    const now = Date.now();
    const cached = this.cache.get(telegramId);

    // Check cache first
    if (cached && (now - cached.lastChecked) < this.cacheTtlMs) {
      // Cache is fresh - check if username changed
      if (cached.username === currentUsername) {
        return false; // No change
      }
    }

    // Need to check/update DB
    try {
      const user = await User.findOne({ telegramId }).select('username firstName').lean();

      if (!user) {
        // User not in DB yet (will be created by /start)
        return false;
      }

      // Update cache
      this.cache.set(telegramId, {
        username: currentUsername,
        lastChecked: now
      });

      // Check if username or firstName changed
      const usernameChanged = user.username !== currentUsername;
      const firstNameChanged = user.firstName !== firstName;

      if (usernameChanged || firstNameChanged) {
        const updates = {};
        if (usernameChanged) updates.username = currentUsername;
        if (firstNameChanged) updates.firstName = firstName;

        await User.updateOne(
          { telegramId },
          { $set: updates }
        );

        if (usernameChanged) {
          console.log(`🔄 Username updated: ${telegramId} | ${user.username || 'null'} → ${currentUsername || 'null'}`);
        }

        return usernameChanged;
      }

      return false;
    } catch (error) {
      console.error('[UsernameSync] Error:', error.message);
      return false;
    }
  }

  /**
   * Cleanup old cache entries
   */
  cleanup() {
    const now = Date.now();
    let deleted = 0;

    for (const [userId, data] of this.cache.entries()) {
      if (now - data.lastChecked > this.cacheTtlMs * 2) {
        this.cache.delete(userId);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`🧹 UsernameSync: cleaned ${deleted} cache entries`);
    }
  }

  /**
   * Clear cache for specific user (e.g., after manual update)
   */
  invalidate(telegramId) {
    this.cache.delete(telegramId);
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

// Singleton instance
const usernameSync = new UsernameSync();

/**
 * Telegraf middleware for username sync
 * Runs on every update (message, callback, etc.)
 */
const usernameSyncMiddleware = async (ctx, next) => {
  // Sync username in background (don't await to not slow down response)
  // But we do await because it's fast with cache and we want consistency
  await usernameSync.sync(ctx);

  return next();
};

module.exports = {
  usernameSyncMiddleware,
  usernameSync
};
