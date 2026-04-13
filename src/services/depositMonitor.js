const Deal = require('../models/Deal');
const Transaction = require('../models/Transaction');
const MultisigWallet = require('../models/MultisigWallet');
const AuditLog = require('../models/AuditLog');
const ServiceStatus = require('../models/ServiceStatus');
const blockchainService = require('./blockchain');
const adminAlertService = require('./adminAlertService');
const constants = require('../config/constants');
const messageManager = require('../bot/utils/messageManager');
const { depositReceivedKeyboard, mainMenuButton } = require('../bot/keyboards/main');
const User = require('../models/User');
const { t, formatDate } = require('../locales');

// High-load optimization utilities
const RateLimiter = require('../utils/RateLimiter');
const BoundedSet = require('../utils/BoundedSet');

const SERVICE_NAME = 'DepositMonitor';

class DepositMonitor {
  constructor() {
    this.isRunning = false;
    this.isChecking = false; // Prevent overlapping check cycles
    this.interval = null;
    this.botInstance = null;

    // Performance settings
    this.BATCH_SIZE = 8; // Process 8 deals in parallel (TronGrid limit ~10 req/sec)
    this.BATCH_DELAY = 1000; // 1 second delay between batches

    // TronGrid rate limiter (8 req/sec to stay under 10 limit)
    this.rateLimiter = new RateLimiter({ maxReqPerSec: 8 });

    // Activation queue to prevent parallel blockchain transactions from same wallet
    this.activationQueue = [];
    this.isProcessingActivations = false;

    // Track processed deposits to prevent duplicates (bounded to prevent memory leaks)
    this.processedDeposits = new BoundedSet(5000);

    // Auto-cancel deals waiting for deposit longer than 24 hours
    this.DEPOSIT_TIMEOUT_HOURS = 24;
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
  async start() {
    if (this.isRunning) {
      console.log('⚠️  Deposit monitor already running');
      return;
    }

    console.log('✅ Starting deposit monitor...');
    this.isRunning = true;

    // Mark service as started in DB
    try {
      await ServiceStatus.markStarted(SERVICE_NAME);
    } catch (e) {
      console.error('Failed to update service status:', e.message);
    }

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
  async stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;

    // Mark service as stopped in DB
    try {
      await ServiceStatus.markStopped(SERVICE_NAME);
    } catch (e) {
      console.error('Failed to update service status:', e.message);
    }

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
      // Cancel deals that have been waiting for deposit too long
      await this.cancelExpiredDeposits();

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

      // Update heartbeat in DB
      try {
        await ServiceStatus.heartbeat(SERVICE_NAME, {
          lastCheckDeals: deals.length,
          lastCheckAt: new Date()
        });
      } catch (e) {
        // Ignore heartbeat errors
      }
    } catch (error) {
      console.error('Error in deposit monitor:', error);
      // Log error to service status
      try {
        await ServiceStatus.logError(SERVICE_NAME, error);
      } catch (e) {
        // Ignore
      }
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Cancel deals that have been in waiting_for_deposit for too long
   */
  async cancelExpiredDeposits() {
    try {
      const cutoff = new Date(Date.now() - this.DEPOSIT_TIMEOUT_HOURS * 60 * 60 * 1000);

      const expiredDeals = await Deal.find({
        status: 'waiting_for_deposit',
        updatedAt: { $lt: cutoff }
      }).lean();

      if (expiredDeals.length === 0) return;

      console.log(`⏰ Found ${expiredDeals.length} deal(s) with expired deposit timeout...`);

      for (const deal of expiredDeals) {
        try {
          // Atomic update — only cancel if still waiting_for_deposit
          const updated = await Deal.findOneAndUpdate(
            { _id: deal._id, status: 'waiting_for_deposit' },
            { $set: { status: 'cancelled' } },
            { new: true }
          );

          if (!updated) continue;

          // Log
          await AuditLog.log(0, 'deal_deposit_timeout', {
            dealId: deal.dealId,
            waitedHours: this.DEPOSIT_TIMEOUT_HOURS
          }, { dealId: deal._id });

          // Notify both parties
          if (this.botInstance) {
            const ctx = { telegram: this.botInstance.telegram };
            const creatorId = deal.creatorRole === 'buyer' ? deal.buyerId : deal.sellerId;
            const counterpartyId = deal.creatorRole === 'buyer' ? deal.sellerId : deal.buyerId;

            const msgParams = {
              dealId: deal.dealId,
              productName: deal.productName,
              amount: deal.amount,
              asset: deal.asset
            };

            // Notify creator
            try {
              const creatorUser = await User.findOne({ telegramId: creatorId }).select('languageCode').lean();
              const creatorLang = creatorUser?.languageCode || 'ru';
              await messageManager.showNotification(ctx, creatorId, t(creatorLang, 'deposit.timeout_creator', msgParams), mainMenuButton(creatorLang));
            } catch (e) {
              console.error(`Error notifying creator ${creatorId}:`, e.message);
            }

            // Notify counterparty
            if (counterpartyId && counterpartyId !== 0) {
              try {
                const cpUser = await User.findOne({ telegramId: counterpartyId }).select('languageCode').lean();
                const cpLang = cpUser?.languageCode || 'ru';
                await messageManager.showNotification(ctx, counterpartyId, t(cpLang, 'deposit.timeout_counterparty', msgParams), mainMenuButton(cpLang));
              } catch (e) {
                console.error(`Error notifying counterparty ${counterpartyId}:`, e.message);
              }
            }
          }

          console.log(`⏰ Deal ${deal.dealId} cancelled — deposit timeout (${this.DEPOSIT_TIMEOUT_HOURS}h)`);
        } catch (error) {
          console.error(`Error cancelling expired deal ${deal.dealId}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Error in cancelExpiredDeposits:', error.message);
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

      // Wait for rate limit token before API call
      await this.rateLimiter.waitForToken();

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
            // Load buyer language
            const buyerUser = await User.findOne({ telegramId: deal.buyerId }).select('languageCode').lean();
            const buyerLang = buyerUser?.languageCode || 'ru';

            const warningText = t(buyerLang, 'deposit.insufficient', {
              dealId: deal.dealId,
              received: deposit.amount,
              expected: expectedAmount,
              shortfall: shortfall.toFixed(2),
              asset: deal.asset,
              multisigAddress: deal.multisigAddress,
              tolerance
            });

            const warningKeyboard = depositReceivedKeyboard(deal.dealId, buyerLang);
            const warningCtx = { telegram: this.botInstance.telegram };
            await messageManager.showNotification(warningCtx, deal.buyerId, warningText, warningKeyboard);
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

          // ATOMIC status update - prevents race conditions!
          // Only update if status is still 'waiting_for_deposit'
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

          // Atomic update: only succeeds if status is still 'waiting_for_deposit'
          const updatedDeal = await Deal.findOneAndUpdate(
            { _id: deal._id, status: 'waiting_for_deposit' }, // Atomic condition!
            { $set: updateData },
            { new: true }
          );

          if (!updatedDeal) {
            // Another process already updated this deal (cancelled, etc.)
            console.log(`⏭️ Deal ${deal.dealId} status changed by another process, skipping...`);
            return;
          }

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
              // Load buyer language
              const buyerUserDoc = await User.findOne({ telegramId: deal.buyerId }).select('languageCode').lean();
              const buyerLang = buyerUserDoc?.languageCode || 'ru';

              // Prepare overpayment message if applicable
              let overpaymentNote = '';
              if (overpayment > 0) {
                overpaymentNote = t(buyerLang, 'deposit.overpayment', {
                  overpayment: overpayment.toFixed(2),
                  asset: deal.asset
                });
              }

              // Notify buyer
              const buyerText = t(buyerLang, 'deposit.buyer_confirmed', {
                dealId: deal.dealId,
                productName: deal.productName,
                depositAmount: deposit.amount,
                dealAmount: deal.amount,
                asset: deal.asset,
                overpaymentNote,
                txHash: deposit.txHash
              });

              const buyerKeyboard = depositReceivedKeyboard(deal.dealId, buyerLang);
              const buyerCtx = { telegram: this.botInstance.telegram };
              await messageManager.showNotification(buyerCtx, deal.buyerId, buyerText, buyerKeyboard);

              // Calculate seller payout amount
              let sellerPayout = deal.amount;
              if (deal.commissionType === 'seller') {
                sellerPayout = deal.amount - deal.commission;
              } else if (deal.commissionType === 'split') {
                sellerPayout = deal.amount - (deal.commission / 2);
              }

              // Load seller language
              const sellerUserDoc = await User.findOne({ telegramId: deal.sellerId }).select('languageCode').lean();
              const sellerLang = sellerUserDoc?.languageCode || 'ru';

              // Notify seller
              const sellerText = t(sellerLang, 'deposit.seller_funded', {
                dealId: deal.dealId,
                productName: deal.productName,
                dealAmount: deal.amount,
                asset: deal.asset,
                sellerPayout: sellerPayout.toFixed(2)
              });

              const sellerKeyboard = depositReceivedKeyboard(deal.dealId, sellerLang);
              const sellerCtx = { telegram: this.botInstance.telegram };
              await messageManager.showNotification(sellerCtx, deal.sellerId, sellerText, sellerKeyboard);

              // Mark notification as sent to prevent duplicates on bot restart
              await Deal.updateOne(
                { _id: deal._id },
                { $set: { depositNotificationSent: true } }
              );

              // Alert admin about deposit
              await adminAlertService.alertDepositReceived(deal, deposit.amount);

              // Track successful deposit for health monitoring
              try {
                await ServiceStatus.trackSuccess('deposit_received', {
                  dealId: deal.dealId,
                  amount: deposit.amount
                });
              } catch (e) { /* ignore */ }

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
      // Find deals that are locked, have deposit, but notification NOT sent yet
      const lockedDeals = await Deal.find({
        status: 'locked',
        depositTxHash: { $ne: null },
        depositNotificationSent: { $ne: true } // Only deals where notification wasn't sent
      });

      if (lockedDeals.length === 0) {
        return;
      }

      console.log(`📬 Found ${lockedDeals.length} locked deal(s) with pending notifications...`);

      for (const deal of lockedDeals) {
        // Send notifications if bot instance is available
        if (this.botInstance && deal.depositTxHash) {
          try {
            // Load buyer language
            const buyerUserDoc = await User.findOne({ telegramId: deal.buyerId }).select('languageCode').lean();
            const buyerLang = buyerUserDoc?.languageCode || 'ru';

            const buyerText = t(buyerLang, 'deposit.buyer_confirmed_short', {
              dealId: deal.dealId,
              amount: deal.amount,
              asset: deal.asset,
              txHash: deal.depositTxHash
            });

            const buyerKeyboard = depositReceivedKeyboard(deal.dealId, buyerLang);
            const buyerCtx = { telegram: this.botInstance.telegram };
            await messageManager.showNotification(buyerCtx, deal.buyerId, buyerText, buyerKeyboard);

            // Load seller language
            const sellerUserDoc = await User.findOne({ telegramId: deal.sellerId }).select('languageCode').lean();
            const sellerLang = sellerUserDoc?.languageCode || 'ru';

            const sellerText = t(sellerLang, 'deposit.seller_funded_short', {
              dealId: deal.dealId,
              productName: deal.productName,
              amount: deal.amount,
              asset: deal.asset
            });

            const sellerKeyboard = depositReceivedKeyboard(deal.dealId, sellerLang);
            const sellerCtx = { telegram: this.botInstance.telegram };
            await messageManager.showNotification(sellerCtx, deal.sellerId, sellerText, sellerKeyboard);

            // Mark notification as sent to prevent duplicates on restart
            await Deal.updateOne(
              { _id: deal._id },
              { $set: { depositNotificationSent: true } }
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
