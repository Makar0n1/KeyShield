const Dispute = require('../models/Dispute');
const Deal = require('../models/Deal');
const User = require('../models/User');
const Session = require('../models/Session');
const AuditLog = require('../models/AuditLog');
const Transaction = require('../models/Transaction');
const MultisigWallet = require('../models/MultisigWallet');
const dealService = require('./dealService');
const blockchainService = require('./blockchain');
const feesaverService = require('./feesaver');
const priceService = require('./priceService');
const constants = require('../config/constants');
const TronWeb = require('tronweb');
const notificationService = require('./notificationService');
const messageManager = require('../bot/utils/messageManager');

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
      // Notify WINNER - request private key
      const winnerText = `✅ *Спор решён в вашу пользу!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

💰 *Для получения средств введите ваш приватный ключ:*

💸 К получению: *${payoutAmount.toFixed(2)} ${deal.asset}*
📊 Комиссия сервиса: ${commission.toFixed(2)} ${deal.asset}

⚠️ Это ключ, который был выдан вам при указании кошелька.

❗️ *Без ввода ключа средства НЕ будут переведены!*
❗️ *Если вы потеряли ключ - средства останутся заблокированными навсегда!*`;

      const winnerKeyboard = {
        inline_keyboard: [
          [{ text: '🏠 Главное меню', callback_data: 'main_menu' }]
        ]
      };

      try {
        await messageManager.showNotification(ctx, winnerId, winnerText, winnerKeyboard);
        console.log(`📬 Key request sent to winner for deal ${deal.dealId}`);
      } catch (error) {
        console.error(`Error sending key request to winner:`, error.message);
      }

      // Notify LOSER - inform about loss streak
      let loserText = `❌ *Спор решён не в вашу пользу*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

⚠️ *Проигранных споров подряд: ${lossStreak} из 3*`;

      if (isNowBanned) {
        loserText += `

🚫 *Ваш аккаунт заблокирован!*
Вы проиграли 3 спора подряд.

Заблокированные пользователи не могут:
• Создавать новые сделки
• Участвовать в сделках как контрагент

Для разблокировки обратитесь в поддержку: @mamlyga`;
      } else {
        loserText += `

_После 3 проигранных споров подряд — автоматическая блокировка аккаунта._
_Счётчик сбрасывается после первой победы в споре._`;
      }

      try {
        await messageManager.showNotification(ctx, loserId, loserText, winnerKeyboard);
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
    const banText = `🚫 *Ваш аккаунт заблокирован*

Вы проиграли 3 спора подряд, что привело к автоматической блокировке аккаунта.

Заблокированные пользователи не могут:
• Создавать новые сделки
• Участвовать в сделках как контрагент

Если вы считаете, что блокировка ошибочна, обратитесь в поддержку:

📧 support@keyshield.io
💬 @keyshield\\_support`;

    try {
      // Use notificationService which uses DELETE+SEND pattern
      await notificationService.sendNotification(userId, banText, {});
      console.log(`📤 Ban notification sent to user ${userId}`);
    } catch (error) {
      console.error(`❌ Failed to send ban notification to user ${userId}:`, error.message);
    }
  }

  /**
   * Process payout for resolved dispute
   * Full flow: FeeSaver → TRX fallback → USDT transactions → return TRX → save costs
   *
   * @param {Object} deal - Deal document
   * @param {string} decision - 'refund_buyer' or 'release_seller'
   * @param {number} arbiterId - Arbiter user ID
   * @returns {Promise<Object>} - Payout result
   */
  async processDisputePayout(deal, decision, arbiterId) {
    const dealId = deal.dealId;
    console.log(`\n💰 Processing dispute payout for deal ${dealId}, decision: ${decision}`);

    // Get multisig wallet
    const multisig = await MultisigWallet.findOne({ _id: deal.multisigWalletId });
    if (!multisig) {
      throw new Error(`Multisig wallet not found for deal ${dealId}`);
    }

    const multisigAddress = multisig.address;
    console.log(`📍 Multisig address: ${multisigAddress}`);

    // Get arbiter wallet for signing
    const arbiterKey = process.env.ARBITER_PRIVATE_KEY;
    if (!arbiterKey) {
      throw new Error('ARBITER_PRIVATE_KEY not configured');
    }

    // Get commission wallet
    const commissionWallet = process.env.COMMISSION_WALLET;
    if (!commissionWallet) {
      throw new Error('COMMISSION_WALLET not configured');
    }

    // Determine recipient based on decision
    const isRefund = decision === 'refund_buyer';
    const recipientWallet = isRefund ? deal.buyerWallet : deal.sellerWallet;
    const recipientId = isRefund ? deal.buyerId : deal.sellerId;
    const recipientRole = isRefund ? 'buyer' : 'seller';

    if (!recipientWallet) {
      throw new Error(`${recipientRole} wallet not set for deal ${dealId}`);
    }

    console.log(`👤 Recipient (${recipientRole}): ${recipientWallet}`);

    // Calculate amounts
    const totalAmount = deal.totalAmount; // Amount in USDT with commission
    const commission = deal.commission;
    const netAmount = totalAmount - commission; // Amount to recipient

    console.log(`💵 Total: ${totalAmount} USDT, Commission: ${commission} USDT, Net to ${recipientRole}: ${netAmount} USDT`);

    // Track costs for logging
    let trxSent = 0;
    let trxReturned = 0;
    let feesaverUsed = false;
    let feesaverCost = 0;

    // ========================================
    // STEP 1: Energy provision (FeeSaver or TRX)
    // ========================================
    let useFeeSaver = feesaverService.isEnabled();

    if (useFeeSaver) {
      console.log('⚡ Attempting to rent energy from FeeSaver...');
      try {
        const rentResult = await feesaverService.rentEnergyForDeal(multisigAddress);
        if (rentResult.success) {
          feesaverUsed = true;
          feesaverCost = rentResult.cost || 0;
          console.log(`✅ FeeSaver energy rented successfully, cost: ${feesaverCost} TRX`);
        } else {
          console.log(`⚠️ FeeSaver failed: ${rentResult.error}, falling back to TRX`);
          useFeeSaver = false;
        }
      } catch (error) {
        console.log(`⚠️ FeeSaver error: ${error.message}, falling back to TRX`);
        useFeeSaver = false;
      }
    }

    // If FeeSaver not used, send TRX for energy
    if (!useFeeSaver) {
      console.log('💰 Sending TRX for transaction energy...');
      const trxForEnergy = 30; // 30 TRX for 2 USDT transactions

      try {
        const trxResult = await blockchainService.sendTRX(multisigAddress, trxForEnergy);
        if (trxResult.success) {
          trxSent = trxForEnergy;
          console.log(`✅ Sent ${trxForEnergy} TRX to multisig, txid: ${trxResult.txid}`);

          // Wait for TRX to arrive
          await this.sleep(5000);
        } else {
          throw new Error(`Failed to send TRX: ${trxResult.error}`);
        }
      } catch (error) {
        throw new Error(`TRX transfer failed: ${error.message}`);
      }
    }

    // ========================================
    // STEP 2: Send USDT to recipient
    // ========================================
    console.log(`\n📤 Sending ${netAmount} USDT to ${recipientRole}...`);

    let mainTxId;
    try {
      const mainResult = await blockchainService.sendUSDTFromMultisig(
        multisigAddress,
        recipientWallet,
        netAmount,
        arbiterKey
      );

      if (!mainResult.success) {
        throw new Error(`USDT transfer to ${recipientRole} failed: ${mainResult.error}`);
      }

      mainTxId = mainResult.txid;
      console.log(`✅ Sent ${netAmount} USDT to ${recipientRole}, txid: ${mainTxId}`);

      // Record transaction
      await Transaction.create({
        deal: deal._id,
        type: isRefund ? 'refund' : 'release',
        from: multisigAddress,
        to: recipientWallet,
        amount: netAmount,
        currency: 'USDT',
        txid: mainTxId,
        status: 'confirmed',
        metadata: {
          reason: 'dispute_resolution',
          decision,
          arbiterId
        }
      });

    } catch (error) {
      console.error(`❌ Failed to send USDT to ${recipientRole}:`, error.message);
      throw error;
    }

    // Wait between transactions
    await this.sleep(5000);

    // ========================================
    // STEP 3: Send commission
    // ========================================
    console.log(`\n📤 Sending ${commission} USDT commission...`);

    let commissionTxId;
    try {
      const commissionResult = await blockchainService.sendUSDTFromMultisig(
        multisigAddress,
        commissionWallet,
        commission,
        arbiterKey
      );

      if (!commissionResult.success) {
        console.error(`⚠️ Commission transfer failed: ${commissionResult.error}`);
        // Don't throw - main payment succeeded
      } else {
        commissionTxId = commissionResult.txid;
        console.log(`✅ Sent ${commission} USDT commission, txid: ${commissionTxId}`);

        // Record commission transaction
        await Transaction.create({
          deal: deal._id,
          type: 'commission',
          from: multisigAddress,
          to: commissionWallet,
          amount: commission,
          currency: 'USDT',
          txid: commissionTxId,
          status: 'confirmed',
          metadata: {
            reason: 'dispute_resolution',
            decision,
            arbiterId
          }
        });
      }
    } catch (error) {
      console.error(`⚠️ Commission transfer error: ${error.message}`);
      // Don't throw - main payment succeeded
    }

    // ========================================
    // STEP 4: Return leftover TRX to arbiter
    // ========================================
    if (trxSent > 0) {
      console.log('\n💰 Returning leftover TRX to arbiter...');
      await this.sleep(10000); // Wait for USDT transactions to fully confirm

      try {
        const returnResult = await this.returnLeftoverTRX(multisig, arbiterKey);
        if (returnResult.success) {
          trxReturned = returnResult.amount;
          console.log(`✅ Returned ${trxReturned} TRX to arbiter`);
        }
      } catch (error) {
        console.error(`⚠️ TRX return error: ${error.message}`);
      }
    }

    // ========================================
    // STEP 5: Save operational costs
    // ========================================
    try {
      await this.saveOperationalCosts(deal, {
        trxSent,
        trxReturned,
        feesaverUsed,
        feesaverCost,
        operation: 'dispute_resolution',
        decision
      });
    } catch (error) {
      console.error(`⚠️ Failed to save operational costs: ${error.message}`);
    }

    console.log(`\n✅ Dispute payout completed for deal ${dealId}`);
    console.log(`   ${recipientRole} received: ${netAmount} USDT`);
    console.log(`   Commission: ${commission} USDT`);
    console.log(`   TRX sent: ${trxSent}, returned: ${trxReturned}, net cost: ${trxSent - trxReturned}`);
    if (feesaverUsed) {
      console.log(`   FeeSaver cost: ${feesaverCost} TRX`);
    }

    return {
      success: true,
      recipientWallet,
      netAmount,
      commission,
      mainTxId,
      commissionTxId,
      trxSent,
      trxReturned,
      feesaverUsed,
      feesaverCost
    };
  }

  /**
   * Return leftover TRX from multisig to arbiter wallet
   */
  async returnLeftoverTRX(multisig, arbiterKey) {
    const tronWeb = new TronWeb({
      fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
      privateKey: arbiterKey
    });

    // Get arbiter address from key
    const arbiterAddress = tronWeb.address.fromPrivateKey(arbiterKey);

    // Get multisig TRX balance
    const balance = await tronWeb.trx.getBalance(multisig.address);
    const balanceTRX = balance / 1_000_000;

    // Leave 1 TRX for account rent, return the rest
    const minKeep = 1;
    const toReturn = balanceTRX - minKeep;

    if (toReturn <= 0.1) {
      console.log(`   TRX balance too low to return: ${balanceTRX} TRX`);
      return { success: false, amount: 0 };
    }

    console.log(`   Multisig TRX balance: ${balanceTRX}, returning: ${toReturn} TRX`);

    // Build and sign transaction
    const toReturnSun = Math.floor(toReturn * 1_000_000);

    const unsignedTx = await tronWeb.transactionBuilder.sendTrx(
      arbiterAddress,
      toReturnSun,
      multisig.address
    );

    // Sign with arbiter key (for multisig, arbiter has authority)
    const signedTx = await tronWeb.trx.sign(unsignedTx, arbiterKey);
    const broadcast = await tronWeb.trx.sendRawTransaction(signedTx);

    if (broadcast.result) {
      return { success: true, amount: toReturn, txid: broadcast.txid };
    } else {
      return { success: false, amount: 0, error: 'Broadcast failed' };
    }
  }

  /**
   * Save operational costs to database
   */
  async saveOperationalCosts(deal, costs) {
    const { trxSent, trxReturned, feesaverUsed, feesaverCost, operation, decision } = costs;

    // Get current TRX price in USD
    let trxPriceUsd = 0.12; // Default fallback
    try {
      const prices = await priceService.getPrices();
      if (prices.TRX) {
        trxPriceUsd = prices.TRX;
      }
    } catch (e) {
      console.log('   Using default TRX price');
    }

    const netTrxCost = trxSent - trxReturned;
    const totalTrxCost = feesaverUsed ? feesaverCost : netTrxCost;
    const costInUsd = totalTrxCost * trxPriceUsd;

    // Update deal with operational costs
    await Deal.updateOne(
      { _id: deal._id },
      {
        $set: {
          'operationalCosts.trxSent': trxSent,
          'operationalCosts.trxReturned': trxReturned,
          'operationalCosts.feesaverUsed': feesaverUsed,
          'operationalCosts.feesaverCost': feesaverCost,
          'operationalCosts.netCostTrx': totalTrxCost,
          'operationalCosts.netCostUsd': costInUsd,
          'operationalCosts.trxPriceAtCompletion': trxPriceUsd
        }
      }
    );

    // Log to audit
    await AuditLog.log(0, 'operational_costs', {
      dealId: deal.dealId,
      operation,
      decision,
      trxSent,
      trxReturned,
      feesaverUsed,
      feesaverCost,
      netCostTrx: totalTrxCost,
      netCostUsd: costInUsd
    }, { dealId: deal._id });

    console.log(`   Operational costs saved: ${totalTrxCost} TRX ($${costInUsd.toFixed(2)})`);
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
