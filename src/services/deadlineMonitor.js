const Deal = require('../models/Deal');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const blockchainService = require('./blockchain');
const constants = require('../config/constants');

/**
 * Deadline Monitor Service
 * Monitors deals for deadline expiration and handles auto-refunds
 *
 * Flow:
 * 1. Deadline expires → notify both parties with action buttons
 * 2. +12 hours without action → auto-refund to buyer (minus commission)
 */
class DeadlineMonitor {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.botInstance = null;

    // Check interval: every 5 minutes
    this.CHECK_INTERVAL = 5 * 60 * 1000;

    // Grace period after deadline: 12 hours
    this.GRACE_PERIOD_MS = 12 * 60 * 60 * 1000;

    // Track notified deals to avoid duplicate notifications
    this.notifiedDeals = new Set();

    // Track deals in refund process to prevent double processing
    this.refundingDeals = new Set();
  }

  /**
   * Set bot instance for sending notifications
   * @param {Object} bot - Telegraf bot instance
   */
  setBotInstance(bot) {
    this.botInstance = bot;
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Deadline monitor already running');
      return;
    }

    console.log('✅ Starting deadline monitor...');
    this.isRunning = true;

    // Run immediately
    this.checkDeadlines();

    // Then run on interval
    this.interval = setInterval(() => {
      this.checkDeadlines();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log('⛔ Deadline monitor stopped');
  }

  /**
   * Check all active deals for deadline expiration
   */
  async checkDeadlines() {
    try {
      const now = new Date();

      // Find deals that are locked/in_progress and past deadline
      const expiredDeals = await Deal.find({
        status: { $in: ['locked', 'in_progress'] },
        deadline: { $lt: now },
        multisigAddress: { $ne: null }
      }).lean();

      if (expiredDeals.length === 0) {
        return;
      }

      console.log(`⏰ Checking ${expiredDeals.length} expired deal(s)...`);

      for (const deal of expiredDeals) {
        await this.processDeal(deal);
      }
    } catch (error) {
      console.error('Error in deadline monitor:', error);
    }
  }

  /**
   * Process a single expired deal
   * @param {Object} deal - Deal document
   */
  async processDeal(deal) {
    try {
      const now = new Date();
      const deadlineTime = new Date(deal.deadline).getTime();
      const timeSinceDeadline = now.getTime() - deadlineTime;
      const gracePeriodPassed = timeSinceDeadline >= this.GRACE_PERIOD_MS;

      // Check if we already sent expiration notification
      const notificationKey = `expired_${deal.dealId}`;
      const alreadyNotified = this.notifiedDeals.has(notificationKey);

      if (!alreadyNotified) {
        // Send expiration notification with action buttons
        await this.sendExpirationNotification(deal);
        this.notifiedDeals.add(notificationKey);

        // Clean up old notifications (keep last 1000)
        if (this.notifiedDeals.size > 1000) {
          const first = this.notifiedDeals.values().next().value;
          this.notifiedDeals.delete(first);
        }
      }

      // If grace period passed → auto-refund
      if (gracePeriodPassed) {
        await this.processAutoRefund(deal);
      }
    } catch (error) {
      console.error(`Error processing deal ${deal.dealId}:`, error);
    }
  }

  /**
   * Send expiration notification to both parties
   * @param {Object} deal - Deal document
   */
  async sendExpirationNotification(deal) {
    if (!this.botInstance) {
      console.error('Bot instance not set, cannot send notifications');
      return;
    }

    const hoursRemaining = 12;
    const deadline = new Date(deal.deadline);
    const autoRefundTime = new Date(deadline.getTime() + this.GRACE_PERIOD_MS);

    try {
      // Notify buyer
      await this.botInstance.telegram.sendMessage(
        deal.buyerId,
        `⚠️ *Срок сделки истёк!*\n\n` +
        `🆔 Сделка: \`${deal.dealId}\`\n` +
        `📦 ${deal.productName}\n` +
        `💰 Сумма: ${deal.amount} ${deal.asset}\n\n` +
        `⏰ Дедлайн был: ${deadline.toLocaleString('ru-RU')}\n\n` +
        `У вас есть *${hoursRemaining} часов* чтобы:\n` +
        `• Подтвердить выполнение работы\n` +
        `• Или открыть спор\n\n` +
        `🔄 *Автовозврат:* ${autoRefundTime.toLocaleString('ru-RU')}\n\n` +
        `Если вы не примете решение, средства будут автоматически возвращены ` +
        `на ваш кошелёк за вычетом комиссии сервиса.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Подтвердить работу', callback_data: `confirm_work_${deal.dealId}` }
              ],
              [
                { text: '⚠️ Открыть спор', callback_data: `open_dispute_${deal.dealId}` }
              ],
              [
                { text: '📋 Детали сделки', callback_data: `view_deal_${deal.dealId}` }
              ]
            ]
          }
        }
      );
      console.log(`📬 Expiration notification sent to buyer for deal ${deal.dealId}`);
    } catch (error) {
      console.error(`Error sending buyer notification for ${deal.dealId}:`, error.message);
    }

    try {
      // Notify seller
      await this.botInstance.telegram.sendMessage(
        deal.sellerId,
        `⚠️ *Срок сделки истёк!*\n\n` +
        `🆔 Сделка: \`${deal.dealId}\`\n` +
        `📦 ${deal.productName}\n` +
        `💰 Сумма: ${deal.amount} ${deal.asset}\n\n` +
        `⏰ Дедлайн был: ${deadline.toLocaleString('ru-RU')}\n\n` +
        `У вас есть *${hoursRemaining} часов* чтобы:\n` +
        `• Отметить работу как сданную\n` +
        `• Или открыть спор\n\n` +
        `🔄 *Автовозврат покупателю:* ${autoRefundTime.toLocaleString('ru-RU')}\n\n` +
        `⚠️ *Внимание!* Если покупатель не подтвердит работу и вы не откроете спор, ` +
        `средства будут автоматически возвращены покупателю.\n\n` +
        `Комиссия сервиса удерживается в любом случае.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📤 Работа сдана', callback_data: `work_done_${deal.dealId}` }
              ],
              [
                { text: '⚠️ Открыть спор', callback_data: `open_dispute_${deal.dealId}` }
              ],
              [
                { text: '📋 Детали сделки', callback_data: `view_deal_${deal.dealId}` }
              ]
            ]
          }
        }
      );
      console.log(`📬 Expiration notification sent to seller for deal ${deal.dealId}`);
    } catch (error) {
      console.error(`Error sending seller notification for ${deal.dealId}:`, error.message);
    }

    // Log audit
    await AuditLog.create({
      action: 'DEAL_DEADLINE_EXPIRED',
      dealId: deal._id,
      details: {
        dealId: deal.dealId,
        deadline: deal.deadline,
        autoRefundTime: autoRefundTime.toISOString()
      }
    });
  }

  /**
   * Process auto-refund to buyer
   * @param {Object} deal - Deal document
   */
  async processAutoRefund(deal) {
    // Prevent double processing
    if (this.refundingDeals.has(deal.dealId)) {
      console.log(`⏭️ Deal ${deal.dealId} already in refund process, skipping...`);
      return;
    }

    this.refundingDeals.add(deal.dealId);

    try {
      // Double-check deal status in DB
      const currentDeal = await Deal.findById(deal._id)
        .select('+buyerKey +sellerKey +arbiterKey');

      if (!currentDeal) {
        console.log(`⏭️ Deal ${deal.dealId} not found, skipping...`);
        return;
      }

      // Only process locked or in_progress deals
      if (!['locked', 'in_progress'].includes(currentDeal.status)) {
        console.log(`⏭️ Deal ${deal.dealId} status changed to ${currentDeal.status}, skipping...`);
        return;
      }

      console.log(`🔄 Processing auto-refund for deal ${deal.dealId}...`);

      // Get multisig wallet balance
      const balance = await blockchainService.getBalance(deal.multisigAddress, deal.asset);

      if (balance <= 0) {
        console.log(`⏭️ Deal ${deal.dealId} has zero balance, marking as expired...`);
        await Deal.findByIdAndUpdate(deal._id, { status: 'expired' });
        return;
      }

      // Commission is ALWAYS taken on expiration (penalty for non-compliance)
      const commission = deal.commission;
      const refundAmount = balance - commission;

      if (refundAmount <= 0) {
        console.log(`⚠️ Deal ${deal.dealId} balance (${balance}) <= commission (${commission}), only commission will be taken`);
        // Only transfer commission to service wallet
        await this.transferCommission(currentDeal, balance);
        await Deal.findByIdAndUpdate(deal._id, {
          status: 'expired',
          completedAt: new Date()
        });
        return;
      }

      // Get buyer address for refund
      const buyerAddress = deal.buyerAddress;
      if (!buyerAddress) {
        console.error(`❌ Deal ${deal.dealId} has no buyer address for refund`);
        await this.notifyRefundError(deal, 'Не указан адрес кошелька покупателя');
        return;
      }

      console.log(`💸 Refunding ${refundAmount} ${deal.asset} to buyer ${buyerAddress}`);

      // Create and sign refund transaction
      // Using arbiter key + buyer key (2-of-3)
      const arbiterKey = process.env.ARBITER_PRIVATE_KEY;
      const buyerKey = currentDeal.buyerKey;

      if (!buyerKey) {
        console.error(`❌ Deal ${deal.dealId} missing buyer key`);
        await this.notifyRefundError(deal, 'Отсутствует ключ покупателя');
        return;
      }

      // 1. Create refund transaction to buyer
      const refundTx = await blockchainService.createReleaseTransaction(
        deal.multisigAddress,
        buyerAddress,
        refundAmount,
        deal.asset
      );

      // 2. Multi-sign with arbiter + buyer keys
      const signedRefundTx = await blockchainService.multiSignTransaction(refundTx, [
        arbiterKey,
        buyerKey
      ]);

      // 3. Broadcast refund transaction
      const refundResult = await blockchainService.broadcastTransaction(signedRefundTx);

      if (!refundResult.success) {
        console.error(`❌ Failed to broadcast refund for ${deal.dealId}:`, refundResult.error);
        await this.notifyRefundError(deal, `Ошибка транзакции: ${refundResult.error}`);
        return;
      }

      console.log(`✅ Refund successful for deal ${deal.dealId}: ${refundResult.txHash}`);

      // Record refund transaction
      const refundTransaction = new Transaction({
        dealId: deal._id,
        type: 'refund',
        asset: deal.asset,
        amount: refundAmount,
        txHash: refundResult.txHash,
        status: 'confirmed',
        fromAddress: deal.multisigAddress,
        toAddress: buyerAddress
      });
      refundTransaction.generateExplorerLink();
      await refundTransaction.save();

      // 4. Transfer commission to service wallet
      // Wait a bit for blockchain to process
      await new Promise(r => setTimeout(r, 3000));

      await this.transferCommission(currentDeal, commission);

      // Update deal status
      await Deal.findByIdAndUpdate(deal._id, {
        status: 'expired',
        completedAt: new Date()
      });

      // Notify both parties
      await this.notifyRefundComplete(deal, refundAmount, commission, refundResult.txHash);

      // Log audit
      await AuditLog.create({
        action: 'DEAL_AUTO_REFUND',
        dealId: deal._id,
        details: {
          dealId: deal.dealId,
          refundAmount,
          commission,
          buyerAddress,
          txHash: refundResult.txHash
        }
      });

      console.log(`✅ Auto-refund complete for deal ${deal.dealId}`);
    } catch (error) {
      console.error(`❌ Error processing auto-refund for ${deal.dealId}:`, error);
      await this.notifyRefundError(deal, error.message);
    } finally {
      // Remove from processing set after delay
      setTimeout(() => {
        this.refundingDeals.delete(deal.dealId);
      }, 60000);
    }
  }

  /**
   * Transfer commission to service wallet
   * @param {Object} deal - Deal document with keys
   * @param {number} amount - Commission amount
   */
  async transferCommission(deal, amount) {
    try {
      const serviceWallet = constants.SERVICE_WALLET_ADDRESS;
      if (!serviceWallet) {
        console.error('SERVICE_WALLET_ADDRESS not configured');
        return;
      }

      const arbiterKey = process.env.ARBITER_PRIVATE_KEY;
      const buyerKey = deal.buyerKey;

      // Create commission transaction
      const commissionTx = await blockchainService.createReleaseTransaction(
        deal.multisigAddress,
        serviceWallet,
        amount,
        deal.asset
      );

      // Multi-sign
      const signedCommissionTx = await blockchainService.multiSignTransaction(commissionTx, [
        arbiterKey,
        buyerKey
      ]);

      // Broadcast
      const commissionResult = await blockchainService.broadcastTransaction(signedCommissionTx);

      if (commissionResult.success) {
        console.log(`✅ Commission ${amount} ${deal.asset} transferred: ${commissionResult.txHash}`);

        // Record commission transaction
        const commissionTransaction = new Transaction({
          dealId: deal._id,
          type: 'commission',
          asset: deal.asset,
          amount: amount,
          txHash: commissionResult.txHash,
          status: 'confirmed',
          fromAddress: deal.multisigAddress,
          toAddress: serviceWallet
        });
        commissionTransaction.generateExplorerLink();
        await commissionTransaction.save();
      } else {
        console.error(`❌ Failed to transfer commission:`, commissionResult.error);
      }
    } catch (error) {
      console.error('Error transferring commission:', error);
    }
  }

  /**
   * Notify both parties about successful refund
   */
  async notifyRefundComplete(deal, refundAmount, commission, txHash) {
    if (!this.botInstance) return;

    try {
      // Notify buyer
      await this.botInstance.telegram.sendMessage(
        deal.buyerId,
        `✅ *Автовозврат выполнен!*\n\n` +
        `🆔 Сделка: \`${deal.dealId}\`\n` +
        `📦 ${deal.productName}\n\n` +
        `💸 Возвращено: *${refundAmount.toFixed(2)} ${deal.asset}*\n` +
        `📊 Комиссия сервиса: ${commission.toFixed(2)} ${deal.asset}\n\n` +
        `Срок сделки истёк, средства возвращены на ваш кошелёк.\n\n` +
        `[Транзакция](https://tronscan.org/#/transaction/${txHash})`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error(`Error notifying buyer about refund:`, error.message);
    }

    try {
      // Notify seller
      await this.botInstance.telegram.sendMessage(
        deal.sellerId,
        `⚠️ *Сделка завершена автовозвратом*\n\n` +
        `🆔 Сделка: \`${deal.dealId}\`\n` +
        `📦 ${deal.productName}\n\n` +
        `Срок сделки истёк без подтверждения выполнения.\n` +
        `Средства возвращены покупателю.\n\n` +
        `💸 Возвращено покупателю: ${refundAmount.toFixed(2)} ${deal.asset}\n` +
        `📊 Комиссия сервиса: ${commission.toFixed(2)} ${deal.asset}\n\n` +
        `[Транзакция](https://tronscan.org/#/transaction/${txHash})`,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      console.error(`Error notifying seller about refund:`, error.message);
    }
  }

  /**
   * Notify about refund error
   */
  async notifyRefundError(deal, errorMessage) {
    if (!this.botInstance) return;

    const message = `❌ *Ошибка автовозврата*\n\n` +
      `🆔 Сделка: \`${deal.dealId}\`\n` +
      `Ошибка: ${errorMessage}\n\n` +
      `Пожалуйста, свяжитесь с поддержкой: @mamlyga`;

    try {
      await this.botInstance.telegram.sendMessage(deal.buyerId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying buyer about error:', error.message);
    }

    try {
      await this.botInstance.telegram.sendMessage(deal.sellerId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error notifying seller about error:', error.message);
    }
  }

  /**
   * Manually trigger deadline check for specific deal (for testing/admin)
   * @param {string} dealId - Deal ID
   */
  async checkSpecificDeal(dealId) {
    const deal = await Deal.findOne({ dealId }).lean();

    if (!deal) {
      throw new Error('Deal not found');
    }

    if (!['locked', 'in_progress'].includes(deal.status)) {
      return {
        checked: false,
        message: `Deal is in status: ${deal.status}`
      };
    }

    const now = new Date();
    const isExpired = deal.deadline < now;

    if (!isExpired) {
      return {
        checked: true,
        expired: false,
        deadline: deal.deadline,
        timeRemaining: deal.deadline - now
      };
    }

    await this.processDeal(deal);

    return {
      checked: true,
      expired: true,
      processed: true
    };
  }
}

// Export singleton instance
module.exports = new DeadlineMonitor();
