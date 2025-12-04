const Dispute = require('../models/Dispute');
const Deal = require('../models/Deal');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const dealService = require('./dealService');

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
   * Resolve dispute (admin/arbiter action)
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

    // Update deal status
    deal.status = 'resolved';
    await deal.save();

    // Update user dispute stats
    const winnerId = decision === 'refund_buyer' ? deal.buyerId : deal.sellerId;
    const loserId = decision === 'refund_buyer' ? deal.sellerId : deal.buyerId;

    const winner = await User.findOne({ telegramId: winnerId });
    const loser = await User.findOne({ telegramId: loserId });

    if (winner) {
      await winner.updateDisputeStats(true); // Won
    }

    if (loser) {
      await loser.updateDisputeStats(false); // Lost
    }

    // Log decision
    await AuditLog.logArbitrageDecision(arbiterId, deal._id, dispute._id, {
      dealId: deal.dealId,
      decision,
      winnerId,
      loserId,
      loserNewStreak: loser?.disputeStats.lossStreak,
      loserBanned: loser?.blacklisted
    });

    return {
      dispute,
      deal,
      winner,
      loser,
      autobanTriggered: loser?.blacklisted && loser.disputeStats.lossStreak >= 3
    };
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
}

module.exports = new DisputeService();
