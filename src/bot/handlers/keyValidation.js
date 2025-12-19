/**
 * Key Validation Handler
 *
 * Handles private key validation for payouts:
 * - acceptWork: seller must input key to receive funds
 * - deadline expired (work not done): buyer must input key for refund
 * - deadline expired (work submitted): seller must input key for release
 * - dispute resolved: winner must input key for payout
 */

const Session = require('../../models/Session');
const Deal = require('../../models/Deal');
const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const MultisigWallet = require('../../models/MultisigWallet');
const AuditLog = require('../../models/AuditLog');
const blockchainService = require('../../services/blockchain');
const feesaverService = require('../../services/feesaver');
const messageManager = require('../utils/messageManager');
const { mainMenuButton, backButton } = require('../keyboards/main');

/**
 * Check if user has active key validation session
 */
async function hasKeyValidationSession(telegramId) {
  const session = await Session.getSession(telegramId, 'key_validation');
  return !!session;
}

/**
 * Clear key validation session
 */
async function clearKeyValidationSession(telegramId) {
  await Session.deleteSession(telegramId, 'key_validation');
}

/**
 * Create key validation session
 * @param {number} telegramId - User telegram ID
 * @param {string} dealId - Deal ID
 * @param {string} type - Validation type: 'seller_payout', 'buyer_refund', 'seller_release', 'dispute_buyer', 'dispute_seller'
 * @param {Object} extraData - Additional data (e.g., buyerId for notifications)
 */
async function createKeyValidationSession(telegramId, dealId, type, extraData = {}) {
  await Session.setSession(telegramId, 'key_validation', {
    dealId,
    type,
    attempts: 0,
    ...extraData
  }, 24); // TTL 24 hours
}

/**
 * Handle key validation input
 * Main function that processes private key input from users
 */
async function handleKeyValidationInput(ctx) {
  const telegramId = ctx.from.id;
  const inputKey = ctx.message.text.trim();

  // Delete user message immediately (key should not stay in chat!)
  await messageManager.deleteUserMessage(ctx);

  // Get session
  const session = await Session.getSession(telegramId, 'key_validation');
  if (!session) return false;

  // Get deal with private keys
  const deal = await Deal.findOne({ dealId: session.dealId })
    .select('+buyerPrivateKey +sellerPrivateKey +buyerKey +sellerKey +arbiterKey');

  if (!deal) {
    await clearKeyValidationSession(telegramId);
    return false;
  }

  // Determine which key to validate against
  let expectedKey;
  let isSellerKey = false;

  switch (session.type) {
    case 'seller_payout':
    case 'seller_release':
    case 'dispute_seller':
      expectedKey = deal.sellerPrivateKey;
      isSellerKey = true;
      break;
    case 'buyer_refund':
    case 'dispute_buyer':
      expectedKey = deal.buyerPrivateKey;
      isSellerKey = false;
      break;
    default:
      console.error(`Unknown key validation type: ${session.type}`);
      await clearKeyValidationSession(telegramId);
      return false;
  }

  // Increment attempts
  session.attempts = (session.attempts || 0) + 1;
  await Session.setSession(telegramId, 'key_validation', session, 24);

  // === VALIDATE KEY ===
  if (inputKey === expectedKey) {
    // ✅ KEY CORRECT - process payout
    await clearKeyValidationSession(telegramId);

    // Process payout based on type
    switch (session.type) {
      case 'seller_payout':
        await processSellerPayout(ctx, deal, session.buyerId);
        break;
      case 'seller_release':
        await processSellerRelease(ctx, deal);
        break;
      case 'buyer_refund':
        await processBuyerRefund(ctx, deal);
        break;
      case 'dispute_buyer':
        await processDisputePayout(ctx, deal, 'buyer');
        break;
      case 'dispute_seller':
        await processDisputePayout(ctx, deal, 'seller');
        break;
    }
    return true;
  }

  // ❌ KEY INCORRECT
  let errorText;

  if (session.attempts >= 3) {
    errorText = `❌ *Неверный ключ!*

Попытка ${session.attempts}

⚠️ Если вы потеряли ключ, обратитесь в поддержку: @keyshield_support

Попробуйте ещё раз:`;
  } else {
    errorText = `❌ *Неверный ключ!*

Попытка ${session.attempts} из 3

Введите ваш приватный ключ ещё раз:`;
  }

  const keyboard = mainMenuButton();
  await messageManager.updateScreen(ctx, telegramId, 'key_error', errorText, keyboard);
  return true;
}

// ============================================
// PAYOUT PROCESSING FUNCTIONS
// ============================================

/**
 * Process seller payout (after buyer accepts work)
 */
async function processSellerPayout(ctx, deal, buyerId) {
  const telegramId = deal.sellerId;
  let energyMethod = 'none';
  let totalFeesaverCost = 0;
  let trxReturned = 0;

  try {
    // Get multisig wallet
    const wallet = await MultisigWallet.findOne({ dealId: deal._id }).select('+privateKey');
    if (!wallet || !wallet.privateKey) {
      throw new Error('Multisig wallet key not found');
    }

    // Get balance
    const balance = await blockchainService.getBalance(deal.multisigAddress, deal.asset);
    if (balance <= 0) {
      throw new Error('Insufficient balance');
    }

    // Calculate amounts
    const commission = deal.commission;
    const releaseAmount = balance - commission;

    if (releaseAmount <= 0) {
      throw new Error('Balance too low for payout');
    }

    console.log(`💸 Processing seller payout for deal ${deal.dealId}: ${releaseAmount} ${deal.asset}`);

    // Check if FeeSaver is available
    const useFeeSaver = feesaverService.isEnabled();
    const FALLBACK_AMOUNT = parseInt(process.env.FALLBACK_TRX_AMOUNT) || 30;

    // If not using FeeSaver, send fallback TRX upfront
    if (!useFeeSaver) {
      console.log(`⚠️ FeeSaver not available, using TRX fallback (${FALLBACK_AMOUNT} TRX)`);
      const trxResult = await blockchainService.sendTRX(
        process.env.ARBITER_PRIVATE_KEY,
        deal.multisigAddress,
        FALLBACK_AMOUNT
      );
      if (trxResult.success) {
        console.log(`✅ Sent ${FALLBACK_AMOUNT} TRX to multisig: ${trxResult.txHash}`);
        await new Promise(r => setTimeout(r, 3000));
        energyMethod = 'trx';
      } else {
        throw new Error(`Failed to send TRX: ${trxResult.message}`);
      }
    }

    // ============================================
    // 1. FIRST TRANSFER: Release to seller
    // ============================================

    // 🔋 Rent 65k energy for first transfer (if using FeeSaver)
    if (useFeeSaver) {
      try {
        console.log(`🔋 Renting 65k energy for main payout...`);
        const rental1 = await feesaverService.rentEnergy(deal.multisigAddress, 65000, '1h');
        if (rental1.status === 'Filled') {
          totalFeesaverCost += parseFloat(rental1.summa) || 0;
          energyMethod = 'feesaver';
          console.log(`✅ Energy rental #1 successful (cost: ${rental1.summa} TRX)`);
          await feesaverService.waitForDelegation(10);
        } else {
          throw new Error('Energy rental not filled');
        }
      } catch (error) {
        console.error(`⚠️ Energy rental #1 failed: ${error.message}`);
        // Fallback to TRX
        const trxResult = await blockchainService.sendTRX(
          process.env.ARBITER_PRIVATE_KEY,
          deal.multisigAddress,
          FALLBACK_AMOUNT
        );
        if (trxResult.success) {
          await new Promise(r => setTimeout(r, 3000));
          energyMethod = 'trx';
        } else {
          throw new Error(`Failed to send fallback TRX: ${trxResult.message}`);
        }
      }
    }

    // Create and send release transaction
    const releaseTx = await blockchainService.createReleaseTransaction(
      deal.multisigAddress,
      deal.sellerAddress,
      releaseAmount,
      deal.asset
    );

    const signedReleaseTx = await blockchainService.signTransaction(releaseTx, wallet.privateKey);
    const releaseResult = await blockchainService.broadcastTransaction(signedReleaseTx);

    if (!releaseResult.success) {
      throw new Error(`Release transaction failed: ${releaseResult.error}`);
    }

    console.log(`✅ Release successful: ${releaseResult.txHash}`);

    // Record transaction
    const releaseTransaction = new Transaction({
      dealId: deal._id,
      type: 'release',
      asset: deal.asset,
      amount: releaseAmount,
      txHash: releaseResult.txHash,
      status: 'confirmed',
      fromAddress: deal.multisigAddress,
      toAddress: deal.sellerAddress
    });
    releaseTransaction.generateExplorerLink();
    await releaseTransaction.save();

    // ============================================
    // 2. SECOND TRANSFER: Commission to service
    // ============================================

    if (commission > 0) {
      // Wait a bit before second transfer
      await new Promise(r => setTimeout(r, 3000));

      // 🔋 Rent 65k energy for commission transfer (if using FeeSaver)
      if (useFeeSaver && energyMethod === 'feesaver') {
        try {
          console.log(`🔋 Renting 65k energy for commission transfer...`);
          const rental2 = await feesaverService.rentEnergy(deal.multisigAddress, 65000, '1h');
          if (rental2.status === 'Filled') {
            totalFeesaverCost += parseFloat(rental2.summa) || 0;
            console.log(`✅ Energy rental #2 successful (cost: ${rental2.summa} TRX)`);
            await feesaverService.waitForDelegation(10);
          } else {
            console.warn(`⚠️ Energy rental #2 not filled, trying anyway...`);
          }
        } catch (error) {
          console.error(`⚠️ Energy rental #2 failed: ${error.message}, trying anyway...`);
        }
      }

      const commissionTx = await blockchainService.createReleaseTransaction(
        deal.multisigAddress,
        process.env.SERVICE_WALLET_ADDRESS,
        commission,
        deal.asset
      );
      const signedCommissionTx = await blockchainService.signTransaction(commissionTx, wallet.privateKey);
      const commissionResult = await blockchainService.broadcastTransaction(signedCommissionTx);

      if (commissionResult.success) {
        const commissionTransaction = new Transaction({
          dealId: deal._id,
          type: 'fee',
          asset: deal.asset,
          amount: commission,
          txHash: commissionResult.txHash,
          status: 'confirmed',
          toAddress: process.env.SERVICE_WALLET_ADDRESS
        });
        commissionTransaction.generateExplorerLink();
        await commissionTransaction.save();
        console.log(`✅ Commission transferred: ${commissionResult.txHash}`);
      } else {
        console.error(`❌ Commission transfer failed: ${commissionResult.error}`);
      }
    }

    // Update deal status
    await Deal.findByIdAndUpdate(deal._id, {
      status: 'completed',
      pendingKeyValidation: null,
      completedAt: new Date()
    });

    // Return leftover TRX only if fallback was used (FeeSaver keeps 1 TRX for bandwidth)
    if (energyMethod === 'trx') {
      trxReturned = await returnLeftoverTRX(deal, wallet.privateKey);
    }

    // Save operational costs
    await saveOperationalCosts(deal, energyMethod, totalFeesaverCost, trxReturned, 'seller_payout');

    // Notify seller (success)
    const sellerText = `✅ *Средства получены!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

💸 Получено: *${releaseAmount.toFixed(2)} ${deal.asset}*
📊 Комиссия сервиса: ${commission.toFixed(2)} ${deal.asset}

[Транзакция](https://tronscan.org/#/transaction/${releaseResult.txHash})`;

    const keyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'payout_complete', sellerText, keyboard);

    // Notify buyer
    if (buyerId) {
      const buyerText = `✅ *Сделка завершена!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

Продавец подтвердил получение средств.
Сделка успешно завершена!

[Транзакция](https://tronscan.org/#/transaction/${releaseResult.txHash})`;

      await messageManager.showNotification(ctx, buyerId, buyerText, keyboard);
    }

    // Audit log
    await AuditLog.create({
      action: 'DEAL_COMPLETED',
      userId: telegramId,
      dealId: deal._id,
      details: {
        dealId: deal.dealId,
        releaseAmount,
        commission,
        txHash: releaseResult.txHash
      }
    });

  } catch (error) {
    console.error(`❌ Error processing seller payout:`, error);

    const errorText = `❌ *Ошибка выплаты*

🆔 Сделка: \`${deal.dealId}\`
Ошибка: ${error.message}

Пожалуйста, свяжитесь с поддержкой: @keyshield_support`;

    const keyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'payout_error', errorText, keyboard);
  }
}

/**
 * Process seller release (after deadline + grace period, work was submitted)
 */
async function processSellerRelease(ctx, deal) {
  // Same logic as processSellerPayout but with different notifications
  await processSellerPayout(ctx, deal, deal.buyerId);
}

/**
 * Process buyer refund (after deadline + grace period, work not done)
 */
async function processBuyerRefund(ctx, deal) {
  const telegramId = deal.buyerId;
  let energyMethod = 'none';
  let totalFeesaverCost = 0;
  let trxReturned = 0;

  try {
    // Get multisig wallet
    const wallet = await MultisigWallet.findOne({ dealId: deal._id }).select('+privateKey');
    if (!wallet || !wallet.privateKey) {
      throw new Error('Multisig wallet key not found');
    }

    // Get balance
    const balance = await blockchainService.getBalance(deal.multisigAddress, deal.asset);
    if (balance <= 0) {
      throw new Error('Insufficient balance');
    }

    // Calculate amounts (commission is still taken on refund)
    const commission = deal.commission;
    const refundAmount = balance - commission;

    if (refundAmount <= 0) {
      throw new Error('Balance too low for refund');
    }

    console.log(`💸 Processing buyer refund for deal ${deal.dealId}: ${refundAmount} ${deal.asset}`);

    // Check if FeeSaver is available
    const useFeeSaver = feesaverService.isEnabled();
    const FALLBACK_AMOUNT = parseInt(process.env.FALLBACK_TRX_AMOUNT) || 30;

    // If not using FeeSaver, send fallback TRX upfront
    if (!useFeeSaver) {
      console.log(`⚠️ FeeSaver not available, using TRX fallback (${FALLBACK_AMOUNT} TRX)`);
      const trxResult = await blockchainService.sendTRX(
        process.env.ARBITER_PRIVATE_KEY,
        deal.multisigAddress,
        FALLBACK_AMOUNT
      );
      if (trxResult.success) {
        await new Promise(r => setTimeout(r, 3000));
        energyMethod = 'trx';
      } else {
        throw new Error(`Failed to send TRX: ${trxResult.message}`);
      }
    }

    // ============================================
    // 1. FIRST TRANSFER: Refund to buyer
    // ============================================

    // 🔋 Rent 65k energy for first transfer (if using FeeSaver)
    if (useFeeSaver) {
      try {
        console.log(`🔋 Renting 65k energy for refund...`);
        const rental1 = await feesaverService.rentEnergy(deal.multisigAddress, 65000, '1h');
        if (rental1.status === 'Filled') {
          totalFeesaverCost += parseFloat(rental1.summa) || 0;
          energyMethod = 'feesaver';
          console.log(`✅ Energy rental #1 successful (cost: ${rental1.summa} TRX)`);
          await feesaverService.waitForDelegation(10);
        } else {
          throw new Error('Energy rental not filled');
        }
      } catch (error) {
        console.error(`⚠️ Energy rental #1 failed: ${error.message}`);
        const trxResult = await blockchainService.sendTRX(
          process.env.ARBITER_PRIVATE_KEY,
          deal.multisigAddress,
          FALLBACK_AMOUNT
        );
        if (trxResult.success) {
          await new Promise(r => setTimeout(r, 3000));
          energyMethod = 'trx';
        } else {
          throw new Error(`Failed to send fallback TRX: ${trxResult.message}`);
        }
      }
    }

    // Create and send refund transaction
    const refundTx = await blockchainService.createReleaseTransaction(
      deal.multisigAddress,
      deal.buyerAddress,
      refundAmount,
      deal.asset
    );

    const signedRefundTx = await blockchainService.signTransaction(refundTx, wallet.privateKey);
    const refundResult = await blockchainService.broadcastTransaction(signedRefundTx);

    if (!refundResult.success) {
      throw new Error(`Refund transaction failed: ${refundResult.error}`);
    }

    console.log(`✅ Refund successful: ${refundResult.txHash}`);

    // Record transaction
    const refundTransaction = new Transaction({
      dealId: deal._id,
      type: 'refund',
      asset: deal.asset,
      amount: refundAmount,
      txHash: refundResult.txHash,
      status: 'confirmed',
      fromAddress: deal.multisigAddress,
      toAddress: deal.buyerAddress
    });
    refundTransaction.generateExplorerLink();
    await refundTransaction.save();

    // ============================================
    // 2. SECOND TRANSFER: Commission to service
    // ============================================

    if (commission > 0) {
      await new Promise(r => setTimeout(r, 3000));

      // 🔋 Rent 65k energy for commission transfer (if using FeeSaver)
      if (useFeeSaver && energyMethod === 'feesaver') {
        try {
          console.log(`🔋 Renting 65k energy for commission transfer...`);
          const rental2 = await feesaverService.rentEnergy(deal.multisigAddress, 65000, '1h');
          if (rental2.status === 'Filled') {
            totalFeesaverCost += parseFloat(rental2.summa) || 0;
            console.log(`✅ Energy rental #2 successful (cost: ${rental2.summa} TRX)`);
            await feesaverService.waitForDelegation(10);
          } else {
            console.warn(`⚠️ Energy rental #2 not filled, trying anyway...`);
          }
        } catch (error) {
          console.error(`⚠️ Energy rental #2 failed: ${error.message}, trying anyway...`);
        }
      }

      const commissionTx = await blockchainService.createReleaseTransaction(
        deal.multisigAddress,
        process.env.SERVICE_WALLET_ADDRESS,
        commission,
        deal.asset
      );
      const signedCommissionTx = await blockchainService.signTransaction(commissionTx, wallet.privateKey);
      const commissionResult = await blockchainService.broadcastTransaction(signedCommissionTx);

      if (commissionResult.success) {
        const commissionTransaction = new Transaction({
          dealId: deal._id,
          type: 'fee',
          asset: deal.asset,
          amount: commission,
          txHash: commissionResult.txHash,
          status: 'confirmed',
          toAddress: process.env.SERVICE_WALLET_ADDRESS
        });
        commissionTransaction.generateExplorerLink();
        await commissionTransaction.save();
        console.log(`✅ Commission transferred: ${commissionResult.txHash}`);
      } else {
        console.error(`❌ Commission transfer failed: ${commissionResult.error}`);
      }
    }

    // Update deal status
    await Deal.findByIdAndUpdate(deal._id, {
      status: 'expired',
      pendingKeyValidation: null,
      completedAt: new Date()
    });

    // Return leftover TRX only if fallback was used
    if (energyMethod === 'trx') {
      trxReturned = await returnLeftoverTRX(deal, wallet.privateKey);
    }

    // Save operational costs
    await saveOperationalCosts(deal, energyMethod, totalFeesaverCost, trxReturned, 'buyer_refund');

    // Notify buyer (success)
    const buyerText = `✅ *Возврат выполнен!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

💸 Возвращено: *${refundAmount.toFixed(2)} ${deal.asset}*
📊 Комиссия сервиса: ${commission.toFixed(2)} ${deal.asset}

[Транзакция](https://tronscan.org/#/transaction/${refundResult.txHash})`;

    const keyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'refund_complete', buyerText, keyboard);

    // Notify seller
    const sellerText = `⚠️ *Сделка завершена возвратом*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

Срок сделки истёк без подтверждения выполнения.
Средства возвращены покупателю.

💸 Возвращено: ${refundAmount.toFixed(2)} ${deal.asset}

[Транзакция](https://tronscan.org/#/transaction/${refundResult.txHash})`;

    await messageManager.showNotification(ctx, deal.sellerId, sellerText, keyboard);

    // Audit log
    await AuditLog.create({
      action: 'DEAL_REFUNDED',
      userId: telegramId,
      dealId: deal._id,
      details: {
        dealId: deal.dealId,
        refundAmount,
        commission,
        txHash: refundResult.txHash
      }
    });

  } catch (error) {
    console.error(`❌ Error processing buyer refund:`, error);

    const errorText = `❌ *Ошибка возврата*

🆔 Сделка: \`${deal.dealId}\`
Ошибка: ${error.message}

Пожалуйста, свяжитесь с поддержкой: @keyshield_support`;

    const keyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'refund_error', errorText, keyboard);
  }
}

/**
 * Process dispute payout to winner
 */
async function processDisputePayout(ctx, deal, winnerRole) {
  const winnerId = winnerRole === 'buyer' ? deal.buyerId : deal.sellerId;
  const loserId = winnerRole === 'buyer' ? deal.sellerId : deal.buyerId;
  const winnerAddress = winnerRole === 'buyer' ? deal.buyerAddress : deal.sellerAddress;

  let energyMethod = 'none';
  let totalFeesaverCost = 0;
  let trxReturned = 0;

  try {
    // Get multisig wallet
    const wallet = await MultisigWallet.findOne({ dealId: deal._id }).select('+privateKey');
    if (!wallet || !wallet.privateKey) {
      throw new Error('Multisig wallet key not found');
    }

    // Get balance
    const balance = await blockchainService.getBalance(deal.multisigAddress, deal.asset);
    if (balance <= 0) {
      throw new Error('Insufficient balance');
    }

    // Calculate amounts
    const commission = deal.commission;
    const payoutAmount = balance - commission;

    if (payoutAmount <= 0) {
      throw new Error('Balance too low for payout');
    }

    console.log(`💸 Processing dispute payout for deal ${deal.dealId}: ${payoutAmount} ${deal.asset} to ${winnerRole}`);

    // Check if FeeSaver is available
    const useFeeSaver = feesaverService.isEnabled();
    const FALLBACK_AMOUNT = parseInt(process.env.FALLBACK_TRX_AMOUNT) || 30;

    // If not using FeeSaver, send fallback TRX upfront
    if (!useFeeSaver) {
      console.log(`⚠️ FeeSaver not available, using TRX fallback (${FALLBACK_AMOUNT} TRX)`);
      const trxResult = await blockchainService.sendTRX(
        process.env.ARBITER_PRIVATE_KEY,
        deal.multisigAddress,
        FALLBACK_AMOUNT
      );
      if (trxResult.success) {
        await new Promise(r => setTimeout(r, 3000));
        energyMethod = 'trx';
      } else {
        throw new Error(`Failed to send TRX: ${trxResult.message}`);
      }
    }

    // ============================================
    // 1. FIRST TRANSFER: Payout to winner
    // ============================================

    // 🔋 Rent 65k energy for first transfer (if using FeeSaver)
    if (useFeeSaver) {
      try {
        console.log(`🔋 Renting 65k energy for dispute payout...`);
        const rental1 = await feesaverService.rentEnergy(deal.multisigAddress, 65000, '1h');
        if (rental1.status === 'Filled') {
          totalFeesaverCost += parseFloat(rental1.summa) || 0;
          energyMethod = 'feesaver';
          console.log(`✅ Energy rental #1 successful (cost: ${rental1.summa} TRX)`);
          await feesaverService.waitForDelegation(10);
        } else {
          throw new Error('Energy rental not filled');
        }
      } catch (error) {
        console.error(`⚠️ Energy rental #1 failed: ${error.message}`);
        const trxResult = await blockchainService.sendTRX(
          process.env.ARBITER_PRIVATE_KEY,
          deal.multisigAddress,
          FALLBACK_AMOUNT
        );
        if (trxResult.success) {
          await new Promise(r => setTimeout(r, 3000));
          energyMethod = 'trx';
        } else {
          throw new Error(`Failed to send fallback TRX: ${trxResult.message}`);
        }
      }
    }

    // Create and send payout transaction
    const payoutTx = await blockchainService.createReleaseTransaction(
      deal.multisigAddress,
      winnerAddress,
      payoutAmount,
      deal.asset
    );

    const signedPayoutTx = await blockchainService.signTransaction(payoutTx, wallet.privateKey);
    const payoutResult = await blockchainService.broadcastTransaction(signedPayoutTx);

    if (!payoutResult.success) {
      throw new Error(`Payout transaction failed: ${payoutResult.error}`);
    }

    console.log(`✅ Dispute payout successful: ${payoutResult.txHash}`);

    // Record transaction
    const payoutTransaction = new Transaction({
      dealId: deal._id,
      type: winnerRole === 'buyer' ? 'refund' : 'release',
      asset: deal.asset,
      amount: payoutAmount,
      txHash: payoutResult.txHash,
      status: 'confirmed',
      fromAddress: deal.multisigAddress,
      toAddress: winnerAddress
    });
    payoutTransaction.generateExplorerLink();
    await payoutTransaction.save();

    // ============================================
    // 2. SECOND TRANSFER: Commission to service
    // ============================================

    if (commission > 0) {
      await new Promise(r => setTimeout(r, 3000));

      // 🔋 Rent 65k energy for commission transfer (if using FeeSaver)
      if (useFeeSaver && energyMethod === 'feesaver') {
        try {
          console.log(`🔋 Renting 65k energy for commission transfer...`);
          const rental2 = await feesaverService.rentEnergy(deal.multisigAddress, 65000, '1h');
          if (rental2.status === 'Filled') {
            totalFeesaverCost += parseFloat(rental2.summa) || 0;
            console.log(`✅ Energy rental #2 successful (cost: ${rental2.summa} TRX)`);
            await feesaverService.waitForDelegation(10);
          } else {
            console.warn(`⚠️ Energy rental #2 not filled, trying anyway...`);
          }
        } catch (error) {
          console.error(`⚠️ Energy rental #2 failed: ${error.message}, trying anyway...`);
        }
      }

      const commissionTx = await blockchainService.createReleaseTransaction(
        deal.multisigAddress,
        process.env.SERVICE_WALLET_ADDRESS,
        commission,
        deal.asset
      );
      const signedCommissionTx = await blockchainService.signTransaction(commissionTx, wallet.privateKey);
      const commissionResult = await blockchainService.broadcastTransaction(signedCommissionTx);

      if (commissionResult.success) {
        const commissionTransaction = new Transaction({
          dealId: deal._id,
          type: 'fee',
          asset: deal.asset,
          amount: commission,
          txHash: commissionResult.txHash,
          status: 'confirmed',
          toAddress: process.env.SERVICE_WALLET_ADDRESS
        });
        commissionTransaction.generateExplorerLink();
        await commissionTransaction.save();
        console.log(`✅ Commission transferred: ${commissionResult.txHash}`);
      } else {
        console.error(`❌ Commission transfer failed: ${commissionResult.error}`);
      }
    }

    // Update deal status
    await Deal.findByIdAndUpdate(deal._id, {
      status: 'resolved',
      pendingKeyValidation: null,
      completedAt: new Date()
    });

    // Return leftover TRX only if fallback was used
    if (energyMethod === 'trx') {
      trxReturned = await returnLeftoverTRX(deal, wallet.privateKey);
    }

    // Save operational costs
    await saveOperationalCosts(deal, energyMethod, totalFeesaverCost, trxReturned, 'dispute_payout');

    // Notify winner
    const winnerText = `✅ *Средства получены!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

💸 Получено: *${payoutAmount.toFixed(2)} ${deal.asset}*
📊 Комиссия сервиса: ${commission.toFixed(2)} ${deal.asset}

[Транзакция](https://tronscan.org/#/transaction/${payoutResult.txHash})`;

    const keyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, winnerId, 'dispute_payout_complete', winnerText, keyboard);

    // Audit log
    await AuditLog.create({
      action: 'DISPUTE_PAYOUT_COMPLETED',
      userId: winnerId,
      dealId: deal._id,
      details: {
        dealId: deal.dealId,
        winnerRole,
        payoutAmount,
        commission,
        txHash: payoutResult.txHash
      }
    });

  } catch (error) {
    console.error(`❌ Error processing dispute payout:`, error);

    const errorText = `❌ *Ошибка выплаты*

🆔 Сделка: \`${deal.dealId}\`
Ошибка: ${error.message}

Пожалуйста, свяжитесь с поддержкой: @keyshield_support`;

    const keyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, winnerId, 'dispute_payout_error', errorText, keyboard);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Return leftover TRX from multisig to arbiter
 * Called ONLY when fallback TRX was used (not FeeSaver)
 * Returns: (balance - 1.1 TRX) to keep minimum for potential future fees
 */
async function returnLeftoverTRX(deal, walletPrivateKey) {
  try {
    await new Promise(r => setTimeout(r, 5000)); // Wait for previous tx to settle

    const trxBalance = await blockchainService.getBalance(deal.multisigAddress, 'TRX');
    // Keep 1.1 TRX for potential future fees, return the rest
    const returnAmount = trxBalance - 1.1;

    if (returnAmount > 0.5) {
      const arbiterAddress = blockchainService.privateKeyToAddress(process.env.ARBITER_PRIVATE_KEY);
      const returnTx = await blockchainService.tronWeb.transactionBuilder.sendTrx(
        arbiterAddress,
        Math.floor(returnAmount * 1e6),
        deal.multisigAddress
      );
      const signedReturnTx = await blockchainService.signTransaction(returnTx, walletPrivateKey);
      const returnResult = await blockchainService.broadcastTransaction(signedReturnTx);

      if (returnResult.success) {
        console.log(`✅ Returned ${returnAmount.toFixed(2)} TRX to service wallet from ${deal.dealId}`);
        return returnAmount;
      }
    } else {
      console.log(`ℹ️ TRX balance too low to return: ${trxBalance} TRX on ${deal.dealId}`);
    }
  } catch (error) {
    console.error(`Error returning TRX from ${deal.dealId}:`, error.message);
  }

  return 0;
}

/**
 * Save operational costs to deal
 *
 * COST BREAKDOWN:
 *
 * 1. Activation (always):
 *    - activationTrxSent: 1 TRX (MULTISIG_ACTIVATION_TRX)
 *    - activationTxFee: 1.1 TRX (fee for sending TRX from service wallet)
 *    - Total activation: 2.1 TRX
 *
 * 2a. FeeSaver scenario:
 *    - feesaverCostTrx: ~6.5 TRX (2x 65k energy @ ~3.25 TRX each)
 *    - No TRX returned (1 TRX stays for bandwidth)
 *    - Total: 2.1 + 6.5 = ~8.6 TRX
 *
 * 2b. Fallback scenario:
 *    - fallbackTrxSent: 30 TRX (FALLBACK_TRX_AMOUNT)
 *    - fallbackTxFee: 1.1 TRX (fee for sending TRX)
 *    - fallbackTrxReturned: varies (balance - 1.1 TRX)
 *    - Total: 2.1 + 30 + 1.1 - returned
 *
 * @param {Object} deal - Deal object
 * @param {string} energyMethod - 'feesaver', 'trx', or 'none'
 * @param {number} feesaverCost - Total FeeSaver cost in TRX
 * @param {number} trxReturned - TRX returned to service wallet
 * @param {string} operationType - Type of operation for logging
 */
async function saveOperationalCosts(deal, energyMethod, feesaverCost, trxReturned, operationType) {
  try {
    const priceService = require('../../services/priceService');
    const TX_FEE = 1.1; // Standard TRON transaction fee
    const activationTrx = parseInt(process.env.MULTISIG_ACTIVATION_TRX) || 1;
    const FALLBACK_AMOUNT = parseInt(process.env.FALLBACK_TRX_AMOUNT) || 30;

    const updateData = {
      'operationalCosts.energyMethod': energyMethod,
      'operationalCosts.activationTrxSent': activationTrx,
      'operationalCosts.activationTxFee': TX_FEE
    };

    let totalTrxSpent = activationTrx + TX_FEE; // Activation + its tx fee

    if (energyMethod === 'feesaver') {
      // FeeSaver was used - record cost (2x 65k energy = ~6.5 TRX total)
      updateData['operationalCosts.feesaverCostTrx'] = feesaverCost;
      updateData['operationalCosts.activationTrxReturned'] = 0;
      updateData['operationalCosts.fallbackTrxSent'] = 0;
      updateData['operationalCosts.fallbackTxFee'] = 0;
      updateData['operationalCosts.fallbackTrxReturned'] = 0;
      updateData['operationalCosts.fallbackTrxNet'] = 0;

      // FeeSaver: activation (2.1) + feesaver cost
      totalTrxSpent += feesaverCost;

    } else if (energyMethod === 'trx') {
      // Fallback TRX was used
      updateData['operationalCosts.feesaverCostTrx'] = 0;
      updateData['operationalCosts.fallbackTrxSent'] = FALLBACK_AMOUNT;
      updateData['operationalCosts.fallbackTxFee'] = TX_FEE;
      updateData['operationalCosts.fallbackTrxReturned'] = trxReturned;
      updateData['operationalCosts.fallbackTrxNet'] = FALLBACK_AMOUNT + TX_FEE - trxReturned;
      updateData['operationalCosts.activationTrxReturned'] = 0; // Nothing returned from activation

      // Fallback: activation (2.1) + fallback (30 + 1.1) - returned
      totalTrxSpent += FALLBACK_AMOUNT + TX_FEE - trxReturned;
    }

    // Calculate net activation cost (sent + fee - returned)
    const activationNet = activationTrx + TX_FEE;
    updateData['operationalCosts.activationTrxNet'] = activationNet;

    updateData['operationalCosts.totalTrxSpent'] = totalTrxSpent;

    // Get TRX price and calculate USD cost
    try {
      const trxPrice = await priceService.getTrxPrice();
      const totalCostUsd = totalTrxSpent * trxPrice;
      updateData['operationalCosts.totalCostUsd'] = totalCostUsd;
      updateData['operationalCosts.trxPriceAtCompletion'] = trxPrice;
    } catch (priceError) {
      console.warn('Could not get TRX price:', priceError.message);
    }

    await Deal.findByIdAndUpdate(deal._id, { $set: updateData });

    console.log(`\n📊 Operational costs saved for ${deal.dealId}:`);
    console.log(`   Type: ${operationType}`);
    console.log(`   Method: ${energyMethod}`);
    console.log(`   Activation: ${activationTrx} + ${TX_FEE} fee = ${activationNet.toFixed(2)} TRX`);
    if (energyMethod === 'feesaver') {
      console.log(`   FeeSaver: ${feesaverCost.toFixed(2)} TRX`);
    } else if (energyMethod === 'trx') {
      console.log(`   Fallback: ${FALLBACK_AMOUNT} + ${TX_FEE} fee - ${trxReturned.toFixed(2)} returned = ${(FALLBACK_AMOUNT + TX_FEE - trxReturned).toFixed(2)} TRX`);
    }
    console.log(`   ════════════════════════════`);
    console.log(`   TOTAL: ${totalTrxSpent.toFixed(2)} TRX\n`);

  } catch (error) {
    console.error('Error saving operational costs:', error.message);
  }
}

module.exports = {
  hasKeyValidationSession,
  clearKeyValidationSession,
  createKeyValidationSession,
  handleKeyValidationInput,
  processSellerPayout,
  processBuyerRefund,
  processDisputePayout
};
