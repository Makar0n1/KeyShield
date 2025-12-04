/**
 * Notification Service - sends Telegram notifications to users
 */

class NotificationService {
  constructor() {
    this.bot = null;
  }

  /**
   * Set bot instance (called from bot/index.js)
   * @param {Object} bot - Telegraf bot instance
   */
  setBotInstance(bot) {
    this.bot = bot;
    console.log('✅ Notification service initialized with bot instance');
  }

  /**
   * Get bot instance (for web server to access Telegram API)
   * @returns {Object} bot instance
   */
  getBotInstance() {
    return this.bot;
  }

  /**
   * Send a notification message to a user
   * @param {number} userId - Telegram user ID
   * @param {string} text - Message text
   * @param {Object} extra - Extra options (parse_mode, reply_markup, etc.)
   */
  async sendNotification(userId, text, extra = {}) {
    if (!this.bot) {
      console.error('❌ Bot instance not set in notification service');
      return false;
    }

    try {
      await this.bot.telegram.sendMessage(userId, text, {
        parse_mode: 'Markdown',
        ...extra
      });
      console.log(`📤 Notification sent to user ${userId}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to send notification to user ${userId}:`, error.message);
      return false;
    }
  }

  /**
   * Notify both parties about dispute cancellation
   * @param {number} buyerId - Buyer's Telegram ID
   * @param {number} sellerId - Seller's Telegram ID
   * @param {string} dealId - Deal ID
   */
  async notifyDisputeCancelled(buyerId, sellerId, dealId) {
    const message = `⚠️ *Спор отменен администратором*\n\n` +
      `Сделка: \`${dealId}\`\n\n` +
      `Спор был отменен. Вы можете продолжить работу по сделке или открыть новый спор при необходимости.\n\n` +
      `Используйте /my_deals для просмотра активных сделок.`;

    await this.sendNotification(buyerId, message);
    await this.sendNotification(sellerId, message);
  }

  /**
   * Notify both parties about dispute resolution
   * @param {number} buyerId - Buyer's Telegram ID
   * @param {number} sellerId - Seller's Telegram ID
   * @param {string} dealId - Deal ID
   * @param {string} decision - 'refund_buyer' or 'release_seller'
   */
  async notifyDisputeResolved(buyerId, sellerId, dealId, decision) {
    const winner = decision === 'refund_buyer' ? 'покупателя' : 'продавца';

    const buyerMessage = decision === 'refund_buyer'
      ? `✅ *Спор решен в вашу пользу*\n\nСделка: \`${dealId}\`\n\nАдминистратор решил спор в вашу пользу. Средства будут возвращены на ваш кошелек.`
      : `❌ *Спор решен в пользу продавца*\n\nСделка: \`${dealId}\`\n\nАдминистратор решил спор в пользу продавца. Средства будут переведены продавцу.`;

    const sellerMessage = decision === 'release_seller'
      ? `✅ *Спор решен в вашу пользу*\n\nСделка: \`${dealId}\`\n\nАдминистратор решил спор в вашу пользу. Средства будут переведены на ваш кошелек.`
      : `❌ *Спор решен в пользу покупателя*\n\nСделка: \`${dealId}\`\n\nАдминистратор решил спор в пользу покупателя. Средства будут возвращены покупателю.`;

    await this.sendNotification(buyerId, buyerMessage);
    await this.sendNotification(sellerId, sellerMessage);
  }
}

// Export singleton
module.exports = new NotificationService();
