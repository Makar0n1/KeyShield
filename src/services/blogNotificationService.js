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
    return {
      inline_keyboard: [
        [{
          text: '📖 Читать статью',
          url: `${this.getSiteUrl()}/blog/${post.slug}`
        }],
        [{
          text: '↩️ Назад',
          callback_data: 'blog_notification_back'
        }]
      ]
    };
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

    console.log(`📤 Blog notification completed: sent=${sent}, failed=${failed}, skipped=${skipped}`);

    return { sent, failed, skipped };
  }

  /**
   * Send notification to a single user
   * Handles stacked notifications properly
   */
  async sendNotificationToUser(user, postId, notificationText, keyboard) {
    try {
      const userId = user.telegramId;

      // Check if user is already on a blog notification screen
      const isAlreadyNotification = user.currentScreen?.startsWith('blog_notification');

      // If NOT already on notification, save current screen to stack
      if (!isAlreadyNotification && user.currentScreenData?.text) {
        // Build new navigation stack
        const newStack = [...(user.navigationStack || [])];
        newStack.push({
          screen: user.currentScreen || 'main_menu',
          text: user.currentScreenData.text,
          keyboard: user.currentScreenData.keyboard
        });

        // Update user in database with new stack
        await User.updateOne(
          { telegramId: userId },
          {
            $set: {
              navigationStack: newStack,
              currentScreen: `blog_notification_${postId}`,
              currentScreenData: { text: notificationText, keyboard },
              lastActivity: new Date()
            }
          }
        );
      } else {
        // Already on notification - just update current screen (don't touch stack)
        await User.updateOne(
          { telegramId: userId },
          {
            $set: {
              currentScreen: `blog_notification_${postId}`,
              currentScreenData: { text: notificationText, keyboard },
              lastActivity: new Date()
            }
          }
        );
      }

      // Send the notification by editing the main message
      await this.bot.telegram.editMessageText(
        userId,
        user.mainMessageId,
        null,
        notificationText,
        {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        }
      );

      // Update messageManager cache if user is active in memory
      messageManager.currentScreen.set(userId, `blog_notification_${postId}`);
      messageManager.currentScreenData.set(userId, { text: notificationText, keyboard });

      return 'sent';
    } catch (error) {
      // Common errors: bot blocked, message deleted, chat not found
      if (error.description?.includes('message is not modified')) {
        return 'skipped'; // Same content, no need to update
      }

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
