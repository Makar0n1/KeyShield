/**
 * Invite Accept Handlers
 * Handles accepting/declining deal invitations from invite links
 */

const Deal = require('../../models/Deal');
const User = require('../../models/User');
const { Markup } = require('telegraf');
const { t } = require('../../locales');
const {
  mainMenuButton,
  backButton,
  walletSelectionKeyboard,
  dealCreatedKeyboard
} = require('../keyboards/main');
const messageManager = require('../utils/messageManager');
const dealService = require('../../services/dealService');
const adminAlertService = require('../../services/adminAlertService');

/**
 * Handle accept_invite button press
 * User wants to accept the deal - need to ask for their wallet
 */
const handleAcceptInvite = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const dealId = ctx.callbackQuery.data.split(':')[1];

    // Find the deal
    const deal = await Deal.findOne({ dealId, status: 'pending_counterparty' });

    if (!deal) {
      await ctx.answerCbQuery(t(lang, 'common.deal_not_found_or_taken'), { show_alert: true });
      return;
    }

    // Check if invite expired
    if (deal.inviteExpiresAt < new Date()) {
      deal.status = 'cancelled';
      deal.inviteToken = null;
      await deal.save();

      const text = t(lang, 'invite.expired');

      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'invite_expired', text, keyboard);
      return;
    }

    // Check user has saved wallets
    const user = await User.findOne({ telegramId });
    const savedWallets = user?.wallets || [];

    console.log(`📨 Invite accept: user ${telegramId} has ${savedWallets.length} saved wallets`);

    // Determine user role
    const userRole = deal.creatorRole === 'buyer' ? 'seller' : 'buyer';

    // Store deal ID in session for wallet input
    const Session = require('../../models/Session');
    await Session.setSession(telegramId, 'invite_accept', {
      dealId: deal.dealId,
      userRole
    }, 0.5); // 30 minutes TTL

    if (savedWallets.length > 0) {
      console.log(`📨 Showing wallet selection for user ${telegramId}`);
      // Show wallet selection
      const text = t(lang, 'invite.select_wallet');

      const keyboard = walletSelectionKeyboard(savedWallets, true, lang);
      await messageManager.navigateToScreen(ctx, telegramId, 'invite_wallet_select', text, keyboard);
    } else {
      // Ask for wallet address
      const purpose = userRole === 'buyer'
        ? t(lang, 'wallet.purpose_buyer_invite')
        : t(lang, 'wallet.purpose_seller_invite');
      const text = t(lang, 'invite.enter_wallet', { purpose });

      const keyboard = backButton(lang);
      await messageManager.navigateToScreen(ctx, telegramId, 'invite_wallet_input', text, keyboard);
    }
  } catch (error) {
    console.error('Error accepting invite:', error);
    await ctx.answerCbQuery(t(ctx.state?.lang || 'ru', 'common.error'), { show_alert: true });
  }
};

/**
 * Handle decline_invite button press
 */
const handleDeclineInvite = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const dealId = ctx.callbackQuery.data.split(':')[1];

    // Clear any session
    await clearInviteAcceptSession(telegramId);

    // Find the deal to get creator info and cancel it
    const deal = await Deal.findOne({ dealId, status: 'pending_counterparty' });

    if (deal) {
      // Cancel the deal
      deal.status = 'cancelled';
      deal.inviteToken = null;
      await deal.save();

      // Get declining user info
      const decliningUser = await User.findOne({ telegramId });
      const decliningUsername = decliningUser?.username ? `@${decliningUser.username}` : t(lang, 'common.user');

      // Notify creator
      const creatorId = deal.creatorRole === 'buyer' ? deal.buyerId : deal.sellerId;
      if (creatorId && creatorId !== 0) {
        const escapeMarkdown = (text) => {
          if (!text) return '';
          return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
        };

        // Load creator's language
        const creatorUser = await User.findOne({ telegramId: creatorId }).select('languageCode').lean();
        const creatorLang = creatorUser?.languageCode || 'ru';

        const creatorText = t(creatorLang, 'invite.declined_creator', {
          dealId: deal.dealId,
          productName: escapeMarkdown(deal.productName),
          username: decliningUsername
        });

        const creatorKeyboard = mainMenuButton(creatorLang);
        await messageManager.showNotification(ctx, creatorId, creatorText, creatorKeyboard);
      }

      console.log(`❌ Invite ${deal.dealId} declined by ${telegramId}, creator notified`);
    }

    const text = t(lang, 'invite.declined_user');

    const keyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'invite_declined', text, keyboard);
  } catch (error) {
    console.error('Error declining invite:', error);
    await ctx.answerCbQuery(t(ctx.state?.lang || 'ru', 'common.error'), { show_alert: true });
  }
};

/**
 * Check if user has invite accept session
 */
const hasInviteAcceptSession = async (telegramId) => {
  const Session = require('../../models/Session');
  const data = await Session.getSession(telegramId, 'invite_accept');
  return !!data;
};

/**
 * Get invite accept session data
 */
const getInviteAcceptSession = async (telegramId) => {
  const Session = require('../../models/Session');
  return await Session.getSession(telegramId, 'invite_accept');
};

/**
 * Clear invite accept session
 */
const clearInviteAcceptSession = async (telegramId) => {
  const Session = require('../../models/Session');
  await Session.deleteSession(telegramId, 'invite_accept');
};

/**
 * Handle wallet input for invite acceptance
 */
const handleInviteWalletInput = async (ctx, walletAddress) => {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  try {
    // Get session data (getInviteAcceptSession returns data directly)
    const sessionData = await getInviteAcceptSession(telegramId);
    if (!sessionData) {
      return false;
    }

    const { dealId, userRole } = sessionData;

    // Validate wallet address
    const blockchainService = require('../../services/blockchain');
    if (!blockchainService.isValidAddress(walletAddress)) {
      const text = t(lang, 'wallet.invalid_address_short');

      const keyboard = backButton(lang);
      await messageManager.updateScreen(ctx, telegramId, 'invite_wallet_input', text, keyboard);
      return true;
    }

    // Find the deal
    const deal = await Deal.findOne({ dealId, status: 'pending_counterparty' });
    if (!deal) {
      const text = t(lang, 'invite.deal_not_found');

      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'invite_error', text, keyboard);
      await clearInviteAcceptSession(telegramId);
      return true;
    }

    // Show loading
    await messageManager.updateScreen(ctx, telegramId, 'invite_loading', t(lang, 'common.accepting_deal'), {});

    // Accept the deal
    const result = await dealService.acceptInviteDeal(deal.inviteToken, telegramId, walletAddress);
    const { deal: updatedDeal, counterpartyPrivateKey } = result;

    // Clear session
    await clearInviteAcceptSession(telegramId);

    // Calculate amounts for display
    const commission = updatedDeal.commission;
    let depositAmount = updatedDeal.amount;
    if (updatedDeal.commissionType === 'buyer') {
      depositAmount = updatedDeal.amount + commission;
    } else if (updatedDeal.commissionType === 'split') {
      depositAmount = updatedDeal.amount + (commission / 2);
    }

    let sellerPayout = updatedDeal.amount;
    if (updatedDeal.commissionType === 'seller') {
      sellerPayout = updatedDeal.amount - commission;
    } else if (updatedDeal.commissionType === 'split') {
      sellerPayout = updatedDeal.amount - (commission / 2);
    }

    // Escape markdown helper
    const escapeMarkdown = (text) => {
      if (!text) return '';
      return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
    };

    // Show success to counterparty (person who accepted)
    const shortWallet = walletAddress.slice(0, 8) + '...' + walletAddress.slice(-6);

    if (userRole === 'buyer') {
      // User is buyer - show deposit info
      const buyerText = t(lang, 'invite.accepted_buyer', {
        dealId: updatedDeal.dealId,
        productName: escapeMarkdown(updatedDeal.productName),
        amount: updatedDeal.amount,
        asset: updatedDeal.asset,
        depositAmount,
        shortWallet,
        multisigAddress: updatedDeal.multisigAddress
      });

      const buyerKeyboard = dealCreatedKeyboard(updatedDeal.dealId, lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'deal_accepted', buyerText, buyerKeyboard);
    } else {
      // User is seller - waiting for deposit
      const sellerText = t(lang, 'invite.accepted_seller', {
        dealId: updatedDeal.dealId,
        productName: escapeMarkdown(updatedDeal.productName),
        amount: updatedDeal.amount,
        asset: updatedDeal.asset,
        sellerPayout,
        shortWallet
      });

      const sellerKeyboard = dealCreatedKeyboard(updatedDeal.dealId, lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'deal_accepted', sellerText, sellerKeyboard);
    }

    // Show private key message
    const roleLabel = userRole === 'buyer' ? t(lang, 'createDeal.private_key_buyer') : t(lang, 'createDeal.private_key_seller');
    const keyText = `${t(lang, 'createDeal.private_key_title')}

🆔 ${t(lang, 'myDeals.deal_label', { dealId: updatedDeal.dealId })}

${roleLabel}
\`${counterpartyPrivateKey}\`

${t(lang, 'createDeal.private_key_warning')}
${t(lang, 'createDeal.private_key_general_warning')}

${t(lang, 'createDeal.private_key_autodelete')}`;

    const keyKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.key_saved'), `key_saved:${updatedDeal.dealId}`)]
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

    // ========== NOTIFY CREATOR ==========
    const creatorId = updatedDeal.creatorRole === 'buyer' ? updatedDeal.buyerId : updatedDeal.sellerId;
    const counterpartyUser = await User.findOne({ telegramId });
    const counterpartyUsername = counterpartyUser?.username ? `@${counterpartyUser.username}` : t(lang, 'common.counterparty');

    // Load creator's language
    const creatorUserDoc = await User.findOne({ telegramId: creatorId }).select('languageCode').lean();
    const creatorLang = creatorUserDoc?.languageCode || 'ru';

    if (updatedDeal.creatorRole === 'buyer') {
      // Creator is buyer - now has deposit address
      const creatorText = t(creatorLang, 'invite.creator_notify_buyer', {
        dealId: updatedDeal.dealId,
        productName: escapeMarkdown(updatedDeal.productName),
        counterpartyUsername,
        multisigAddress: updatedDeal.multisigAddress,
        depositAmount,
        asset: updatedDeal.asset
      });

      const creatorKeyboard = dealCreatedKeyboard(updatedDeal.dealId, creatorLang);
      await messageManager.showNotification(ctx, creatorId, creatorText, creatorKeyboard);
    } else {
      // Creator is seller - buyer should deposit
      const creatorText = t(creatorLang, 'invite.creator_notify_seller', {
        dealId: updatedDeal.dealId,
        productName: escapeMarkdown(updatedDeal.productName),
        counterpartyUsername
      });

      const creatorKeyboard = dealCreatedKeyboard(updatedDeal.dealId, creatorLang);
      await messageManager.showNotification(ctx, creatorId, creatorText, creatorKeyboard);
    }

    // Alert admin
    await adminAlertService.alertNewDeal(updatedDeal);

    console.log(`✅ Invite deal ${updatedDeal.dealId} accepted by ${telegramId}`);

    return true;
  } catch (error) {
    console.error('Error processing invite wallet:', error);

    const text = t(lang, 'invite.error', { message: error.message });

    const keyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'invite_error', text, keyboard);
    await clearInviteAcceptSession(telegramId);

    return true;
  }
};

/**
 * Handle saved wallet selection for invite acceptance
 */
const handleInviteSelectWallet = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const walletIndex = parseInt(ctx.callbackQuery.data.split(':')[1]);

    // Get user's saved wallets
    const user = await User.findOne({ telegramId });
    const savedWallets = user?.wallets || [];

    if (walletIndex >= savedWallets.length) {
      await ctx.answerCbQuery(t(lang, 'wallet.not_found_alert'), { show_alert: true });
      return;
    }

    const selectedWallet = savedWallets[walletIndex];

    // Process with this wallet
    await handleInviteWalletInput(ctx, selectedWallet.address);
  } catch (error) {
    console.error('Error selecting wallet for invite:', error);
    await ctx.answerCbQuery(t(ctx.state?.lang || 'ru', 'common.error'), { show_alert: true });
  }
};

module.exports = {
  handleAcceptInvite,
  handleDeclineInvite,
  hasInviteAcceptSession,
  getInviteAcceptSession,
  clearInviteAcceptSession,
  handleInviteWalletInput,
  handleInviteSelectWallet
};
