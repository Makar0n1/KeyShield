const Dispute = require('../models/Dispute');
const Deal = require('../models/Deal');
const User = require('../models/User');
const Session = require('../models/Session');
const AuditLog = require('../models/AuditLog');
const blockchainService = require('./blockchain');
const notificationService = require('./notificationService');
const messageManager = require('../bot/utils/messageManager');
const { t } = require('../locales');

class DisputeService {
  /**
   * Open a dispute for a deal
   * @param {string} dealId
   * @param {number} userId - Who opened the dispute
   * @param {string} reasonText
   * @param {Array<string>} media - URLs to media files
   * @returns {Promise<Object>} - Created dispute
   */
  async openDispute(dealId, userId, reasonText, media = []) {
    // Get deal
    const deal = await Deal.findOne({ dealId });

    if (!deal) {
      throw new Error('Deal not found');
    }

    // Verify user is participant
    if (!deal.isParticipant(userId)) {
      throw new Error('Only deal participants can open disputes');
    }

    // Check if deal can be disputed
    const validStatuses = ['locked', 'in_progress'];
    if (!validStatuses.includes(deal.status)) {
      throw new Error(`Cannot open dispute for deal in status: ${deal.status}`);
    }

    // Check if dispute already exists
    const existingDispute = await Dispute.findOne({ dealId: deal._id });
    if (existingDispute) {
      throw new Error('Dispute already exists for this deal');
    }

    // Create dispute
    const dispute = new Dispute({
      dealId: deal._id,
      openedBy: userId,
      reasonText,
      media,
      status: 'open'
    });

    await dispute.save();

    // Update deal status
    deal.status = 'dispute';
    await deal.save();

    // Log dispute creation
    await AuditLog.logDisputeOpened(userId, deal._id, dispute._id, {
      dealId: deal.dealId,
      reasonText: reasonText.substring(0, 200)
    });

    return dispute;
  }

  /**
   * Add comment to dispute
   * @param {string} dealId
   * @param {number} userId
   * @param {string} text
   * @param {Array<string>} media
   * @returns {Promise<Object>}
   */
  async addComment(dealId, userId, text, media = []) {
    const deal = await Deal.findOne({ dealId });
    if (!deal) {
      throw new Error('Deal not found');
    }

    const dispute = await Dispute.findOne({ dealId: deal._id });
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    // Verify user is participant or arbiter
    if (!deal.isParticipant(userId)) {
      // Could be arbiter - allow for now, add proper arbiter check later
    }

    await dispute.addComment(userId, text, media);

    await AuditLog.log(userId, 'dispute_comment', {
      dealId: deal.dealId,
      disputeId: dispute._id
    }, { dealId: deal._id, disputeId: dispute._id });

    return dispute;
  }

  /**
   * Set bot instance for sending notifications
   * @param {Object} bot - Telegraf bot instance
   */
  setBotInstance(bot) {
    this.botInstance = bot;
  }

  /**
   * Resolve dispute (admin/arbiter action)
   * NO automatic payouts - winner must input their private key!
   * @param {string} dealId
   * @param {string} decision - 'refund_buyer' or 'release_seller'
   * @param {number} arbiterId - Admin/arbiter user ID
   * @returns {Promise<Object>}
   */
  async resolveDispute(dealId, decision, arbiterId) {
    const deal = await Deal.findOne({ dealId });
    if (!deal) {
      throw new Error('Deal not found');
    }

    const dispute = await Dispute.findOne({ dealId: deal._id });
    if (!dispute) {
      throw new Error('Dispute not found');
    }

    if (dispute.status === 'resolved') {
      throw new Error('Dispute already resolved');
    }

    if (!['refund_buyer', 'release_seller'].includes(decision)) {
      throw new Error('Invalid decision');
    }

    // Resolve dispute
    await dispute.resolve(decision, arbiterId);

    // Determine winner and loser
    const winnerId = decision === 'refund_buyer' ? deal.buyerId : deal.sellerId;
    const loserId = decision === 'refund_buyer' ? deal.sellerId : deal.buyerId;
    const winnerRole = decision === 'refund_buyer' ? 'buyer' : 'seller';

    const winner = await User.findOne({ telegramId: winnerId });
    const loser = await User.findOne({ telegramId: loserId });

    // Update dispute stats BEFORE sending notifications (so loser sees correct streak)
    if (winner) {
      await winner.updateDisputeStats(true); // Won - resets loss streak
    }

    if (loser) {
      await loser.updateDisputeStats(false); // Lost - increments loss streak
    }

    // Reload loser to get updated stats
    const updatedLoser = await User.findOne({ telegramId: loserId });
    const lossStreak = updatedLoser?.disputeStats?.lossStreak || 1;
    const isNowBanned = updatedLoser?.blacklisted || false;

    // Get balance and calculate amounts
    const balance = await blockchainService.getBalance(deal.multisigAddress, deal.asset);
    const commission = deal.commission;
    const payoutAmount = balance - commission;

    // Determine pending key validation type
    const keyValidationType = decision === 'refund_buyer' ? 'dispute_buyer' : 'dispute_seller';

    // Update deal status to mark pending key validation (NOT resolved yet - wait for key)
    await Deal.findByIdAndUpdate(deal._id, {
      pendingKeyValidation: keyValidationType
    });

    // Create key validation session for winner
    await Session.setSession(winnerId, 'key_validation', {
      dealId: deal.dealId,
      type: keyValidationType,
      attempts: 0,
      payoutAmount,
      commission
    }, 24); // TTL 24 hours

    // Log decision
    await AuditLog.logArbitrageDecision(arbiterId, deal._id, dispute._id, {
      dealId: deal.dealId,
      decision,
      winnerId,
      loserId,
      loserNewStreak: lossStreak,
      loserBanned: isNowBanned
    });

    // =============================================
    // Send notifications (NO auto-payout!)
    // =============================================

    // Create mock ctx for messageManager
    const ctx = this.botInstance ? { telegram: this.botInstance.telegram } : null;

    if (ctx) {
      // Load languages for both parties
      const winnerUser = await User.findOne({ telegramId: winnerId }).select('languageCode').lean();
      const winnerLang = winnerUser?.languageCode || 'ru';
      const loserUser = await User.findOne({ telegramId: loserId }).select('languageCode').lean();
      const loserLang = loserUser?.languageCode || 'ru';

      const msgParams = {
        dealId: deal.dealId,
        productName: this.escapeMarkdown(deal.productName),
        payoutAmount: payoutAmount.toFixed(2),
        asset: deal.asset,
        commission: commission.toFixed(2),
        lossStreak,
      };

      const mainMenuKeyboard = (lang) => ({
        inline_keyboard: [
          [{ text: t(lang, 'btn.main_menu'), callback_data: 'main_menu' }]
        ]
      });

      // Notify WINNER - request private key
      try {
        const winnerText = t(winnerLang, 'dispute.resolve_winner', msgParams);
        await messageManager.showNotification(ctx, winnerId, winnerText, mainMenuKeyboard(winnerLang));
        console.log(`📬 Key request sent to winner for deal ${deal.dealId}`);
      } catch (error) {
        console.error(`Error sending key request to winner:`, error.message);
      }

      // Notify LOSER - inform about loss streak
      try {
        const loserKey = isNowBanned ? 'dispute.resolve_loser_banned' : 'dispute.resolve_loser';
        const loserText = t(loserLang, loserKey, msgParams);
        await messageManager.showNotification(ctx, loserId, loserText, mainMenuKeyboard(loserLang));
        console.log(`📬 Loss notification sent to loser for deal ${deal.dealId}`);
      } catch (error) {
        console.error(`Error sending notification to loser:`, error.message);
      }
    }

    console.log(`🔐 Dispute resolved for deal ${deal.dealId}, awaiting winner's key for payout`);

    return {
      dispute,
      deal,
      winner,
      loser: updatedLoser,
      autobanTriggered: isNowBanned,
      keyRequested: true,
      winnerId,
      payoutAmount
    };
  }

  /**
   * Send ban notification to user using DELETE+SEND pattern
   * @param {number} userId - Telegram user ID
   */
  async sendBanNotification(userId) {
    try {
      const user = await User.findOne({ telegramId: userId }).select('languageCode').lean();
      const lang = user?.languageCode || 'ru';
      const banText = t(lang, 'dispute.ban_notification');

      await notificationService.sendNotification(userId, banText, {});
      console.log(`📤 Ban notification sent to user ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to send ban notification to user ${userId}:`, error.message);
    }
  }

  /**
   * Get dispute by deal ID
   * @param {string} dealId
   * @returns {Promise<Object>}
   */
  async getDisputeByDealId(dealId) {
    const deal = await Deal.findOne({ dealId });
    if (!deal) {
      return null;
    }

    return await Dispute.findOne({ dealId: deal._id }).populate('dealId');
  }

  /**
   * Get all open disputes (for admin panel)
   * @returns {Promise<Array>}
   */
  async getOpenDisputes() {
    return await Dispute.find({ status: { $in: ['open', 'in_review'] } })
      .populate('dealId')
      .sort({ createdAt: -1 });
  }

  /**
   * Get all disputes with filters
   * @param {Object} filters
   * @returns {Promise<Array>}
   */
  async getDisputes(filters = {}) {
    const query = {};

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.openedBy) {
      query.openedBy = filters.openedBy;
    }

    return await Dispute.find(query)
      .populate('dealId')
      .sort({ createdAt: -1 })
      .limit(filters.limit || 50);
  }

  escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }
}

module.exports = new DisputeService();
