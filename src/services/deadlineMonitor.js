const Deal = require('../models/Deal');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const MultisigWallet = require('../models/MultisigWallet');
const Session = require('../models/Session');
const blockchainService = require('./blockchain');
const feesaverService = require('./feesaver');
const priceService = require('./priceService');
const constants = require('../config/constants');
const messageManager = require('../bot/utils/messageManager');
const TronWeb = require('tronweb');

// High-load optimization utilities
const BoundedSet = require('../utils/BoundedSet');

/**
 * Deadline Monitor Service
 * Monitors deals for deadline expiration and handles auto-refunds/releases
 *
 * Flow:
 * 1. Deadline expires → notify both parties with action buttons
 * 2. +12 hours without action:
 *    - If work_submitted → auto-release to seller (work accepted by default)
 *    - Otherwise → auto-refund to buyer
 *
 * Commission is always taken in standard mode (no penalties).
 */
class DeadlineMonitor {
  constructor() {
    this.isRunning = false;
    this.isChecking = false; // Prevent overlapping check cycles
    this.interval = null;
    this.botInstance = null;

    // Check interval: every 5 minutes
    this.CHECK_INTERVAL = 5 * 60 * 1000;

    // Grace period after deadline: 12 hours
    this.GRACE_PERIOD_MS = 12 * 60 * 60 * 1000;

    // Batch processing settings
    this.BATCH_SIZE = 5; // Process 5 deals at a time
    this.BATCH_DELAY = 2000; // 2 seconds between batches

    // Track notified deals to avoid duplicate notifications (bounded to prevent memory leaks)
    // Note: Primary deduplication is now via DB field 'deadlineNotificationSent'
    this.notifiedDeals = new BoundedSet(1000);

    // Track deals in refund process to prevent double processing (bounded)
    this.refundingDeals = new BoundedSet(500);

    // Cleanup interval for memory management (less critical now with BoundedSet)
    this.CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
    this.cleanupTimer = null;
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

    // Start cleanup timer for memory management
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.isRunning = false;
    console.log('⛔ Deadline monitor stopped');
  }

  /**
   * Cleanup old entries from tracking Sets
   * Note: BoundedSet handles this automatically now, but we log stats
   */
  cleanup() {
    console.log(`📊 DeadlineMonitor stats: notified=${this.notifiedDeals.size}, refunding=${this.refundingDeals.size}`);
  }

  /**
   * Check all active deals for deadline expiration
   */
  async checkDeadlines() {
    // Prevent overlapping check cycles
    if (this.isChecking) {
      console.log('⏳ Previous deadline check still running, skipping...');
      return;
    }

    this.isChecking = true;

    try {
      const now = new Date();

      // Find deals that are locked/in_progress/work_submitted and past deadline
      // CRITICAL: Only these 3 statuses - explicitly prevents spam on completed deals
      const expiredDeals = await Deal.find({
        status: { $in: ['locked', 'in_progress', 'work_submitted'] },
        deadline: { $lt: now },
        multisigAddress: { $ne: null },
        // Extra safety: exclude deals that have completedAt set (belt and suspenders)
        completedAt: null
      }).lean();

      if (expiredDeals.length === 0) {
        return;
      }

      console.log(`⏰ Checking ${expiredDeals.length} expired deal(s) in batches of ${this.BATCH_SIZE}...`);

      // Process deals in batches to avoid overwhelming the system
      for (let i = 0; i < expiredDeals.length; i += this.BATCH_SIZE) {
        const batch = expiredDeals.slice(i, i + this.BATCH_SIZE);
        const batchNum = Math.floor(i / this.BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(expiredDeals.length / this.BATCH_SIZE);

        console.log(`📦 Processing deadline batch ${batchNum}/${totalBatches} (${batch.length} deals)...`);

        // Process batch sequentially (refunds need blockchain confirmations)
        for (const deal of batch) {
          await this.processDeal(deal);
        }

        // Delay between batches
        if (i + this.BATCH_SIZE < expiredDeals.length) {
          await new Promise(resolve => setTimeout(resolve, this.BATCH_DELAY));
        }
      }

      console.log(`✅ Deadline check cycle completed for ${expiredDeals.length} deal(s)`);
    } catch (error) {
      console.error('Error in deadline monitor:', error);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Process a single expired deal
   * @param {Object} deal - Deal document
   */
  async processDeal(deal) {
    try {
      // CRITICAL: Double-check deal status from DB (prevents spam on completed deals)
      const currentDeal = await Deal.findById(deal._id).lean();
      if (!currentDeal) return;

      // Skip if deal is already completed, cancelled, expired, or resolved
      if (['completed', 'cancelled', 'expired', 'resolved'].includes(currentDeal.status)) {
        console.log(`⏭️ Deal ${deal.dealId} is ${currentDeal.status}, skipping deadline processing`);
        return;
      }

      const now = new Date();
      const deadlineTime = new Date(deal.deadline).getTime();
      const timeSinceDeadline = now.getTime() - deadlineTime;
      const gracePeriodPassed = timeSinceDeadline >= this.GRACE_PERIOD_MS;

      // Check if we already sent expiration notification (from DB, not memory!)
      // Using deadlineNotificationSent field for persistence across restarts
      const alreadyNotified = currentDeal.deadlineNotificationSent === true;

      if (!alreadyNotified) {
        // Mark as notified BEFORE sending (prevents duplicates even if send fails)
        await Deal.updateOne(
          { _id: deal._id },
          { $set: { deadlineNotificationSent: true } }
        );

        // Send expiration notification with action buttons
        await this.sendExpirationNotification(deal);

        // Also track in memory for current session (optimization)
        this.notifiedDeals.add(`expired_${deal.dealId}`);

        console.log(`📬 Deadline notification sent and persisted for deal ${deal.dealId}`);
      }

      // If grace period passed → auto-refund or auto-release based on status
      if (gracePeriodPassed) {
        if (currentDeal.status === 'work_submitted') {
          // Work was submitted but buyer didn't respond → release to seller
          await this.processAutoRelease(deal);
        } else {
          // Work not submitted → refund to buyer
          await this.processAutoRefund(deal);
        }
      }
    } catch (error) {
      console.error(`Error processing deal ${deal.dealId}:`, error);
    }
  }

  /**
   * Send expiration notification to both parties
   * Uses DELETE + SEND pattern via messageManager
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

    // Create mock ctx for messageManager (it needs ctx.telegram)
    const ctx = { telegram: this.botInstance.telegram };

    // Buyer notification
    const buyerText = `⚠️ *Срок сделки истёк!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}
💰 Сумма: ${deal.amount} ${deal.asset}

⏰ Дедлайн был: ${deadline.toLocaleString('ru-RU')}

У вас есть *${hoursRemaining} часов* чтобы:
• Подтвердить выполнение работы
• Или открыть спор

🔄 *Автовозврат:* ${autoRefundTime.toLocaleString('ru-RU')}

Если вы не примете решение, средства будут автоматически возвращены на ваш кошелёк за вычетом комиссии сервиса.`;

    const buyerKeyboard = {
      inline_keyboard: [
        [{ text: '✅ Подтвердить работу', callback_data: `confirm_work_${deal.dealId}` }],
        [{ text: '⚠️ Открыть спор', callback_data: `open_dispute_${deal.dealId}` }],
        [{ text: '📋 Детали сделки', callback_data: `view_deal_${deal.dealId}` }],
        [{ text: '↩️ Назад', callback_data: 'back' }]
      ]
    };

    try {
      await messageManager.showNotification(ctx, deal.buyerId, buyerText, buyerKeyboard);
      console.log(`📬 Expiration notification sent to buyer for deal ${deal.dealId}`);
    } catch (error) {
      console.error(`Error sending buyer notification for ${deal.dealId}:`, error.message);
    }

    // Seller notification
    const sellerText = `⚠️ *Срок сделки истёк!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}
💰 Сумма: ${deal.amount} ${deal.asset}

⏰ Дедлайн был: ${deadline.toLocaleString('ru-RU')}

У вас есть *${hoursRemaining} часов* чтобы:
• Отметить работу как сданную
• Или открыть спор

🔄 *Автовозврат покупателю:* ${autoRefundTime.toLocaleString('ru-RU')}

⚠️ *Внимание!* Если покупатель не подтвердит работу и вы не откроете спор, средства будут автоматически возвращены покупателю.

Комиссия сервиса удерживается в любом случае.`;

    const sellerKeyboard = {
      inline_keyboard: [
        [{ text: '📤 Работа сдана', callback_data: `work_done_${deal.dealId}` }],
        [{ text: '⚠️ Открыть спор', callback_data: `open_dispute_${deal.dealId}` }],
        [{ text: '📋 Детали сделки', callback_data: `view_deal_${deal.dealId}` }],
        [{ text: '↩️ Назад', callback_data: 'back' }]
      ]
    };

    try {
      await messageManager.showNotification(ctx, deal.sellerId, sellerText, sellerKeyboard);
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
   * Request buyer's private key for refund (instead of auto-refund)
   * NO automatic payouts - buyer must input their private key!
   * @param {Object} deal - Deal document
   */
  async processAutoRefund(deal) {
    // Prevent double processing
    if (this.refundingDeals.has(deal.dealId)) {
      console.log(`⏭️ Deal ${deal.dealId} already in refund request process, skipping...`);
      return;
    }

    this.refundingDeals.add(deal.dealId);

    try {
      // Double-check deal status in DB
      const currentDeal = await Deal.findById(deal._id);

      if (!currentDeal) {
        console.log(`⏭️ Deal ${deal.dealId} not found, skipping...`);
        return;
      }

      // Only process locked or in_progress deals
      if (!['locked', 'in_progress'].includes(currentDeal.status)) {
        console.log(`⏭️ Deal ${deal.dealId} status changed to ${currentDeal.status}, skipping...`);
        return;
      }

      // Check if key validation already requested
      if (currentDeal.pendingKeyValidation === 'buyer_refund') {
        console.log(`⏭️ Deal ${deal.dealId} already has pending key validation, skipping...`);
        return;
      }

      console.log(`🔐 Requesting buyer's private key for refund on deal ${deal.dealId}...`);

      // Get multisig wallet balance
      const balance = await blockchainService.getBalance(deal.multisigAddress, deal.asset);

      if (balance <= 0) {
        console.log(`⏭️ Deal ${deal.dealId} has zero balance, marking as expired...`);
        await Deal.findByIdAndUpdate(deal._id, { status: 'expired' });
        return;
      }

      // Get buyer address for refund
      const buyerAddress = deal.buyerAddress;
      if (!buyerAddress) {
        console.error(`❌ Deal ${deal.dealId} has no buyer address for refund`);
        await this.notifyRefundError(deal, 'Не указан адрес кошелька покупателя');
        return;
      }

      // Calculate amounts
      const commission = deal.commission;
      const refundAmount = balance - commission;

      // Update deal status to mark pending key validation
      await Deal.findByIdAndUpdate(deal._id, {
        pendingKeyValidation: 'buyer_refund'
      });

      // Create key validation session for buyer
      await Session.setSession(deal.buyerId, 'key_validation', {
        dealId: deal.dealId,
        type: 'buyer_refund',
        attempts: 0,
        refundAmount,
        commission
      }, 24); // TTL 24 hours

      // Create mock ctx for messageManager
      const ctx = { telegram: this.botInstance.telegram };

      // Notify buyer - request private key
      const buyerText = `⏰ *Срок сделки истёк!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

Работа не была выполнена в срок.

💰 *Для возврата средств введите ваш приватный ключ:*

💸 К возврату: *${refundAmount.toFixed(2)} ${deal.asset}*
📊 Комиссия сервиса: ${commission.toFixed(2)} ${deal.asset}

⚠️ Это ключ, который был выдан вам при указании кошелька.

❗️ *Без ввода ключа средства НЕ будут возвращены!*
❗️ *Если вы потеряли ключ - средства останутся заблокированными навсегда!*`;

      const buyerKeyboard = {
        inline_keyboard: [
          [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
        ]
      };

      try {
        await messageManager.showNotification(ctx, deal.buyerId, buyerText, buyerKeyboard);
        console.log(`📬 Key request sent to buyer for deal ${deal.dealId}`);
      } catch (error) {
        console.error(`Error sending key request to buyer:`, error.message);
      }

      // Notify seller (informational)
      const sellerText = `⏰ *Срок сделки истёк*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

Работа не была выполнена в срок.
Покупателю отправлен запрос на возврат средств.`;

      try {
        await messageManager.showNotification(ctx, deal.sellerId, sellerText, buyerKeyboard);
      } catch (error) {
        console.error(`Error sending notification to seller:`, error.message);
      }

      // Log audit
      await AuditLog.create({
        action: 'DEAL_REFUND_KEY_REQUESTED',
        dealId: deal._id,
        details: {
          dealId: deal.dealId,
          refundAmount,
          commission,
          buyerAddress
        }
      });

      console.log(`✅ Key request for refund sent for deal ${deal.dealId}`);
    } catch (error) {
      console.error(`❌ Error requesting key for refund for ${deal.dealId}:`, error);
      await this.notifyRefundError(deal, error.message);
    } finally {
      // Remove from processing set after delay
      setTimeout(() => {
        this.refundingDeals.delete(deal.dealId);
      }, 60000);
    }
  }

  /**
   * Request seller's private key for release (instead of auto-release)
   * NO automatic payouts - seller must input their private key!
   * Called when work_submitted and buyer didn't respond within grace period
   * @param {Object} deal - Deal document
   */
  async processAutoRelease(deal) {
    // Prevent double processing (reuse same Set)
    if (this.refundingDeals.has(deal.dealId)) {
      console.log(`⏭️ Deal ${deal.dealId} already in release request process, skipping...`);
      return;
    }

    this.refundingDeals.add(deal.dealId);

    try {
      // Double-check deal status in DB
      const currentDeal = await Deal.findById(deal._id);

      if (!currentDeal) {
        console.log(`⏭️ Deal ${deal.dealId} not found, skipping...`);
        return;
      }

      // Only process work_submitted deals
      if (currentDeal.status !== 'work_submitted') {
        console.log(`⏭️ Deal ${deal.dealId} status changed to ${currentDeal.status}, skipping...`);
        return;
      }

      // Check if key validation already requested
      if (currentDeal.pendingKeyValidation === 'seller_release') {
        console.log(`⏭️ Deal ${deal.dealId} already has pending key validation, skipping...`);
        return;
      }

      console.log(`🔐 Requesting seller's private key for release on deal ${deal.dealId}...`);

      // Get multisig wallet balance
      const balance = await blockchainService.getBalance(deal.multisigAddress, deal.asset);

      if (balance <= 0) {
        console.log(`⏭️ Deal ${deal.dealId} has zero balance, marking as completed...`);
        await Deal.findByIdAndUpdate(deal._id, { status: 'completed', completedAt: new Date() });
        return;
      }

      // Get seller address for release
      const sellerAddress = deal.sellerAddress;
      if (!sellerAddress) {
        console.error(`❌ Deal ${deal.dealId} has no seller address for release`);
        await this.notifyReleaseError(deal, 'Не указан адрес кошелька продавца');
        return;
      }

      // Calculate amounts
      const commission = deal.commission;
      const releaseAmount = balance - commission;

      // Update deal status to mark pending key validation
      await Deal.findByIdAndUpdate(deal._id, {
        pendingKeyValidation: 'seller_release'
      });

      // Create key validation session for seller
      await Session.setSession(deal.sellerId, 'key_validation', {
        dealId: deal.dealId,
        type: 'seller_release',
        attempts: 0,
        releaseAmount,
        commission
      }, 24); // TTL 24 hours

      // Create mock ctx for messageManager
      const ctx = { telegram: this.botInstance.telegram };

      // Notify seller - request private key
      const sellerText = `✅ *Работа принята автоматически!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

Покупатель не ответил в течение 12 часов после сдачи работы.
Работа принята автоматически!

💰 *Для получения средств введите ваш приватный ключ:*

💸 К получению: *${releaseAmount.toFixed(2)} ${deal.asset}*
📊 Комиссия сервиса: ${commission.toFixed(2)} ${deal.asset}

⚠️ Это ключ, который был выдан вам при указании кошелька.

❗️ *Без ввода ключа средства НЕ будут переведены!*
❗️ *Если вы потеряли ключ - средства останутся заблокированными навсегда!*`;

      const sellerKeyboard = {
        inline_keyboard: [
          [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
        ]
      };

      try {
        await messageManager.showNotification(ctx, deal.sellerId, sellerText, sellerKeyboard);
        console.log(`📬 Key request sent to seller for deal ${deal.dealId}`);
      } catch (error) {
        console.error(`Error sending key request to seller:`, error.message);
      }

      // Notify buyer (informational)
      const buyerText = `⏰ *Время на проверку работы истекло*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

Вы не ответили в течение 12 часов после сдачи работы.
Работа принята автоматически.

Средства будут переведены продавцу после подтверждения.`;

      try {
        await messageManager.showNotification(ctx, deal.buyerId, buyerText, sellerKeyboard);
      } catch (error) {
        console.error(`Error sending notification to buyer:`, error.message);
      }

      // Log audit
      await AuditLog.create({
        action: 'DEAL_RELEASE_KEY_REQUESTED',
        dealId: deal._id,
        details: {
          dealId: deal.dealId,
          releaseAmount,
          commission,
          sellerAddress,
          reason: 'work_submitted_buyer_timeout'
        }
      });

      console.log(`✅ Key request for release sent for deal ${deal.dealId}`);
    } catch (error) {
      console.error(`❌ Error requesting key for release for ${deal.dealId}:`, error);
      await this.notifyReleaseError(deal, error.message);
    } finally {
      // Remove from processing set after delay
      setTimeout(() => {
        this.refundingDeals.delete(deal.dealId);
      }, 60000);
    }
  }

  /**
   * Transfer commission to service wallet (for auto-release, uses seller key)
   * @param {Object} deal - Deal document with keys
   * @param {number} amount - Commission amount
   */
  async transferCommissionForRelease(deal, amount) {
    try {
      const serviceWallet = constants.SERVICE_WALLET_ADDRESS;
      if (!serviceWallet) {
        console.error('SERVICE_WALLET_ADDRESS not configured');
        return;
      }

      const arbiterKey = process.env.ARBITER_PRIVATE_KEY;
      const sellerKey = deal.sellerKey;

      // Create commission transaction
      const commissionTx = await blockchainService.createReleaseTransaction(
        deal.multisigAddress,
        serviceWallet,
        amount,
        deal.asset
      );

      // Multi-sign with arbiter + seller
      const signedCommissionTx = await blockchainService.multiSignTransaction(commissionTx, [
        arbiterKey,
        sellerKey
      ]);

      // Broadcast
      const commissionResult = await blockchainService.broadcastTransaction(signedCommissionTx);

      if (commissionResult.success) {
        console.log(`✅ Commission ${amount} ${deal.asset} transferred (release): ${commissionResult.txHash}`);

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
        console.error(`❌ Failed to transfer commission (release):`, commissionResult.error);
      }
    } catch (error) {
      console.error('Error transferring commission (release):', error);
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
   * Uses DELETE + SEND pattern via messageManager (final screen - no back button)
   */
  async notifyRefundComplete(deal, refundAmount, commission, txHash) {
    if (!this.botInstance) return;

    // Create mock ctx for messageManager
    const ctx = { telegram: this.botInstance.telegram };

    // Final screen keyboard (no back button - this is a final state)
    const finalKeyboard = {
      inline_keyboard: [
        [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
      ]
    };

    // Buyer notification
    const buyerText = `✅ *Автовозврат выполнен!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

💸 Возвращено: *${refundAmount.toFixed(2)} ${deal.asset}*
📊 Комиссия сервиса: ${commission.toFixed(2)} ${deal.asset}

Срок сделки истёк, средства возвращены на ваш кошелёк.

[Транзакция](https://tronscan.org/#/transaction/${txHash})`;

    try {
      await messageManager.showFinalScreen(ctx, deal.buyerId, 'auto_refund_complete', buyerText, finalKeyboard);
    } catch (error) {
      console.error(`Error notifying buyer about refund:`, error.message);
    }

    // Seller notification
    const sellerText = `⚠️ *Сделка завершена автовозвратом*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

Срок сделки истёк без подтверждения выполнения.
Средства возвращены покупателю.

💸 Возвращено покупателю: ${refundAmount.toFixed(2)} ${deal.asset}
📊 Комиссия сервиса: ${commission.toFixed(2)} ${deal.asset}

[Транзакция](https://tronscan.org/#/transaction/${txHash})`;

    try {
      await messageManager.showFinalScreen(ctx, deal.sellerId, 'auto_refund_complete', sellerText, finalKeyboard);
    } catch (error) {
      console.error(`Error notifying seller about refund:`, error.message);
    }
  }

  /**
   * Notify about refund error
   * Uses DELETE + SEND pattern via messageManager
   */
  async notifyRefundError(deal, errorMessage) {
    if (!this.botInstance) return;

    // Create mock ctx for messageManager
    const ctx = { telegram: this.botInstance.telegram };

    const errorText = `❌ *Ошибка автовозврата*

🆔 Сделка: \`${deal.dealId}\`
Ошибка: ${errorMessage}

Пожалуйста, свяжитесь с поддержкой: @keyshield_support`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '📋 Детали сделки', callback_data: `view_deal_${deal.dealId}` }],
        [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
      ]
    };

    try {
      await messageManager.showNotification(ctx, deal.buyerId, errorText, keyboard);
    } catch (error) {
      console.error('Error notifying buyer about error:', error.message);
    }

    try {
      await messageManager.showNotification(ctx, deal.sellerId, errorText, keyboard);
    } catch (error) {
      console.error('Error notifying seller about error:', error.message);
    }
  }

  /**
   * Notify both parties about successful auto-release to seller
   * Uses DELETE + SEND pattern via messageManager (final screen - no back button)
   */
  async notifyReleaseComplete(deal, releaseAmount, commission, txHash) {
    if (!this.botInstance) return;

    // Create mock ctx for messageManager
    const ctx = { telegram: this.botInstance.telegram };

    // Final screen keyboard (no back button - this is a final state)
    const finalKeyboard = {
      inline_keyboard: [
        [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
      ]
    };

    // Seller notification (winner)
    const sellerText = `✅ *Сделка успешно завершена!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

💸 Получено: *${releaseAmount.toFixed(2)} ${deal.asset}*
📊 Комиссия сервиса: ${commission.toFixed(2)} ${deal.asset}

Покупатель не ответил в течение 12 часов после сдачи работы.
Работа принята автоматически, средства переведены на ваш кошелёк.

[Транзакция](https://tronscan.org/#/transaction/${txHash})`;

    try {
      await messageManager.showFinalScreen(ctx, deal.sellerId, 'auto_release_complete', sellerText, finalKeyboard);
    } catch (error) {
      console.error(`Error notifying seller about release:`, error.message);
    }

    // Buyer notification
    const buyerText = `✅ *Сделка завершена*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

Продавец сдал работу, но вы не ответили в течение 12 часов.
Работа принята автоматически, средства переведены продавцу.

💸 Переведено продавцу: ${releaseAmount.toFixed(2)} ${deal.asset}
📊 Комиссия сервиса: ${commission.toFixed(2)} ${deal.asset}

[Транзакция](https://tronscan.org/#/transaction/${txHash})`;

    try {
      await messageManager.showFinalScreen(ctx, deal.buyerId, 'auto_release_complete', buyerText, finalKeyboard);
    } catch (error) {
      console.error(`Error notifying buyer about release:`, error.message);
    }
  }

  /**
   * Notify about release error
   * Uses DELETE + SEND pattern via messageManager
   */
  async notifyReleaseError(deal, errorMessage) {
    if (!this.botInstance) return;

    // Create mock ctx for messageManager
    const ctx = { telegram: this.botInstance.telegram };

    const errorText = `❌ *Ошибка авто-перевода продавцу*

🆔 Сделка: \`${deal.dealId}\`
Ошибка: ${errorMessage}

Пожалуйста, свяжитесь с поддержкой: @keyshield_support`;

    const keyboard = {
      inline_keyboard: [
        [{ text: '📋 Детали сделки', callback_data: `view_deal_${deal.dealId}` }],
        [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
      ]
    };

    try {
      await messageManager.showNotification(ctx, deal.buyerId, errorText, keyboard);
    } catch (error) {
      console.error('Error notifying buyer about release error:', error.message);
    }

    try {
      await messageManager.showNotification(ctx, deal.sellerId, errorText, keyboard);
    } catch (error) {
      console.error('Error notifying seller about release error:', error.message);
    }
  }

  /**
   * Return leftover TRX from multisig to arbiter
   * @param {Object} deal - Deal document
   * @param {string} walletPrivateKey - Multisig wallet private key
   * @param {boolean} energyRented - Whether energy was rented
   * @returns {number} Amount of TRX returned
   */
  async returnLeftoverTRX(deal, walletPrivateKey, energyRented) {
    try {
      console.log(`\n💰 Waiting for USDT transactions to confirm before checking TRX balance...`);
      await new Promise(resolve => setTimeout(resolve, 10000));

      console.log(`\n💰 Checking for leftover TRX on multisig to return...`);
      const tronWeb = new TronWeb({
        fullHost: process.env.TRON_FULL_NODE || 'https://api.trongrid.io',
        headers: { 'TRON-PRO-API-KEY': process.env.TRONGRID_API_KEY }
      });

      const balanceSun = await tronWeb.trx.getBalance(deal.multisigAddress);
      const balanceTRX = balanceSun / 1_000_000;

      console.log(`   Multisig TRX balance: ${balanceTRX.toFixed(6)} TRX`);
      console.log(`   (includes activation TRX + ${energyRented ? 'no' : 'fallback'} TRX for energy)`);

      if (balanceTRX < 0.1) {
        console.log(`   Balance too low (< 0.1 TRX), nothing to return`);
        return 0;
      }

      const feeReserve = 1.5; // TRX for transaction fee
      const returnAmount = balanceTRX - feeReserve;

      if (returnAmount <= 0) {
        console.log(`   After reserving ${feeReserve} TRX for fee, nothing left to return`);
        return 0;
      }

      const returnAmountSun = Math.floor(returnAmount * 1_000_000);

      console.log(`   Total: ${balanceTRX.toFixed(6)} TRX`);
      console.log(`   Fee reserve: ${feeReserve} TRX`);
      console.log(`   Returning: ${returnAmount.toFixed(6)} TRX to arbiter...`);

      const returnTx = await tronWeb.transactionBuilder.sendTrx(
        process.env.ARBITER_ADDRESS,
        returnAmountSun,
        deal.multisigAddress
      );

      const signedReturnTx = await tronWeb.trx.sign(returnTx, walletPrivateKey);
      const returnResult = await tronWeb.trx.sendRawTransaction(signedReturnTx);

      if (returnResult.result) {
        const returnTxHash = returnResult.txid || returnResult.transaction?.txID;
        console.log(`✅ Returned ${returnAmount.toFixed(6)} TRX to arbiter: ${returnTxHash}`);
        return returnAmount;
      } else {
        console.log(`⚠️  TRX return failed (non-critical): ${JSON.stringify(returnResult)}`);
        return 0;
      }
    } catch (returnError) {
      console.error(`⚠️  Failed to return leftover TRX (non-critical):`, returnError.message);
      return 0;
    }
  }

  /**
   * Save operational costs to database
   * @param {Object} deal - Deal document
   * @param {boolean} energyRented - Whether energy was rented
   * @param {number} feesaverCost - FeeSaver cost in TRX
   * @param {number} trxReturned - TRX returned to arbiter
   * @param {string} operationType - 'auto_refund', 'auto_release', or 'dispute'
   */
  async saveOperationalCosts(deal, energyRented, feesaverCost, trxReturned, operationType) {
    try {
      const trxPrice = await priceService.getTrxPrice();

      // Calculate costs with REAL blockchain data
      const ACTIVATION_AMOUNT = parseInt(process.env.MULTISIG_ACTIVATION_TRX) || 5;
      const FALLBACK_AMOUNT = parseInt(process.env.FALLBACK_TRX_AMOUNT) || 30;
      const TX_FEE = 1.1; // Standard TRON transaction fee

      // Amounts sent
      const activationTrxSent = ACTIVATION_AMOUNT;
      const activationTxFee = TX_FEE;
      const fallbackTrxSent = energyRented ? 0 : FALLBACK_AMOUNT;
      const fallbackTxFee = energyRented ? 0 : TX_FEE;

      // FeeSaver cost
      const feesaverCostTrx = energyRented ? feesaverCost : 0;

      // Calculate returns
      let activationTrxReturned = 0;
      let fallbackTrxReturned = 0;

      if (energyRented) {
        activationTrxReturned = trxReturned;
        fallbackTrxReturned = 0;
      } else {
        activationTrxReturned = 0;
        fallbackTrxReturned = trxReturned;
      }

      // Net costs
      const activationTrxNet = activationTrxSent - activationTrxReturned;
      const fallbackTrxNet = fallbackTrxSent - fallbackTrxReturned;

      // TOTAL TRX SPENT = Sent + TX Fees + FeeSaver - Returned
      const totalTrxSpent = activationTrxSent + activationTxFee +
                           fallbackTrxSent + fallbackTxFee +
                           feesaverCostTrx -
                           trxReturned;

      const totalCostUsd = totalTrxSpent * trxPrice;

      // Update deal with operational costs
      await Deal.updateOne(
        { _id: deal._id },
        {
          $set: {
            'operationalCosts.activationTrxSent': activationTrxSent,
            'operationalCosts.activationTxFee': activationTxFee,
            'operationalCosts.activationTrxReturned': activationTrxReturned,
            'operationalCosts.activationTrxNet': parseFloat(activationTrxNet.toFixed(6)),
            'operationalCosts.energyMethod': energyRented ? 'feesaver' : 'trx',
            'operationalCosts.feesaverCostTrx': feesaverCostTrx,
            'operationalCosts.fallbackTrxSent': fallbackTrxSent,
            'operationalCosts.fallbackTxFee': fallbackTxFee,
            'operationalCosts.fallbackTrxReturned': fallbackTrxReturned,
            'operationalCosts.fallbackTrxNet': parseFloat(fallbackTrxNet.toFixed(6)),
            'operationalCosts.totalTrxSpent': totalTrxSpent,
            'operationalCosts.totalCostUsd': totalCostUsd,
            'operationalCosts.trxPriceAtCompletion': trxPrice,
            'operationalCosts.completionType': operationType
          }
        }
      );

      console.log(`\n📊 Operational costs saved to database:`);
      console.log(`   Operation type: ${operationType}`);
      console.log(`   Energy method: ${energyRented ? 'FeeSaver' : 'TRX Fallback'}`);
      console.log(`   Activation: ${activationTrxSent} + ${activationTxFee} fee = ${(activationTrxSent + activationTxFee).toFixed(2)} TRX sent`);
      if (!energyRented) {
        console.log(`   Fallback: ${fallbackTrxSent} + ${fallbackTxFee} fee = ${(fallbackTrxSent + fallbackTxFee).toFixed(2)} TRX sent`);
      } else {
        console.log(`   FeeSaver energy: ${feesaverCostTrx} TRX`);
      }
      console.log(`   Returned: ${trxReturned.toFixed(6)} TRX`);
      console.log(`   ═══════════════════════════════`);
      console.log(`   Total TRX spent: ${totalTrxSpent.toFixed(6)} TRX`);
      console.log(`   Total cost USD: $${totalCostUsd.toFixed(6)} (TRX @ $${trxPrice.toFixed(6)})`);
      console.log(`   Net profit: $${(deal.commission - totalCostUsd).toFixed(6)}`);
    } catch (costError) {
      console.error(`⚠️  Failed to save operational costs (non-critical):`, costError.message);
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

    if (!['locked', 'in_progress', 'work_submitted'].includes(deal.status)) {
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
