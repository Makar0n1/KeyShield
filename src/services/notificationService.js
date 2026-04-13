/**
 * Notification Service - sends Telegram notifications to users
 * Uses DELETE + SEND pattern via messageManager for consistent UX
 */

const messageManager = require('../bot/utils/messageManager');
const User = require('../models/User');
const { t, formatDate, escapeMarkdown } = require('../locales');

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
    const buyerUserDoc = await User.findOne({ telegramId: buyerId }).select('languageCode').lean();
    const buyerLang = buyerUserDoc?.languageCode || 'ru';
    const sellerUserDoc = await User.findOne({ telegramId: sellerId }).select('languageCode').lean();
    const sellerLang = sellerUserDoc?.languageCode || 'ru';

    const buyerMessage = t(buyerLang, 'notification.dispute_cancelled', { dealId });
    const sellerMessage = t(sellerLang, 'notification.dispute_cancelled', { dealId });

    const buyerKeyboard = {
      inline_keyboard: [
        [{ text: t(buyerLang, 'btn.deal_details'), callback_data: `view_deal_${dealId}` }],
        [{ text: t(buyerLang, 'btn.main_menu'), callback_data: 'main_menu' }]
      ]
    };
    const sellerKeyboard = {
      inline_keyboard: [
        [{ text: t(sellerLang, 'btn.deal_details'), callback_data: `view_deal_${dealId}` }],
        [{ text: t(sellerLang, 'btn.main_menu'), callback_data: 'main_menu' }]
      ]
    };

    await this.sendNotification(buyerId, buyerMessage, buyerKeyboard);
    await this.sendNotification(sellerId, sellerMessage, sellerKeyboard);
  }

  /**
   * Format date for Russian locale
   * @param {Date} date - Date to format
   * @returns {string} Formatted date string
   */
  formatDeadline(date, lang = 'ru') {
    return formatDate(lang, new Date(date));
  }

  /**
   * Notify both parties about dispute cancellation with deadline info
   * @param {number} buyerId - Buyer's Telegram ID
   * @param {number} sellerId - Seller's Telegram ID
   * @param {string} dealId - Deal ID
   * @param {string} productName - Product/service name
   * @param {Date} deadline - New/current deadline
   * @param {boolean} isNewDeadline - Whether deadline was updated
   */
  async notifyDisputeCancelledWithDeadline(buyerId, sellerId, dealId, rawProductName, deadline, isNewDeadline) {
    const productName = escapeMarkdown(rawProductName);
    const buyerUserDoc = await User.findOne({ telegramId: buyerId }).select('languageCode').lean();
    const buyerLang = buyerUserDoc?.languageCode || 'ru';
    const sellerUserDoc = await User.findOne({ telegramId: sellerId }).select('languageCode').lean();
    const sellerLang = sellerUserDoc?.languageCode || 'ru';

    const buyerDeadlineLabel = isNewDeadline ? t(buyerLang, 'notification.new_deadline') : t(buyerLang, 'notification.deadline_label');
    const sellerDeadlineLabel = isNewDeadline ? t(sellerLang, 'notification.new_deadline') : t(sellerLang, 'notification.deadline_label');

    const buyerMessage = t(buyerLang, 'notification.dispute_cancelled_agreement', {
      dealId,
      productName,
      deadlineLabel: buyerDeadlineLabel,
      deadlineText: formatDate(buyerLang, deadline)
    });
    const sellerMessage = t(sellerLang, 'notification.dispute_cancelled_agreement', {
      dealId,
      productName,
      deadlineLabel: sellerDeadlineLabel,
      deadlineText: formatDate(sellerLang, deadline)
    });

    const buyerKeyboard = {
      inline_keyboard: [
        [{ text: t(buyerLang, 'btn.deal_details'), callback_data: `view_deal_${dealId}` }],
        [{ text: t(buyerLang, 'btn.main_menu'), callback_data: 'main_menu' }]
      ]
    };
    const sellerKeyboard = {
      inline_keyboard: [
        [{ text: t(sellerLang, 'btn.deal_details'), callback_data: `view_deal_${dealId}` }],
        [{ text: t(sellerLang, 'btn.main_menu'), callback_data: 'main_menu' }]
      ]
    };

    await this.sendNotification(buyerId, buyerMessage, buyerKeyboard);
    await this.sendNotification(sellerId, sellerMessage, sellerKeyboard);
    console.log(`📤 Dispute cancelled notifications sent to buyer ${buyerId} and seller ${sellerId}`);
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

    const ctx = { telegram: this.bot.telegram };

    const buyerUserDoc = await User.findOne({ telegramId: buyerId }).select('languageCode').lean();
    const buyerLang = buyerUserDoc?.languageCode || 'ru';
    const sellerUserDoc = await User.findOne({ telegramId: sellerId }).select('languageCode').lean();
    const sellerLang = sellerUserDoc?.languageCode || 'ru';

    const buyerFinalKeyboard = {
      inline_keyboard: [
        [{ text: t(buyerLang, 'btn.main_menu'), callback_data: 'main_menu' }]
      ]
    };
    const sellerFinalKeyboard = {
      inline_keyboard: [
        [{ text: t(sellerLang, 'btn.main_menu'), callback_data: 'main_menu' }]
      ]
    };

    const buyerMessage = decision === 'refund_buyer'
      ? t(buyerLang, 'notification.dispute_resolved_winner', { dealId })
      : t(buyerLang, 'notification.dispute_resolved_loser_buyer', { dealId });

    const sellerMessage = decision === 'release_seller'
      ? t(sellerLang, 'notification.dispute_resolved_winner_seller', { dealId })
      : t(sellerLang, 'notification.dispute_resolved_loser_seller', { dealId });

    try {
      await messageManager.showFinalScreen(ctx, buyerId, 'dispute_resolved', buyerMessage, buyerFinalKeyboard);
      console.log(`📤 Dispute resolution sent to buyer ${buyerId}`);
    } catch (error) {
      console.error(`❌ Failed to notify buyer ${buyerId}:`, error.message);
    }

    try {
      await messageManager.showFinalScreen(ctx, sellerId, 'dispute_resolved', sellerMessage, sellerFinalKeyboard);
      console.log(`📤 Dispute resolution sent to seller ${sellerId}`);
    } catch (error) {
      console.error(`❌ Failed to notify seller ${sellerId}:`, error.message);
    }
  }
}

// Export singleton
module.exports = new NotificationService();
