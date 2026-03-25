const dealService = require('../../services/dealService');
const User = require('../../models/User');
const Deal = require('../../models/Deal');
const Session = require('../../models/Session');
const { Markup } = require('telegraf');
const {
  roleSelectionKeyboard,
  counterpartyMethodKeyboard,
  inviteDealCreatedKeyboard,
  assetSelectionKeyboard,
  commissionTypeKeyboard,
  deadlineKeyboard,
  dealConfirmationKeyboard,
  dealCreatedKeyboard,
  backButton,
  mainMenuButton,
  newDealNotificationKeyboard,
  walletVerificationErrorKeyboard,
  usernameRequiredKeyboard,
  walletSelectionKeyboard,
  saveWalletPromptKeyboard,
  walletNameInputDealKeyboard,
  keepPreviousValueKeyboard
} = require('../keyboards/main');
const messageManager = require('../utils/messageManager');
const { getMainMenuText } = require('./start');
const { t, formatDate } = require('../../locales');
const blockchainService = require('../../services/blockchain');
const adminAlertService = require('../../services/adminAlertService');
const {
  MIN_DEAL_AMOUNT
} = require('../../config/constants');

// Escape special Markdown characters
function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/([_*`\[\]])/g, '\\$1');
}

// Helper to get deadline text from hours
function getDeadlineText(lang, hours) {
  if (hours === 24) return t(lang, 'deadlineText.hours_24');
  if (hours === 48) return t(lang, 'deadlineText.hours_48');
  if (hours === 72) return t(lang, 'deadlineText.days_3');
  if (hours === 168) return t(lang, 'deadlineText.days_7');
  if (hours === 336) return t(lang, 'deadlineText.days_14');
  if (hours < 24) return t(lang, 'deadlineText.hours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days === 1) return t(lang, 'deadlineText.day_1');
  if (days >= 2 && days <= 4) return t(lang, 'deadlineText.days_few', { n: days });
  return t(lang, 'deadlineText.days_many', { n: days });
}

// ============================================
// SESSION HELPERS (MongoDB persistence)
// ============================================

async function getCreateDealSession(telegramId) {
  return await Session.getSession(telegramId, 'create_deal');
}

async function setCreateDealSession(telegramId, sessionData) {
  await Session.setSession(telegramId, 'create_deal', sessionData, 2); // 2 hours TTL
}

async function deleteCreateDealSession(telegramId) {
  await Session.deleteSession(telegramId, 'create_deal');
}

async function hasCreateDealSession(telegramId) {
  const session = await getCreateDealSession(telegramId);
  return !!session;
}

// ============================================
// STEP 1: START DEAL CREATION
// ============================================

const startCreateDeal = async (ctx) => {
  try {
    const isCallbackQuery = !!ctx.callbackQuery;
    if (isCallbackQuery) await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';

    // Check if user is banned
    const user = await User.findOne({ telegramId });
    if (user?.blacklisted) {
      const text = t(lang, 'welcome.account_blocked');
      const keyboard = mainMenuButton(lang);
      await messageManager.navigateToScreen(ctx, telegramId, 'banned', text, keyboard);
      return;
    }

    // Check if user has username
    const currentUsername = ctx.from.username;
    if (!currentUsername) {
      const text = t(lang, 'welcome.username_required');

      const keyboard = usernameRequiredKeyboard(lang);
      await messageManager.navigateToScreen(ctx, telegramId, 'username_required', text, keyboard);
      return;
    }

    // Update username in DB if changed
    if (user && user.username !== currentUsername) {
      user.username = currentUsername;
      await user.save();
    }

    // Check if user has a deal pending key validation
    const pendingDeal = await dealService.getDealPendingKeyValidation(telegramId);
    if (pendingDeal) {
      const isBuyer = pendingDeal.buyerId === telegramId;
      const refundAmount = pendingDeal.amount - pendingDeal.commission;

      if (pendingDeal.pendingKeyValidation === 'buyer_refund' && isBuyer) {
        const text = t(lang, 'createDeal.pending_buyer_refund', {
          dealId: pendingDeal.dealId,
          refundAmount: refundAmount.toFixed(2),
          asset: pendingDeal.asset,
          commission: pendingDeal.commission.toFixed(2)
        });

        const keyboard = mainMenuButton(lang);
        await messageManager.navigateToScreen(ctx, telegramId, 'pending_refund', text, keyboard);
        return;
      }

      if ((pendingDeal.pendingKeyValidation === 'seller_payout' || pendingDeal.pendingKeyValidation === 'seller_release') && !isBuyer) {
        const text = t(lang, 'createDeal.pending_seller_payout', {
          dealId: pendingDeal.dealId,
          payoutAmount: refundAmount.toFixed(2),
          asset: pendingDeal.asset,
          commission: pendingDeal.commission.toFixed(2)
        });

        const keyboard = mainMenuButton(lang);
        await messageManager.navigateToScreen(ctx, telegramId, 'pending_payout', text, keyboard);
        return;
      }

      // Other party has pending validation - inform them
      const text = t(lang, 'createDeal.pending_other_party', { dealId: pendingDeal.dealId });
      const keyboard = mainMenuButton(lang);
      await messageManager.navigateToScreen(ctx, telegramId, 'pending_deal', text, keyboard);
      return;
    }

    // Check if user hasn't reached the deals limit
    if (!(await dealService.canCreateNewDeal(telegramId))) {
      const count = await dealService.countActiveDeals(telegramId);
      const { MAX_ACTIVE_DEALS_PER_USER } = require('../../config/constants');
      const text = t(lang, 'createDeal.error_deals_limit', { count, max: MAX_ACTIVE_DEALS_PER_USER });
      const keyboard = mainMenuButton(lang);
      await messageManager.navigateToScreen(ctx, telegramId, 'has_active_deal', text, keyboard);
      return;
    }

    // Initialize session
    await setCreateDealSession(telegramId, {
      step: 'role_selection',
      data: {},
      createdAt: Date.now()
    });

    const text = t(lang, 'createDeal.step1_role');

    const keyboard = roleSelectionKeyboard(lang);
    await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_role', text, keyboard);
  } catch (error) {
    console.error('Error starting deal creation:', error);
  }
};

// ============================================
// STEP 2: ROLE SELECTION
// ============================================

const handleRoleSelection = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';
    const session = await getCreateDealSession(telegramId);

    // Allow re-selection for back navigation (don't check step strictly)
    if (!session) {
      // Session expired - restart deal creation
      return await startCreateDeal(ctx);
    }

    const role = ctx.callbackQuery.data.split(':')[1];
    session.data.creatorRole = role;
    session.step = 'counterparty_method';
    await setCreateDealSession(telegramId, session);

    const counterpartyLabel = role === 'buyer' ? t(lang, 'role.seller_gen') : t(lang, 'role.buyer_gen');

    const text = t(lang, 'createDeal.step2_method', { counterpartyLabel });

    const keyboard = counterpartyMethodKeyboard(lang);
    await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_method', text, keyboard);
  } catch (error) {
    console.error('Error handling role selection:', error);
  }
};

// ============================================
// STEP 2b: COUNTERPARTY METHOD SELECTION
// ============================================

const handleCounterpartyMethod = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';
    const session = await getCreateDealSession(telegramId);

    console.log(`🔍 handleCounterpartyMethod: user=${telegramId}, session=${session ? 'exists' : 'null'}`);

    if (!session) {
      console.log(`⚠️ No create_deal session for user ${telegramId}`);
      // Session expired - restart deal creation
      return await startCreateDeal(ctx);
    }

    const method = ctx.callbackQuery.data.split(':')[1];

    // Clear previous method data when switching
    delete session.data.counterpartyUsername;
    delete session.data.counterpartyId;
    delete session.data.isInviteLink;

    session.data.counterpartyMethod = method;

    if (method === 'username') {
      // Standard flow - ask for username
      session.step = 'counterparty_username';
      await setCreateDealSession(telegramId, session);

      const counterpartyLabel = session.data.creatorRole === 'buyer' ? t(lang, 'role.seller_gen') : t(lang, 'role.buyer_gen');

      const text = t(lang, 'createDeal.step3_username', { counterpartyLabel });

      const keyboard = backButton(lang);
      await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_username', text, keyboard);
    } else {
      // Invite link flow - skip username, go to product name
      session.step = 'product_name';
      session.data.isInviteLink = true;
      await setCreateDealSession(telegramId, session);

      const text = t(lang, 'createDeal.step3_product');

      const keyboard = backButton(lang);
      await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_name', text, keyboard);
    }
  } catch (error) {
    console.error('Error handling counterparty method:', error);
  }
};

// ============================================
// TEXT INPUT HANDLER
// ============================================

const handleCreateDealInput = async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';
    const session = await getCreateDealSession(telegramId);

    if (!session) return;

    const text = ctx.message.text.trim();

    // Delete user's message immediately
    await messageManager.deleteUserMessage(ctx);

    // Handle /cancel
    if (text === '/cancel') {
      await deleteCreateDealSession(telegramId);
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'cancelled', t(lang, 'common.deal_creation_cancelled'), keyboard);
      return;
    }

    switch (session.step) {
      case 'counterparty_username':
        await handleCounterpartyUsername(ctx, session, text);
        break;

      case 'product_name':
        await handleProductName(ctx, session, text);
        break;

      case 'description':
        await handleDescription(ctx, session, text);
        break;

      case 'amount':
        await handleAmount(ctx, session, text);
        break;

      case 'creator_wallet':
        await handleCreatorWallet(ctx, session, text);
        break;

      case 'wallet_name':
        await handleWalletNameDeal(ctx, session, text);
        break;

      default:
        break;
    }
  } catch (error) {
    console.error('Error handling deal creation input:', error);
  }
};

// ============================================
// STEP 2b: COUNTERPARTY USERNAME
// ============================================

const handleCounterpartyUsername = async (ctx, session, text) => {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';
  const creatorRole = session.data.creatorRole;
  const username = text.replace('@', '');

  // Check if trying to create deal with themselves
  if (username.toLowerCase() === ctx.from.username?.toLowerCase()) {
    const errorText = t(lang, 'createDeal.error_self_deal');
    const keyboard = backButton(lang);
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_username', errorText, keyboard);
    return;
  }

  // Find counterparty
  const counterparty = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
  const counterpartyLabel = creatorRole === 'buyer' ? t(lang, 'role.seller') : t(lang, 'role.buyer');

  if (!counterparty) {
    const errorText = t(lang, 'createDeal.error_user_not_found', { username });
    const keyboard = backButton(lang);
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_username', errorText, keyboard);
    return;
  }

  if (counterparty.blacklisted) {
    const errorText = t(lang, 'createDeal.error_user_blocked');
    const keyboard = backButton(lang);
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_username', errorText, keyboard);
    return;
  }

  if (!(await dealService.canCreateNewDeal(counterparty.telegramId))) {
    const count = await dealService.countActiveDeals(counterparty.telegramId);
    const { MAX_ACTIVE_DEALS_PER_USER } = require('../../config/constants');
    const errorText = t(lang, 'createDeal.error_counterparty_limit', { username, count, max: MAX_ACTIVE_DEALS_PER_USER });
    const keyboard = backButton(lang);
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_username', errorText, keyboard);
    return;
  }

  // Assign roles
  if (creatorRole === 'buyer') {
    session.data.buyerId = telegramId;
    session.data.sellerId = counterparty.telegramId;
    session.data.sellerUsername = counterparty.username;
  } else {
    session.data.sellerId = telegramId;
    session.data.buyerId = counterparty.telegramId;
    session.data.buyerUsername = counterparty.username;
  }

  session.step = 'product_name';
  await setCreateDealSession(telegramId, session);

  // Get rating display for counterparty
  const ratingDisplay = counterparty.getRatingDisplay ? counterparty.getRatingDisplay(lang) :
    (counterparty.ratingsCount > 0 ? `⭐ ${counterparty.averageRating} (${counterparty.ratingsCount})` : t(lang, 'common.no_reviews'));

  const successText = t(lang, 'createDeal.step3_username_found', {
    counterpartyLabel,
    username: counterparty.username,
    ratingDisplay
  });

  const keyboard = backButton(lang);
  await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_name', successText, keyboard);
};

// ============================================
// STEP 3: PRODUCT NAME
// ============================================

const handleProductName = async (ctx, session, text) => {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  if (text.length < 5 || text.length > 200) {
    const errorText = t(lang, 'createDeal.error_name_length', { length: text.length });
    const keyboard = backButton(lang);
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_name', errorText, keyboard);
    return;
  }

  session.data.productName = text;
  session.step = 'description';
  await setCreateDealSession(telegramId, session);

  const successText = t(lang, 'createDeal.step4_description');

  const keyboard = backButton(lang);
  await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_description', successText, keyboard);
};

// ============================================
// STEP 4: DESCRIPTION
// ============================================

const handleDescription = async (ctx, session, text) => {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  if (text.length < 20 || text.length > 5000) {
    const errorText = t(lang, 'createDeal.error_desc_length', { length: text.length });
    const keyboard = backButton(lang);
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_description', errorText, keyboard);
    return;
  }

  session.data.description = text;
  session.step = 'asset';
  await setCreateDealSession(telegramId, session);

  const successText = t(lang, 'createDeal.step5_asset');

  const keyboard = assetSelectionKeyboard(lang);
  await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_asset', successText, keyboard);
};

// ============================================
// STEP 5: ASSET SELECTION
// ============================================

const handleAssetSelection = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';
    const session = await getCreateDealSession(telegramId);

    // Allow re-selection for back navigation (don't check step strictly)
    if (!session) {
      // Session expired - restart deal creation
      return await startCreateDeal(ctx);
    }

    const asset = ctx.callbackQuery.data.split(':')[1];
    session.data.asset = asset;
    session.step = 'amount';
    await setCreateDealSession(telegramId, session);

    const text = t(lang, 'createDeal.step6_amount', { asset, minAmount: MIN_DEAL_AMOUNT });

    const keyboard = backButton(lang);
    await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_amount', text, keyboard);
  } catch (error) {
    console.error('Error handling asset selection:', error);
  }
};

// ============================================
// STEP 6: AMOUNT
// ============================================

const handleAmount = async (ctx, session, text) => {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';
  const amount = parseFloat(text);

  if (isNaN(amount) || amount < 50) {
    const errorText = t(lang, 'createDeal.error_amount');
    const keyboard = backButton(lang);
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_amount', errorText, keyboard);
    return;
  }

  session.data.amount = amount;
  session.step = 'commission';
  await setCreateDealSession(telegramId, session);

  const { asset } = session.data;
  const commission = Deal.calculateCommission(amount);

  const successText = t(lang, 'createDeal.step7_commission', { amount, asset, commission });

  const keyboard = commissionTypeKeyboard(amount, asset, lang);
  await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_commission', successText, keyboard);
};

// ============================================
// STEP 9: CREATOR WALLET (with validation)
// - Buyer: balance check (amount + 5 USDT buffer)
// - Seller: existence check only
// ============================================

const handleCreatorWallet = async (ctx, session, inputText) => {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';
  const address = inputText.trim();

  if (!blockchainService.isValidAddress(address)) {
    const errorText = t(lang, 'wallet.invalid_format_short');
    const keyboard = backButton(lang);
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_wallet', errorText, keyboard);
    return;
  }

  const { data } = session;
  const creatorRole = data.creatorRole;

  // Store wallet based on creator role
  if (creatorRole === 'buyer') {
    session.data.buyerAddress = address;
  } else {
    session.data.sellerAddress = address;
  }

  // Show verification loading for both roles
  await User.updateOne({ telegramId }, { currentScreen: 'wallet_verification' });
  await messageManager.updateScreen(ctx, telegramId, 'wallet_verification', t(lang, 'common.checking_address'), {});

  // For BUYER: verify wallet has sufficient balance
  if (creatorRole === 'buyer') {
    // Calculate required amount
    const commission = Deal.calculateCommission(data.amount);
    let depositAmount = data.amount;
    if (data.commissionType === 'buyer') {
      depositAmount = data.amount + commission;
    } else if (data.commissionType === 'split') {
      depositAmount = data.amount + (commission / 2);
    }
    const requiredAmount = depositAmount + 5; // +5 USDT buffer

    // Verify wallet balance
    const verification = await blockchainService.verifyBuyerWallet(address, requiredAmount, depositAmount);

    if (!verification.valid) {
      // Store session for retry
      session.step = 'creator_wallet';
      await setCreateDealSession(telegramId, session);

      let errorMessage;
      if (verification.errorType === 'invalid_address') {
        errorMessage = t(lang, 'wallet.invalid_address');
      } else if (verification.errorType === 'not_found') {
        errorMessage = t(lang, 'wallet.not_found');
      } else if (verification.errorType === 'insufficient_funds' || verification.errorType === 'no_buffer') {
        // Show warning with choice instead of blocking
        const currentBalance = verification.balance || 0;
        const warningMessage = t(lang, 'wallet.balance_warning', {
          balance: currentBalance.toFixed(2),
          depositAmount
        });

        // Save wallet address before showing choice
        session.data.pendingBuyerAddress = address;
        session.step = 'wallet_balance_warning';
        await setCreateDealSession(telegramId, session);

        const keyboard = {
          inline_keyboard: [
            [{ text: t(lang, 'btn.continue_funds'), callback_data: 'wallet_continue_anyway' }],
            [{ text: t(lang, 'btn.change_wallet'), callback_data: 'wallet_change_address' }],
            [{ text: t(lang, 'btn.back'), callback_data: 'back' }]
          ]
        };
        await messageManager.updateScreen(ctx, telegramId, 'wallet_balance_warning', warningMessage, keyboard);
        return;
      } else {
        errorMessage = t(lang, 'wallet.check_error');
      }

      const keyboard = backButton(lang);
      await messageManager.updateScreen(ctx, telegramId, 'create_deal_wallet', errorMessage, keyboard);
      return;
    }

    // Wallet valid - show success for 3 seconds (don't show balance for privacy)
    const successText = t(lang, 'wallet.verified_short', { address });

    await User.updateOne({ telegramId }, { currentScreen: 'wallet_verified' });
    await messageManager.updateScreen(ctx, telegramId, 'wallet_verified', successText, {});
    await new Promise(resolve => setTimeout(resolve, 3000));

  } else {
    // For SELLER: verify wallet exists (no balance check needed)
    const verification = await blockchainService.verifyWalletExists(address);

    if (!verification.valid) {
      // Store session for retry
      session.step = 'creator_wallet';
      await setCreateDealSession(telegramId, session);

      let errorMessage;
      if (verification.errorType === 'invalid_address') {
        errorMessage = t(lang, 'wallet.invalid_address');
      } else if (verification.errorType === 'not_found') {
        errorMessage = t(lang, 'wallet.not_found_detailed');
      } else {
        errorMessage = t(lang, 'wallet.check_error');
      }

      const keyboard = backButton(lang);
      await messageManager.updateScreen(ctx, telegramId, 'create_deal_wallet', errorMessage, keyboard);
      return;
    }

    // Wallet valid - show success
    const successText = t(lang, 'wallet.verified', { address });

    await User.updateOne({ telegramId }, { currentScreen: 'wallet_verified' });
    await messageManager.updateScreen(ctx, telegramId, 'wallet_verified', successText, {});
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Check if user can save wallet and if it's not already saved
  const user = await User.findOne({ telegramId }).select('wallets');
  const wallets = user?.wallets || [];
  const alreadySaved = wallets.some(w => w.address.toLowerCase() === address.toLowerCase());

  if (!alreadySaved && wallets.length < 5) {
    // Offer to save the wallet
    session.step = 'save_wallet_prompt';
    await setCreateDealSession(telegramId, session);

    const shortAddr = address.slice(0, 6) + '...' + address.slice(-4);

    const promptText = t(lang, 'wallet.verified_save', { address: shortAddr });

    const keyboard = saveWalletPromptKeyboard(lang);
    await messageManager.updateScreen(ctx, telegramId, 'save_wallet_prompt', promptText, keyboard);
    return;
  }

  // Wallet already saved or limit reached - proceed to confirmation
  session.step = 'confirm';
  await setCreateDealSession(telegramId, session);

  await showDealConfirmation(ctx, telegramId, session.data);
};

/**
 * Handle wallet name input during deal creation
 */
const handleWalletNameDeal = async (ctx, session, walletName) => {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  // Delete user message
  await messageManager.deleteUserMessage(ctx);

  // Validate name length
  if (walletName.length > 30) {
    const text = t(lang, 'wallet.name_too_long');

    const keyboard = walletNameInputDealKeyboard(lang);
    await messageManager.updateScreen(ctx, telegramId, 'wallet_name_input', text, keyboard);
    return;
  }

  // Save wallet with name
  const address = session.data.creatorRole === 'buyer'
    ? session.data.buyerAddress
    : session.data.sellerAddress;

  const user = await User.findOne({ telegramId });
  if (user && user.canAddWallet()) {
    await user.addWallet(address, walletName);
  }

  // Proceed to confirmation
  session.step = 'confirm';
  await setCreateDealSession(telegramId, session);

  await showDealConfirmation(ctx, telegramId, session.data);
};

/**
 * Show deal confirmation screen
 */
const showDealConfirmation = async (ctx, telegramId, data) => {
  const lang = ctx.state?.lang || 'ru';
  const commission = Deal.calculateCommission(data.amount);

  let commissionText;
  if (data.commissionType === 'buyer') {
    commissionText = t(lang, 'commission.buyer_text', { commission: commission.toFixed(2), asset: data.asset });
  } else if (data.commissionType === 'seller') {
    commissionText = t(lang, 'commission.seller_text', { commission: commission.toFixed(2), asset: data.asset });
  } else {
    commissionText = t(lang, 'commission.split_text', { half: (commission / 2).toFixed(2), asset: data.asset });
  }

  const counterpartyLabel = data.creatorRole === 'buyer' ? t(lang, 'role.seller') : t(lang, 'role.buyer');
  const counterpartyUsername = data.creatorRole === 'buyer' ? data.sellerUsername : data.buyerUsername;

  const hours = data.deadlineHours;
  const deadlineText = getDeadlineText(lang, hours);

  const text = `${t(lang, 'createDeal.confirm_title')}

${t(lang, 'myDeals.product_label')} ${escapeMarkdown(data.productName)}

${t(lang, 'myDeals.description_label')}
${escapeMarkdown(data.description.substring(0, 200))}${data.description.length > 200 ? '...' : ''}

${t(lang, 'myDeals.counterparty_label', { role: counterpartyLabel })} \`@${counterpartyUsername}\`
${t(lang, 'myDeals.amount_label')} ${data.amount} ${data.asset}
${t(lang, 'myDeals.commission_label')} ${commissionText}
${t(lang, 'myDeals.deadline_label')} ${deadlineText}

${t(lang, 'createDeal.confirm_check')}`;

  const keyboard = dealConfirmationKeyboard(lang);
  await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_confirm', text, keyboard);
};

// ============================================
// WALLET BALANCE WARNING HANDLERS
// ============================================

/**
 * Handle "Continue anyway" - user confirms they have funds on exchange
 */
const handleWalletContinueAnyway = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';

    const session = await getCreateDealSession(telegramId);
    if (!session || !session.data.pendingBuyerAddress) {
      await ctx.answerCbQuery(t(lang, 'common.session_expired_restart'), { show_alert: true });
      return;
    }

    const address = session.data.pendingBuyerAddress;

    // Set the buyer address and clear pending
    session.data.buyerAddress = address;
    delete session.data.pendingBuyerAddress;
    session.step = 'confirm';
    await setCreateDealSession(telegramId, session);

    // Show success and proceed to confirmation
    const successText = t(lang, 'wallet.accepted', { address });

    await User.updateOne({ telegramId }, { currentScreen: 'wallet_verified' });
    await messageManager.updateScreen(ctx, telegramId, 'wallet_verified', successText, {});
    await new Promise(resolve => setTimeout(resolve, 2000));

    await showDealConfirmation(ctx, telegramId, session.data);
  } catch (error) {
    console.error('Error in handleWalletContinueAnyway:', error);
  }
};

/**
 * Handle "Change address" - user wants to enter different wallet
 */
const handleWalletChangeAddress = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';

    const session = await getCreateDealSession(telegramId);
    if (!session) {
      await ctx.answerCbQuery(t(lang, 'common.session_expired_restart'), { show_alert: true });
      return;
    }

    // Clear pending address and go back to wallet input
    delete session.data.pendingBuyerAddress;
    session.step = 'creator_wallet';
    await setCreateDealSession(telegramId, session);

    const text = t(lang, 'createDeal.wallet_reentry');

    const keyboard = backButton(lang);
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_wallet', text, keyboard);
  } catch (error) {
    console.error('Error in handleWalletChangeAddress:', error);
  }
};

// ============================================
// STEP 8: COMMISSION SELECTION
// ============================================

const handleCommissionSelection = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';
    const session = await getCreateDealSession(telegramId);

    // Allow re-selection for back navigation (don't check step strictly)
    if (!session) {
      // Session expired - restart deal creation
      return await startCreateDeal(ctx);
    }

    const commissionType = ctx.callbackQuery.data.split(':')[1];
    session.data.commissionType = commissionType;
    session.step = 'deadline';
    await setCreateDealSession(telegramId, session);

    const text = t(lang, 'createDeal.step8_deadline');

    const keyboard = deadlineKeyboard(lang);
    await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_deadline', text, keyboard);
  } catch (error) {
    console.error('Error handling commission selection:', error);
  }
};

// ============================================
// STEP 9: DEADLINE SELECTION
// ============================================

const handleDeadlineSelection = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';
    const session = await getCreateDealSession(telegramId);

    // Allow re-selection for back navigation (don't check step strictly)
    if (!session) {
      // Session expired - restart deal creation
      return await startCreateDeal(ctx);
    }

    const hours = parseInt(ctx.callbackQuery.data.split(':')[1]);
    session.data.deadlineHours = hours;

    // Check if user has saved wallets
    const user = await User.findOne({ telegramId }).select('wallets');
    const savedWallets = user?.wallets || [];

    const creatorRole = session.data.creatorRole;
    const walletPurpose = creatorRole === 'buyer'
      ? t(lang, 'wallet.purpose_buyer')
      : t(lang, 'wallet.purpose_seller');

    if (savedWallets.length > 0) {
      // User has saved wallets - show selection screen
      session.step = 'select_wallet';
      await setCreateDealSession(telegramId, session);

      const text = t(lang, 'createDeal.step9_wallet', { walletPurpose });

      const keyboard = walletSelectionKeyboard(savedWallets, true, lang);
      await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_select_wallet', text, keyboard);
    } else {
      // No saved wallets - go directly to wallet input
      session.step = 'creator_wallet';
      await setCreateDealSession(telegramId, session);

      const text = t(lang, 'createDeal.step9_wallet_input', { walletPurpose });

      const keyboard = backButton(lang);
      await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_wallet', text, keyboard);
    }
  } catch (error) {
    console.error('Error handling deadline selection:', error);
  }
};

// ============================================
// CONFIRM AND CREATE DEAL
// ============================================

/**
 * Finalize deal creation - shared logic for both regular and template flows
 * @param {Object} ctx - Telegraf context
 * @param {Object} sessionData - Deal data from session
 * @param {string} creatorUsername - Creator's username
 * @returns {Object} - Created deal
 */
const finalizeDealCreation = async (ctx, sessionData, creatorUsername) => {
  const lang = ctx.state?.lang || 'ru';
  const result = await dealService.createDeal(sessionData);
  const { deal, wallet, creatorPrivateKey } = result;

  // Get creator's rating for notification to counterparty (lang resolved later per counterparty)

  // Calculate amounts
  const commission = deal.commission;
  let depositAmount = deal.amount;

  if (deal.commissionType === 'buyer') {
    depositAmount = deal.amount + commission;
  } else if (deal.commissionType === 'split') {
    depositAmount = deal.amount + (commission / 2);
  }

  let sellerPayout = deal.amount;
  if (deal.commissionType === 'seller') {
    sellerPayout = deal.amount - commission;
  } else if (deal.commissionType === 'split') {
    sellerPayout = deal.amount - (commission / 2);
  }

  // ========== NOTIFY CREATOR (first - main message) ==========
  if (deal.creatorRole === 'buyer') {
    // Buyer created - waiting for seller wallet
    const creatorText = `${t(lang, 'createDeal.deal_created')}

🆔 ID: \`${deal.dealId}\`
📦 ${escapeMarkdown(deal.productName)}

💰 ${t(lang, 'myDeals.amount_label')} ${deal.amount} ${deal.asset}
📊 ${t(lang, 'myDeals.commission_label')} ${commission} ${deal.asset}
💸 ${t(lang, 'myDeals.you_pay')} ${depositAmount} ${deal.asset}

${t(lang, 'createDeal.waiting_seller_wallet')}

${t(lang, 'createDeal.seller_notified')}`;

    const creatorKeyboard = dealCreatedKeyboard(deal.dealId, lang);
    await messageManager.showFinalScreen(ctx, deal.buyerId, 'deal_created', creatorText, creatorKeyboard);

    // ========== SHOW PRIVATE KEY (separate message below with button) ==========
    const keyText = `${t(lang, 'createDeal.private_key_title')}

🆔 ${t(lang, 'myDeals.deal_label', { dealId: deal.dealId })}

${t(lang, 'createDeal.private_key_buyer')}
\`${creatorPrivateKey}\`

${t(lang, 'createDeal.private_key_warning')}
${t(lang, 'createDeal.private_key_buyer_warning')}

${t(lang, 'createDeal.private_key_autodelete')}`;

    const keyKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.key_saved'), `key_saved:${deal.dealId}`)]
    ]);

    const keyMsg = await ctx.telegram.sendMessage(deal.buyerId, keyText, {
      parse_mode: 'Markdown',
      reply_markup: keyKeyboard.reply_markup
    });

    // Auto-delete after 60 seconds
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(deal.buyerId, keyMsg.message_id);
      } catch (e) {
        // Already deleted by button
      }
    }, 60000);

    // Notify seller (use counterparty's language)
    const counterpartyUser = await User.findOne({ telegramId: deal.sellerId }).select('languageCode').lean();
    const counterpartyLang = counterpartyUser?.languageCode || 'ru';
    const creatorRatingDisplay = await User.getRatingDisplayById(deal.creatorId, counterpartyLang);

    const sellerText = `${t(counterpartyLang, 'createDeal.new_deal_notification')}

🆔 ID: \`${deal.dealId}\`
📦 ${escapeMarkdown(deal.productName)}

📝 ${escapeMarkdown(deal.description.substring(0, 200))}${deal.description.length > 200 ? '...' : ''}

💰 ${t(counterpartyLang, 'myDeals.amount_label')} ${deal.amount} ${deal.asset}
💸 ${t(counterpartyLang, 'myDeals.you_receive')} ${sellerPayout} ${deal.asset}
👤 ${t(counterpartyLang, 'role.buyer')}: \`@${creatorUsername}\`
📊 ${creatorRatingDisplay}

${t(counterpartyLang, 'createDeal.provide_wallet_prompt')}`;

    const sellerKeyboard = newDealNotificationKeyboard(deal.dealId, counterpartyLang);
    await messageManager.showNotification(ctx, deal.sellerId, sellerText, sellerKeyboard);
  } else {
    // Seller created - waiting for buyer wallet
    const creatorText = `${t(lang, 'createDeal.deal_created')}

🆔 ID: \`${deal.dealId}\`
📦 ${escapeMarkdown(deal.productName)}

💰 ${t(lang, 'myDeals.amount_label')} ${deal.amount} ${deal.asset}
💸 ${t(lang, 'myDeals.you_receive')} ${sellerPayout} ${deal.asset}

${t(lang, 'createDeal.waiting_buyer_wallet')}

${t(lang, 'createDeal.buyer_notified')}`;

    const creatorKeyboard = dealCreatedKeyboard(deal.dealId, lang);
    await messageManager.showFinalScreen(ctx, deal.sellerId, 'deal_created', creatorText, creatorKeyboard);

    // ========== SHOW PRIVATE KEY (separate message below with button) ==========
    const keyText = `${t(lang, 'createDeal.private_key_title')}

🆔 ${t(lang, 'myDeals.deal_label', { dealId: deal.dealId })}

${t(lang, 'createDeal.private_key_seller')}
\`${creatorPrivateKey}\`

${t(lang, 'createDeal.private_key_warning')}
${t(lang, 'createDeal.private_key_seller_warning')}

${t(lang, 'createDeal.private_key_autodelete')}`;

    const keyKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.key_saved'), `key_saved:${deal.dealId}`)]
    ]);

    const keyMsg = await ctx.telegram.sendMessage(deal.sellerId, keyText, {
      parse_mode: 'Markdown',
      reply_markup: keyKeyboard.reply_markup
    });

    // Auto-delete after 60 seconds
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(deal.sellerId, keyMsg.message_id);
      } catch (e) {
        // Already deleted by button
      }
    }, 60000);

    // Notify buyer (use counterparty's language)
    const counterpartyUser = await User.findOne({ telegramId: deal.buyerId }).select('languageCode').lean();
    const counterpartyLang = counterpartyUser?.languageCode || 'ru';
    const creatorRatingDisplay = await User.getRatingDisplayById(deal.creatorId, counterpartyLang);

    const buyerText = `${t(counterpartyLang, 'createDeal.new_deal_notification')}

🆔 ID: \`${deal.dealId}\`
📦 ${escapeMarkdown(deal.productName)}

📝 ${escapeMarkdown(deal.description.substring(0, 200))}${deal.description.length > 200 ? '...' : ''}

💰 ${t(counterpartyLang, 'myDeals.amount_label')} ${deal.amount} ${deal.asset}
💸 ${t(counterpartyLang, 'myDeals.you_pay')} ${depositAmount} ${deal.asset}
👤 ${t(counterpartyLang, 'role.seller')}: \`@${creatorUsername}\`
📊 ${creatorRatingDisplay}

${t(counterpartyLang, 'createDeal.provide_wallet_prompt')}`;

    const buyerKeyboard = newDealNotificationKeyboard(deal.dealId, counterpartyLang);
    await messageManager.showNotification(ctx, deal.buyerId, buyerText, buyerKeyboard);
  }

  // Alert admin about new deal
  await adminAlertService.alertNewDeal(deal);

  console.log(`✅ Deal ${deal.dealId} created by ${deal.creatorId}`);

  return deal;
};

const confirmCreateDeal = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';
    const session = await getCreateDealSession(telegramId);

    if (!session || session.step !== 'confirm') return;

    // Check if this is an invite link deal
    if (session.data.isInviteLink) {
      // Use invite deal flow (no counterparty yet)
      await confirmInviteDeal(ctx, session);
    } else {
      // Standard deal flow with counterparty
      // Show loading (use updateScreen for silent edit)
      await messageManager.updateScreen(ctx, telegramId, 'create_deal_loading', t(lang, 'common.creating_deal_multisig'), {});

      // Use shared finalization logic (handles all notifications)
      await finalizeDealCreation(ctx, session.data, ctx.from.username);

      // Clean up session
      await deleteCreateDealSession(telegramId);
    }
  } catch (error) {
    console.error('Error confirming deal creation:', error);

    const lang = ctx.state?.lang || 'ru';
    await deleteCreateDealSession(ctx.from.id);

    const errorText = t(lang, 'createDeal.error_creation', { message: error.message });

    const keyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, ctx.from.id, 'error', errorText, keyboard);
  }
};

// ============================================
// CANCEL DEAL CREATION
// ============================================

const cancelCreateDeal = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';
    await deleteCreateDealSession(telegramId);

    const keyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'cancelled', t(lang, 'common.deal_creation_cancelled'), keyboard);
  } catch (error) {
    console.error('Error canceling deal creation:', error);
  }
};

// ============================================
// BACK NAVIGATION HANDLER (for deal creation)
// Updates session.step when going back
// ============================================

/**
 * Map screen names to session steps and display functions
 */
const SCREEN_TO_STEP = {
  'create_deal_role': 'role_selection',
  'create_deal_method': 'counterparty_method',
  'create_deal_username': 'counterparty_username',
  'create_deal_name': 'product_name',
  'create_deal_description': 'description',
  'create_deal_asset': 'asset',
  'create_deal_amount': 'amount',
  'create_deal_commission': 'commission',
  'create_deal_deadline': 'deadline',
  'create_deal_wallet': 'creator_wallet',
  'create_deal_select_wallet': 'select_wallet',
  'create_deal_confirm': 'confirm'
};

/**
 * Handle back navigation during deal creation
 * Updates session step and shows previous screen with saved data
 */
const handleCreateDealBack = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const session = await getCreateDealSession(telegramId);

    if (!session) {
      // No session - just go back normally
      return false;
    }

    // Get user's navigation stack to find previous screen
    const user = await User.findOne({ telegramId }).select('navigationStack').lean();
    const stack = user?.navigationStack || [];

    if (stack.length === 0) {
      // No previous screen - clear session and go to main menu
      await deleteCreateDealSession(telegramId);
      return false;
    }

    // Get previous screen from stack
    const previousScreen = stack[stack.length - 1];
    const previousScreenName = previousScreen?.screen;

    // Check if previous screen is part of deal creation
    const previousStep = SCREEN_TO_STEP[previousScreenName];

    if (!previousStep) {
      // Previous screen is not part of deal creation - clear session
      await deleteCreateDealSession(telegramId);
      return false;
    }

    // Update session step to match the screen we're returning to
    session.step = previousStep;
    await setCreateDealSession(telegramId, session);

    // Show the previous screen with correct content and working buttons
    await showDealCreationScreen(ctx, telegramId, session, previousStep);

    return true;
  } catch (error) {
    console.error('Error in handleCreateDealBack:', error);
    return false;
  }
};

/**
 * Show a specific deal creation screen with session data
 */
const showDealCreationScreen = async (ctx, telegramId, session, step) => {
  const lang = ctx.state?.lang || 'ru';
  const { data } = session;
  let text, keyboard;

  switch (step) {
    case 'role_selection':
      text = t(lang, 'createDeal.step1_role');
      if (data.creatorRole) {
        const roleValue = data.creatorRole === 'buyer' ? t(lang, 'role.buyer') : t(lang, 'role.seller');
        text += `\n\n${t(lang, 'createDeal.previously_selected', { value: roleValue })}`;
      }
      keyboard = roleSelectionKeyboard(lang);
      break;

    case 'counterparty_method':
      const counterpartyLabelMethod = data.creatorRole === 'buyer' ? t(lang, 'role.seller_gen') : t(lang, 'role.buyer_gen');
      text = t(lang, 'createDeal.step2_method', { counterpartyLabel: counterpartyLabelMethod });
      keyboard = counterpartyMethodKeyboard(lang);
      break;

    case 'counterparty_username':
      const counterpartyLabel1 = data.creatorRole === 'buyer' ? t(lang, 'role.seller_gen') : t(lang, 'role.buyer_gen');
      const savedUsername = data.creatorRole === 'buyer' ? data.sellerUsername : data.buyerUsername;

      text = t(lang, 'createDeal.step3_username', { counterpartyLabel: counterpartyLabel1 });

      if (savedUsername) {
        text += `\n\n${t(lang, 'createDeal.previously_entered_username', { username: savedUsername })}`;
        keyboard = keepPreviousValueKeyboard('counterparty_username', `@${savedUsername}`, lang);
      } else {
        keyboard = backButton(lang);
      }
      break;

    case 'product_name':
      const counterpartyLabel2 = data.creatorRole === 'buyer' ? t(lang, 'role.seller') : t(lang, 'role.buyer');
      const counterpartyUsername = data.creatorRole === 'buyer' ? data.sellerUsername : data.buyerUsername;

      // Different header for invite link flow (no counterparty yet)
      if (data.isInviteLink) {
        text = t(lang, 'createDeal.step3_product');
      } else {
        text = t(lang, 'createDeal.step3_username_found', {
          counterpartyLabel: counterpartyLabel2,
          username: counterpartyUsername,
          ratingDisplay: ''
        });
      }

      if (data.productName) {
        text += `\n\n${t(lang, 'createDeal.previously_entered_name', { name: escapeMarkdown(data.productName) })}`;
        keyboard = keepPreviousValueKeyboard('product_name', data.productName, lang);
      } else {
        keyboard = backButton(lang);
      }
      break;

    case 'description':
      text = t(lang, 'createDeal.step4_description');

      if (data.description) {
        const shortDesc = data.description.substring(0, 100);
        text += `\n\n${t(lang, 'createDeal.previously_entered_desc', { desc: escapeMarkdown(shortDesc) + (data.description.length > 100 ? '...' : '') })}`;
        keyboard = keepPreviousValueKeyboard('description', shortDesc + (data.description.length > 100 ? '...' : ''), lang);
      } else {
        keyboard = backButton(lang);
      }
      break;

    case 'asset':
      text = t(lang, 'createDeal.step5_asset');
      if (data.asset) {
        text += `\n\n${t(lang, 'createDeal.previously_selected', { value: data.asset })}`;
      }
      keyboard = assetSelectionKeyboard(lang);
      break;

    case 'amount':
      text = t(lang, 'createDeal.step6_amount', { asset: data.asset || 'USDT', minAmount: MIN_DEAL_AMOUNT });

      if (data.amount) {
        text += `\n\n${t(lang, 'createDeal.previously_entered_amount', { amount: data.amount, asset: data.asset || 'USDT' })}`;
        keyboard = keepPreviousValueKeyboard('amount', `${data.amount} ${data.asset || 'USDT'}`, lang);
      } else {
        keyboard = backButton(lang);
      }
      break;

    case 'commission':
      const commission = Deal.calculateCommission(data.amount);
      text = t(lang, 'createDeal.step7_commission', { amount: data.amount, asset: data.asset, commission });
      if (data.commissionType) {
        const commTypeText = data.commissionType === 'buyer' ? t(lang, 'commission.type_buyer') :
          data.commissionType === 'seller' ? t(lang, 'commission.type_seller') : t(lang, 'commission.type_split');
        text += `\n\n${t(lang, 'createDeal.previously_selected', { value: commTypeText })}`;
      }
      keyboard = commissionTypeKeyboard(data.amount, data.asset, lang);
      break;

    case 'deadline':
      text = t(lang, 'createDeal.step8_deadline');
      if (data.deadlineHours) {
        const dlText = getDeadlineText(lang, data.deadlineHours);
        text += `\n\n${t(lang, 'createDeal.previously_selected', { value: dlText })}`;
      }
      keyboard = deadlineKeyboard(lang);
      break;

    case 'creator_wallet':
      const walletPurpose = data.creatorRole === 'buyer'
        ? t(lang, 'wallet.purpose_buyer')
        : t(lang, 'wallet.purpose_seller');
      const savedWalletAddr = data.creatorRole === 'buyer' ? data.buyerAddress : data.sellerAddress;

      text = t(lang, 'createDeal.step9_wallet_input', { walletPurpose });

      if (savedWalletAddr) {
        const shortWalletDisplay = savedWalletAddr.slice(0, 8) + '...' + savedWalletAddr.slice(-6);
        text += `\n\n${t(lang, 'createDeal.previously_entered_wallet', { address: savedWalletAddr })}`;
        keyboard = keepPreviousValueKeyboard('creator_wallet', shortWalletDisplay, lang);
      } else {
        keyboard = backButton(lang);
      }
      break;

    case 'select_wallet':
      // Show wallet selection screen
      const selectWalletPurpose = data.creatorRole === 'buyer'
        ? t(lang, 'wallet.purpose_buyer')
        : t(lang, 'wallet.purpose_seller');
      text = t(lang, 'createDeal.step9_wallet', { walletPurpose: selectWalletPurpose });
      // Get user's saved wallets
      const userForWallets = await User.findOne({ telegramId }).select('wallets').lean();
      const { walletSelectionKeyboard } = require('../keyboards/main');
      keyboard = walletSelectionKeyboard(userForWallets?.wallets || [], true, lang);
      break;

    default:
      // Unknown step - go to main menu
      await deleteCreateDealSession(telegramId);
      const { mainMenuKeyboard } = require('../keyboards/main');
      await messageManager.showFinalScreen(ctx, telegramId, 'main_menu', getMainMenuText(lang), mainMenuKeyboard(lang));
      return;
  }

  // Pop the screen from navigation stack and show the content
  const user = await User.findOne({ telegramId }).lean();
  const stack = user?.navigationStack || [];
  stack.pop(); // Remove last screen

  await User.updateOne(
    { telegramId },
    {
      $set: {
        navigationStack: stack,
        currentScreen: `create_deal_${step}`,
        currentScreenData: { text, keyboard: messageManager.normalizeKeyboard(keyboard) }
      }
    }
  );

  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
};

// ============================================
// USERNAME CHECK HANDLER
// ============================================

/**
 * Handle "Ник установлен" button press
 * Checks if user now has username, updates DB, proceeds to deal creation
 */
const handleUsernameSet = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';
    const currentUsername = ctx.from.username;

    if (!currentUsername) {
      // Username still not set - show error for 2 seconds
      const errorText = t(lang, 'welcome.username_not_found');

      await messageManager.updateScreen(ctx, telegramId, 'username_error', errorText, {});

      // Wait 2 seconds and show the warning again
      await new Promise(resolve => setTimeout(resolve, 2000));

      const warningText = t(lang, 'welcome.username_required');

      const keyboard = usernameRequiredKeyboard(lang);
      await messageManager.updateScreen(ctx, telegramId, 'username_required', warningText, keyboard);
      return;
    }

    // Username exists - update in DB
    await User.updateOne(
      { telegramId },
      { $set: { username: currentUsername } }
    );

    console.log(`✅ Username updated for user ${telegramId}: @${currentUsername}`);

    // Proceed to deal creation (call startCreateDeal which will now pass the check)
    await startCreateDeal(ctx);
  } catch (error) {
    console.error('Error in handleUsernameSet:', error);
  }
};

// ============================================
// WALLET SELECTION HANDLERS
// ============================================

/**
 * Handle saved wallet selection during deal creation
 */
const handleSelectSavedWallet = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';
    const walletIndex = parseInt(ctx.callbackQuery.data.split(':')[1]);

    const session = await getCreateDealSession(telegramId);
    if (!session) {
      // Session expired - restart deal creation
      return await startCreateDeal(ctx);
    }
    if (session.step !== 'select_wallet') return;

    const user = await User.findOne({ telegramId }).select('wallets');
    if (!user || !user.wallets[walletIndex]) {
      await ctx.answerCbQuery(t(lang, 'wallet.not_found_alert'), { show_alert: true });
      return;
    }

    const wallet = user.wallets[walletIndex];
    const address = wallet.address;
    const creatorRole = session.data.creatorRole;

    // For saved wallets - skip validation, proceed to confirmation
    // Show loading briefly
    const loadingText = t(lang, 'common.preparing', { address: `${address.slice(0, 6)}...${address.slice(-4)}` });

    await messageManager.updateScreen(ctx, telegramId, 'wallet_loading', loadingText, {});
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Save wallet to session and proceed
    if (creatorRole === 'buyer') {
      session.data.buyerAddress = address;
    } else {
      session.data.sellerAddress = address;
    }
    session.data.usedSavedWallet = true; // Mark that saved wallet was used (no need to offer saving)
    session.step = 'confirm';
    await setCreateDealSession(telegramId, session);

    // Show confirmation screen
    await showConfirmationScreen(ctx, telegramId, session);
  } catch (error) {
    console.error('Error in handleSelectSavedWallet:', error);
  }
};

/**
 * Handle "Enter new wallet" button during deal creation
 */
const handleEnterNewWallet = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';
    const session = await getCreateDealSession(telegramId);

    if (!session) {
      // Session expired - restart deal creation
      return await startCreateDeal(ctx);
    }

    session.step = 'creator_wallet';
    await setCreateDealSession(telegramId, session);

    const creatorRole = session.data.creatorRole;
    const walletPurpose = creatorRole === 'buyer'
      ? t(lang, 'wallet.purpose_buyer')
      : t(lang, 'wallet.purpose_seller');

    const text = t(lang, 'createDeal.step9_wallet_input', { walletPurpose });

    const keyboard = backButton(lang);
    await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_wallet', text, keyboard);
  } catch (error) {
    console.error('Error in handleEnterNewWallet:', error);
  }
};

/**
 * Handle save wallet prompt response (yes/no) after wallet validation
 */
const handleSaveWalletPrompt = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const action = ctx.callbackQuery.data.split(':')[1]; // 'yes' or 'no'
    const session = await getCreateDealSession(telegramId);

    if (!session) {
      // Session expired - restart deal creation
      return await startCreateDeal(ctx);
    }
    if (session.step !== 'save_wallet_prompt') return;

    if (action === 'no') {
      // Skip saving, proceed to confirmation
      session.step = 'confirm';
      await setCreateDealSession(telegramId, session);
      await showConfirmationScreen(ctx, telegramId, session);
      return;
    }

    // action === 'yes' - ask for wallet name
    const lang = ctx.state?.lang || 'ru';
    session.step = 'wallet_name';
    await setCreateDealSession(telegramId, session);

    const address = session.data.creatorRole === 'buyer'
      ? session.data.buyerAddress
      : session.data.sellerAddress;
    const shortAddr = address.slice(0, 6) + '...' + address.slice(-4);

    const text = t(lang, 'wallet.save_name_prompt', { address: shortAddr });

    const keyboard = walletNameInputDealKeyboard(lang);
    await messageManager.updateScreen(ctx, telegramId, 'wallet_name_input', text, keyboard);
  } catch (error) {
    console.error('Error in handleSaveWalletPrompt:', error);
  }
};

/**
 * Handle wallet name skip button
 */
const handleWalletNameSkipDeal = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const session = await getCreateDealSession(telegramId);

    if (!session) {
      // Session expired - restart deal creation
      return await startCreateDeal(ctx);
    }
    if (session.step !== 'wallet_name') return;

    // Save wallet without name
    const address = session.data.creatorRole === 'buyer'
      ? session.data.buyerAddress
      : session.data.sellerAddress;

    const user = await User.findOne({ telegramId });
    if (user && user.canAddWallet()) {
      await user.addWallet(address, null);
    }

    // Proceed to confirmation
    session.step = 'confirm';
    await setCreateDealSession(telegramId, session);
    await showConfirmationScreen(ctx, telegramId, session);
  } catch (error) {
    console.error('Error in handleWalletNameSkipDeal:', error);
  }
};

/**
 * Handle wallet name back button - return to save prompt
 */
const handleWalletNameBackDeal = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';
    const session = await getCreateDealSession(telegramId);

    if (!session) {
      // Session expired - restart deal creation
      return await startCreateDeal(ctx);
    }

    session.step = 'save_wallet_prompt';
    await setCreateDealSession(telegramId, session);

    const address = session.data.creatorRole === 'buyer'
      ? session.data.buyerAddress
      : session.data.sellerAddress;
    const shortAddr = address.slice(0, 6) + '...' + address.slice(-4);

    const text = t(lang, 'wallet.verified_save', { address: shortAddr });

    const keyboard = saveWalletPromptKeyboard(lang);
    await messageManager.updateScreen(ctx, telegramId, 'save_wallet_prompt', text, keyboard);
  } catch (error) {
    console.error('Error in handleWalletNameBackDeal:', error);
  }
};

/**
 * Show confirmation screen helper
 */
async function showConfirmationScreen(ctx, telegramId, session) {
  const data = session.data;

  // If invite link deal, use different confirmation screen
  if (data.isInviteLink) {
    await showInviteConfirmationScreen(ctx, telegramId, session);
    return;
  }

  const lang = ctx.state?.lang || 'ru';
  const creatorRole = data.creatorRole;
  // Get counterparty username based on creator role
  const rawUsername = creatorRole === 'buyer' ? data.sellerUsername : data.buyerUsername;
  const counterpartyUsername = (rawUsername || '').replace('@', '');

  // Calculate commission
  const commission = Deal.calculateCommission(data.amount);

  // Commission distribution
  let commissionNote = '';
  if (data.commissionType === 'buyer') {
    commissionNote = t(lang, 'commission.buyer_note', { commission, asset: data.asset });
  } else if (data.commissionType === 'seller') {
    commissionNote = t(lang, 'commission.seller_note', { amount: (data.amount - commission).toFixed(2), asset: data.asset });
  } else {
    commissionNote = t(lang, 'commission.split_note', { half: (commission / 2).toFixed(2), asset: data.asset });
  }

  // Deadline text
  const deadlineText = getDeadlineText(lang, data.deadlineHours);

  // Get creator wallet
  const creatorWallet = creatorRole === 'buyer' ? data.buyerAddress : data.sellerAddress;
  const shortWallet = creatorWallet.slice(0, 8) + '...' + creatorWallet.slice(-6);

  const text = `${t(lang, 'createDeal.confirm_title')}

${t(lang, 'myDeals.your_role')} ${creatorRole === 'buyer' ? t(lang, 'role.buyer_icon') : t(lang, 'role.seller_icon')}
${t(lang, 'myDeals.counterparty_label', { role: t(lang, 'role.' + (creatorRole === 'buyer' ? 'seller' : 'buyer')) })} \`@${counterpartyUsername}\`

${t(lang, 'myDeals.product_label')} ${escapeMarkdown(data.productName)}
${data.description ? `${t(lang, 'myDeals.description_label')} ${escapeMarkdown(data.description)}\n` : ''}
${t(lang, 'myDeals.amount_label')} ${data.amount} ${data.asset}
${t(lang, 'myDeals.commission_label')} ${commission} ${data.asset}
_${commissionNote}_

${t(lang, 'myDeals.deadline_label')} ${deadlineText}
${t(lang, 'myDeals.escrow_address')} \`${shortWallet}\`

${t(lang, 'createDeal.confirm_check')}`;

  const keyboard = dealConfirmationKeyboard(lang);
  await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_confirm', text, keyboard);
}

// ============================================
// INVITE DEAL CONFIRMATION (for link-based deals)
// ============================================

/**
 * Show invite confirmation screen (no counterparty yet)
 */
async function showInviteConfirmationScreen(ctx, telegramId, session) {
  const lang = ctx.state?.lang || 'ru';
  const data = session.data;
  const creatorRole = data.creatorRole;

  // Calculate commission
  const commission = Deal.calculateCommission(data.amount);

  // Commission distribution
  let commissionNote = '';
  if (data.commissionType === 'buyer') {
    commissionNote = t(lang, 'commission.buyer_note', { commission, asset: data.asset });
  } else if (data.commissionType === 'seller') {
    commissionNote = t(lang, 'commission.seller_note', { amount: (data.amount - commission).toFixed(2), asset: data.asset });
  } else {
    commissionNote = t(lang, 'commission.split_note', { half: (commission / 2).toFixed(2), asset: data.asset });
  }

  // Deadline text
  const deadlineText = getDeadlineText(lang, data.deadlineHours);

  // Get creator wallet
  const creatorWallet = creatorRole === 'buyer' ? data.buyerAddress : data.sellerAddress;
  const shortWallet = creatorWallet.slice(0, 8) + '...' + creatorWallet.slice(-6);

  const counterpartyLabel = creatorRole === 'buyer' ? t(lang, 'role.seller_gen') : t(lang, 'role.buyer_gen');

  const text = `${t(lang, 'createDeal.confirm_title')}

${t(lang, 'myDeals.your_role')} ${creatorRole === 'buyer' ? t(lang, 'role.buyer_icon') : t(lang, 'role.seller_icon')}
${t(lang, 'myDeals.counterparty_label', { role: t(lang, 'role.' + (creatorRole === 'buyer' ? 'seller' : 'buyer')) })} ${t(lang, 'createDeal.confirm_invite_counterparty')}

${t(lang, 'myDeals.product_label')} ${escapeMarkdown(data.productName)}
${data.description ? `${t(lang, 'myDeals.description_label')} ${escapeMarkdown(data.description)}\n` : ''}
${t(lang, 'myDeals.amount_label')} ${data.amount} ${data.asset}
${t(lang, 'myDeals.commission_label')} ${commission} ${data.asset}
_${commissionNote}_

${t(lang, 'myDeals.deadline_label')} ${deadlineText}
${t(lang, 'myDeals.escrow_address')} \`${shortWallet}\`

${t(lang, 'createDeal.confirm_invite_note', { counterpartyLabel })}

${t(lang, 'createDeal.confirm_check')}`;

  const keyboard = dealConfirmationKeyboard(lang);
  await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_confirm', text, keyboard);
}

/**
 * Show private key screen BEFORE creating invite deal
 * User must confirm they saved the key before deal is created
 */
const confirmInviteDeal = async (ctx, session) => {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';
  const data = session.data;

  // Generate private key for creator (but don't create deal yet!)
  const creatorKeys = await blockchainService.generateKeyPair();
  const creatorPrivateKey = creatorKeys.privateKey;

  // Save key and mark step in session
  const newData = {
    ...data,
    step: 'invite_key_confirm',
    creatorPrivateKey: creatorPrivateKey
  };
  await setCreateDealSession(telegramId, newData);

  const roleLabel = data.creatorRole === 'buyer' ? t(lang, 'role.buyer_gen') : t(lang, 'role.seller_gen');

  // Show key screen - deal will only be created after user confirms
  const keyText = `${t(lang, 'createDeal.private_key_save_title')}

${t(lang, 'createDeal.private_key_role', { roleLabel })}
\`${creatorPrivateKey}\`

${t(lang, 'createDeal.private_key_warning')}
${t(lang, 'createDeal.private_key_general_warning')}

${t(lang, 'createDeal.private_key_save_then_create')}`;

  const keyKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.key_saved'), 'invite_key_saved')],
    [Markup.button.callback(t(lang, 'btn.cancel'), 'main_menu')]
  ]);

  await messageManager.navigateToScreen(ctx, telegramId, 'invite_key_confirm', keyText, keyKeyboard.reply_markup);
};

/**
 * Handle "I saved the key" button - now create the actual invite deal
 */
const handleInviteKeySaved = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const data = await getCreateDealSession(telegramId);

    if (!data || data.step !== 'invite_key_confirm') {
      return;
    }

    // Show loading
    const lang = ctx.state?.lang || 'ru';
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_loading', t(lang, 'common.creating_deal'), {});

    // Create invite deal via dealService with pre-generated key
    const result = await dealService.createInviteDeal({
      creatorRole: data.creatorRole,
      creatorId: telegramId,
      productName: data.productName,
      description: data.description,
      asset: data.asset,
      amount: data.amount,
      commissionType: data.commissionType,
      deadlineHours: data.deadlineHours,
      creatorAddress: data.creatorRole === 'buyer' ? data.buyerAddress : data.sellerAddress,
      creatorPrivateKey: data.creatorPrivateKey // Pass the pre-generated key
    });

    const { deal, inviteToken } = result;

    // Clean up session
    await deleteCreateDealSession(telegramId);

    // Build invite link
    const botUsername = process.env.BOT_USERNAME || 'KeyShield_escrow_bot';
    const inviteLink = `https://t.me/${botUsername}?start=deal_${inviteToken}`;

    // Calculate amounts for display
    const commission = deal.commission;
    let depositAmount = deal.amount;
    if (deal.commissionType === 'buyer') {
      depositAmount = deal.amount + commission;
    } else if (deal.commissionType === 'split') {
      depositAmount = deal.amount + (commission / 2);
    }

    let sellerPayout = deal.amount;
    if (deal.commissionType === 'seller') {
      sellerPayout = deal.amount - commission;
    } else if (deal.commissionType === 'split') {
      sellerPayout = deal.amount - (commission / 2);
    }

    const counterpartyLabel = deal.creatorRole === 'buyer' ? t(lang, 'role.seller_gen') : t(lang, 'role.buyer_gen');

    // Show success message with invite link
    const creatorText = `${t(lang, 'createDeal.deal_created')}

🆔 ID: \`${deal.dealId}\`
📦 ${escapeMarkdown(deal.productName)}

💰 ${t(lang, 'myDeals.amount_label')} ${deal.amount} ${deal.asset}
${deal.creatorRole === 'buyer' ? `💸 ${t(lang, 'myDeals.you_pay')} ${depositAmount} ${deal.asset}` : `💸 ${t(lang, 'myDeals.you_receive')} ${sellerPayout} ${deal.asset}`}

${t(lang, 'createDeal.waiting_counterparty', { counterpartyLabel })}

${t(lang, 'createDeal.invite_link_label')}
\`${inviteLink}\`

${t(lang, 'createDeal.invite_send', { counterpartyLabel })}

${t(lang, 'createDeal.invite_expires')}`;

    const creatorKeyboard = inviteDealCreatedKeyboard(deal.dealId, inviteToken, lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'invite_deal_created', creatorText, creatorKeyboard);

    // Alert admin
    await adminAlertService.alertNewDeal(deal);

    console.log(`📨 Invite deal ${deal.dealId} created by ${telegramId}, link: ${inviteLink}`);

    return deal;
  } catch (error) {
    console.error('Error creating invite deal after key confirmation:', error);

    const lang = ctx.state?.lang || 'ru';
    const telegramId = ctx.from.id;
    await deleteCreateDealSession(telegramId);

    const errorText = t(lang, 'createDeal.error_creation_retry', { message: error.message });
    const keyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'invite_deal_error', errorText, keyboard);
  }
};

/**
 * Handle "Keep previous value" button - user wants to keep existing data
 * Advances to the next step with the saved value
 */
const handleKeepValue = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const field = ctx.callbackQuery.data.split(':')[1];

    const session = await getCreateDealSession(telegramId);
    if (!session) {
      return await startCreateDeal(ctx);
    }

    const { data } = session;

    // Advance to the next step based on field
    switch (field) {
      case 'counterparty_username':
        // Username already saved, go to product_name
        session.step = 'product_name';
        await setCreateDealSession(telegramId, session);
        await showDealCreationScreen(ctx, telegramId, session, 'product_name');
        break;

      case 'product_name':
        // Product name already saved, go to description
        session.step = 'description';
        await setCreateDealSession(telegramId, session);
        await showDealCreationScreen(ctx, telegramId, session, 'description');
        break;

      case 'description':
        // Description already saved, go to asset
        session.step = 'asset';
        await setCreateDealSession(telegramId, session);
        await showDealCreationScreen(ctx, telegramId, session, 'asset');
        break;

      case 'amount':
        // Amount already saved, go to commission
        session.step = 'commission';
        await setCreateDealSession(telegramId, session);
        await showDealCreationScreen(ctx, telegramId, session, 'commission');
        break;

      case 'creator_wallet':
        // Wallet already saved and verified - go to confirmation
        // Check if we should offer to save the wallet
        const address = data.creatorRole === 'buyer' ? data.buyerAddress : data.sellerAddress;
        const user = await User.findOne({ telegramId }).select('wallets');
        const wallets = user?.wallets || [];
        const alreadySaved = wallets.some(w => w.address.toLowerCase() === address.toLowerCase());

        if (!alreadySaved && wallets.length < 5 && !data.usedSavedWallet) {
          // Offer to save the wallet
          session.step = 'save_wallet_prompt';
          await setCreateDealSession(telegramId, session);

          const shortAddr = address.slice(0, 6) + '...' + address.slice(-4);

          const lang = ctx.state?.lang || 'ru';
          const promptText = t(lang, 'wallet.verified_save', { address: shortAddr });

          const promptKeyboard = saveWalletPromptKeyboard(lang);
          await messageManager.updateScreen(ctx, telegramId, 'save_wallet_prompt', promptText, promptKeyboard);
        } else {
          // Proceed to confirmation
          session.step = 'confirm';
          await setCreateDealSession(telegramId, session);
          await showConfirmationScreen(ctx, telegramId, session);
        }
        break;

      default:
        console.log(`Unknown keep_value field: ${field}`);
        break;
    }
  } catch (error) {
    console.error('Error in handleKeepValue:', error);
  }
};

/**
 * Handle cancel invite deal button
 */
const handleCancelInvite = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';
    const dealId = ctx.callbackQuery.data.split(':')[1];

    await dealService.cancelInviteDeal(dealId, telegramId);

    const text = t(lang, 'myDeals.deal_cancelled_you', { dealId, productName: '' });

    const keyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'invite_cancelled', text, keyboard);
  } catch (error) {
    console.error('Error cancelling invite deal:', error);
    await ctx.answerCbQuery(`❌ ${error.message}`, { show_alert: true });
  }
};

module.exports = {
  startCreateDeal,
  handleCreateDealInput,
  handleAssetSelection,
  handleDeadlineSelection,
  handleCommissionSelection,
  handleRoleSelection,
  handleCounterpartyMethod,
  confirmCreateDeal,
  cancelCreateDeal,
  handleCreateDealBack,
  hasCreateDealSession,
  clearCreateDealSession: deleteCreateDealSession,
  handleWalletContinueAnyway,
  handleWalletChangeAddress,
  handleUsernameSet,
  // Wallet selection
  handleSelectSavedWallet,
  handleEnterNewWallet,
  handleSaveWalletPrompt,
  handleWalletNameSkipDeal,
  handleWalletNameBackDeal,
  // Invite deals
  showInviteConfirmationScreen,
  confirmInviteDeal,
  handleInviteKeySaved,
  handleCancelInvite,
  // Keep value (for back navigation)
  handleKeepValue,
  // Shared for templates
  finalizeDealCreation
};
