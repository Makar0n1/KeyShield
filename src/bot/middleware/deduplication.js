/**
 * Callback Deduplication Middleware
 *
 * Prevents double-tap issues where user clicks button twice quickly
 * and creates duplicate deals or triggers duplicate actions.
 *
 * Uses in-memory cache with TTL for fast lookups.
 */

class CallbackDeduplicator {
  constructor(options = {}) {
    // TTL for processed callbacks (default 3 seconds)
    this.ttlMs = options.ttlMs || 3000;

    // Max cache size to prevent memory leaks
    this.maxSize = options.maxSize || 10000;

    // Processed callbacks: Map<key, timestamp>
    this.processed = new Map();

    // Cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);

    // Stats
    this.stats = {
      totalProcessed: 0,
      totalDeduplicated: 0
    };
  }

  /**
   * Generate unique key for callback
   * Some callbacks (like username_set) can appear on different message IDs,
   * so we need to deduplicate by userId:data only for those cases.
   */
  getKey(ctx) {
    const userId = ctx.from?.id;
    const data = ctx.callbackQuery?.data;
    const messageId = ctx.callbackQuery?.message?.message_id;

    // For actions that can be on different screens, deduplicate by userId:data only
    const actionOnlyActions = new Set(['username_set', 'lang_change', 'main_menu', 'back']);
    if (actionOnlyActions.has(data)) {
      return `${userId}:${data}`;  // No message_id, dedups across all messages
    }

    // For other callbacks, include message_id (allow same button on different messages)
    return `${userId}:${data}:${messageId}`;
  }

  /**
   * Check if callback should be processed
   * Returns true if this is a new callback, false if duplicate
   */
  shouldProcess(ctx) {
    if (!ctx.callbackQuery) {
      return true; // Not a callback, always process
    }

    const key = this.getKey(ctx);
    const now = Date.now();

    // Check if we've seen this callback recently
    const lastSeen = this.processed.get(key);
    if (lastSeen && (now - lastSeen) < this.ttlMs) {
      this.stats.totalDeduplicated++;
      return false; // Duplicate!
    }

    // Mark as processed
    this.processed.set(key, now);
    this.stats.totalProcessed++;

    // Prevent memory leak
    if (this.processed.size > this.maxSize) {
      this.cleanup();
    }

    return true;
  }

  /**
   * Cleanup old entries
   */
  cleanup() {
    const now = Date.now();
    let deleted = 0;

    for (const [key, timestamp] of this.processed.entries()) {
      if (now - timestamp > this.ttlMs) {
        this.processed.delete(key);
        deleted++;
      }
    }

    if (deleted > 0) {
      console.log(`🧹 CallbackDeduplicator: cleaned ${deleted} old entries`);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.processed.size
    };
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.processed.clear();
  }
}

// Create singleton instance
const deduplicator = new CallbackDeduplicator();

/**
 * Telegraf middleware for callback deduplication
 */
const deduplicationMiddleware = async (ctx, next) => {
  // Only check callbacks
  if (ctx.callbackQuery) {
    if (!deduplicator.shouldProcess(ctx)) {
      // Duplicate callback - answer silently and don't process
      try {
        await ctx.answerCbQuery();
      } catch (e) {
        // Ignore errors
      }
      return; // Don't call next()
    }
  }

  return next();
};

module.exports = {
  deduplicationMiddleware,
  deduplicator
};
