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
const { templateUseKeyboard } = require('../../keyboards/templates');
const { walletSelectionKeyboard, mainMenuButton } = require('../../keyboards/main');
const { getTemplateSession, setTemplateSession, clearTemplateSession } = require('./session');
const { finalizeDealCreation } = require('../createDeal');

/**
 * Start using template
 */
async function startUseTemplate(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;

  const templateId = ctx.callbackQuery.data.split(':')[2];

  const template = await DealTemplate.findOne({ _id: templateId, telegramId });
  if (!template) {
    await ctx.answerCbQuery('❌ Шаблон не найден', { show_alert: true });
    return showTemplatesList(ctx);
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

  // Initialize use session
  await setTemplateSession(telegramId, {
    action: 'use_template',
    templateId: template._id.toString(),
    step: 'counterparty',
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

  const counterpartyLabel = template.creatorRole === 'buyer' ? 'продавца' : 'покупателя';
  const roleIcon = template.creatorRole === 'buyer' ? '💵' : '🛠';

  const text = `🚀 *Быстрая сделка по шаблону*

📑 ${template.name}
${roleIcon} Вы: ${template.creatorRole === 'buyer' ? 'Покупатель' : 'Продавец'}
📦 ${template.productName}
💰 ${template.amount} ${template.asset}

Введите @username ${counterpartyLabel}:`;

  const keyboard = templateUseKeyboard(templateId);
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
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

  // Check if user has saved wallets
  const creator = await User.findOne({ telegramId }).select('wallets');
  const savedWallets = creator?.wallets || [];

  const walletPurpose = session.data.creatorRole === 'buyer'
    ? 'для возврата средств'
    : 'для получения оплаты';

  if (savedWallets.length > 0) {
    const walletText = `✅ *Контрагент:* @${counterparty.username}

💳 *Выберите кошелёк ${walletPurpose}:*

Или введите новый адрес TRON-кошелька.`;

    await messageManager.sendNewMessage(ctx, telegramId, walletText, walletSelectionKeyboard(savedWallets, true));
  } else {
    const walletText = `✅ *Контрагент:* @${counterparty.username}

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
 */
async function createDealFromTemplate(ctx, session) {
  const telegramId = ctx.from.id;

  try {
    // Show loading
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_loading', '⏳ *Создаём сделку и multisig-кошелёк...*', {});

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
      deadlineHours: session.data.deadlineHours
    };

    // Set wallet based on role
    if (session.data.creatorRole === 'buyer') {
      dealData.buyerAddress = session.data.buyerAddress;
    } else {
      dealData.sellerAddress = session.data.sellerAddress;
    }

    // Use shared finalization logic from createDeal.js
    await finalizeDealCreation(ctx, dealData, ctx.from.username);

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

module.exports = {
  startUseTemplate,
  handleCounterpartyInput,
  handleWalletSelection,
  handleWalletInput,
  createDealFromTemplate
};
