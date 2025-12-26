/**
 * Bot Status Checker Service
 *
 * Safely checks if users have blocked the bot using getChat API.
 * Does NOT send any messages to users - completely silent check.
 *
 * Uses rate limiting to avoid hitting Telegram API limits.
 */

const User = require('../models/User');

class BotStatusChecker {
  constructor() {
    this.isRunning = false;
    this.progress = {
      total: 0,
      checked: 0,
      blocked: 0,
      active: 0,
      errors: 0,
      startedAt: null,
      completedAt: null
    };
  }

  /**
   * Get current progress
   */
  getProgress() {
    return {
      ...this.progress,
      isRunning: this.isRunning,
      percent: this.progress.total > 0
        ? Math.round((this.progress.checked / this.progress.total) * 100)
        : 0
    };
  }

  /**
   * Check a single user's bot status using sendChatAction
   * sendChatAction("typing") is the most reliable way to check if bot is blocked
   * User sees nothing (typing indicator disappears instantly)
   *
   * @param {object} bot - Telegraf bot instance
   * @param {number} telegramId - User's Telegram ID
   * @returns {Promise<'active'|'blocked'|'error'>}
   */
  async checkUserStatus(bot, telegramId) {
    try {
      // sendChatAction is the ONLY reliable way to check if bot is blocked
      // getChat works even when blocked!
      // User sees brief "typing..." that disappears instantly
      await bot.telegram.sendChatAction(telegramId, 'typing');
      return 'active';
    } catch (error) {
      const desc = error.description || '';
      const code = error.code;

      // User blocked the bot or deleted account
      // Error 403: Forbidden - bot was blocked by the user
      if (
        code === 403 ||
        desc.includes('bot was blocked') ||
        desc.includes('user is deactivated') ||
        desc.includes('chat not found') ||
        desc.includes('PEER_ID_INVALID') ||
        desc.includes('Forbidden')
      ) {
        return 'blocked';
      }

      // Other errors (rate limit, network, etc.)
      console.error(`[BotStatusChecker] Error checking user ${telegramId}:`, error.code, desc);
      return 'error';
    }
  }

  /**
   * Run full status check for all users
   * Uses batching and delays to avoid rate limits
   *
   * @param {object} bot - Telegraf bot instance
   * @param {object} options - Options
   * @param {number} options.batchSize - Users per batch (default: 25)
   * @param {number} options.delayBetweenBatches - Delay in ms between batches (default: 1000)
   * @param {boolean} options.onlyActive - Only check users not already marked as blocked
   */
  async runFullCheck(bot, options = {}) {
    if (this.isRunning) {
      throw new Error('Check is already running');
    }

    const {
      batchSize = 25,
      delayBetweenBatches = 1000,
      onlyActive = true
    } = options;

    this.isRunning = true;
    this.progress = {
      total: 0,
      checked: 0,
      blocked: 0,
      active: 0,
      errors: 0,
      startedAt: new Date(),
      completedAt: null
    };

    try {
      // Build query
      const query = onlyActive ? { botBlocked: { $ne: true } } : {};

      // Get all users to check
      const users = await User.find(query).select('telegramId botBlocked').lean();
      this.progress.total = users.length;

      console.log(`[BotStatusChecker] Starting check for ${users.length} users...`);

      // Process in batches
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize);

        // Check batch in parallel
        const results = await Promise.all(
          batch.map(async (user) => {
            const status = await this.checkUserStatus(bot, user.telegramId);
            return { telegramId: user.telegramId, status };
          })
        );

        // Update database for each result
        for (const result of results) {
          this.progress.checked++;

          if (result.status === 'blocked') {
            this.progress.blocked++;
            // Mark as blocked in DB
            await User.updateOne(
              { telegramId: result.telegramId },
              {
                $set: {
                  botBlocked: true,
                  botBlockedAt: new Date()
                }
              }
            );
          } else if (result.status === 'active') {
            this.progress.active++;
            // Mark as active (unblocked) in DB
            await User.updateOne(
              { telegramId: result.telegramId },
              {
                $set: {
                  botBlocked: false,
                  botBlockedAt: null
                }
              }
            );
          } else {
            this.progress.errors++;
          }
        }

        // Log progress
        console.log(`[BotStatusChecker] Progress: ${this.progress.checked}/${this.progress.total} (${this.progress.blocked} blocked, ${this.progress.active} active)`);

        // Delay between batches to avoid rate limits
        if (i + batchSize < users.length) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      this.progress.completedAt = new Date();
      console.log(`[BotStatusChecker] Completed! Blocked: ${this.progress.blocked}, Active: ${this.progress.active}, Errors: ${this.progress.errors}`);

      return this.progress;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Quick check - only check users who were recently active but now might be blocked
   * Checks users who had activity in the last 30 days
   */
  async runQuickCheck(bot) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Only check users with recent activity who aren't already marked as blocked
    const query = {
      botBlocked: { $ne: true },
      $or: [
        { lastActionAt: { $gte: thirtyDaysAgo } },
        { lastActivity: { $gte: thirtyDaysAgo } }
      ]
    };

    const count = await User.countDocuments(query);
    console.log(`[BotStatusChecker] Quick check: ${count} recently active users`);

    return this.runFullCheck(bot, {
      batchSize: 30,
      delayBetweenBatches: 800,
      onlyActive: true
    });
  }
}

// Export singleton
module.exports = new BotStatusChecker();
