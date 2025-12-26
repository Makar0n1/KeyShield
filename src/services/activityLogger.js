/**
 * Activity Logger Service
 *
 * Logs all user actions to console and updates user stats in DB.
 * Tracks bot blocking/unblocking and maintains activity counters.
 */

const User = require('../models/User');

class ActivityLogger {

  /**
   * Log user action to console and update DB stats
   * @param {number} telegramId - User's Telegram ID
   * @param {string} actionType - Type of action (e.g., 'start', 'button_create_deal')
   * @param {Object} details - Additional details (username, etc.)
   */
  async logAction(telegramId, actionType, details = {}) {
    try {
      const timestamp = new Date();
      const username = details.username || 'unknown';

      // 1. Console log (always - all actions)
      console.log(`👤 [${timestamp.toISOString()}] @${username} (${telegramId}): ${actionType}`);

      // 2. Build update object
      const setUpdate = {
        lastActionType: actionType,
        lastActionAt: timestamp,
        lastActivity: timestamp
      };

      const incUpdate = {};

      // 3. Increment counters based on action type
      if (actionType === 'start') {
        incUpdate.sessionCount = 1;
        incUpdate['stats.commandsUsed'] = 1;
      } else if (actionType.startsWith('button_')) {
        incUpdate['stats.buttonsClicked'] = 1;
      } else if (actionType.startsWith('command_')) {
        incUpdate['stats.commandsUsed'] = 1;
      }

      // 4. Update DB
      const updateQuery = { $set: setUpdate };
      if (Object.keys(incUpdate).length > 0) {
        updateQuery.$inc = incUpdate;
      }

      await User.updateOne({ telegramId }, updateQuery);
    } catch (error) {
      console.error(`❌ [ActivityLogger] Failed to log action for ${telegramId}:`, error.message);
    }
  }

  /**
   * Mark user as having blocked the bot
   * @param {number} telegramId - User's Telegram ID
   */
  async logBotBlocked(telegramId) {
    try {
      console.log(`📵 [BOT_BLOCKED] User ${telegramId} blocked the bot`);

      await User.updateOne(
        { telegramId },
        {
          $set: {
            botBlocked: true,
            botBlockedAt: new Date(),
            mainMessageId: null
          }
        }
      );
    } catch (error) {
      console.error(`❌ [ActivityLogger] Failed to mark bot blocked for ${telegramId}:`, error.message);
    }
  }

  /**
   * Mark user as having unblocked the bot (called on /start if was blocked)
   * @param {number} telegramId - User's Telegram ID
   */
  async logBotUnblocked(telegramId) {
    try {
      const user = await User.findOne({ telegramId }).select('botBlocked').lean();

      if (user?.botBlocked) {
        console.log(`✅ [BOT_UNBLOCKED] User ${telegramId} unblocked the bot`);

        await User.updateOne(
          { telegramId },
          {
            $set: {
              botBlocked: false,
              botBlockedAt: null
            }
          }
        );
      }
    } catch (error) {
      console.error(`❌ [ActivityLogger] Failed to mark bot unblocked for ${telegramId}:`, error.message);
    }
  }

  /**
   * Increment deal-related stats
   * @param {number} telegramId - User's Telegram ID
   * @param {string} field - Stats field to increment (dealsCreated, dealsCompleted, totalVolume)
   * @param {number} amount - Amount to increment by (default 1)
   */
  async incrementDealStats(telegramId, field, amount = 1) {
    try {
      const updateField = `stats.${field}`;
      await User.updateOne(
        { telegramId },
        { $inc: { [updateField]: amount } }
      );
    } catch (error) {
      console.error(`❌ [ActivityLogger] Failed to increment ${field} for ${telegramId}:`, error.message);
    }
  }

  /**
   * Log deal creation
   * @param {number} telegramId - Creator's Telegram ID
   * @param {string} dealId - Deal ID
   * @param {number} amount - Deal amount
   */
  async logDealCreated(telegramId, dealId, amount) {
    console.log(`💼 [DEAL_CREATED] User ${telegramId} created deal ${dealId} for ${amount} USDT`);
    await this.incrementDealStats(telegramId, 'dealsCreated', 1);
  }

  /**
   * Log deal completion
   * @param {number} telegramId - User's Telegram ID
   * @param {string} dealId - Deal ID
   * @param {number} amount - Deal amount
   */
  async logDealCompleted(telegramId, dealId, amount) {
    console.log(`✅ [DEAL_COMPLETED] User ${telegramId} completed deal ${dealId} for ${amount} USDT`);
    await this.incrementDealStats(telegramId, 'dealsCompleted', 1);
    await this.incrementDealStats(telegramId, 'totalVolume', amount);
  }
}

module.exports = new ActivityLogger();
