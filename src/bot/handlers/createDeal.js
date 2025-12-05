const dealService = require('../../services/dealService');
const User = require('../../models/User');
const Deal = require('../../models/Deal');
const { Markup } = require('telegraf');
const {
  roleSelectionKeyboard,
  assetSelectionKeyboard,
  commissionTypeKeyboard,
  deadlineKeyboard,
  dealConfirmationKeyboard,
  dealCreatedKeyboard,
  backButton,
  mainMenuButton,
  newDealNotificationKeyboard
} = require('../keyboards/main');
const messageManager = require('../utils/messageManager');
const { MAIN_MENU_TEXT } = require('./start');

// Store temporary deal creation data
const createDealSessions = new Map();

// Session cleanup
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes

setInterval(() => {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [userId, session] of createDealSessions) {
    if (session.createdAt && now - session.createdAt > SESSION_TIMEOUT) {
      createDealSessions.delete(userId);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned ${cleanedCount} abandoned deal creation sessions`);
  }
}, CLEANUP_INTERVAL);

console.log('🧹 Deal sessions cleanup interval started (every 10 min)');

// ============================================
// STEP 1: START DEAL CREATION
// ============================================

const startCreateDeal = async (ctx) => {
  try {
    const isCallbackQuery = !!ctx.callbackQuery;
    if (isCallbackQuery) await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    // Check if user is banned
    const user = await User.findOne({ telegramId });
    if (user?.blacklisted) {
      const text = '🚫 Вы не можете создавать сделки, так как ваш аккаунт заблокирован.';
      const keyboard = mainMenuButton();
      await messageManager.navigateToScreen(ctx, telegramId, 'banned', text, keyboard);
      return;
    }

    // Check if user already has an active deal
    if (await dealService.hasActiveDeal(telegramId)) {
      const text = '⚠️ *У вас уже есть активная сделка*\n\n' +
        'Завершите или отмените текущую сделку перед созданием новой.';
      const keyboard = mainMenuButton();
      await messageManager.navigateToScreen(ctx, telegramId, 'has_active_deal', text, keyboard);
      return;
    }

    // Initialize session
    createDealSessions.set(telegramId, {
      step: 'role_selection',
      data: {},
      createdAt: Date.now()
    });

    const text = `📝 *Создание сделки*

*Шаг 1 из 8: Выберите вашу роль*

Покупатель — вносит депозит и получает товар/услугу.

Продавец — выполняет работу и получает оплату после подтверждения.`;

    const keyboard = roleSelectionKeyboard();
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
    const session = createDealSessions.get(telegramId);

    if (!session || session.step !== 'role_selection') return;

    const role = ctx.callbackQuery.data.split(':')[1];
    session.data.creatorRole = role;
    session.step = 'counterparty_username';
    createDealSessions.set(telegramId, session);

    const counterpartyLabel = role === 'buyer' ? 'продавца' : 'покупателя';

    const text = `📝 *Создание сделки*

*Шаг 2 из 8: Укажите ${counterpartyLabel}*

Введите Telegram username в формате @username

⚠️ Второй участник должен уже запустить бота!`;

    const keyboard = backButton();
    await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_username', text, keyboard);
  } catch (error) {
    console.error('Error handling role selection:', error);
  }
};

// ============================================
// TEXT INPUT HANDLER
// ============================================

const handleCreateDealInput = async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const session = createDealSessions.get(telegramId);

    if (!session) return;

    const text = ctx.message.text.trim();

    // Delete user's message immediately
    await messageManager.deleteUserMessage(ctx);

    // Handle /cancel
    if (text === '/cancel') {
      createDealSessions.delete(telegramId);
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'cancelled', '❌ Создание сделки отменено.', keyboard);
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
  const creatorRole = session.data.creatorRole;
  const username = text.replace('@', '');

  // Check if trying to create deal with themselves
  if (username.toLowerCase() === ctx.from.username?.toLowerCase()) {
    const errorText = `❌ *Ошибка*

Вы не можете создать сделку с самим собой!

Введите другой @username:`;
    const keyboard = backButton();
    await messageManager.editMainMessage(ctx, telegramId, errorText, keyboard);
    return;
  }

  // Find counterparty
  const counterparty = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
  const counterpartyLabel = creatorRole === 'buyer' ? 'Продавец' : 'Покупатель';

  if (!counterparty) {
    const errorText = `❌ *Пользователь не найден*

Пользователь @${username} ещё не запустил бота.
Попросите его отправить /start боту.

Введите другой @username:`;
    const keyboard = backButton();
    await messageManager.editMainMessage(ctx, telegramId, errorText, keyboard);
    return;
  }

  if (counterparty.blacklisted) {
    const errorText = `❌ *Пользователь заблокирован*

Этот пользователь не может участвовать в сделках.

Введите другой @username:`;
    const keyboard = backButton();
    await messageManager.editMainMessage(ctx, telegramId, errorText, keyboard);
    return;
  }

  if (await dealService.hasActiveDeal(counterparty.telegramId)) {
    const errorText = `⚠️ *У пользователя есть активная сделка*

@${username} должен завершить текущую сделку.

Введите другой @username:`;
    const keyboard = backButton();
    await messageManager.editMainMessage(ctx, telegramId, errorText, keyboard);
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
  createDealSessions.set(telegramId, session);

  const successText = `✅ ${counterpartyLabel} найден: @${counterparty.username}

📝 *Создание сделки*

*Шаг 3 из 8: Название*

Введите краткое название товара или услуги.
(от 5 до 200 символов)

Пример: "Разработка логотипа"`;

  const keyboard = backButton();
  await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_name', successText, keyboard);
};

// ============================================
// STEP 3: PRODUCT NAME
// ============================================

const handleProductName = async (ctx, session, text) => {
  const telegramId = ctx.from.id;

  if (text.length < 5 || text.length > 200) {
    const errorText = `❌ *Ошибка*

Название должно быть от 5 до 200 символов.
Сейчас: ${text.length} символов.

Введите название:`;
    const keyboard = backButton();
    await messageManager.editMainMessage(ctx, telegramId, errorText, keyboard);
    return;
  }

  session.data.productName = text;
  session.step = 'description';
  createDealSessions.set(telegramId, session);

  const successText = `📝 *Создание сделки*

*Шаг 4 из 8: Описание*

Опишите подробно условия работы:
• Что именно нужно сделать
• Требования к результату
• Формат сдачи

⚠️ Это описание будет использовано арбитром при спорах!

(от 20 до 5000 символов)`;

  const keyboard = backButton();
  await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_description', successText, keyboard);
};

// ============================================
// STEP 4: DESCRIPTION
// ============================================

const handleDescription = async (ctx, session, text) => {
  const telegramId = ctx.from.id;

  if (text.length < 20 || text.length > 5000) {
    const errorText = `❌ *Ошибка*

Описание должно быть от 20 до 5000 символов.
Сейчас: ${text.length} символов.

Введите описание:`;
    const keyboard = backButton();
    await messageManager.editMainMessage(ctx, telegramId, errorText, keyboard);
    return;
  }

  session.data.description = text;
  session.step = 'asset';
  createDealSessions.set(telegramId, session);

  const successText = `📝 *Создание сделки*

*Шаг 5 из 8: Выбор актива*

Выберите криптовалюту для сделки:`;

  const keyboard = assetSelectionKeyboard();
  await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_asset', successText, keyboard);
};

// ============================================
// STEP 5: ASSET SELECTION
// ============================================

const handleAssetSelection = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const session = createDealSessions.get(telegramId);

    if (!session || session.step !== 'asset') return;

    const asset = ctx.callbackQuery.data.split(':')[1];
    session.data.asset = asset;
    session.step = 'amount';
    createDealSessions.set(telegramId, session);

    const text = `📝 *Создание сделки*

*Шаг 6 из 8: Сумма*

Введите сумму сделки в ${asset}.

⚠️ Минимальная сумма: 50 ${asset}

Комиссия сервиса:
• До 300 USDT — 15 USDT
• От 300 USDT — 5%`;

    const keyboard = backButton();
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
  const amount = parseFloat(text);

  if (isNaN(amount) || amount < 50) {
    const errorText = `❌ *Ошибка*

Неверная сумма. Минимум: 50 USDT.

Введите сумму:`;
    const keyboard = backButton();
    await messageManager.editMainMessage(ctx, telegramId, errorText, keyboard);
    return;
  }

  session.data.amount = amount;
  session.step = 'creator_wallet';
  createDealSessions.set(telegramId, session);

  const creatorRole = session.data.creatorRole;
  const walletPurpose = creatorRole === 'buyer'
    ? 'для возврата средств при отмене/споре'
    : 'для получения оплаты';

  const successText = `📝 *Создание сделки*

*Шаг 7 из 8: Ваш кошелёк*

Введите адрес TRON-кошелька (TRC-20) ${walletPurpose}.

Формат: начинается с T, 34 символа

Пример: TQRfXYMDSspFQBXPf9MevZpkYgUXkviCSj`;

  const keyboard = backButton();
  await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_wallet', successText, keyboard);
};

// ============================================
// STEP 7: CREATOR WALLET
// ============================================

const handleCreatorWallet = async (ctx, session, inputText) => {
  const telegramId = ctx.from.id;
  const blockchainService = require('../../services/blockchain');
  const address = inputText.trim();

  if (!blockchainService.isValidAddress(address)) {
    const errorText = `❌ *Неверный адрес*

Адрес должен начинаться с T и содержать 34 символа.

Пример: TQRfXYMDSspFQBXPf9MevZpkYgUXkviCSj

Введите адрес:`;
    const keyboard = backButton();
    await messageManager.editMainMessage(ctx, telegramId, errorText, keyboard);
    return;
  }

  // Store wallet based on creator role
  if (session.data.creatorRole === 'buyer') {
    session.data.buyerAddress = address;
  } else {
    session.data.sellerAddress = address;
  }

  session.step = 'commission';
  createDealSessions.set(telegramId, session);

  const { amount, asset } = session.data;
  const commission = Deal.calculateCommission(amount);

  const text = `📝 *Создание сделки*

*Шаг 8 из 8: Комиссия*

Сумма сделки: ${amount} ${asset}
Комиссия сервиса: ${commission} ${asset}

Кто оплачивает комиссию?`;

  const keyboard = commissionTypeKeyboard(amount, asset);
  await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_commission', text, keyboard);
};

// ============================================
// STEP 8: COMMISSION SELECTION
// ============================================

const handleCommissionSelection = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const session = createDealSessions.get(telegramId);

    if (!session || session.step !== 'commission') return;

    const commissionType = ctx.callbackQuery.data.split(':')[1];
    session.data.commissionType = commissionType;
    session.step = 'deadline';
    createDealSessions.set(telegramId, session);

    const text = `📝 *Создание сделки*

*Выберите срок выполнения*

После истечения срока обе стороны получат уведомление.
Через 12 часов после дедлайна — автовозврат покупателю.`;

    const keyboard = deadlineKeyboard();
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
    const session = createDealSessions.get(telegramId);

    if (!session || session.step !== 'deadline') return;

    const hours = parseInt(ctx.callbackQuery.data.split(':')[1]);
    session.data.deadlineHours = hours;
    session.step = 'confirm';
    createDealSessions.set(telegramId, session);

    const { data } = session;
    const commission = Deal.calculateCommission(data.amount);

    let commissionText;
    if (data.commissionType === 'buyer') {
      commissionText = `Покупатель платит ${commission.toFixed(2)} ${data.asset}`;
    } else if (data.commissionType === 'seller') {
      commissionText = `Продавец платит ${commission.toFixed(2)} ${data.asset}`;
    } else {
      commissionText = `50/50 — по ${(commission / 2).toFixed(2)} ${data.asset}`;
    }

    const counterpartyLabel = data.creatorRole === 'buyer' ? 'Продавец' : 'Покупатель';
    const counterpartyUsername = data.creatorRole === 'buyer' ? data.sellerUsername : data.buyerUsername;

    const deadlineText = hours < 24 ? `${hours} часов` :
      hours === 24 ? '24 часа' :
        hours === 48 ? '48 часов' :
          `${Math.floor(hours / 24)} дней`;

    const text = `✅ *Подтверждение сделки*

📦 *Название:* ${data.productName}

📝 *Описание:*
${data.description.substring(0, 200)}${data.description.length > 200 ? '...' : ''}

👤 *${counterpartyLabel}:* @${counterpartyUsername}
💰 *Сумма:* ${data.amount} ${data.asset}
💸 *Комиссия:* ${commissionText}
⏰ *Срок:* ${deadlineText}

Всё верно?`;

    const keyboard = dealConfirmationKeyboard();
    await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_confirm', text, keyboard);
  } catch (error) {
    console.error('Error handling deadline selection:', error);
  }
};

// ============================================
// CONFIRM AND CREATE DEAL
// ============================================

const confirmCreateDeal = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const session = createDealSessions.get(telegramId);

    if (!session || session.step !== 'confirm') return;

    // Show loading
    await messageManager.editMainMessage(ctx, telegramId, '⏳ Создаём сделку и multisig-кошелёк...', {});

    const result = await dealService.createDeal(session.data);
    const { deal, wallet } = result;

    // Clean up session
    createDealSessions.delete(telegramId);

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

    // ========== NOTIFY CREATOR ==========
    if (deal.creatorRole === 'buyer') {
      // Buyer created - waiting for seller wallet
      const creatorText = `✅ *Сделка создана!*

🆔 ID: \`${deal.dealId}\`
📦 ${deal.productName}

💰 Сумма: ${deal.amount} ${deal.asset}
📊 Комиссия: ${commission} ${deal.asset}
💸 К оплате: ${depositAmount} ${deal.asset}

⏳ *Статус:* Ожидание кошелька продавца

Продавец получил уведомление и должен указать свой кошелёк.
После этого вы получите адрес для депозита.`;

      const creatorKeyboard = dealCreatedKeyboard(deal.dealId);
      await messageManager.showFinalScreen(ctx, deal.buyerId, 'deal_created', creatorText, creatorKeyboard);

      // Notify seller
      const sellerText = `📬 *Новая сделка!*

🆔 ID: \`${deal.dealId}\`
📦 ${deal.productName}

📝 ${deal.description.substring(0, 200)}${deal.description.length > 200 ? '...' : ''}

💰 Сумма: ${deal.amount} ${deal.asset}
💸 Вы получите: ${sellerPayout} ${deal.asset}
👤 Покупатель: @${ctx.from.username}

Для участия укажите ваш TRON-кошелёк.`;

      const sellerKeyboard = newDealNotificationKeyboard(deal.dealId);
      await messageManager.showNotification(ctx, deal.sellerId, sellerText, sellerKeyboard);
    } else {
      // Seller created - waiting for buyer wallet
      const creatorText = `✅ *Сделка создана!*

🆔 ID: \`${deal.dealId}\`
📦 ${deal.productName}

💰 Сумма: ${deal.amount} ${deal.asset}
💸 Вы получите: ${sellerPayout} ${deal.asset}

⏳ *Статус:* Ожидание кошелька покупателя

Покупатель получил уведомление и должен указать кошелёк и внести депозит.`;

      const creatorKeyboard = dealCreatedKeyboard(deal.dealId);
      await messageManager.showFinalScreen(ctx, deal.sellerId, 'deal_created', creatorText, creatorKeyboard);

      // Notify buyer
      const buyerText = `📬 *Новая сделка!*

🆔 ID: \`${deal.dealId}\`
📦 ${deal.productName}

📝 ${deal.description.substring(0, 200)}${deal.description.length > 200 ? '...' : ''}

💰 Сумма: ${deal.amount} ${deal.asset}
💸 К оплате: ${depositAmount} ${deal.asset}
👤 Продавец: @${ctx.from.username}

Для участия укажите ваш TRON-кошелёк.`;

      const buyerKeyboard = newDealNotificationKeyboard(deal.dealId);
      await messageManager.showNotification(ctx, deal.buyerId, buyerText, buyerKeyboard);
    }

    console.log(`✅ Deal ${deal.dealId} created by ${telegramId}`);
  } catch (error) {
    console.error('Error confirming deal creation:', error);

    createDealSessions.delete(ctx.from.id);

    const errorText = `❌ *Ошибка при создании сделки*

${error.message}`;

    const keyboard = mainMenuButton();
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
    createDealSessions.delete(telegramId);

    const keyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'cancelled', '❌ Создание сделки отменено.', keyboard);
  } catch (error) {
    console.error('Error canceling deal creation:', error);
  }
};

// ============================================
// SESSION HELPERS
// ============================================

/**
 * Check if user has active create deal session
 */
const hasCreateDealSession = (telegramId) => {
  return createDealSessions.has(telegramId);
};

/**
 * Clear create deal session
 */
const clearCreateDealSession = (telegramId) => {
  createDealSessions.delete(telegramId);
};

module.exports = {
  startCreateDeal,
  handleCreateDealInput,
  handleAssetSelection,
  handleDeadlineSelection,
  handleCommissionSelection,
  handleRoleSelection,
  confirmCreateDeal,
  cancelCreateDeal,
  hasCreateDealSession,
  clearCreateDealSession,
  createDealSessions
};
