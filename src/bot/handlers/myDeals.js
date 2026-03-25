const dealService = require('../../services/dealService');
const {
  myDealsKeyboard,
  myDealsEmptyKeyboard,
  dealDetailsKeyboard,
  mainMenuButton,
  backAndMainMenu,
  finalScreenKeyboard,
  workSubmittedKeyboard,
  getStatusIcon
} = require('../keyboards/main');
const messageManager = require('../utils/messageManager');
const { MAIN_MENU_TEXT } = require('./start');
const feesaverService = require('../../services/feesaver');
const { createKeyValidationSession } = require('./keyValidation');
const Deal = require('../../models/Deal');
const { t, formatDate } = require('../../locales');

function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/([_*`\[\]])/g, '\\$1');
}

// ============================================
// STATUS HELPERS
// ============================================

function getStatusText(status, lang = 'ru') {
  return t(lang, 'status.' + status) || status;
}

// ============================================
// MY DEALS LIST WITH PAGINATION
// ============================================

const DEALS_PER_PAGE = 3;

const showMyDeals = async (ctx, page) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    const isCallbackQuery = !!ctx.callbackQuery;
    if (isCallbackQuery) await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const deals = await dealService.getUserDeals(telegramId);

    if (deals.length === 0) {
      const text = t(lang, 'myDeals.empty');

      const keyboard = myDealsEmptyKeyboard(lang);
      await messageManager.navigateToScreen(ctx, telegramId, 'my_deals', text, keyboard);
      return;
    }

    // Calculate pagination
    const totalPages = Math.ceil(deals.length / DEALS_PER_PAGE);
    const currentPage = Math.max(1, Math.min(parseInt(page) || 1, totalPages));
    const startIndex = (currentPage - 1) * DEALS_PER_PAGE;
    const endIndex = startIndex + DEALS_PER_PAGE;
    const dealsOnPage = deals.slice(startIndex, endIndex);

    // Format deals list
    let text = t(lang, 'myDeals.title_count', { count: deals.length }) + '\n\n';

    for (const deal of dealsOnPage) {
      const role = deal.getUserRole(telegramId);
      const statusIcon = getStatusIcon(deal.status);
      const statusText = getStatusText(deal.status, lang);

      text += `${statusIcon} \`${deal.dealId}\`\n`;
      text += `📦 ${deal.productName}\n`;
      text += `👤 ${t(lang, 'role.' + role)}\n`;
      text += `💰 ${deal.amount} ${deal.asset}\n`;
      text += `📊 ${statusText}\n\n`;
    }

    // Add pagination info
    if (totalPages > 1) {
      text += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += t(lang, 'myDeals.page', { current: currentPage, total: totalPages });
    }

    const keyboard = myDealsKeyboard(dealsOnPage, currentPage, totalPages, lang);
    await messageManager.navigateToScreen(ctx, telegramId, 'my_deals', text, keyboard);
  } catch (error) {
    console.error('Error showing deals:', error);
  }
};

// ============================================
// DEAL DETAILS
// ============================================

const showDealDetails = async (ctx, dealId) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    const telegramId = ctx.from.id;

    // Delete user message if text input
    if (ctx.message) {
      await messageManager.deleteUserMessage(ctx);
    }

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      const text = t(lang, 'myDeals.not_found');
      const keyboard = mainMenuButton(lang);
      await messageManager.updateScreen(ctx, telegramId, 'deal_not_found', text, keyboard);
      return;
    }

    if (!deal.isParticipant(telegramId)) {
      const text = t(lang, 'myDeals.access_denied');
      const keyboard = mainMenuButton(lang);
      await messageManager.updateScreen(ctx, telegramId, 'deal_access_denied', text, keyboard);
      return;
    }

    const role = deal.getUserRole(telegramId);
    const commission = dealService.getCommissionBreakdown(deal);

    // Handle pending key validation states - show special screens
    if (deal.pendingKeyValidation === 'buyer_refund') {
      if (role === 'buyer') {
        // Buyer needs to enter key for refund
        const refundAmount = deal.amount - deal.commission;
        const text = t(lang, 'myDeals.pending_buyer_refund', {
          dealId: deal.dealId,
          productName: deal.productName,
          refundAmount: refundAmount.toFixed(2),
          asset: deal.asset,
          commission: deal.commission.toFixed(2)
        });

        const keyboard = backAndMainMenu(lang);
        await messageManager.navigateToScreen(ctx, telegramId, `deal_${dealId}_refund`, text, keyboard);
        return;
      } else {
        // Seller sees info that deal expired
        const text = t(lang, 'myDeals.pending_seller_expired', {
          dealId: deal.dealId,
          productName: deal.productName
        });

        const keyboard = backAndMainMenu(lang);
        await messageManager.navigateToScreen(ctx, telegramId, `deal_${dealId}_expired`, text, keyboard);
        return;
      }
    }

    if (deal.pendingKeyValidation === 'seller_release') {
      if (role === 'seller') {
        // Seller needs to enter key for release (work accepted by timeout)
        const releaseAmount = deal.amount - deal.commission;
        const text = t(lang, 'myDeals.pending_seller_release', {
          dealId: deal.dealId,
          productName: deal.productName,
          releaseAmount: releaseAmount.toFixed(2),
          asset: deal.asset,
          commission: deal.commission.toFixed(2)
        });

        const keyboard = backAndMainMenu(lang);
        await messageManager.navigateToScreen(ctx, telegramId, `deal_${dealId}_release`, text, keyboard);
        return;
      } else {
        // Buyer sees info that work was accepted
        const text = t(lang, 'myDeals.pending_buyer_autoaccept', {
          dealId: deal.dealId,
          productName: deal.productName
        });

        const keyboard = backAndMainMenu(lang);
        await messageManager.navigateToScreen(ctx, telegramId, `deal_${dealId}_auto_accepted`, text, keyboard);
        return;
      }
    }

    if (deal.pendingKeyValidation === 'seller_payout') {
      if (role === 'seller') {
        // Seller needs to enter key for payout (work accepted by buyer)
        const releaseAmount = deal.amount - deal.commission;
        const text = t(lang, 'myDeals.pending_seller_payout', {
          dealId: deal.dealId,
          productName: deal.productName,
          releaseAmount: releaseAmount.toFixed(2),
          asset: deal.asset,
          commission: deal.commission.toFixed(2)
        });

        const keyboard = backAndMainMenu(lang);
        await messageManager.navigateToScreen(ctx, telegramId, `deal_${dealId}_payout`, text, keyboard);
        return;
      } else {
        // Buyer sees waiting for seller
        const text = t(lang, 'myDeals.pending_buyer_waiting', {
          dealId: deal.dealId,
          productName: deal.productName
        });

        const keyboard = backAndMainMenu(lang);
        await messageManager.navigateToScreen(ctx, telegramId, `deal_${dealId}_waiting_seller`, text, keyboard);
        return;
      }
    }

    let text = t(lang, 'myDeals.deal_label', { dealId: deal.dealId }) + '\n\n';
    text += `${t(lang, 'myDeals.product_label')} ${deal.productName}\n\n`;
    text += `${t(lang, 'myDeals.description_label')}\n${deal.description.substring(0, 300)}${deal.description.length > 300 ? '...' : ''}\n\n`;

    text += `${t(lang, 'myDeals.your_role')} ${t(lang, 'role.' + role)}\n`;

    // Get counterparty username (or show invite link status)
    const User = require('../../models/User');
    const counterpartyId = role === 'buyer' ? deal.sellerId : deal.buyerId;
    const counterpartyRole = role === 'buyer' ? 'seller' : 'buyer';

    if (deal.status === 'pending_counterparty' || counterpartyId === 0) {
      // No counterparty yet - show invite link info
      text += t(lang, 'myDeals.counterparty_label', { role: t(lang, 'role.' + counterpartyRole) }) + ` ${t(lang, 'myDeals.counterparty_by_link')}\n\n`;
    } else {
      const counterparty = await User.findOne({ telegramId: counterpartyId });
      const counterpartyUsername = counterparty?.username || `ID: ${counterpartyId}`;
      text += t(lang, 'myDeals.counterparty_label', { role: t(lang, 'role.' + counterpartyRole) }) + ` @${escapeMarkdown(counterpartyUsername)}\n\n`;
    }

    text += `${t(lang, 'myDeals.amount_label')} ${deal.amount} ${deal.asset}\n`;
    text += `${t(lang, 'myDeals.commission_label')} ${deal.commission} ${deal.asset}\n`;

    if (role === 'buyer') {
      text += `${t(lang, 'myDeals.you_pay')} ${deal.amount + commission.buyerPays} ${deal.asset}\n`;
    } else {
      text += `${t(lang, 'myDeals.you_receive')} ${deal.amount - commission.sellerPays} ${deal.asset}\n`;
    }

    text += `\n${t(lang, 'myDeals.status_label')} ${getStatusText(deal.status, lang)}\n`;

    if (deal.deadline) {
      text += `${t(lang, 'myDeals.deadline_label')} ${formatDate(lang, deal.deadline)}\n`;
    }

    // Show hint when waiting for wallet
    if (role === 'seller' && deal.status === 'waiting_for_seller_wallet') {
      text += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += t(lang, 'myDeals.seller_wallet_required');
    }

    if (role === 'buyer' && deal.status === 'waiting_for_buyer_wallet') {
      text += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += t(lang, 'myDeals.buyer_wallet_required');
    }

    // Show invite link for pending_counterparty deals
    if (deal.status === 'pending_counterparty' && deal.inviteToken) {
      const botUsername = process.env.BOT_USERNAME || 'KeyShieldBot';
      const inviteLink = `https://t.me/${botUsername}?start=deal_${deal.inviteToken}`;
      const expiresAt = deal.inviteExpiresAt ? formatDate(lang, deal.inviteExpiresAt) : t(lang, 'myDeals.unknown');

      text += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `${t(lang, 'myDeals.invite_link')}\n\`${inviteLink}\`\n\n`;
      text += t(lang, 'myDeals.invite_expires', { date: expiresAt }) + '\n';
      text += `\n${t(lang, 'myDeals.invite_send_to')}`;
    }

    // Show multisig address for waiting_for_deposit
    if (deal.status === 'waiting_for_deposit' && deal.multisigAddress) {
      text += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `${t(lang, 'myDeals.escrow_address')}\n\`${deal.multisigAddress}\`\n`;
      text += `\n[${t(lang, 'myDeals.check_tronscan')}](https://tronscan.org/#/address/${deal.multisigAddress})`;
    }

    // Show deposit TX
    if (deal.depositTxHash) {
      text += `\n\n${t(lang, 'myDeals.deposit_label')} [${t(lang, 'myDeals.transaction_link_label')}](https://tronscan.org/#/transaction/${deal.depositTxHash})`;
    }

    // Determine if user is the deal creator
    const isCreator = role === deal.creatorRole;

    const keyboard = dealDetailsKeyboard(deal.dealId, role, deal.status, {
      isCreator,
      fromTemplate: deal.fromTemplate || false,
      lang
    });
    await messageManager.navigateToScreen(ctx, telegramId, `deal_${dealId}`, text, keyboard);
  } catch (error) {
    console.error('Error showing deal details:', error);
  }
};

// ============================================
// SUBMIT WORK (SELLER)
// ============================================

const submitWork = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const deal = await dealService.submitWork(dealId, telegramId);

    // Show confirmation to seller
    const sellerText = t(lang, 'myDeals.work_submitted_seller', { dealId: deal.dealId });

    const sellerKeyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'work_submitted', sellerText, sellerKeyboard);

    // Notify buyer with notification
    const buyerText = t(lang, 'myDeals.work_submitted_buyer', { dealId: deal.dealId, productName: deal.productName });

    const buyerKeyboard = workSubmittedKeyboard(deal.dealId, lang);
    await messageManager.showNotification(ctx, deal.buyerId, buyerText, buyerKeyboard);

  } catch (error) {
    console.error('Error submitting work:', error);
    await ctx.answerCbQuery(t(ctx.state?.lang || 'ru', 'common.error'));
  }
};

// ============================================
// ACCEPT WORK (BUYER)
// Now requests seller's private key instead of direct payout
// ============================================

const acceptWork = async (ctx) => {
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
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'myDeals.only_buyer_can_accept'), keyboard);
      return;
    }

    if (deal.status !== 'in_progress') {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'myDeals.cannot_accept_status', { status: getStatusText(deal.status, lang) }), keyboard);
      return;
    }

    // Check seller address
    if (!deal.sellerAddress) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'myDeals.seller_address_missing'), keyboard);
      return;
    }

    // Update deal status to mark pending key validation
    await Deal.findByIdAndUpdate(deal._id, {
      pendingKeyValidation: 'seller_payout'
    });

    // Create key validation session for seller
    await createKeyValidationSession(deal.sellerId, dealId, 'seller_payout', {
      buyerId: telegramId
    });

    console.log(`🔐 Key validation requested for deal ${dealId}: seller must input private key`);

    // Notify buyer - waiting for seller confirmation
    const buyerText = t(lang, 'myDeals.pending_buyer_waiting', {
      dealId: dealId,
      productName: deal.productName
    });

    const buyerKeyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'waiting_seller_key', buyerText, buyerKeyboard);

    // Notify seller - request private key
    const releaseAmount = deal.amount - deal.commission;
    const sellerText = t(lang, 'myDeals.pending_seller_payout', {
      dealId: dealId,
      productName: deal.productName,
      releaseAmount: releaseAmount.toFixed(2),
      asset: deal.asset,
      commission: deal.commission.toFixed(2)
    });

    const sellerKeyboard = mainMenuButton(lang);
    await messageManager.showNotification(ctx, deal.sellerId, sellerText, sellerKeyboard);

  } catch (error) {
    console.error('Error accepting work:', error);
  }
};

module.exports = {
  showMyDeals,
  showDealDetails,
  submitWork,
  acceptWork,
  getStatusText
};
