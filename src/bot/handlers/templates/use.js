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

  const templateId = ctx.callbackQuery.data.split(':')[2];

  const template = await DealTemplate.findOne({ _id: templateId, telegramId });
  if (!template) {
    await ctx.answerCbQuery('❌ Шаблон не найден', { show_alert: true });
    return getShowTemplatesList()(ctx);
  }

  // Check if user has active deal
  if (await dealService.hasActiveDeal(telegramId)) {
    const text = `⚠️ *У вас уже есть активная сделка*

Завершите текущую сделку перед созданием новой.`;
    await messageManager.sendNewMessage(ctx, telegramId, text, templateUseKeyboard(templateId));
    return;
  }

  // Check username
  if (!ctx.from.username) {
    const text = `⚠️ *Необходим username*

Для создания сделок установите публичный username в настройках Telegram.`;
    await messageManager.sendNewMessage(ctx, telegramId, text, templateUseKeyboard(templateId));
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

  const text = `🚀 *Быстрая сделка по шаблону*

📑 ${template.name}
${roleIcon} Вы: ${template.creatorRole === 'buyer' ? 'Покупатель' : 'Продавец'}
📦 ${template.productName}
💰 ${template.amount} ${template.asset}

*Как найти контрагента?*`;

  const keyboard = templateCounterpartyMethodKeyboard(templateId);
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
}

/**
 * Handle counterparty method selection (username or invite)
 */
async function handleTemplateMethodSelection(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;

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

    const counterpartyLabel = session.data.creatorRole === 'buyer' ? 'продавца' : 'покупателя';

    const text = `🚀 *Быстрая сделка по шаблону*

📑 ${session.templateName}

Введите @username ${counterpartyLabel}:`;

    const keyboard = templateUseKeyboard(templateId);
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
      ? 'для возврата средств'
      : 'для получения оплаты';

    if (savedWallets.length > 0) {
      const walletText = `🚀 *Быстрая сделка по шаблону*

📑 ${session.templateName}

💳 *Выберите кошелёк ${walletPurpose}:*

Или введите новый адрес TRON-кошелька.`;

      await messageManager.sendNewMessage(ctx, telegramId, walletText, walletSelectionKeyboard(savedWallets, true));
    } else {
      const walletText = `🚀 *Быстрая сделка по шаблону*

📑 ${session.templateName}

💳 *Введите адрес TRON-кошелька ${walletPurpose}:*

_(адрес начинается с T, 34 символа)_`;

      await messageManager.sendNewMessage(ctx, telegramId, walletText, templateUseKeyboard(templateId));
    }
  }
}

/**
 * Handle counterparty username input
 */
async function handleCounterpartyInput(ctx) {
  const telegramId = ctx.from.id;
  const text = ctx.message.text.trim();

  await messageManager.deleteUserMessage(ctx);

  const session = await getTemplateSession(telegramId);
  if (!session || session.action !== 'use_template' || session.step !== 'counterparty') {
    return false;
  }

  const username = text.replace('@', '');

  // Can't create deal with yourself
  if (username.toLowerCase() === ctx.from.username?.toLowerCase()) {
    const errorText = `❌ *Вы не можете создать сделку с самим собой!*

Введите другой @username:`;
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateUseKeyboard(session.templateId));
    return true;
  }

  // Find counterparty
  const counterparty = await User.findOne({
    username: { $regex: new RegExp(`^${username}$`, 'i') }
  });

  if (!counterparty) {
    const errorText = `❌ *Пользователь @${username} не найден*

Убедитесь, что он уже запустил бота.
Введите другой @username:`;
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateUseKeyboard(session.templateId));
    return true;
  }

  if (counterparty.blacklisted) {
    const errorText = `❌ *Пользователь заблокирован*

Введите другой @username:`;
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateUseKeyboard(session.templateId));
    return true;
  }

  if (await dealService.hasActiveDeal(counterparty.telegramId)) {
    const errorText = `⚠️ *У @${username} есть активная сделка*

Он должен завершить её. Введите другой @username:`;
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateUseKeyboard(session.templateId));
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
  const counterpartyRating = await User.getRatingDisplayById(counterparty.telegramId);

  // Check if user has saved wallets
  const creator = await User.findOne({ telegramId }).select('wallets');
  const savedWallets = creator?.wallets || [];

  const walletPurpose = session.data.creatorRole === 'buyer'
    ? 'для возврата средств'
    : 'для получения оплаты';

  if (savedWallets.length > 0) {
    const walletText = `✅ *Контрагент:* @${counterparty.username}
📊 *Рейтинг:* ${counterpartyRating}

💳 *Выберите кошелёк ${walletPurpose}:*

Или введите новый адрес TRON-кошелька.`;

    await messageManager.sendNewMessage(ctx, telegramId, walletText, walletSelectionKeyboard(savedWallets, true));
  } else {
    const walletText = `✅ *Контрагент:* @${counterparty.username}
📊 *Рейтинг:* ${counterpartyRating}

💳 *Введите адрес TRON-кошелька ${walletPurpose}:*

_(адрес начинается с T, 34 символа)_`;

    await messageManager.sendNewMessage(ctx, telegramId, walletText, templateUseKeyboard(session.templateId));
  }

  return true;
}

/**
 * Handle wallet selection for template use
 */
async function handleWalletSelection(ctx, walletIndex) {
  const telegramId = ctx.from.id;

  const session = await getTemplateSession(telegramId);
  if (!session || session.action !== 'use_template' || session.step !== 'wallet') {
    return false;
  }

  const user = await User.findOne({ telegramId }).select('wallets');
  const wallet = user?.wallets?.[walletIndex];

  if (!wallet) {
    await ctx.answerCbQuery('❌ Кошелёк не найден', { show_alert: true });
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

  await messageManager.deleteUserMessage(ctx);

  const session = await getTemplateSession(telegramId);
  if (!session || session.action !== 'use_template' || session.step !== 'wallet') {
    return false;
  }

  // Basic TRON address format validation
  if (!text.startsWith('T') || text.length !== 34) {
    const errorText = `❌ *Неверный формат адреса*

Адрес должен начинаться с T и содержать 34 символа.
Введите адрес TRON-кошелька:`;
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateUseKeyboard(session.templateId));
    return true;
  }

  // Show verification message
  await messageManager.sendNewMessage(ctx, telegramId, '⏳ *Проверяем кошелёк...*', { inline_keyboard: [] });

  // Verify wallet exists on TRON network
  const verification = await blockchainService.verifyWalletExists(text);

  if (!verification.valid) {
    let errorMessage;
    if (verification.reason === 'not_found') {
      errorMessage = `❌ *Кошелёк не найден*

Адрес не активирован в сети TRON.
Введите другой адрес:`;
    } else if (verification.reason === 'api_error') {
      errorMessage = `⚠️ *Ошибка проверки*

Не удалось проверить кошелёк. Попробуйте ещё раз.
Введите адрес TRON-кошелька:`;
    } else {
      errorMessage = `❌ *Неверный адрес*

Введите корректный адрес TRON-кошелька:`;
    }
    await messageManager.sendNewMessage(ctx, telegramId, errorMessage, templateUseKeyboard(session.templateId));
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

  try {
    // Show loading
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_loading', '⏳ *Создаём сделку...*', {});

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

    const errorText = `❌ *Ошибка при создании сделки*

${error.message || 'Попробуйте позже.'}`;

    await messageManager.showFinalScreen(ctx, telegramId, 'error', errorText, mainMenuButton());
    return false;
  }
}

/**
 * Create invite deal from template (no counterparty - generates invite link)
 */
async function createInviteDealFromTemplate(ctx, session) {
  const telegramId = ctx.from.id;
  const creatorUsername = ctx.from.username;

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

    // Escape markdown helper
    const escapeMarkdown = (text) => {
      if (!text) return '';
      return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
    };

    // Generate invite link
    const botUsername = process.env.BOT_USERNAME || 'KeyShieldBot';
    const inviteLink = `https://t.me/${botUsername}?start=deal_${deal.inviteToken}`;

    const roleLabel = session.data.creatorRole === 'buyer' ? 'Покупатель' : 'Продавец';
    const roleIcon = session.data.creatorRole === 'buyer' ? '💵' : '🛠';

    const text = `✅ *Сделка создана!*

🆔 ID: \`${deal.dealId}\`
${roleIcon} Вы: ${roleLabel}
📦 ${escapeMarkdown(deal.productName)}
💰 ${deal.amount} ${deal.asset}
💸 Комиссия: ${commission} ${deal.asset}

🔗 *Ссылка для контрагента:*
\`${inviteLink}\`

⏳ Ссылка действительна 24 часа.
Отправьте её контрагенту для участия в сделке.`;

    const keyboard = inviteDealCreatedKeyboard(deal.dealId, deal.inviteToken);
    await messageManager.showFinalScreen(ctx, telegramId, 'invite_deal_created', text, keyboard);

    // Send private key message
    const roleKeyLabel = session.data.creatorRole === 'buyer' ? 'покупателя' : 'продавца';
    const keyText = `🔐 *ВАЖНО: Ваш приватный ключ!*

🆔 Сделка: \`${deal.dealId}\`

Ваш приватный ключ ${roleKeyLabel}:
\`${creatorPrivateKey}\`

⚠️ *СОХРАНИТЕ ЭТОТ КЛЮЧ ПРЯМО СЕЙЧАС!*

• Скопируйте и сохраните в надёжном месте
• Этот ключ показан *ОДИН РАЗ* и *НЕ ХРАНИТСЯ* на сервере
• Без этого ключа вы НЕ сможете получить/вернуть средства!

🗑 Сообщение удалится через 60 секунд или по нажатию кнопки.`;

    const keyKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✅ Я сохранил ключ', `key_saved:${deal.dealId}`)]
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

    const errorText = `❌ *Ошибка при создании сделки*

${error.message || 'Попробуйте позже.'}`;

    await messageManager.showFinalScreen(ctx, telegramId, 'error', errorText, mainMenuButton());
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
