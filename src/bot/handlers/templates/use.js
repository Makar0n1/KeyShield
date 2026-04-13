/**
 * Template Use Handlers
 *
 * Handles using a template to create a deal quickly.
 */

const DealTemplate = require('../../../models/DealTemplate');
const User = require('../../../models/User');
const dealService = require('../../../services/dealService');
const blockchainService = require('../../../services/blockchain');
const messageManager = require('../../utils/messageManager');
const { templateUseKeyboard, templateCounterpartyMethodKeyboard } = require('../../keyboards/templates');
const { walletSelectionKeyboard, mainMenuButton, inviteDealCreatedKeyboard } = require('../../keyboards/main');
const { getTemplateSession, setTemplateSession, clearTemplateSession } = require('./session');
const { Markup } = require('telegraf');
const { t } = require('../../../locales');

function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/([_*`\[\]])/g, '\\$1');
}

// Lazy require to avoid circular dependency
let _showTemplatesList = null;
let _finalizeDealCreation = null;

function getShowTemplatesList() {
  if (!_showTemplatesList) {
    _showTemplatesList = require('./list').showTemplatesList;
  }
  return _showTemplatesList;
}

function getFinalizeDealCreation() {
  if (!_finalizeDealCreation) {
    _finalizeDealCreation = require('../createDeal').finalizeDealCreation;
  }
  return _finalizeDealCreation;
}

/**
 * Start using template - show counterparty method selection
 */
async function startUseTemplate(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  const templateId = ctx.callbackQuery.data.split(':')[2];

  const template = await DealTemplate.findOne({ _id: templateId, telegramId });
  if (!template) {
    await ctx.answerCbQuery(t(lang, 'templates.not_found'), { show_alert: true });
    return getShowTemplatesList()(ctx);
  }

  // Check if user hasn't reached the deals limit
  if (!(await dealService.canCreateNewDeal(telegramId))) {
    const count = await dealService.countActiveDeals(telegramId);
    const { MAX_ACTIVE_DEALS_PER_USER } = require('../../../config/constants');
    const text = t(lang, 'templates.use_deals_limit', { count, max: MAX_ACTIVE_DEALS_PER_USER });
    await messageManager.sendNewMessage(ctx, telegramId, text, templateUseKeyboard(templateId, lang));
    return;
  }

  // Check username
  if (!ctx.from.username) {
    const text = t(lang, 'templates.use_username_required');
    await messageManager.sendNewMessage(ctx, telegramId, text, templateUseKeyboard(templateId, lang));
    return;
  }

  // Initialize use session with method selection step
  await setTemplateSession(telegramId, {
    action: 'use_template',
    templateId: template._id.toString(),
    templateName: template.name,
    step: 'method_selection',
    data: {
      creatorRole: template.creatorRole,
      productName: template.productName,
      description: template.description,
      asset: template.asset,
      amount: template.amount,
      commissionType: template.commissionType,
      deadlineHours: template.deadlineHours
    }
  });

  const roleIcon = template.creatorRole === 'buyer' ? '💵' : '🛠';
  const roleLabel = template.creatorRole === 'buyer' ? t(lang, 'role.buyer') : t(lang, 'role.seller');

  const text = t(lang, 'templates.use_title') + `\n\n📑 ${template.name}\n${roleIcon} ${t(lang, 'role.buyer') === roleLabel ? t(lang, 'role.buyer') : t(lang, 'role.seller')}: ${roleLabel}\n📦 ${template.productName}\n💰 ${template.amount} ${template.asset}\n\n` + t(lang, 'templates.use_how_find');

  const keyboard = templateCounterpartyMethodKeyboard(templateId, lang);
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
}

/**
 * Handle counterparty method selection (username or invite)
 */
async function handleTemplateMethodSelection(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  const parts = ctx.callbackQuery.data.split(':');
  const method = parts[1];
  const templateId = parts[2];

  const session = await getTemplateSession(telegramId);
  if (!session || session.action !== 'use_template') {
    return;
  }

  // Clear previous method data when switching
  delete session.data.counterpartyUsername;
  delete session.data.counterpartyId;
  delete session.data.isInviteLink;
  delete session.data.buyerId;
  delete session.data.sellerId;

  session.data.counterpartyMethod = method;

  if (method === 'username') {
    // Standard flow - ask for username
    session.step = 'counterparty';
    await setTemplateSession(telegramId, session);

    const counterpartyLabel = session.data.creatorRole === 'buyer' ? t(lang, 'role.seller_gen') : t(lang, 'role.buyer_gen');

    const text = t(lang, 'templates.use_enter_username', {
      templateName: session.templateName,
      counterpartyLabel
    });

    const keyboard = templateUseKeyboard(templateId, lang);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } else {
    // Invite link flow - go to wallet
    session.step = 'wallet';
    session.data.isInviteLink = true;
    await setTemplateSession(telegramId, session);

    // Check if user has saved wallets
    const creator = await User.findOne({ telegramId }).select('wallets');
    const savedWallets = creator?.wallets || [];

    const walletPurpose = session.data.creatorRole === 'buyer'
      ? t(lang, 'wallet.purpose_buyer_short')
      : t(lang, 'wallet.purpose_seller_short');

    if (savedWallets.length > 0) {
      const walletText = t(lang, 'templates.use_select_wallet', {
        templateName: session.templateName,
        walletPurpose
      });

      await messageManager.sendNewMessage(ctx, telegramId, walletText, walletSelectionKeyboard(savedWallets, true, lang));
    } else {
      const walletText = t(lang, 'templates.use_enter_wallet', {
        templateName: session.templateName,
        walletPurpose
      });

      await messageManager.sendNewMessage(ctx, telegramId, walletText, templateUseKeyboard(templateId, lang));
    }
  }
}

/**
 * Handle counterparty username input
 */
async function handleCounterpartyInput(ctx) {
  const telegramId = ctx.from.id;
  const text = ctx.message.text.trim();
  const lang = ctx.state?.lang || 'ru';

  await messageManager.deleteUserMessage(ctx);

  const session = await getTemplateSession(telegramId);
  if (!session || session.action !== 'use_template' || session.step !== 'counterparty') {
    return false;
  }

  const username = text.replace('@', '');

  // Can't create deal with yourself
  if (username.toLowerCase() === ctx.from.username?.toLowerCase()) {
    const errorText = t(lang, 'templates.use_self_deal');
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateUseKeyboard(session.templateId, lang));
    return true;
  }

  // Find counterparty (escape regex to prevent ReDoS / wildcard injection)
  const safeUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const counterparty = await User.findOne({
    username: { $regex: new RegExp(`^${safeUsername}$`, 'i') }
  });

  if (!counterparty) {
    const errorText = t(lang, 'templates.use_user_not_found', { username });
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateUseKeyboard(session.templateId, lang));
    return true;
  }

  if (counterparty.blacklisted) {
    const errorText = t(lang, 'templates.use_user_blocked');
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateUseKeyboard(session.templateId, lang));
    return true;
  }

  if (!(await dealService.canCreateNewDeal(counterparty.telegramId))) {
    const count = await dealService.countActiveDeals(counterparty.telegramId);
    const { MAX_ACTIVE_DEALS_PER_USER } = require('../../../config/constants');
    const errorText = t(lang, 'templates.use_counterparty_limit', {
      username,
      count,
      max: MAX_ACTIVE_DEALS_PER_USER
    });
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateUseKeyboard(session.templateId, lang));
    return true;
  }

  // Assign roles
  if (session.data.creatorRole === 'buyer') {
    session.data.buyerId = telegramId;
    session.data.buyerUsername = ctx.from.username;
    session.data.sellerId = counterparty.telegramId;
    session.data.sellerUsername = counterparty.username;
  } else {
    session.data.sellerId = telegramId;
    session.data.sellerUsername = ctx.from.username;
    session.data.buyerId = counterparty.telegramId;
    session.data.buyerUsername = counterparty.username;
  }

  session.step = 'wallet';
  session.data.counterpartyUsername = counterparty.username;
  await setTemplateSession(telegramId, session);

  // Get counterparty rating
  const counterpartyRating = await User.getRatingDisplayById(counterparty.telegramId, lang);

  // Check if user has saved wallets
  const creator = await User.findOne({ telegramId }).select('wallets');
  const savedWallets = creator?.wallets || [];

  const walletPurpose = session.data.creatorRole === 'buyer'
    ? t(lang, 'wallet.purpose_buyer_short')
    : t(lang, 'wallet.purpose_seller_short');

  if (savedWallets.length > 0) {
    const walletText = t(lang, 'templates.use_counterparty_found_wallet', {
      username: counterparty.username,
      rating: counterpartyRating,
      walletPurpose
    });

    await messageManager.sendNewMessage(ctx, telegramId, walletText, walletSelectionKeyboard(savedWallets, true, lang));
  } else {
    const walletText = t(lang, 'templates.use_counterparty_found_input', {
      username: counterparty.username,
      rating: counterpartyRating,
      walletPurpose
    });

    await messageManager.sendNewMessage(ctx, telegramId, walletText, templateUseKeyboard(session.templateId, lang));
  }

  return true;
}

/**
 * Handle wallet selection for template use
 */
async function handleWalletSelection(ctx, walletIndex) {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  const session = await getTemplateSession(telegramId);
  if (!session || session.action !== 'use_template' || session.step !== 'wallet') {
    return false;
  }

  const user = await User.findOne({ telegramId }).select('wallets');
  const wallet = user?.wallets?.[walletIndex];

  if (!wallet) {
    await ctx.answerCbQuery(t(lang, 'wallet.not_found_alert'), { show_alert: true });
    return false;
  }

  // Set wallet based on role
  if (session.data.creatorRole === 'buyer') {
    session.data.buyerAddress = wallet.address;
  } else {
    session.data.sellerAddress = wallet.address;
  }

  session.data.usedSavedWallet = true;
  await setTemplateSession(telegramId, session);

  // Create the deal
  return await createDealFromTemplate(ctx, session);
}

/**
 * Handle wallet address input for template use
 */
async function handleWalletInput(ctx) {
  const telegramId = ctx.from.id;
  const text = ctx.message.text.trim();
  const lang = ctx.state?.lang || 'ru';

  await messageManager.deleteUserMessage(ctx);

  const session = await getTemplateSession(telegramId);
  if (!session || session.action !== 'use_template' || session.step !== 'wallet') {
    return false;
  }

  // Basic TRON address format validation
  if (!text.startsWith('T') || text.length !== 34) {
    const errorText = t(lang, 'wallet.invalid_format_short');
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateUseKeyboard(session.templateId, lang));
    return true;
  }

  // Show verification message
  await messageManager.sendNewMessage(ctx, telegramId, t(lang, 'common.checking_wallet_short'), { inline_keyboard: [] });

  // Verify wallet exists on TRON network
  const verification = await blockchainService.verifyWalletExists(text);

  if (!verification.valid) {
    let errorMessage;
    if (verification.reason === 'not_found') {
      errorMessage = t(lang, 'wallet.not_found');
    } else if (verification.reason === 'api_error') {
      errorMessage = t(lang, 'wallet.check_error_short');
    } else {
      errorMessage = t(lang, 'wallet.invalid_address_short');
    }
    await messageManager.sendNewMessage(ctx, telegramId, errorMessage, templateUseKeyboard(session.templateId, lang));
    return true;
  }

  // Set wallet based on role
  if (session.data.creatorRole === 'buyer') {
    session.data.buyerAddress = text;
  } else {
    session.data.sellerAddress = text;
  }

  session.data.usedSavedWallet = false;
  await setTemplateSession(telegramId, session);

  // Create the deal
  return await createDealFromTemplate(ctx, session);
}

/**
 * Create deal from template - uses shared finalizeDealCreation from createDeal.js
 * Supports both username and invite link flows
 */
async function createDealFromTemplate(ctx, session) {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  try {
    // Show loading
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_loading', t(lang, 'common.creating_deal'), {});

    // Check if this is invite link flow
    if (session.data.isInviteLink) {
      // Create invite deal (no counterparty yet)
      return await createInviteDealFromTemplate(ctx, session);
    }

    // Standard flow with known counterparty
    // Prepare deal data (same format as createDeal.js session.data)
    const dealData = {
      creatorId: telegramId,
      creatorRole: session.data.creatorRole,
      buyerId: session.data.buyerId,
      sellerId: session.data.sellerId,
      productName: session.data.productName,
      description: session.data.description,
      asset: session.data.asset,
      amount: session.data.amount,
      commissionType: session.data.commissionType,
      deadlineHours: session.data.deadlineHours,
      fromTemplate: true
    };

    // Set wallet based on role
    if (session.data.creatorRole === 'buyer') {
      dealData.buyerAddress = session.data.buyerAddress;
    } else {
      dealData.sellerAddress = session.data.sellerAddress;
    }

    // Use shared finalization logic from createDeal.js
    await getFinalizeDealCreation()(ctx, dealData, ctx.from.username);

    // Update template usage stats
    await DealTemplate.incrementUsage(session.templateId);

    // Clear template session
    await clearTemplateSession(telegramId);

    return true;
  } catch (error) {
    console.error('Error creating deal from template:', error);
    await clearTemplateSession(telegramId);

    const errorText = t(lang, 'templates.use_error', { message: error.message });

    await messageManager.showFinalScreen(ctx, telegramId, 'error', errorText, mainMenuButton(lang));
    return false;
  }
}

/**
 * Create invite deal from template (no counterparty - generates invite link)
 */
async function createInviteDealFromTemplate(ctx, session) {
  const telegramId = ctx.from.id;
  const creatorUsername = ctx.from.username;
  const lang = ctx.state?.lang || 'ru';

  try {
    // Prepare deal data for invite
    const dealData = {
      creatorId: telegramId,
      creatorRole: session.data.creatorRole,
      productName: session.data.productName,
      description: session.data.description,
      asset: session.data.asset,
      amount: session.data.amount,
      commissionType: session.data.commissionType,
      deadlineHours: session.data.deadlineHours,
      fromTemplate: true
    };

    // Set wallet based on role
    if (session.data.creatorRole === 'buyer') {
      dealData.buyerAddress = session.data.buyerAddress;
    } else {
      dealData.sellerAddress = session.data.sellerAddress;
    }

    // Create invite deal via dealService
    const { deal, creatorPrivateKey } = await dealService.createInviteDeal(dealData, creatorUsername);

    // Update template usage stats
    await DealTemplate.incrementUsage(session.templateId);

    // Clear template session
    await clearTemplateSession(telegramId);

    // Calculate display amounts
    const commission = deal.commission;
    let depositAmount = deal.amount;
    if (deal.commissionType === 'buyer') {
      depositAmount = deal.amount + commission;
    } else if (deal.commissionType === 'split') {
      depositAmount = deal.amount + (commission / 2);
    }

    // Generate invite link
    const botUsername = process.env.BOT_USERNAME || 'KeyShieldBot';
    const inviteLink = `https://t.me/${botUsername}?start=deal_${deal.inviteToken}`;

    const roleLabel = session.data.creatorRole === 'buyer' ? t(lang, 'role.buyer') : t(lang, 'role.seller');
    const roleIcon = session.data.creatorRole === 'buyer' ? '💵' : '🛠';

    const text = t(lang, 'templates.use_deal_created', {
      dealId: deal.dealId,
      roleIcon,
      roleLabel,
      productName: escapeMarkdown(deal.productName),
      amount: deal.amount,
      asset: deal.asset,
      commission,
      inviteLink
    });

    const keyboard = inviteDealCreatedKeyboard(deal.dealId, deal.inviteToken, lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'invite_deal_created', text, keyboard);

    // Send private key message
    const roleKeyLabel = session.data.creatorRole === 'buyer' ? t(lang, 'createDeal.private_key_buyer') : t(lang, 'createDeal.private_key_seller');
    const keyText = `${t(lang, 'createDeal.private_key_title')}

🆔 \`${deal.dealId}\`

${roleKeyLabel}
\`${creatorPrivateKey}\`

${t(lang, 'createDeal.private_key_warning')}
${t(lang, 'createDeal.private_key_general_warning')}

${t(lang, 'createDeal.private_key_autodelete')}`;

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

    console.log(`✅ Invite deal ${deal.dealId} created from template by ${telegramId}`);

    return true;
  } catch (error) {
    console.error('Error creating invite deal from template:', error);
    await clearTemplateSession(telegramId);

    const errorText = t(lang, 'templates.use_error', { message: error.message });

    await messageManager.showFinalScreen(ctx, telegramId, 'error', errorText, mainMenuButton(lang));
    return false;
  }
}

module.exports = {
  startUseTemplate,
  handleTemplateMethodSelection,
  handleCounterpartyInput,
  handleWalletSelection,
  handleWalletInput,
  createDealFromTemplate
};
