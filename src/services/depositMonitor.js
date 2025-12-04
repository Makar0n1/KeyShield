const Deal = require('../models/Deal');
const Transaction = require('../models/Transaction');
const MultisigWallet = require('../models/MultisigWallet');
const AuditLog = require('../models/AuditLog');
const blockchainService = require('./blockchain');
const constants = require('../config/constants');

class DepositMonitor {
  constructor() {
    this.isRunning = false;
    this.isChecking = false; // Prevent overlapping check cycles
    this.interval = null;
    this.botInstance = null;

    // Performance settings
    this.BATCH_SIZE = 8; // Process 8 deals in parallel (TronGrid limit ~10 req/sec)
    this.BATCH_DELAY = 1000; // 1 second delay between batches

    // Activation queue to prevent parallel blockchain transactions from same wallet
    this.activationQueue = [];
    this.isProcessingActivations = false;

    // Track processed deposits to prevent duplicates
    this.processedDeposits = new Set();
  }

  /**
   * Add activation task to queue (prevents parallel TRX transfers)
   */
  async queueActivation(dealId, multisigAddress) {
    return new Promise((resolve, reject) => {
      this.activationQueue.push({ dealId, multisigAddress, resolve, reject });
      this.processActivationQueue();
    });
  }

  /**
   * Process activation queue sequentially
   */
  async processActivationQueue() {
    if (this.isProcessingActivations || this.activationQueue.length === 0) {
      return;
    }

    this.isProcessingActivations = true;

    while (this.activationQueue.length > 0) {
      const task = this.activationQueue.shift();

      try {
        const activationAmount = parseInt(process.env.MULTISIG_ACTIVATION_TRX) || 15;
        console.log(`🔓 [Queue] Activating multisig ${task.multisigAddress} with ${activationAmount} TRX...`);

        const result = await blockchainService.activateMultisigWallet(
          task.multisigAddress,
          activationAmount
        );

        if (result.success) {
          console.log(`✅ [Queue] Activation successful: ${result.txHash}`);

          // Update deal with activation costs
          const trxToUsdRate = 0.27;
          await Deal.findByIdAndUpdate(task.dealId, {
            'operationalCosts.activationTrx': activationAmount,
            'operationalCosts.activationUsd': activationAmount * trxToUsdRate
          });

          task.resolve(result);
        } else {
          console.error(`❌ [Queue] Activation failed: ${result.error}`);
          task.resolve(result); // Don't reject, just return failure
        }

        // Wait 2 seconds between activations to ensure blockchain confirms
        if (this.activationQueue.length > 0) {
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (error) {
        console.error(`❌ [Queue] Activation error:`, error);
        task.reject(error);
      }
    }

    this.isProcessingActivations = false;
  }

  /**
   * Set bot instance for sending notifications
   * @param {Object} bot - Telegraf bot instance
   */
  setBotInstance(bot) {
    this.botInstance = bot;
  }

  /**
   * Start monitoring for deposits
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  Deposit monitor already running');
      return;
    }

    console.log('✅ Starting deposit monitor...');
    this.isRunning = true;

    // Run immediately
    this.checkDeposits();

    // Check for deals that are locked but notifications weren't sent
    this.checkPendingNotifications();

    // Then run on interval
    this.interval = setInterval(() => {
      this.checkDeposits();
    }, constants.DEPOSIT_CHECK_INTERVAL);
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
    console.log('⛔ Deposit monitor stopped');
  }

  /**
   * Check all deals waiting for deposits (optimized with parallel batching)
   */
  async checkDeposits() {
    // Prevent overlapping check cycles
    if (this.isChecking) {
      console.log('⏳ Previous deposit check still running, skipping...');
      return;
    }

    this.isChecking = true;

    try {
      // Find all deals waiting for deposit
      const deals = await Deal.find({
        status: 'waiting_for_deposit',
        multisigAddress: { $ne: null }
      }).lean(); // Use lean() for better performance

      if (deals.length === 0) {
        return;
      }

      console.log(`🔍 Checking deposits for ${deals.length} deal(s) in batches of ${this.BATCH_SIZE}...`);

      // Process deals in batches for parallel execution
      for (let i = 0; i < deals.length; i += this.BATCH_SIZE) {
        const batch = deals.slice(i, i + this.BATCH_SIZE);
        const batchNum = Math.floor(i / this.BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(deals.length / this.BATCH_SIZE);

        console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} deals)...`);

        // Process batch in parallel using Promise.allSettled for fault tolerance
        const results = await Promise.allSettled(
          batch.map(deal => this.checkDealDeposit(deal))
        );

        // Log any failures
        results.forEach((result, idx) => {
          if (result.status === 'rejected') {
            console.error(`❌ Failed to check deal ${batch[idx].dealId}:`, result.reason);
          }
        });

        // Delay between batches to respect API rate limits (skip delay after last batch)
        if (i + this.BATCH_SIZE < deals.length) {
          await new Promise(resolve => setTimeout(resolve, this.BATCH_DELAY));
        }
      }

      console.log(`✅ Deposit check cycle completed for ${deals.length} deal(s)`);
    } catch (error) {
      console.error('Error in deposit monitor:', error);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Check deposit for a specific deal
   * @param {Object} deal - Deal document (can be lean object)
   */
  async checkDealDeposit(deal) {
    try {
      // Check if deposit already recorded (safety check)
      if (deal.depositTxHash) {
        return;
      }

      // Prevent duplicate processing (race condition protection)
      const processingKey = `${deal.dealId}`;
      if (this.processedDeposits.has(processingKey)) {
        console.log(`⏭️ Deal ${deal.dealId} already being processed, skipping...`);
        return;
      }

      // Calculate expected deposit amount based on commission payer
      let expectedAmount = deal.amount;
      if (deal.commissionType === 'buyer') {
        expectedAmount = deal.amount + deal.commission;
      } else if (deal.commissionType === 'split') {
        expectedAmount = deal.amount + (deal.commission / 2);
      }

      // Check blockchain for deposit (pass 0 as amount to get any deposit)
      const deposit = await blockchainService.checkDeposit(
        deal.multisigAddress,
        deal.asset,
        0 // Don't filter by amount in blockchain service
      );

      if (deposit) {
        console.log(`💰 Deposit detected for deal ${deal.dealId}:`, deposit);

        // Calculate difference from expected amount
        const difference = deposit.amount - expectedAmount;
        const tolerance = constants.DEPOSIT_TOLERANCE_MINUS;

        // Check if deposit is too low (below tolerance)
        if (difference < -tolerance) {
          const shortfall = Math.abs(difference + tolerance);
          console.log(`⚠️ Insufficient deposit for deal ${deal.dealId}: short by ${shortfall} ${deal.asset}`);

          // Notify buyer to add more funds
          if (this.botInstance) {
            await this.botInstance.telegram.sendMessage(
              deal.buyerId,
              `⚠️ *Недостаточный депозит!*\n\n` +
              `🆔 Сделка: \`${deal.dealId}\`\n` +
              `💸 Получено: ${deposit.amount} ${deal.asset}\n` +
              `💸 Требуется: ${expectedAmount} ${deal.asset}\n\n` +
              `❌ Недостаёт: ${shortfall.toFixed(2)} ${deal.asset}\n\n` +
              `Пожалуйста, переведите ещё ${shortfall.toFixed(2)} ${deal.asset} на адрес:\n` +
              `\`${deal.multisigAddress}\`\n\n` +
              `⚠️ Допускается отклонение до -${tolerance} ${deal.asset}.`,
              { parse_mode: 'Markdown' }
            );
          }
          return; // Don't lock deal yet
        }

        // Mark as being processed to prevent duplicates
        this.processedDeposits.add(processingKey);

        try {
          // Check if there's overpayment
          let overpayment = 0;
          if (difference > 0) {
            overpayment = difference;
            console.log(`💰 Overpayment detected: ${overpayment} ${deal.asset} - will go to service wallet`);
          }

          // Double-check deal status in DB (another process might have updated it)
          const currentDeal = await Deal.findById(deal._id).lean();
          if (currentDeal.status !== 'waiting_for_deposit') {
            console.log(`⏭️ Deal ${deal.dealId} status changed to ${currentDeal.status}, skipping...`);
            return;
          }

          // Update deal using findByIdAndUpdate (works with lean objects)
          const updateData = {
            status: 'locked',
            depositTxHash: deposit.txHash,
            depositDetectedAt: new Date(),
            actualDepositAmount: deposit.amount
          };

          // Save buyer's address from deposit transaction
          if (deposit.from && !deal.buyerAddress) {
            updateData.buyerAddress = deposit.from;
            console.log(`💼 Saved buyer address: ${deposit.from}`);
          }

          await Deal.findByIdAndUpdate(deal._id, updateData);

          // Queue activation (processed sequentially to avoid blockchain conflicts)
          try {
            await this.queueActivation(deal._id, deal.multisigAddress);
          } catch (error) {
            console.error(`⚠️ Warning: Error queuing activation:`, error);
          }

          // Create transaction record
          const transaction = new Transaction({
            dealId: deal._id,
            type: 'deposit',
            asset: deal.asset,
            amount: deposit.amount,
            txHash: deposit.txHash,
            block: deposit.block,
            status: 'confirmed',
            fromAddress: deposit.from,
            toAddress: deal.multisigAddress
          });

          transaction.generateExplorerLink();
          await transaction.save();

          // Update multisig wallet balance
          await MultisigWallet.findOneAndUpdate(
            { dealId: deal._id },
            { [`balances.${deal.asset}`]: deposit.amount }
          );

          // Log deposit detection
          await AuditLog.logDepositDetected(deal._id, {
            dealId: deal.dealId,
            amount: deposit.amount,
            asset: deal.asset,
            txHash: deposit.txHash,
            from: deposit.from
          });

          console.log(`✅ Deal ${deal.dealId} marked as locked`);

          // Notify both parties via Telegram bot
          if (this.botInstance) {
            try {
              // Prepare overpayment message if applicable
              let overpaymentNote = '';
              if (overpayment > 0) {
                overpaymentNote = `\n\n⚠️ *Переплата: ${overpayment.toFixed(2)} ${deal.asset}*\n` +
                  `Разница пойдёт на баланс сервиса.\n` +
                  `Для возврата свяжитесь с поддержкой.`;
              }

              // Notify buyer
              await this.botInstance.telegram.sendMessage(
                deal.buyerId,
                `✅ *Депозит подтверждён!*\n\n` +
                `🆔 Сделка: \`${deal.dealId}\`\n` +
                `📦 ${deal.productName}\n` +
                `💸 Депозит: ${deposit.amount} ${deal.asset}\n` +
                `💸 Сумма сделки: ${deal.amount} ${deal.asset}\n\n` +
                `Средства заморожены в multisig-кошельке.\n` +
                `Продавец может начать работу.${overpaymentNote}\n\n` +
                `[Транзакция](https://tronscan.org/#/transaction/${deposit.txHash})`,
                { parse_mode: 'Markdown' }
              );

              // Calculate seller payout amount
              let sellerPayout = deal.amount;
              if (deal.commissionType === 'seller') {
                sellerPayout = deal.amount - deal.commission;
              } else if (deal.commissionType === 'split') {
                sellerPayout = deal.amount - (deal.commission / 2);
              }

              // Notify seller
              await this.botInstance.telegram.sendMessage(
                deal.sellerId,
                `💰 *Средства поступили!*\n\n` +
                `🆔 Сделка: \`${deal.dealId}\`\n` +
                `📦 ${deal.productName}\n\n` +
                `💸 Депозит: ${deal.amount} ${deal.asset}\n` +
                `💵 Вы получите: ${sellerPayout.toFixed(2)} ${deal.asset}\n\n` +
                `Депозит подтверждён. Можете приступать к работе!\n\n` +
                `Отправьте \`${deal.dealId}\` для просмотра деталей.`,
                { parse_mode: 'Markdown' }
              );

              console.log(`📬 Notifications sent to buyer and seller for deal ${deal.dealId}`);
            } catch (error) {
              console.error(`Error sending notifications for deal ${deal.dealId}:`, error);
            }
          }
        } finally {
          // Remove from processed set after a delay (allows re-check if something failed)
          setTimeout(() => {
            this.processedDeposits.delete(processingKey);
          }, 60000); // 1 minute
        }
      }
    } catch (error) {
      console.error(`Error checking deposit for deal ${deal.dealId}:`, error);
    }
  }

  /**
   * Check for deals that are locked but notifications weren't sent
   * This handles cases where bot was restarted after deposit was detected
   */
  async checkPendingNotifications() {
    try {
      // Find deals that are locked but don't have "notificationsSent" flag
      const lockedDeals = await Deal.find({
        status: 'locked',
        depositTxHash: { $ne: null }
      });

      if (lockedDeals.length === 0) {
        return;
      }

      console.log(`📬 Checking ${lockedDeals.length} locked deal(s) for pending notifications...`);

      for (const deal of lockedDeals) {
        // Send notifications if bot instance is available
        if (this.botInstance && deal.depositTxHash) {
          try {
            await this.botInstance.telegram.sendMessage(
              deal.buyerId,
              `✅ *Депозит подтверждён!*\n\n` +
              `Сделка ${deal.dealId}\n` +
              `Сумма: ${deal.amount} ${deal.asset}\n\n` +
              `Средства заморожены в multisig-кошельке.\n` +
              `Продавец может начать работу.\n\n` +
              `[Транзакция](https://tronscan.org/#/transaction/${deal.depositTxHash})`,
              { parse_mode: 'Markdown' }
            );

            await this.botInstance.telegram.sendMessage(
              deal.sellerId,
              `💰 *Средства поступили!*\n\n` +
              `Сделка ${deal.dealId}\n` +
              `${deal.productName}\n\n` +
              `Депозит ${deal.amount} ${deal.asset} подтверждён.\n` +
              `Можете приступать к работе!\n\n` +
              `Отправьте \`${deal.dealId}\` для просмотра деталей.`,
              { parse_mode: 'Markdown' }
            );

            console.log(`✅ Sent pending notifications for deal ${deal.dealId}`);
          } catch (error) {
            console.error(`Error sending pending notifications for deal ${deal.dealId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error checking pending notifications:', error);
    }
  }

  /**
   * Manually check a specific deal (for testing or admin trigger)
   * @param {string} dealId
   * @returns {Promise<Object>}
   */
  async checkSpecificDeal(dealId) {
    const deal = await Deal.findOne({ dealId });

    if (!deal) {
      throw new Error('Deal not found');
    }

    if (deal.status !== 'waiting_for_deposit') {
      return {
        checked: false,
        message: `Deal is in status: ${deal.status}, not waiting for deposit`
      };
    }

    await this.checkDealDeposit(deal);

    // Reload deal to get updated status
    await deal.reload();

    return {
      checked: true,
      depositFound: deal.status === 'locked',
      deal
    };
  }
}

// Export singleton instance
module.exports = new DepositMonitor();
