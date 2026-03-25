const Deal = require('../../models/Deal');
const Session = require('../../models/Session');
const blockchainService = require('../../services/blockchain');
const dealService = require('../../services/dealService');
const { Markup } = require('telegraf');
const {
  mainMenuButton,
  depositWarningKeyboard,
  walletVerificationErrorKeyboard,
  backButton,
  walletSelectionKeyboard,
  saveWalletPromptKeyboard,
  walletNameInputDealKeyboard
} = require('../keyboards/main');
const User = require('../../models/User');
const messageManager = require('../utils/messageManager');
const { t } = require('../../locales');

// ============================================
// SESSION HELPERS for wallet saving flow
// ============================================

async function getProvideWalletSession(telegramId) {
  return await Session.getSession(telegramId, 'provide_wallet');
}

async function setProvideWalletSession(telegramId, sessionData) {
  await Session.setSession(telegramId, 'provide_wallet', sessionData, 1); // 1 hour TTL
}

async function deleteProvideWalletSession(telegramId) {
  await Session.deleteSession(telegramId, 'provide_wallet');
}

async function hasProvideWalletSession(telegramId) {
  const session = await getProvideWalletSession(telegramId);
  return !!session;
}

// Escape special Markdown characters
function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/([_*`\[\]])/g, '\\$1');
}

// ============================================
// ENTER WALLET CALLBACK (from notification)
// ============================================

/**
 * Handle "Enter Wallet" button click from deal notification
 */
const enterWalletHandler = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.deal_not_found'), keyboard);
      return;
    }

    // Determine user role
    const role = deal.getUserRole(telegramId);

    if (!role) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.not_participant'), keyboard);
      return;
    }

    // Check if waiting for this user's wallet
    if (role === 'seller' && deal.status !== 'waiting_for_seller_wallet') {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.not_awaiting_wallet'), keyboard);
      return;
    }

    if (role === 'buyer' && deal.status !== 'waiting_for_buyer_wallet') {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.not_awaiting_wallet'), keyboard);
      return;
    }

    // Check if user has saved wallets
    const user = await User.findOne({ telegramId }).select('wallets');
    const savedWallets = user?.wallets || [];

    if (savedWallets.length > 0) {
      // User has saved wallets - show selection screen
      const walletPurpose = role === 'buyer'
        ? t(lang, 'wallet.purpose_buyer')
        : t(lang, 'wallet.purpose_seller');

      const text = t(lang, 'provideWallet.select_title', {
        dealId: deal.dealId,
        productName: deal.productName,
        amount: deal.amount,
        asset: deal.asset,
        walletPurpose
      });

      // Store deal info for wallet selection
      await User.updateOne(
        { telegramId },
        {
          pendingDealId: dealId,
          currentScreen: 'select_wallet_deal'
        }
      );

      const keyboard = walletSelectionKeyboard(savedWallets, true, lang);
      await messageManager.navigateToScreen(ctx, telegramId, `select_wallet_${dealId}`, text, keyboard);
    } else {
      // No saved wallets - show direct input
      const text = t(lang, 'provideWallet.input_title', {
        dealId: deal.dealId,
        productName: deal.productName,
        amount: deal.amount,
        asset: deal.asset
      });

      const keyboard = backButton(lang);
      await messageManager.navigateToScreen(ctx, telegramId, `enter_wallet_${dealId}`, text, keyboard);
    }
  } catch (error) {
    console.error('Error in enterWalletHandler:', error);
  }
};

// ============================================
// SELLER WALLET INPUT (with existence verification)
// ============================================

/**
 * Handle seller providing wallet address (text input)
 * Now includes wallet verification: address validity, existence check
 */
const handleSellerWalletInput = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    const telegramId = ctx.from.id;
    const text = ctx.message.text.trim();

    // Delete user message
    await messageManager.deleteUserMessage(ctx);

    // Find deal waiting for this seller's wallet
    const deal = await Deal.findOne({
      sellerId: telegramId,
      status: 'waiting_for_seller_wallet'
    });

    if (!deal) {
      return false; // Not waiting for wallet
    }

    // Validate TRON address format
    if (!blockchainService.isValidAddress(text)) {
      const errorText = t(lang, 'wallet.invalid_format');

      const keyboard = backButton(lang);
      await messageManager.updateScreen(ctx, telegramId, 'seller_wallet_error', errorText, keyboard);
      return true;
    }

    // ========== STEP 1: Show verification loading screen ==========
    await User.findOneAndUpdate(
      { telegramId },
      { currentScreen: 'wallet_verification' }
    );

    const verifyingText = t(lang, 'common.checking_wallet');

    await messageManager.updateScreen(ctx, telegramId, 'wallet_verification', verifyingText, null);

    // ========== STEP 2: Verify wallet exists ==========
    const verification = await blockchainService.verifyWalletExists(text);

    if (!verification.valid) {
      // Wallet verification failed - show error
      let errorMessage;
      if (verification.errorType === 'invalid_address') {
        errorMessage = t(lang, 'wallet.invalid_address');
      } else if (verification.errorType === 'not_found') {
        errorMessage = t(lang, 'wallet.not_found_detailed');
      } else {
        errorMessage = t(lang, 'wallet.check_error');
      }

      const keyboard = backButton(lang);
      await messageManager.updateScreen(ctx, telegramId, 'seller_wallet_error', errorMessage, keyboard);
      return true;
    }

    // ========== STEP 3: Verification passed! ==========
    // Check if user can save this wallet
    const user = await User.findOne({ telegramId }).select('wallets');
    const canSaveWallet = user && user.canAddWallet() && !user.getWallet(text);

    if (canSaveWallet) {
      // Ask to save wallet before proceeding
      const shortAddr = text.slice(0, 6) + '...' + text.slice(-4);
      const savePromptText = t(lang, 'wallet.verified_save', { address: shortAddr });

      // Save session with wallet info
      await setProvideWalletSession(telegramId, {
        step: 'save_wallet_prompt',
        dealId: deal.dealId,
        walletAddress: text,
        role: 'seller'
      });

      const keyboard = saveWalletPromptKeyboard(lang);
      await messageManager.updateScreen(ctx, telegramId, 'save_wallet_prompt', savePromptText, keyboard);
      return true;
    }

    // No save prompt needed - proceed directly
    await processSellerWalletNew(ctx, telegramId, deal, text, lang);
    return true;
  } catch (error) {
    console.error('Error handling seller wallet input:', error);
    return false;
  }
};

/**
 * Process seller wallet after validation (and optional save prompt)
 */
async function processSellerWalletNew(ctx, telegramId, deal, walletAddress, lang) {
    if (!lang) lang = ctx.state?.lang || 'ru';

    // ========== STEP 4: Generate private key and save deal ==========
    const sellerKeys = await blockchainService.generateKeyPair();
    const sellerPrivateKey = sellerKeys.privateKey;

    // Update deal with seller address and private key
    deal.sellerAddress = walletAddress;
    deal.sellerPrivateKey = sellerPrivateKey;
    deal.status = 'waiting_for_deposit';
    await deal.save();

    console.log(`✅ Seller wallet verified and set for deal ${deal.dealId}: ${walletAddress}`);

    // Show confirmation to seller FIRST (main message)
    const sellerText = t(lang, 'provideWallet.seller_wallet_saved', {
      walletAddress,
      dealId: deal.dealId,
      productName: escapeMarkdown(deal.productName)
    });

    const sellerKeyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'wallet_saved', sellerText, sellerKeyboard);

    // ========== SHOW PRIVATE KEY (separate message below with button) ==========
    const keyText = `${t(lang, 'createDeal.private_key_title')}\n\n🆔 \`${deal.dealId}\`\n\n${t(lang, 'createDeal.private_key_seller')}\n\`${sellerPrivateKey}\`\n\n${t(lang, 'createDeal.private_key_warning')}\n${t(lang, 'createDeal.private_key_seller_warning')}\n\n${t(lang, 'createDeal.private_key_autodelete')}`;

    const keyKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.key_saved'), `key_saved:${deal.dealId}`)]
    ]);

    const keyMsg = await ctx.telegram.sendMessage(telegramId, keyText, {
      parse_mode: 'Markdown',
      reply_markup: keyKeyboard.reply_markup
    });

    // Auto-delete after 60 seconds
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(telegramId, keyMsg.message_id);
      } catch (e) {
        // Already deleted by button
      }
    }, 60000);

    // Calculate deposit amount for buyer notification
    let depositAmount = deal.amount;
    let depositNote = '';

    if (deal.commissionType === 'buyer') {
      depositAmount = deal.amount + deal.commission;
      depositNote = `\n${t(lang, 'commission.including', { commission: deal.commission, asset: deal.asset })}`;
    } else if (deal.commissionType === 'split') {
      const halfCommission = deal.commission / 2;
      depositAmount = deal.amount + halfCommission;
      depositNote = `\n${t(lang, 'commission.including_half', { half: halfCommission.toFixed(2), asset: deal.asset })}`;
    }

    // Load buyer language for notification
    const buyerUser = await User.findOne({ telegramId: deal.buyerId }).select('languageCode').lean();
    const buyerLang = buyerUser?.languageCode || 'ru';

    // Recalculate depositNote in buyer's language
    let buyerDepositNote = '';
    if (deal.commissionType === 'buyer') {
      buyerDepositNote = `\n${t(buyerLang, 'commission.including', { commission: deal.commission, asset: deal.asset })}`;
    } else if (deal.commissionType === 'split') {
      const halfCommission = deal.commission / 2;
      buyerDepositNote = `\n${t(buyerLang, 'commission.including_half', { half: halfCommission.toFixed(2), asset: deal.asset })}`;
    }

    // Show WARNING notification to buyer
    const buyerText = t(buyerLang, 'provideWallet.deposit_warning', {
      dealId: deal.dealId,
      productName: deal.productName,
      depositAmount,
      asset: deal.asset,
      depositNote: buyerDepositNote,
      commission: deal.commission
    });

    const buyerKeyboard = depositWarningKeyboard(deal.dealId, buyerLang);
    await messageManager.showNotification(ctx, deal.buyerId, buyerText, buyerKeyboard);
}

// ============================================
// BUYER WALLET INPUT (with balance verification)
// ============================================

/**
 * Handle buyer providing wallet address (text input)
 * Now includes wallet verification: address validity, USDT balance check
 */
const handleBuyerWalletInput = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    const telegramId = ctx.from.id;
    const text = ctx.message.text.trim();

    // Delete user message
    await messageManager.deleteUserMessage(ctx);

    // Find deal waiting for this buyer's wallet
    const deal = await Deal.findOne({
      buyerId: telegramId,
      status: 'waiting_for_buyer_wallet'
    });

    if (!deal) {
      return false; // Not waiting for wallet
    }

    // ========== STEP 1: Show verification loading screen ==========
    // Set currentScreen to wallet_verification to exclude from loading middleware
    await User.findOneAndUpdate(
      { telegramId },
      { currentScreen: 'wallet_verification' }
    );

    const verifyingText = t(lang, 'common.checking_wallet_detailed');

    await messageManager.updateScreen(ctx, telegramId, 'wallet_verification', verifyingText, null);

    // ========== STEP 2: Calculate required amount ==========
    let depositAmount = deal.amount;
    if (deal.commissionType === 'buyer') {
      depositAmount = deal.amount + deal.commission;
    } else if (deal.commissionType === 'split') {
      depositAmount = deal.amount + deal.commission / 2;
    }

    // Required amount = deposit amount + 5 USDT buffer
    const requiredAmount = depositAmount + 5;

    // ========== STEP 3: Verify wallet ==========
    const verification = await blockchainService.verifyBuyerWallet(text, requiredAmount, depositAmount);

    if (!verification.valid) {
      // Check if it's a balance issue (can proceed anyway - funds on exchange)
      if (verification.errorType === 'insufficient_funds' || verification.errorType === 'no_buffer') {
        // Show warning with choice instead of blocking
        const currentBalance = verification.balance || 0;
        const warningMessage = t(lang, 'wallet.balance_warning', {
          balance: currentBalance.toFixed(2),
          depositAmount: depositAmount.toFixed(2)
        });

        // Store pending wallet for later confirmation
        await User.findOneAndUpdate(
          { telegramId },
          {
            currentScreen: 'wallet_balance_warning',
            pendingWallet: text,
            pendingDealId: deal.dealId
          }
        );

        const keyboard = {
          inline_keyboard: [
            [{ text: t(lang, 'btn.continue_funds'), callback_data: `wallet_continue:${deal.dealId}` }],
            [{ text: t(lang, 'btn.change_wallet'), callback_data: `retry_wallet:${deal.dealId}` }],
            [{ text: t(lang, 'btn.back'), callback_data: 'back' }]
          ]
        };
        await messageManager.updateScreen(ctx, telegramId, 'wallet_balance_warning', warningMessage, keyboard);
        return true;
      }

      // Other errors (invalid address, not found) - show error
      const errorText = t(lang, 'provideWallet.check_failed', { error: verification.error });

      const keyboard = walletVerificationErrorKeyboard(deal.dealId, lang);
      await messageManager.updateScreen(ctx, telegramId, 'wallet_verification_error', errorText, keyboard);
      return true;
    }

    // ========== STEP 4: Verification passed! ==========
    // Check if user can save this wallet
    const user = await User.findOne({ telegramId }).select('wallets');
    const canSaveWallet = user && user.canAddWallet() && !user.getWallet(text);

    if (canSaveWallet) {
      // Ask to save wallet before proceeding
      const shortAddr = text.slice(0, 6) + '...' + text.slice(-4);
      const savePromptText = t(lang, 'wallet.verified_save_balance', { address: shortAddr });

      // Save session with wallet info
      await setProvideWalletSession(telegramId, {
        step: 'save_wallet_prompt',
        dealId: deal.dealId,
        walletAddress: text,
        role: 'buyer'
      });

      const keyboard = saveWalletPromptKeyboard(lang);
      await messageManager.updateScreen(ctx, telegramId, 'save_wallet_prompt', savePromptText, keyboard);
      return true;
    }

    // No save prompt needed - proceed directly
    await processBuyerWalletNew(ctx, telegramId, deal, text, lang);
    return true;
  } catch (error) {
    console.error('Error handling buyer wallet input:', error);
    return false;
  }
};

/**
 * Process buyer wallet after validation (and optional save prompt)
 */
async function processBuyerWalletNew(ctx, telegramId, deal, walletAddress, lang) {
    if (!lang) lang = ctx.state?.lang || 'ru';

    // ========== STEP 5: Generate private key and save deal ==========
    const buyerKeys = await blockchainService.generateKeyPair();
    const buyerPrivateKey = buyerKeys.privateKey;

    deal.buyerAddress = walletAddress;
    deal.buyerPrivateKey = buyerPrivateKey;
    deal.status = 'waiting_for_deposit';
    await deal.save();

    console.log(`✅ Buyer wallet verified and set for deal ${deal.dealId}: ${walletAddress}`);

    // Calculate deposit amount
    let depositAmount = deal.amount;
    if (deal.commissionType === 'buyer') {
      depositAmount = deal.amount + deal.commission;
    } else if (deal.commissionType === 'split') {
      depositAmount = deal.amount + deal.commission / 2;
    }

    // Calculate deposit note for display
    let depositNote = '';
    if (deal.commissionType === 'buyer') {
      depositNote = `\n${t(lang, 'commission.including', { commission: deal.commission, asset: deal.asset })}`;
    } else if (deal.commissionType === 'split') {
      const halfCommission = deal.commission / 2;
      depositNote = `\n${t(lang, 'commission.including_half', { half: halfCommission.toFixed(2), asset: deal.asset })}`;
    }

    // ========== STEP 6: Show deposit instructions ==========
    const buyerDepositText = t(lang, 'provideWallet.deposit_confirmed', {
      dealId: deal.dealId,
      productName: escapeMarkdown(deal.productName),
      asset: deal.asset,
      multisigAddress: deal.multisigAddress,
      depositAmount: depositAmount.toFixed(2),
      depositNote
    });

    const buyerKeyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'deposit_instructions', buyerDepositText, buyerKeyboard);

    // ========== STEP 7: Show private key (separate message) ==========
    const keyText = `${t(lang, 'createDeal.private_key_title')}\n\n🆔 \`${deal.dealId}\`\n\n${t(lang, 'createDeal.private_key_buyer')}\n\`${buyerPrivateKey}\`\n\n${t(lang, 'createDeal.private_key_warning')}\n${t(lang, 'createDeal.private_key_buyer_warning')}\n\n${t(lang, 'createDeal.private_key_autodelete')}`;

    const keyKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.key_saved'), `key_saved:${deal.dealId}`)]
    ]);

    const keyMsg = await ctx.telegram.sendMessage(telegramId, keyText, {
      parse_mode: 'Markdown',
      reply_markup: keyKeyboard.reply_markup
    });

    // Auto-delete after 60 seconds
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(telegramId, keyMsg.message_id);
      } catch (e) {
        // Already deleted by button
      }
    }, 60000);

    // ========== STEP 8: Notify seller ==========
    const sellerUser = await User.findOne({ telegramId: deal.sellerId }).select('languageCode').lean();
    const sellerLang = sellerUser?.languageCode || 'ru';

    const sellerNotifyText = t(sellerLang, 'provideWallet.buyer_wallet_set_notify', {
      dealId: deal.dealId,
      productName: escapeMarkdown(deal.productName)
    });

    const sellerKeyboard = mainMenuButton(sellerLang);
    await messageManager.showNotification(ctx, deal.sellerId, sellerNotifyText, sellerKeyboard);
}

// ============================================
// DEPOSIT WARNING CONFIRMATION
// ============================================

/**
 * Handle deposit warning confirmation button
 */
const handleDepositWarningConfirmation = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    // Find deal
    const deal = await Deal.findOne({
      dealId: dealId,
      buyerId: telegramId,
      status: 'waiting_for_deposit'
    });

    if (!deal) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.deal_not_found_or_completed'), keyboard);
      return;
    }

    // Calculate deposit amount
    let depositAmount = deal.amount;
    let depositNote = '';

    if (deal.commissionType === 'buyer') {
      depositAmount = deal.amount + deal.commission;
      depositNote = `\n${t(lang, 'commission.including', { commission: deal.commission, asset: deal.asset })}`;
    } else if (deal.commissionType === 'split') {
      const halfCommission = deal.commission / 2;
      depositAmount = deal.amount + halfCommission;
      depositNote = `\n${t(lang, 'commission.including_half', { half: halfCommission.toFixed(2), asset: deal.asset })}`;
    }

    // Show deposit instructions (final screen)
    const text = t(lang, 'provideWallet.deposit_ready', {
      dealId: deal.dealId,
      productName: deal.productName,
      asset: deal.asset,
      multisigAddress: deal.multisigAddress,
      depositAmount,
      depositNote
    });

    const keyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'deposit_instructions', text, keyboard);
  } catch (error) {
    console.error('Error handling deposit warning confirmation:', error);
  }
};

// ============================================
// SHOW DEPOSIT ADDRESS (from deal details)
// ============================================

/**
 * Handle "Show Deposit Address" button from deal details
 */
const showDepositAddress = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.deal_not_found'), keyboard);
      return;
    }

    if (deal.buyerId !== telegramId) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'myDeals.only_buyer_deposit'), keyboard);
      return;
    }

    if (deal.status !== 'waiting_for_deposit') {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'myDeals.not_waiting_deposit'), keyboard);
      return;
    }

    // Calculate deposit amount
    let depositAmount = deal.amount;
    let depositNote = '';

    if (deal.commissionType === 'buyer') {
      depositAmount = deal.amount + deal.commission;
      depositNote = `\n${t(lang, 'commission.including', { commission: deal.commission, asset: deal.asset })}`;
    } else if (deal.commissionType === 'split') {
      const halfCommission = deal.commission / 2;
      depositAmount = deal.amount + halfCommission;
      depositNote = `\n${t(lang, 'commission.including_half', { half: halfCommission.toFixed(2), asset: deal.asset })}`;
    }

    const text = t(lang, 'provideWallet.deposit_ready', {
      dealId: deal.dealId,
      productName: deal.productName,
      asset: deal.asset,
      multisigAddress: deal.multisigAddress,
      depositAmount,
      depositNote
    });

    const keyboard = mainMenuButton(lang);
    await messageManager.navigateToScreen(ctx, telegramId, `deposit_${dealId}`, text, keyboard);
  } catch (error) {
    console.error('Error showing deposit address:', error);
  }
};

// ============================================
// DECLINE DEAL
// ============================================

/**
 * Handle deal decline from counterparty
 */
const declineDeal = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.deal_not_found'), keyboard);
      return;
    }

    // Check if user is participant
    if (!deal.isParticipant(telegramId)) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.not_participant'), keyboard);
      return;
    }

    // Check if deal can be declined
    const declinableStatuses = ['waiting_for_seller_wallet', 'waiting_for_buyer_wallet', 'waiting_for_deposit'];
    if (!declinableStatuses.includes(deal.status)) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'myDeals.cannot_decline'), keyboard);
      return;
    }

    // Cancel deal
    await dealService.updateDealStatus(dealId, 'cancelled', telegramId);

    // Notify decliner
    const declinerText = t(lang, 'myDeals.deal_declined_you', {
      dealId,
      productName: deal.productName
    });

    const declinerKeyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'deal_declined', declinerText, declinerKeyboard);

    // Notify other party
    const otherPartyId = deal.buyerId === telegramId ? deal.sellerId : deal.buyerId;

    // Load counterparty language
    const counterpartyUser = await User.findOne({ telegramId: otherPartyId }).select('languageCode').lean();
    const counterpartyLang = counterpartyUser?.languageCode || 'ru';

    const otherPartyRole = deal.buyerId === telegramId
      ? t(counterpartyLang, 'role.buyer')
      : t(counterpartyLang, 'role.seller');

    const otherText = t(counterpartyLang, 'myDeals.deal_declined_other', {
      dealId,
      productName: deal.productName,
      role: otherPartyRole
    });

    const otherKeyboard = mainMenuButton(counterpartyLang);
    await messageManager.showNotification(ctx, otherPartyId, otherText, otherKeyboard);

    console.log(`❌ Deal ${dealId} declined by user ${telegramId}`);
  } catch (error) {
    console.error('Error declining deal:', error);
  }
};

// ============================================
// CANCEL DEAL (by creator before deposit)
// ============================================

/**
 * Handle deal cancellation
 */
const cancelDeal = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.deal_not_found'), keyboard);
      return;
    }

    // Check if deal can be cancelled
    const cancellableStatuses = ['waiting_for_seller_wallet', 'waiting_for_buyer_wallet', 'waiting_for_deposit'];
    if (!cancellableStatuses.includes(deal.status)) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'myDeals.cannot_cancel'), keyboard);
      return;
    }

    // Cancel deal
    await dealService.updateDealStatus(dealId, 'cancelled', telegramId);

    // Notify canceller
    const text = t(lang, 'myDeals.deal_cancelled_you', {
      dealId,
      productName: deal.productName
    });

    const keyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'deal_cancelled', text, keyboard);

    // Notify other party if exists
    const otherPartyId = deal.buyerId === telegramId ? deal.sellerId : deal.buyerId;
    if (otherPartyId && otherPartyId !== telegramId) {
      // Load counterparty language
      const counterpartyUser = await User.findOne({ telegramId: otherPartyId }).select('languageCode').lean();
      const counterpartyLang = counterpartyUser?.languageCode || 'ru';

      const otherText = t(counterpartyLang, 'myDeals.deal_cancelled_other', {
        dealId,
        productName: deal.productName
      });

      const otherKeyboard = mainMenuButton(counterpartyLang);
      await messageManager.showNotification(ctx, otherPartyId, otherText, otherKeyboard);
    }

    console.log(`❌ Deal ${dealId} cancelled by user ${telegramId}`);
  } catch (error) {
    console.error('Error cancelling deal:', error);
  }
};

// ============================================
// WALLET BALANCE WARNING - CONTINUE ANYWAY
// ============================================

/**
 * Handle "Continue anyway" when buyer's wallet has insufficient balance visible
 * (funds may be on exchange)
 */
const handleWalletContinue = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const dealId = ctx.callbackQuery.data.split(':')[1];

    // Get pending wallet from user record
    const user = await User.findOne({ telegramId });
    if (!user || !user.pendingWallet || user.pendingDealId !== dealId) {
      await ctx.answerCbQuery(t(lang, 'common.session_expired_restart'), { show_alert: true });
      return;
    }

    const walletAddress = user.pendingWallet;

    // Find deal
    const deal = await Deal.findOne({
      dealId: dealId,
      buyerId: telegramId,
      status: 'waiting_for_buyer_wallet'
    });

    if (!deal) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.deal_not_found_or_status'), keyboard);
      return;
    }

    // Clear pending data
    await User.findOneAndUpdate(
      { telegramId },
      {
        $unset: { pendingWallet: 1, pendingDealId: 1 },
        currentScreen: 'wallet_verified'
      }
    );

    // Show success
    const successText = t(lang, 'wallet.accepted', { address: walletAddress });

    await messageManager.updateScreen(ctx, telegramId, 'wallet_verified', successText, null);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Generate private key and save deal
    const buyerKeys = await blockchainService.generateKeyPair();
    const buyerPrivateKey = buyerKeys.privateKey;

    deal.buyerAddress = walletAddress;
    deal.buyerPrivateKey = buyerPrivateKey;
    deal.status = 'waiting_for_deposit';
    await deal.save();

    console.log(`✅ Buyer wallet accepted (exchange funds) for deal ${deal.dealId}: ${walletAddress}`);

    // Calculate deposit amount
    let depositAmount = deal.amount;
    let depositNote = '';
    if (deal.commissionType === 'buyer') {
      depositAmount = deal.amount + deal.commission;
      depositNote = `\n${t(lang, 'commission.including', { commission: deal.commission, asset: deal.asset })}`;
    } else if (deal.commissionType === 'split') {
      const halfCommission = deal.commission / 2;
      depositAmount = deal.amount + halfCommission;
      depositNote = `\n${t(lang, 'commission.including_half', { half: halfCommission.toFixed(2), asset: deal.asset })}`;
    }

    // Show deposit instructions
    const buyerDepositText = t(lang, 'provideWallet.deposit_confirmed', {
      dealId: deal.dealId,
      productName: escapeMarkdown(deal.productName),
      asset: deal.asset,
      multisigAddress: deal.multisigAddress,
      depositAmount: depositAmount.toFixed(2),
      depositNote
    });

    const buyerKeyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'deposit_instructions', buyerDepositText, buyerKeyboard);

    // Show private key (separate message)
    const keyText = `${t(lang, 'createDeal.private_key_title')}\n\n🆔 \`${deal.dealId}\`\n\n${t(lang, 'createDeal.private_key_buyer')}\n\`${buyerPrivateKey}\`\n\n${t(lang, 'createDeal.private_key_warning')}\n${t(lang, 'createDeal.private_key_buyer_warning')}\n\n${t(lang, 'createDeal.private_key_autodelete')}`;

    const keyKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.key_saved'), `key_saved:${deal.dealId}`)]
    ]);

    const keyMsg = await ctx.telegram.sendMessage(telegramId, keyText, {
      parse_mode: 'Markdown',
      reply_markup: keyKeyboard.reply_markup
    });

    // Auto-delete after 60 seconds
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(telegramId, keyMsg.message_id);
      } catch (e) {
        // Already deleted by button
      }
    }, 60000);

    // Notify seller
    const sellerUser = await User.findOne({ telegramId: deal.sellerId }).select('languageCode').lean();
    const sellerLang = sellerUser?.languageCode || 'ru';

    const sellerNotifyText = t(sellerLang, 'provideWallet.buyer_wallet_set_notify', {
      dealId: deal.dealId,
      productName: escapeMarkdown(deal.productName)
    });

    const sellerKeyboard = mainMenuButton(sellerLang);
    await messageManager.showNotification(ctx, deal.sellerId, sellerNotifyText, sellerKeyboard);

  } catch (error) {
    console.error('Error in handleWalletContinue:', error);
  }
};

// ============================================
// SAVED WALLET SELECTION (for deal acceptance)
// ============================================

/**
 * Handle saved wallet selection during deal acceptance
 */
const handleSelectSavedWalletDeal = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const walletIndex = parseInt(ctx.callbackQuery.data.split(':')[1]);

    // Get user's pending deal
    const user = await User.findOne({ telegramId }).select('wallets pendingDealId');
    if (!user || !user.wallets[walletIndex]) {
      await ctx.answerCbQuery(t(lang, 'wallet.not_found_alert'), { show_alert: true });
      return;
    }

    const dealId = user.pendingDealId;
    if (!dealId) {
      await ctx.answerCbQuery(t(lang, 'common.deal_not_found'), { show_alert: true });
      return;
    }

    const deal = await dealService.getDealById(dealId);
    if (!deal) {
      await ctx.answerCbQuery(t(lang, 'common.deal_not_found'), { show_alert: true });
      return;
    }

    const role = deal.getUserRole(telegramId);
    const wallet = user.wallets[walletIndex];
    const address = wallet.address;

    // Show loading
    const loadingText = t(lang, 'common.preparing', { address: address.slice(0, 6) + '...' + address.slice(-4) });

    await messageManager.updateScreen(ctx, telegramId, 'wallet_loading', loadingText, {});
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Process based on role
    if (role === 'seller') {
      await processSellerWalletSaved(ctx, telegramId, deal, address, lang);
    } else {
      await processBuyerWalletSaved(ctx, telegramId, deal, address, lang);
    }

    // Clear pending deal
    await User.updateOne({ telegramId }, { $unset: { pendingDealId: 1 } });
  } catch (error) {
    console.error('Error in handleSelectSavedWalletDeal:', error);
  }
};

/**
 * Handle "Enter new wallet" button during deal acceptance
 */
const handleEnterNewWalletDeal = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const user = await User.findOne({ telegramId }).select('pendingDealId');

    if (!user || !user.pendingDealId) {
      await ctx.answerCbQuery(t(lang, 'common.deal_not_found'), { show_alert: true });
      return;
    }

    const dealId = user.pendingDealId;
    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      await ctx.answerCbQuery(t(lang, 'common.deal_not_found'), { show_alert: true });
      return;
    }

    const text = t(lang, 'provideWallet.input_title', {
      dealId: deal.dealId,
      productName: deal.productName,
      amount: deal.amount,
      asset: deal.asset
    });

    const keyboard = backButton(lang);
    await messageManager.navigateToScreen(ctx, telegramId, `enter_wallet_${dealId}`, text, keyboard);
  } catch (error) {
    console.error('Error in handleEnterNewWalletDeal:', error);
  }
};

/**
 * Process seller wallet selection (saved wallet, skip validation)
 */
async function processSellerWalletSaved(ctx, telegramId, deal, address, lang) {
  if (!lang) lang = ctx.state?.lang || 'ru';

  // Generate private key and save deal
  const sellerKeys = await blockchainService.generateKeyPair();
  const sellerPrivateKey = sellerKeys.privateKey;

  // Update deal with seller address and private key
  deal.sellerAddress = address;
  deal.sellerPrivateKey = sellerPrivateKey;
  deal.status = 'waiting_for_deposit';
  await deal.save();

  console.log(`✅ Seller wallet (saved) set for deal ${deal.dealId}: ${address}`);

  // Show confirmation to seller
  const sellerText = t(lang, 'provideWallet.seller_wallet_saved', {
    walletAddress: address,
    dealId: deal.dealId,
    productName: escapeMarkdown(deal.productName)
  });

  const sellerKeyboard = mainMenuButton(lang);
  await messageManager.showFinalScreen(ctx, telegramId, 'wallet_saved', sellerText, sellerKeyboard);

  // Show private key
  const keyText = `${t(lang, 'createDeal.private_key_title')}\n\n🆔 \`${deal.dealId}\`\n\n${t(lang, 'createDeal.private_key_seller')}\n\`${sellerPrivateKey}\`\n\n${t(lang, 'createDeal.private_key_warning')}\n${t(lang, 'createDeal.private_key_seller_warning')}\n\n${t(lang, 'createDeal.private_key_autodelete')}`;

  const keyKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.key_saved'), `key_saved:${deal.dealId}`)]
  ]);

  const keyMsg = await ctx.telegram.sendMessage(telegramId, keyText, {
    parse_mode: 'Markdown',
    reply_markup: keyKeyboard.reply_markup
  });

  // Auto-delete after 60 seconds
  setTimeout(async () => {
    try {
      await ctx.telegram.deleteMessage(telegramId, keyMsg.message_id);
    } catch (e) {
      // Already deleted
    }
  }, 60000);

  // Calculate deposit amount for buyer notification
  let depositAmount = deal.amount;
  let depositNote = '';

  if (deal.commissionType === 'buyer') {
    depositAmount = deal.amount + deal.commission;
    depositNote = `\n${t(lang, 'commission.including', { commission: deal.commission, asset: deal.asset })}`;
  } else if (deal.commissionType === 'split') {
    const halfCommission = deal.commission / 2;
    depositAmount = deal.amount + halfCommission;
    depositNote = `\n${t(lang, 'commission.including_half', { half: halfCommission.toFixed(2), asset: deal.asset })}`;
  }

  // Load buyer language for notification
  const buyerUser = await User.findOne({ telegramId: deal.buyerId }).select('languageCode').lean();
  const buyerLang = buyerUser?.languageCode || 'ru';

  // Recalculate depositNote in buyer's language
  let buyerDepositNote = '';
  if (deal.commissionType === 'buyer') {
    buyerDepositNote = `\n${t(buyerLang, 'commission.including', { commission: deal.commission, asset: deal.asset })}`;
  } else if (deal.commissionType === 'split') {
    const halfCommission = deal.commission / 2;
    buyerDepositNote = `\n${t(buyerLang, 'commission.including_half', { half: halfCommission.toFixed(2), asset: deal.asset })}`;
  }

  // Notify buyer
  const buyerText = t(buyerLang, 'provideWallet.deposit_warning', {
    dealId: deal.dealId,
    productName: deal.productName,
    depositAmount,
    asset: deal.asset,
    depositNote: buyerDepositNote,
    commission: deal.commission
  });

  const buyerKeyboard = depositWarningKeyboard(deal.dealId, buyerLang);
  await messageManager.showNotification(ctx, deal.buyerId, buyerText, buyerKeyboard);
}

/**
 * Process buyer wallet selection (saved wallet, skip validation)
 */
async function processBuyerWalletSaved(ctx, telegramId, deal, address, lang) {
  if (!lang) lang = ctx.state?.lang || 'ru';

  // Generate private key and save deal
  const buyerKeys = await blockchainService.generateKeyPair();
  const buyerPrivateKey = buyerKeys.privateKey;

  deal.buyerAddress = address;
  deal.buyerPrivateKey = buyerPrivateKey;
  deal.status = 'waiting_for_deposit';
  await deal.save();

  console.log(`✅ Buyer wallet (saved) set for deal ${deal.dealId}: ${address}`);

  // Calculate deposit amount
  let depositAmount = deal.amount;
  let depositNote = '';
  if (deal.commissionType === 'buyer') {
    depositAmount = deal.amount + deal.commission;
    depositNote = `\n${t(lang, 'commission.including', { commission: deal.commission, asset: deal.asset })}`;
  } else if (deal.commissionType === 'split') {
    const halfCommission = deal.commission / 2;
    depositAmount = deal.amount + halfCommission;
    depositNote = `\n${t(lang, 'commission.including_half', { half: halfCommission.toFixed(2), asset: deal.asset })}`;
  }

  // Show deposit instructions to buyer
  const buyerDepositText = t(lang, 'provideWallet.deposit_confirmed', {
    dealId: deal.dealId,
    productName: escapeMarkdown(deal.productName),
    asset: deal.asset,
    multisigAddress: deal.multisigAddress,
    depositAmount: depositAmount.toFixed(2),
    depositNote
  });

  const buyerKeyboard = mainMenuButton(lang);
  await messageManager.showFinalScreen(ctx, telegramId, 'deposit_instructions', buyerDepositText, buyerKeyboard);

  // Show private key
  const keyText = `${t(lang, 'createDeal.private_key_title')}\n\n🆔 \`${deal.dealId}\`\n\n${t(lang, 'createDeal.private_key_buyer')}\n\`${buyerPrivateKey}\`\n\n${t(lang, 'createDeal.private_key_warning')}\n${t(lang, 'createDeal.private_key_buyer_warning')}\n\n${t(lang, 'createDeal.private_key_autodelete')}`;

  const keyKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.key_saved'), `key_saved:${deal.dealId}`)]
  ]);

  const keyMsg = await ctx.telegram.sendMessage(telegramId, keyText, {
    parse_mode: 'Markdown',
    reply_markup: keyKeyboard.reply_markup
  });

  // Auto-delete after 60 seconds
  setTimeout(async () => {
    try {
      await ctx.telegram.deleteMessage(telegramId, keyMsg.message_id);
    } catch (e) {
      // Already deleted
    }
  }, 60000);

  // Notify seller
  const sellerUser = await User.findOne({ telegramId: deal.sellerId }).select('languageCode').lean();
  const sellerLang = sellerUser?.languageCode || 'ru';

  const sellerNotifyText = t(sellerLang, 'provideWallet.buyer_wallet_set_notify', {
    dealId: deal.dealId,
    productName: escapeMarkdown(deal.productName)
  });

  const sellerKeyboard = mainMenuButton(sellerLang);
  await messageManager.showNotification(ctx, deal.sellerId, sellerNotifyText, sellerKeyboard);
}

// ============================================
// SAVE WALLET PROMPT HANDLERS (for provideWallet flow)
// ============================================

/**
 * Handle save wallet prompt response (yes/no)
 */
const handleSaveWalletPromptDeal = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const action = ctx.callbackQuery.data.split(':')[1]; // 'yes' or 'no'
    const session = await getProvideWalletSession(telegramId);

    if (!session || session.step !== 'save_wallet_prompt') return;

    const { dealId, walletAddress, role } = session;
    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      await deleteProvideWalletSession(telegramId);
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.deal_not_found'), keyboard);
      return;
    }

    if (action === 'no') {
      // Skip saving, proceed with deal
      await deleteProvideWalletSession(telegramId);
      if (role === 'seller') {
        await processSellerWalletNew(ctx, telegramId, deal, walletAddress, lang);
      } else {
        await processBuyerWalletNew(ctx, telegramId, deal, walletAddress, lang);
      }
      return;
    }

    // action === 'yes' - ask for wallet name
    session.step = 'wallet_name';
    await setProvideWalletSession(telegramId, session);

    const shortAddr = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
    const text = t(lang, 'wallet.save_name_prompt', { address: shortAddr });

    const keyboard = walletNameInputDealKeyboard(lang);
    await messageManager.updateScreen(ctx, telegramId, 'wallet_name_input', text, keyboard);
  } catch (error) {
    console.error('Error in handleSaveWalletPromptDeal:', error);
  }
};

/**
 * Handle wallet name skip button in provideWallet flow
 */
const handleWalletNameSkipProvide = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const session = await getProvideWalletSession(telegramId);

    if (!session || session.step !== 'wallet_name') return;

    const { dealId, walletAddress, role } = session;
    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      await deleteProvideWalletSession(telegramId);
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.deal_not_found'), keyboard);
      return;
    }

    // Save wallet without name
    const user = await User.findOne({ telegramId });
    if (user && user.canAddWallet()) {
      await user.addWallet(walletAddress, null);
    }

    // Proceed with deal
    await deleteProvideWalletSession(telegramId);
    if (role === 'seller') {
      await processSellerWalletNew(ctx, telegramId, deal, walletAddress, lang);
    } else {
      await processBuyerWalletNew(ctx, telegramId, deal, walletAddress, lang);
    }
  } catch (error) {
    console.error('Error in handleWalletNameSkipProvide:', error);
  }
};

/**
 * Handle wallet name back button - return to save prompt
 */
const handleWalletNameBackProvide = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const session = await getProvideWalletSession(telegramId);

    if (!session) return;

    session.step = 'save_wallet_prompt';
    await setProvideWalletSession(telegramId, session);

    const shortAddr = session.walletAddress.slice(0, 6) + '...' + session.walletAddress.slice(-4);
    const text = t(lang, 'wallet.verified_save', { address: shortAddr });

    const keyboard = saveWalletPromptKeyboard(lang);
    await messageManager.updateScreen(ctx, telegramId, 'save_wallet_prompt', text, keyboard);
  } catch (error) {
    console.error('Error in handleWalletNameBackProvide:', error);
  }
};

/**
 * Handle wallet name text input in provideWallet flow
 */
const handleWalletNameInputProvide = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    const telegramId = ctx.from.id;
    const walletName = ctx.message.text.trim();

    await messageManager.deleteUserMessage(ctx);

    const session = await getProvideWalletSession(telegramId);
    if (!session || session.step !== 'wallet_name') return false;

    const { dealId, walletAddress, role } = session;
    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      await deleteProvideWalletSession(telegramId);
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.deal_not_found'), keyboard);
      return true;
    }

    // Validate name length
    if (walletName.length > 30) {
      const text = t(lang, 'wallet.name_too_long_provide');
      const keyboard = walletNameInputDealKeyboard(lang);
      await messageManager.updateScreen(ctx, telegramId, 'wallet_name_error', text, keyboard);
      return true;
    }

    // Save wallet with name
    const user = await User.findOne({ telegramId });
    if (user && user.canAddWallet()) {
      await user.addWallet(walletAddress, walletName);
    }

    // Proceed with deal
    await deleteProvideWalletSession(telegramId);
    if (role === 'seller') {
      await processSellerWalletNew(ctx, telegramId, deal, walletAddress, lang);
    } else {
      await processBuyerWalletNew(ctx, telegramId, deal, walletAddress, lang);
    }

    return true;
  } catch (error) {
    console.error('Error in handleWalletNameInputProvide:', error);
    return false;
  }
};

module.exports = {
  enterWalletHandler,
  handleSellerWalletInput,
  handleBuyerWalletInput,
  handleDepositWarningConfirmation,
  showDepositAddress,
  declineDeal,
  cancelDeal,
  handleWalletContinue,
  // Saved wallet selection for deal acceptance
  handleSelectSavedWalletDeal,
  handleEnterNewWalletDeal,
  // Save wallet prompt handlers
  handleSaveWalletPromptDeal,
  handleWalletNameSkipProvide,
  handleWalletNameBackProvide,
  handleWalletNameInputProvide,
  // Session helpers
  hasProvideWalletSession,
  deleteProvideWalletSession
};
