/**
 * Notification Service - sends Telegram notifications to users
 * Uses DELETE + SEND pattern via messageManager for consistent UX
 */

const messageManager = require('../bot/utils/messageManager');

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
   * Send a notification message to a user using DELETE + SEND pattern
   * @param {number} userId - Telegram user ID
   * @param {string} text - Message text
   * @param {Object} keyboard - Inline keyboard object
   */
  async sendNotification(userId, text, keyboard = {}) {
    if (!this.bot) {
      console.error('❌ Bot instance not set in notification service');
      return false;
    }

    try {
      // Create mock ctx for messageManager
      const ctx = { telegram: this.bot.telegram };
      await messageManager.showNotification(ctx, userId, text, keyboard);
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
    const message = `⚠️ *Спор отменен администратором*

Сделка: \`${dealId}\`

Спор был отменен. Вы можете продолжить работу по сделке или открыть новый спор при необходимости.`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '📋 Детали сделки', callback_data: `view_deal_${dealId}` }],
        [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
      ]
    };

    await this.sendNotification(buyerId, message, keyboard);
    await this.sendNotification(sellerId, message, keyboard);
  }

  /**
   * Notify both parties about dispute resolution
   * Uses showFinalScreen since dispute resolution is a final state
   * @param {number} buyerId - Buyer's Telegram ID
   * @param {number} sellerId - Seller's Telegram ID
   * @param {string} dealId - Deal ID
   * @param {string} decision - 'refund_buyer' or 'release_seller'
   */
  async notifyDisputeResolved(buyerId, sellerId, dealId, decision) {
    if (!this.bot) {
      console.error('❌ Bot instance not set in notification service');
      return;
    }

    // Create mock ctx for messageManager
    const ctx = { telegram: this.bot.telegram };

    // Final keyboard (no back button - dispute resolution is final)
    const finalKeyboard = {
      inline_keyboard: [
        [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
      ]
    };

    const buyerMessage = decision === 'refund_buyer'
      ? `✅ *Спор решен в вашу пользу*

Сделка: \`${dealId}\`

Администратор решил спор в вашу пользу. Средства будут возвращены на ваш кошелек.`
      : `❌ *Спор решен в пользу продавца*

Сделка: \`${dealId}\`

Администратор решил спор в пользу продавца. Средства будут переведены продавцу.`;

    const sellerMessage = decision === 'release_seller'
      ? `✅ *Спор решен в вашу пользу*

Сделка: \`${dealId}\`

Администратор решил спор в вашу пользу. Средства будут переведены на ваш кошелек.`
      : `❌ *Спор решен в пользу покупателя*

Сделка: \`${dealId}\`

Администратор решил спор в пользу покупателя. Средства будут возвращены покупателю.`;

    try {
      await messageManager.showFinalScreen(ctx, buyerId, 'dispute_resolved', buyerMessage, finalKeyboard);
      console.log(`📤 Dispute resolution sent to buyer ${buyerId}`);
    } catch (error) {
      console.error(`❌ Failed to notify buyer ${buyerId}:`, error.message);
    }

    try {
      await messageManager.showFinalScreen(ctx, sellerId, 'dispute_resolved', sellerMessage, finalKeyboard);
      console.log(`📤 Dispute resolution sent to seller ${sellerId}`);
    } catch (error) {
      console.error(`❌ Failed to notify seller ${sellerId}:`, error.message);
    }
  }
}

// Export singleton
module.exports = new NotificationService();
