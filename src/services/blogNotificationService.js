/**
 * Blog Notification Service - sends blog post notifications to all active bot users
 *
 * Features:
 * - Batch processing to avoid Telegram rate limits
 * - Stacked notifications handling (new notification replaces old, Back returns to original screen)
 * - Full state persistence to MongoDB
 */

const User = require('../models/User');
const BlogPost = require('../models/BlogPost');
const messageManager = require('../bot/utils/messageManager');

class BlogNotificationService {
  constructor() {
    this.bot = null;
    this.BATCH_SIZE = 25;        // Send 25 messages per batch
    this.BATCH_DELAY = 1000;     // 1 second delay between batches
    this.WEB_DOMAIN = process.env.WEB_DOMAIN || 'keyshield.me';
  }

  /**
   * Set bot instance (called from bot/index.js)
   */
  setBotInstance(bot) {
    this.bot = bot;
    console.log('✅ Blog notification service initialized with bot instance');
  }

  /**
   * Get site URL with proper protocol
   */
  getSiteUrl() {
    return this.WEB_DOMAIN.includes('localhost')
      ? `http://${this.WEB_DOMAIN}`
      : `https://${this.WEB_DOMAIN}`;
  }

  /**
   * Format notification text for a blog post
   */
  formatNotificationText(post) {
    const summary = post.summary || post.seoDescription || '';
    const truncatedSummary = summary.length > 200
      ? summary.substring(0, 197) + '...'
      : summary;

    return `📰 *Новая статья в блоге!*

*${this.escapeMarkdown(post.title)}*

${truncatedSummary ? this.escapeMarkdown(truncatedSummary) + '\n\n' : ''}🔗 Читайте на нашем сайте!`;
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
   * Get keyboard for notification
   */
  getNotificationKeyboard(post) {
    const keyboard = [];

    // Only add URL button if not localhost (Telegram doesn't accept localhost URLs)
    if (!this.WEB_DOMAIN.includes('localhost')) {
      keyboard.push([{
        text: '📖 Читать статью',
        url: `${this.getSiteUrl()}/blog/${post.slug}`
      }]);
    }

    keyboard.push([{
      text: '✖️ Закрыть',
      callback_data: 'blog_notification_back'
    }]);

    return { inline_keyboard: keyboard };
  }

  /**
   * Sleep helper for batch delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Send blog notification to all active users
   * @param {string} postId - Blog post MongoDB ID
   * @returns {Object} - { sent, failed, skipped }
   */
  async sendBlogNotification(postId) {
    if (!this.bot) {
      throw new Error('Bot instance not set');
    }

    // Get the post
    const post = await BlogPost.findById(postId);
    if (!post) {
      throw new Error('Post not found');
    }

    if (post.status !== 'published') {
      throw new Error('Only published posts can be notified');
    }

    const notificationText = this.formatNotificationText(post);
    const keyboard = this.getNotificationKeyboard(post);

    // Get all active users with mainMessageId
    // Filter: not blacklisted, has mainMessageId, active in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const users = await User.find({
      blacklisted: { $ne: true },
      mainMessageId: { $exists: true, $ne: null },
      lastActivity: { $gte: thirtyDaysAgo }
    }).lean();

    console.log(`📤 Sending blog notification to ${users.length} users for post "${post.title}"`);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    // Process in batches
    for (let i = 0; i < users.length; i += this.BATCH_SIZE) {
      const batch = users.slice(i, i + this.BATCH_SIZE);

      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map(user => this.sendNotificationToUser(user, postId, notificationText, keyboard))
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

      // Delay between batches (except for last batch)
      if (i + this.BATCH_SIZE < users.length) {
        await this.sleep(this.BATCH_DELAY);
      }
    }

    // Update post notification stats
    await BlogPost.updateOne(
      { _id: postId },
      {
        $set: { notificationSentAt: new Date() },
        $inc: { notificationSentCount: sent }
      }
    );

    // Track blog notification for health monitoring
    try {
      const ServiceStatus = require('../models/ServiceStatus');
      await ServiceStatus.trackSuccess('blog_notification', {
        postId,
        postTitle: post.title,
        sent,
        failed,
        skipped
      });
    } catch (e) { /* ignore */ }

    console.log(`📤 Blog notification completed: sent=${sent}, failed=${failed}, skipped=${skipped}`);

    return { sent, failed, skipped };
  }

  /**
   * Screens to skip - users in middle of important flows
   */
  shouldSkipUser(user) {
    const screen = user.currentScreen || '';

    // Skip users creating a deal
    if (screen.startsWith('create_deal')) return true;

    // Skip users in dispute flow
    if (screen.startsWith('dispute')) return true;

    // Skip users entering wallet
    if (screen.includes('wallet')) return true;

    return false;
  }

  /**
   * Send notification to a single user
   * Uses delete + send for push notifications (loud)
   */
  async sendNotificationToUser(user, postId, notificationText, keyboard) {
    try {
      const userId = user.telegramId;

      // Skip users in important flows
      if (this.shouldSkipUser(user)) {
        return 'skipped';
      }

      // Check if user is already on a blog notification screen
      const isAlreadyNotification = user.currentScreen?.startsWith('blog_notification');

      // If NOT already on notification, save current screen to stack
      if (!isAlreadyNotification && user.currentScreenData?.text) {
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
        // Note: Don't update messageManager cache here - web server and bot
        // run in separate processes with separate messageManager instances
      }

      // 1. DELETE old message (silent)
      try {
        await this.bot.telegram.deleteMessage(userId, user.mainMessageId);
      } catch (e) {
        // Message already deleted - not critical
      }

      // 2. SEND new message (this triggers PUSH notification!)
      const newMsg = await this.bot.telegram.sendMessage(
        userId,
        notificationText,
        {
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
            currentScreen: `blog_notification_${postId}`,
            currentScreenData: { text: notificationText, keyboard },
            lastActivity: new Date()
          }
        }
      );

      // Note: Don't update messageManager cache - web server and bot run in
      // separate processes. Bot will load fresh data from DB when needed.

      return 'sent';
    } catch (error) {
      console.error(`Failed to notify user ${user.telegramId}:`, error.message);

      // If bot is blocked or chat not found, clear mainMessageId
      if (
        error.description?.includes('bot was blocked') ||
        error.description?.includes('chat not found') ||
        error.description?.includes('user is deactivated')
      ) {
        await User.updateOne(
          { telegramId: user.telegramId },
          { $set: { mainMessageId: null } }
        );
      }

      return 'failed';
    }
  }
}

// Export singleton
module.exports = new BlogNotificationService();
