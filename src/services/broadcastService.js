/**
 * Broadcast Service - sends marketing broadcasts to all active bot users
 *
 * Features:
 * - Batch processing to avoid Telegram rate limits
 * - Image + text support (photo with caption)
 * - Skip users in critical flows (deal creation, completion, payout)
 * - Full state persistence to MongoDB
 */

const User = require('../models/User');
const Broadcast = require('../models/Broadcast');

class BroadcastService {
  constructor() {
    this.bot = null;
    this.BATCH_SIZE = 25;        // Send 25 messages per batch
    this.BATCH_DELAY = 1000;     // 1 second delay between batches
  }

  /**
   * Set bot instance (called from bot/index.js)
   */
  setBotInstance(bot) {
    this.bot = bot;
    console.log('✅ Broadcast service initialized with bot instance');
  }

  /**
   * Escape Markdown special characters
   */
  escapeMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/`/g, '\\`');
  }

  /**
   * Sleep helper for batch delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Screens to skip - users in middle of critical flows
   */
  shouldSkipUser(user) {
    const screen = user.currentScreen || '';

    // Skip users creating a deal
    if (screen.startsWith('create_deal')) return true;

    // Skip users in dispute flow
    if (screen.startsWith('dispute')) return true;

    // Skip users entering wallet
    if (screen.includes('wallet')) return true;

    // Skip users in payout process
    if (screen.includes('payout')) return true;

    // Skip users in work submission
    if (screen.includes('submit_work')) return true;

    // Skip users in work acceptance
    if (screen.includes('accept_work')) return true;

    // Skip users in confirmation screens
    if (screen.includes('confirm')) return true;

    return false;
  }

  /**
   * Get keyboard for broadcast notification
   */
  getKeyboard(broadcastId) {
    return {
      inline_keyboard: [[
        { text: '✖️ Закрыть', callback_data: `broadcast_close_${broadcastId}` }
      ]]
    };
  }

  /**
   * Send broadcast to all active users
   * @param {string} broadcastId - Broadcast MongoDB ID
   * @returns {Object} - { sent, failed, skipped }
   */
  async sendBroadcast(broadcastId) {
    if (!this.bot) {
      throw new Error('Bot instance not set');
    }

    // Get the broadcast
    const broadcast = await Broadcast.findById(broadcastId);
    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    if (broadcast.status !== 'draft') {
      throw new Error('Broadcast already sent or in progress');
    }

    // Mark as sending
    broadcast.status = 'sending';
    broadcast.sentAt = new Date();
    await broadcast.save();

    const keyboard = this.getKeyboard(broadcastId);

    let users;

    // Test mode - send only to specific user
    if (broadcast.isTest && broadcast.testUserId) {
      const testUser = await User.findOne({
        telegramId: broadcast.testUserId,
        mainMessageId: { $exists: true, $ne: null }
      }).lean();

      if (!testUser) {
        broadcast.status = 'failed';
        broadcast.completedAt = new Date();
        broadcast.stats.totalUsers = 0;
        broadcast.stats.failed = 1;
        await broadcast.save();
        throw new Error(`Test user ${broadcast.testUserId} not found or has no active session`);
      }

      users = [testUser];
      console.log(`🧪 TEST MODE: Sending broadcast "${broadcast.title}" to user ${broadcast.testUserId}`);
    } else {
      // Normal mode - get all active users with mainMessageId
      // Filter: not blacklisted, has mainMessageId, active in last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      users = await User.find({
        blacklisted: { $ne: true },
        mainMessageId: { $exists: true, $ne: null },
        lastActivity: { $gte: thirtyDaysAgo }
      }).lean();

      console.log(`📤 Sending broadcast "${broadcast.title}" to ${users.length} users`);
    }

    // Update total users
    broadcast.stats.totalUsers = users.length;
    await broadcast.save();

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    // Process in batches
    for (let i = 0; i < users.length; i += this.BATCH_SIZE) {
      const batch = users.slice(i, i + this.BATCH_SIZE);

      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map(user => this.sendToUser(user, broadcast, keyboard))
      );

      // Count results
      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value === 'sent') sent++;
          else if (result.value === 'skipped') skipped++;
          else failed++;
        } else {
          failed++;
        }
      }

      // Update stats periodically
      if ((i + this.BATCH_SIZE) % 100 === 0) {
        broadcast.stats.sent = sent;
        broadcast.stats.failed = failed;
        broadcast.stats.skipped = skipped;
        await broadcast.save();
      }

      // Delay between batches (except for last batch)
      if (i + this.BATCH_SIZE < users.length) {
        await this.sleep(this.BATCH_DELAY);
      }
    }

    // Update final stats
    broadcast.status = 'completed';
    broadcast.completedAt = new Date();
    broadcast.stats.sent = sent;
    broadcast.stats.failed = failed;
    broadcast.stats.skipped = skipped;
    await broadcast.save();

    console.log(`📤 Broadcast completed: sent=${sent}, failed=${failed}, skipped=${skipped}`);

    return { sent, failed, skipped };
  }

  /**
   * Send broadcast to a single user
   * Uses delete + send photo with caption
   */
  async sendToUser(user, broadcast, keyboard) {
    try {
      const userId = user.telegramId;

      // Skip users in critical flows
      if (this.shouldSkipUser(user)) {
        return 'skipped';
      }

      // Check if user is already on a broadcast notification screen
      const isAlreadyBroadcast = user.currentScreen?.startsWith('broadcast_');

      // If NOT already on broadcast, save current screen to stack
      if (!isAlreadyBroadcast && user.currentScreenData?.text) {
        const newStack = [...(user.navigationStack || [])];
        newStack.push({
          screen: user.currentScreen || 'main_menu',
          text: user.currentScreenData.text,
          keyboard: user.currentScreenData.keyboard
        });

        await User.updateOne(
          { telegramId: userId },
          { $set: { navigationStack: newStack } }
        );
      }

      // 1. DELETE old message (silent)
      try {
        await this.bot.telegram.deleteMessage(userId, user.mainMessageId);
      } catch (e) {
        // Message already deleted - not critical
      }

      // 2. SEND new photo message with caption (this triggers PUSH notification!)
      const caption = `📣 *${this.escapeMarkdown(broadcast.title)}*\n\n${this.escapeMarkdown(broadcast.text)}`;

      const newMsg = await this.bot.telegram.sendPhoto(
        userId,
        broadcast.imageUrl,
        {
          caption,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );

      // 3. Update mainMessageId and state in DB
      await User.updateOne(
        { telegramId: userId },
        {
          $set: {
            mainMessageId: newMsg.message_id,
            currentScreen: `broadcast_${broadcast._id}`,
            currentScreenData: {
              text: caption,
              keyboard,
              isPhoto: true,
              photoUrl: broadcast.imageUrl
            },
            lastActivity: new Date()
          }
        }
      );

      return 'sent';
    } catch (error) {
      console.error(`Failed to send broadcast to user ${user.telegramId}:`, error.message);

      // If bot is blocked or chat not found, mark user
      if (
        error.description?.includes('bot was blocked') ||
        error.description?.includes('chat not found') ||
        error.description?.includes('user is deactivated')
      ) {
        await User.updateOne(
          { telegramId: user.telegramId },
          {
            $set: {
              mainMessageId: null,
              botBlocked: true,
              botBlockedAt: new Date()
            }
          }
        );
      }

      return 'failed';
    }
  }
}

// Export singleton
module.exports = new BroadcastService();
