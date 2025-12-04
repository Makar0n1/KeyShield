const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

class BanService {
  /**
   * Manually ban a user (admin action)
   * @param {number} telegramId - User to ban
   * @param {number} adminId - Admin performing the ban
   * @param {string} reason - Reason for ban
   * @returns {Promise<Object>}
   */
  async banUser(telegramId, adminId, reason = '') {
    const user = await User.findOne({ telegramId });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.blacklisted) {
      return { user, alreadyBanned: true };
    }

    user.blacklisted = true;
    user.notes = user.notes
      ? `${user.notes}\n[BAN] ${new Date().toISOString()}: ${reason}`
      : `[BAN] ${new Date().toISOString()}: ${reason}`;

    await user.save();

    // Log ban
    await AuditLog.logUserBanned(adminId, telegramId, { reason });

    return { user, alreadyBanned: false };
  }

  /**
   * Manually unban a user (admin action)
   * @param {number} telegramId - User to unban
   * @param {number} adminId - Admin performing the unban
   * @param {string} reason - Reason for unban
   * @returns {Promise<Object>}
   */
  async unbanUser(telegramId, adminId, reason = '') {
    const user = await User.findOne({ telegramId });

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.blacklisted) {
      return { user, alreadyUnbanned: true };
    }

    user.blacklisted = false;
    user.notes = user.notes
      ? `${user.notes}\n[UNBAN] ${new Date().toISOString()}: ${reason}`
      : `[UNBAN] ${new Date().toISOString()}: ${reason}`;

    // Optionally reset loss streak on manual unban
    // user.disputeStats.lossStreak = 0;

    await user.save();

    // Log unban
    await AuditLog.log(adminId, 'unban_user', {
      unbannedUserId: telegramId,
      reason
    });

    return { user, alreadyUnbanned: false };
  }

  /**
   * Check if user is banned
   * @param {number} telegramId
   * @returns {Promise<boolean>}
   */
  async isUserBanned(telegramId) {
    const user = await User.findOne({ telegramId });
    return user ? user.blacklisted : false;
  }

  /**
   * Get all banned users
   * @returns {Promise<Array>}
   */
  async getBannedUsers() {
    return await User.find({ blacklisted: true }).sort({ updatedAt: -1 });
  }

  /**
   * Get user ban status and statistics
   * @param {number} telegramId
   * @returns {Promise<Object>}
   */
  async getUserBanInfo(telegramId) {
    const user = await User.findOne({ telegramId });

    if (!user) {
      return null;
    }

    return {
      telegramId: user.telegramId,
      username: user.username,
      blacklisted: user.blacklisted,
      disputeStats: user.disputeStats,
      atRisk: user.disputeStats.lossStreak >= 2 && !user.blacklisted,
      notes: user.notes
    };
  }

  /**
   * Get users at risk of auto-ban (2 consecutive losses)
   * @returns {Promise<Array>}
   */
  async getUsersAtRisk() {
    return await User.find({
      blacklisted: false,
      'disputeStats.lossStreak': { $gte: 2 }
    }).sort({ 'disputeStats.lossStreak': -1 });
  }
}

module.exports = new BanService();
