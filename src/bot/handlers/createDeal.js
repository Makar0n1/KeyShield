const dealService = require('../../services/dealService');
const User = require('../../models/User');
const Deal = require('../../models/Deal');
const Session = require('../../models/Session');
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
  newDealNotificationKeyboard,
  walletVerificationErrorKeyboard
} = require('../keyboards/main');
const messageManager = require('../utils/messageManager');
const { MAIN_MENU_TEXT } = require('./start');
const blockchainService = require('../../services/blockchain');
const adminAlertService = require('../../services/adminAlertService');

// Escape special Markdown characters
function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/([_*`\[\]])/g, '\\$1');
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

    // Check if user is banned
    const user = await User.findOne({ telegramId });
    if (user?.blacklisted) {
      const text = '🚫 Вы не можете создавать сделки, так как ваш аккаунт заблокирован.';
      const keyboard = mainMenuButton();
      await messageManager.navigateToScreen(ctx, telegramId, 'banned', text, keyboard);
      return;
    }

    // Check if user has a deal pending key validation
    const pendingDeal = await dealService.getDealPendingKeyValidation(telegramId);
    if (pendingDeal) {
      const isBuyer = pendingDeal.buyerId === telegramId;
      const refundAmount = pendingDeal.amount - pendingDeal.commission;

      if (pendingDeal.pendingKeyValidation === 'buyer_refund' && isBuyer) {
        const text = `⚠️ *Невозможно создать сделку*

У вас есть незавершённая сделка \`${pendingDeal.dealId}\`, ожидающая возврата средств.

💰 *Для возврата средств введите ваш приватный ключ:*

💸 К возврату: *${refundAmount.toFixed(2)} ${pendingDeal.asset}*
📊 Комиссия сервиса: ${pendingDeal.commission.toFixed(2)} ${pendingDeal.asset}

⚠️ Это ключ, который был выдан вам при указании кошелька.

❗️ *Без ввода ключа средства НЕ будут возвращены!*`;

        const keyboard = mainMenuButton();
        await messageManager.navigateToScreen(ctx, telegramId, 'pending_refund', text, keyboard);
        return;
      }

      if ((pendingDeal.pendingKeyValidation === 'seller_payout' || pendingDeal.pendingKeyValidation === 'seller_release') && !isBuyer) {
        const text = `⚠️ *Невозможно создать сделку*

У вас есть незавершённая сделка \`${pendingDeal.dealId}\`, ожидающая получения средств.

💰 *Для получения средств введите ваш приватный ключ:*

💸 К получению: *${refundAmount.toFixed(2)} ${pendingDeal.asset}*
📊 Комиссия сервиса: ${pendingDeal.commission.toFixed(2)} ${pendingDeal.asset}

⚠️ Это ключ, который был выдан вам при указании кошелька.

❗️ *Без ввода ключа средства НЕ будут переведены!*`;

        const keyboard = mainMenuButton();
        await messageManager.navigateToScreen(ctx, telegramId, 'pending_payout', text, keyboard);
        return;
      }

      // Other party has pending validation - inform them
      const text = `⚠️ *У вас есть незавершённая сделка*

Сделка \`${pendingDeal.dealId}\` ожидает действий от другого участника.

Дождитесь завершения текущей сделки перед созданием новой.`;
      const keyboard = mainMenuButton();
      await messageManager.navigateToScreen(ctx, telegramId, 'pending_deal', text, keyboard);
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
    await setCreateDealSession(telegramId, {
      step: 'role_selection',
      data: {},
      createdAt: Date.now()
    });

    const text = `📝 *Создание сделки*

*Шаг 1 из 9: Выберите вашу роль*

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
    const session = await getCreateDealSession(telegramId);

    // Allow re-selection for back navigation (don't check step strictly)
    if (!session) return;

    const role = ctx.callbackQuery.data.split(':')[1];
    session.data.creatorRole = role;
    session.step = 'counterparty_username';
    await setCreateDealSession(telegramId, session);

    const counterpartyLabel = role === 'buyer' ? 'продавца' : 'покупателя';

    const text = `📝 *Создание сделки*

*Шаг 2 из 9: Укажите ${counterpartyLabel}*

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
    const session = await getCreateDealSession(telegramId);

    if (!session) return;

    const text = ctx.message.text.trim();

    // Delete user's message immediately
    await messageManager.deleteUserMessage(ctx);

    // Handle /cancel
    if (text === '/cancel') {
      await deleteCreateDealSession(telegramId);
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
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_username', errorText, keyboard);
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
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_username', errorText, keyboard);
    return;
  }

  if (counterparty.blacklisted) {
    const errorText = `❌ *Пользователь заблокирован*

Этот пользователь не может участвовать в сделках.

Введите другой @username:`;
    const keyboard = backButton();
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_username', errorText, keyboard);
    return;
  }

  if (await dealService.hasActiveDeal(counterparty.telegramId)) {
    const errorText = `⚠️ *У пользователя есть активная сделка*

@${username} должен завершить текущую сделку.

Введите другой @username:`;
    const keyboard = backButton();
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

  const successText = `✅ ${counterpartyLabel} найден: @${counterparty.username}

📝 *Создание сделки*

*Шаг 3 из 9: Название*

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
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_name', errorText, keyboard);
    return;
  }

  session.data.productName = text;
  session.step = 'description';
  await setCreateDealSession(telegramId, session);

  const successText = `📝 *Создание сделки*

*Шаг 4 из 9: Описание*

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
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_description', errorText, keyboard);
    return;
  }

  session.data.description = text;
  session.step = 'asset';
  await setCreateDealSession(telegramId, session);

  const successText = `📝 *Создание сделки*

*Шаг 5 из 9: Выбор актива*

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
    const session = await getCreateDealSession(telegramId);

    // Allow re-selection for back navigation (don't check step strictly)
    if (!session) return;

    const asset = ctx.callbackQuery.data.split(':')[1];
    session.data.asset = asset;
    session.step = 'amount';
    await setCreateDealSession(telegramId, session);

    const text = `📝 *Создание сделки*

*Шаг 6 из 9: Сумма*

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
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_amount', errorText, keyboard);
    return;
  }

  session.data.amount = amount;
  session.step = 'commission';
  await setCreateDealSession(telegramId, session);

  const { asset } = session.data;
  const commission = Deal.calculateCommission(amount);

  const successText = `📝 *Создание сделки*

*Шаг 7 из 9: Комиссия*

Сумма сделки: ${amount} ${asset}
Комиссия сервиса: ${commission} ${asset}

Кто оплачивает комиссию?`;

  const keyboard = commissionTypeKeyboard(amount, asset);
  await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_commission', successText, keyboard);
};

// ============================================
// STEP 9: CREATOR WALLET (with validation)
// - Buyer: balance check (amount + 5 USDT buffer)
// - Seller: existence check only
// ============================================

const handleCreatorWallet = async (ctx, session, inputText) => {
  const telegramId = ctx.from.id;
  const address = inputText.trim();

  if (!blockchainService.isValidAddress(address)) {
    const errorText = `❌ *Неверный адрес*

Адрес должен начинаться с T и содержать 34 символа.

Пример: TQRfXYMDSspGDB7GB8MevZpkYgUXkviCSj

Введите адрес:`;
    const keyboard = backButton();
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
  await messageManager.updateScreen(ctx, telegramId, 'wallet_verification', `⏳ *Проверяем ваш адрес...*

Проверка кошелька в сети TRON.`, {});

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
        errorMessage = `❌ *Неверный адрес*

Адрес не является действительным TRON-адресом.

Введите другой адрес:`;
      } else if (verification.errorType === 'not_found') {
        errorMessage = `❌ *Кошелёк не найден*

Этот адрес не активирован в сети TRON.

Введите другой адрес:`;
      } else if (verification.errorType === 'insufficient_funds' || verification.errorType === 'no_buffer') {
        const currentBalance = verification.balance || 0;
        errorMessage = `❌ *Недостаточно средств*

Для создания сделки на вашем кошельке должно быть минимум *${requiredAmount} USDT*.

Текущий баланс: *${currentBalance.toFixed(2)} USDT*
Необходимо: *${depositAmount} USDT* (депозит) + *5 USDT* (буфер)

Пополните кошелёк или укажите другой:`;
      } else {
        errorMessage = `❌ *Ошибка проверки*

Не удалось проверить баланс кошелька. Попробуйте позже или укажите другой адрес.`;
      }

      const keyboard = backButton();
      await messageManager.updateScreen(ctx, telegramId, 'create_deal_wallet', errorMessage, keyboard);
      return;
    }

    // Wallet valid - show success for 3 seconds (don't show balance for privacy)
    const successText = `✅ *Кошелёк проверен!*

Адрес: \`${address}\`

Переходим к подтверждению...`;

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
        errorMessage = `❌ *Неверный адрес*

Адрес не является действительным TRON-адресом.

Введите другой адрес:`;
      } else if (verification.errorType === 'not_found') {
        errorMessage = `❌ *Кошелёк не найден*

Этот адрес не активирован в сети TRON.
Убедитесь, что кошелёк имеет хотя бы одну транзакцию.

Введите другой адрес:`;
      } else {
        errorMessage = `❌ *Ошибка проверки*

Не удалось проверить кошелёк. Попробуйте позже или укажите другой адрес.`;
      }

      const keyboard = backButton();
      await messageManager.updateScreen(ctx, telegramId, 'create_deal_wallet', errorMessage, keyboard);
      return;
    }

    // Wallet valid - show success for 3 seconds
    const successText = `✅ *Кошелёк проверен!*

Адрес: \`${address}\`

Переходим к подтверждению...`;

    await User.updateOne({ telegramId }, { currentScreen: 'wallet_verified' });
    await messageManager.updateScreen(ctx, telegramId, 'wallet_verified', successText, {});
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // Proceed to confirmation (for both buyer and seller)
  session.step = 'confirm';
  await setCreateDealSession(telegramId, session);

  await showDealConfirmation(ctx, telegramId, session.data);
};

/**
 * Show deal confirmation screen
 */
const showDealConfirmation = async (ctx, telegramId, data) => {
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

  const hours = data.deadlineHours;
  const deadlineText = hours < 24 ? `${hours} часов` :
    hours === 24 ? '24 часа' :
      hours === 48 ? '48 часов' :
        `${Math.floor(hours / 24)} дней`;

  const text = `✅ *Подтверждение сделки*

📦 *Название:* ${escapeMarkdown(data.productName)}

📝 *Описание:*
${escapeMarkdown(data.description.substring(0, 200))}${data.description.length > 200 ? '...' : ''}

👤 *${counterpartyLabel}:* @${counterpartyUsername}
💰 *Сумма:* ${data.amount} ${data.asset}
💸 *Комиссия:* ${commissionText}
⏰ *Срок:* ${deadlineText}

Всё верно?`;

  const keyboard = dealConfirmationKeyboard();
  await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_confirm', text, keyboard);
};

// ============================================
// STEP 8: COMMISSION SELECTION
// ============================================

const handleCommissionSelection = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const session = await getCreateDealSession(telegramId);

    // Allow re-selection for back navigation (don't check step strictly)
    if (!session) return;

    const commissionType = ctx.callbackQuery.data.split(':')[1];
    session.data.commissionType = commissionType;
    session.step = 'deadline';
    await setCreateDealSession(telegramId, session);

    const text = `📝 *Создание сделки*

*Шаг 8 из 9: Срок выполнения*

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
    const session = await getCreateDealSession(telegramId);

    // Allow re-selection for back navigation (don't check step strictly)
    if (!session) return;

    const hours = parseInt(ctx.callbackQuery.data.split(':')[1]);
    session.data.deadlineHours = hours;
    session.step = 'creator_wallet';
    await setCreateDealSession(telegramId, session);

    const creatorRole = session.data.creatorRole;
    const walletPurpose = creatorRole === 'buyer'
      ? 'для возврата средств при отмене/споре'
      : 'для получения оплаты';

    const text = `📝 *Создание сделки*

*Шаг 9 из 9: Ваш кошелёк*

Введите адрес TRON-кошелька (TRC-20) ${walletPurpose}.

Формат: начинается с T, 34 символа

Пример: TQRfXYMDSspGDB7GB8MevZpkYgUXkviCSj`;

    const keyboard = backButton();
    await messageManager.navigateToScreen(ctx, telegramId, 'create_deal_wallet', text, keyboard);
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
    const session = await getCreateDealSession(telegramId);

    if (!session || session.step !== 'confirm') return;

    // Show loading (use updateScreen for silent edit)
    await messageManager.updateScreen(ctx, telegramId, 'create_deal_loading', '⏳ Создаём сделку и multisig-кошелёк...', {});

    const result = await dealService.createDeal(session.data);
    const { deal, wallet, creatorPrivateKey } = result;

    // Clean up session
    await deleteCreateDealSession(telegramId);

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
      const creatorText = `✅ *Сделка создана!*

🆔 ID: \`${deal.dealId}\`
📦 ${escapeMarkdown(deal.productName)}

💰 Сумма: ${deal.amount} ${deal.asset}
📊 Комиссия: ${commission} ${deal.asset}
💸 К оплате: ${depositAmount} ${deal.asset}

⏳ *Статус:* Ожидание кошелька продавца

Продавец получил уведомление и должен указать свой кошелёк.
После этого вы получите адрес для депозита.`;

      const creatorKeyboard = dealCreatedKeyboard(deal.dealId);
      await messageManager.showFinalScreen(ctx, deal.buyerId, 'deal_created', creatorText, creatorKeyboard);

      // ========== SHOW PRIVATE KEY (separate message below with button) ==========
      const keyText = `🔐 *ВАЖНО: Ваш приватный ключ!*

🆔 Сделка: \`${deal.dealId}\`

Ваш приватный ключ покупателя:
\`${creatorPrivateKey}\`

⚠️ *СОХРАНИТЕ ЭТОТ КЛЮЧ ПРЯМО СЕЙЧАС!*

• Скопируйте и сохраните в надёжном месте
• Этот ключ показан *ОДИН РАЗ* и *НЕ ХРАНИТСЯ* на сервере
• Без этого ключа вы НЕ сможете подтвердить/отменить сделку!

🗑 Сообщение удалится через 60 секунд или по нажатию кнопки.`;

      const keyKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Я сохранил ключ', `key_saved:${deal.dealId}`)]
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
📦 ${escapeMarkdown(deal.productName)}

💰 Сумма: ${deal.amount} ${deal.asset}
💸 Вы получите: ${sellerPayout} ${deal.asset}

⏳ *Статус:* Ожидание кошелька покупателя

Покупатель получил уведомление и должен указать кошелёк и внести депозит.`;

      const creatorKeyboard = dealCreatedKeyboard(deal.dealId);
      await messageManager.showFinalScreen(ctx, deal.sellerId, 'deal_created', creatorText, creatorKeyboard);

      // ========== SHOW PRIVATE KEY (separate message below with button) ==========
      const keyText = `🔐 *ВАЖНО: Ваш приватный ключ!*

🆔 Сделка: \`${deal.dealId}\`

Ваш приватный ключ продавца:
\`${creatorPrivateKey}\`

⚠️ *СОХРАНИТЕ ЭТОТ КЛЮЧ ПРЯМО СЕЙЧАС!*

• Скопируйте и сохраните в надёжном месте
• Этот ключ показан *ОДИН РАЗ* и *НЕ ХРАНИТСЯ* на сервере
• Без этого ключа вы НЕ сможете получить средства по сделке!

🗑 Сообщение удалится через 60 секунд или по нажатию кнопки.`;

      const keyKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Я сохранил ключ', `key_saved:${deal.dealId}`)]
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

    // Alert admin about new deal
    await adminAlertService.alertNewDeal(deal);

    console.log(`✅ Deal ${deal.dealId} created by ${telegramId}`);
  } catch (error) {
    console.error('Error confirming deal creation:', error);

    await deleteCreateDealSession(ctx.from.id);

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
    await deleteCreateDealSession(telegramId);

    const keyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'cancelled', '❌ Создание сделки отменено.', keyboard);
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
  'create_deal_username': 'counterparty_username',
  'create_deal_name': 'product_name',
  'create_deal_description': 'description',
  'create_deal_asset': 'asset',
  'create_deal_amount': 'amount',
  'create_deal_commission': 'commission',
  'create_deal_deadline': 'deadline',
  'create_deal_wallet': 'creator_wallet',
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
  const { data } = session;
  let text, keyboard;

  switch (step) {
    case 'role_selection':
      text = `📝 *Создание сделки*

*Шаг 1 из 9: Выберите вашу роль*

Покупатель — вносит депозит и получает товар/услугу.

Продавец — выполняет работу и получает оплату после подтверждения.`;
      if (data.creatorRole) {
        text += `\n\n✏️ _Ранее выбрано: ${data.creatorRole === 'buyer' ? 'Покупатель' : 'Продавец'}_`;
      }
      keyboard = roleSelectionKeyboard();
      break;

    case 'counterparty_username':
      const counterpartyLabel1 = data.creatorRole === 'buyer' ? 'продавца' : 'покупателя';
      text = `📝 *Создание сделки*

*Шаг 2 из 9: Укажите ${counterpartyLabel1}*

Введите Telegram username в формате @username

⚠️ Второй участник должен уже запустить бота!`;
      if (data.sellerUsername || data.buyerUsername) {
        const savedUsername = data.creatorRole === 'buyer' ? data.sellerUsername : data.buyerUsername;
        if (savedUsername) {
          text += `\n\n✏️ _Ранее указано: @${savedUsername}_`;
        }
      }
      keyboard = backButton();
      break;

    case 'product_name':
      const counterpartyLabel2 = data.creatorRole === 'buyer' ? 'Продавец' : 'Покупатель';
      const counterpartyUsername = data.creatorRole === 'buyer' ? data.sellerUsername : data.buyerUsername;
      text = `✅ ${counterpartyLabel2} найден: @${counterpartyUsername}

📝 *Создание сделки*

*Шаг 3 из 9: Название*

Введите краткое название товара или услуги.
(от 5 до 200 символов)

Пример: "Разработка логотипа"`;
      if (data.productName) {
        text += `\n\n✏️ _Ранее указано: "${escapeMarkdown(data.productName)}"_`;
      }
      keyboard = backButton();
      break;

    case 'description':
      text = `📝 *Создание сделки*

*Шаг 4 из 9: Описание*

Опишите подробно условия работы:
• Что именно нужно сделать
• Требования к результату
• Формат сдачи

⚠️ Это описание будет использовано арбитром при спорах!

(от 20 до 5000 символов)`;
      if (data.description) {
        const shortDesc = data.description.substring(0, 100);
        text += `\n\n✏️ _Ранее указано: "${escapeMarkdown(shortDesc)}${data.description.length > 100 ? '...' : ''}"_`;
      }
      keyboard = backButton();
      break;

    case 'asset':
      text = `📝 *Создание сделки*

*Шаг 5 из 9: Выбор актива*

Выберите криптовалюту для сделки:`;
      if (data.asset) {
        text += `\n\n✏️ _Ранее выбрано: ${data.asset}_`;
      }
      keyboard = assetSelectionKeyboard();
      break;

    case 'amount':
      text = `📝 *Создание сделки*

*Шаг 6 из 9: Сумма*

Введите сумму сделки в ${data.asset || 'USDT'}.

⚠️ Минимальная сумма: 50 ${data.asset || 'USDT'}

Комиссия сервиса:
• До 300 USDT — 15 USDT
• От 300 USDT — 5%`;
      if (data.amount) {
        text += `\n\n✏️ _Ранее указано: ${data.amount} ${data.asset || 'USDT'}_`;
      }
      keyboard = backButton();
      break;

    case 'commission':
      const commission = Deal.calculateCommission(data.amount);
      text = `📝 *Создание сделки*

*Шаг 7 из 9: Комиссия*

Сумма сделки: ${data.amount} ${data.asset}
Комиссия сервиса: ${commission} ${data.asset}

Кто оплачивает комиссию?`;
      if (data.commissionType) {
        const commTypeText = data.commissionType === 'buyer' ? 'Покупатель' :
          data.commissionType === 'seller' ? 'Продавец' : '50/50';
        text += `\n\n✏️ _Ранее выбрано: ${commTypeText}_`;
      }
      keyboard = commissionTypeKeyboard(data.amount, data.asset);
      break;

    case 'deadline':
      text = `📝 *Создание сделки*

*Шаг 8 из 9: Срок выполнения*

После истечения срока обе стороны получат уведомление.
Через 12 часов после дедлайна — автовозврат покупателю.`;
      if (data.deadlineHours) {
        const hours = data.deadlineHours;
        const deadlineText = hours < 24 ? `${hours} часов` :
          hours === 24 ? '24 часа' :
            hours === 48 ? '48 часов' :
              `${Math.floor(hours / 24)} дней`;
        text += `\n\n✏️ _Ранее выбрано: ${deadlineText}_`;
      }
      keyboard = deadlineKeyboard();
      break;

    case 'creator_wallet':
      const walletPurpose = data.creatorRole === 'buyer'
        ? 'для возврата средств при отмене/споре'
        : 'для получения оплаты';
      text = `📝 *Создание сделки*

*Шаг 9 из 9: Ваш кошелёк*

Введите адрес TRON-кошелька (TRC-20) ${walletPurpose}.

Формат: начинается с T, 34 символа

Пример: TQRfXYMDSspGDB7GB8MevZpkYgUXkviCSj`;
      const savedWallet = data.creatorRole === 'buyer' ? data.buyerAddress : data.sellerAddress;
      if (savedWallet) {
        text += `\n\n✏️ _Ранее указано: ${savedWallet}_`;
      }
      keyboard = backButton();
      break;

    default:
      // Unknown step - go to main menu
      await deleteCreateDealSession(telegramId);
      const { mainMenuKeyboard } = require('../keyboards/main');
      const { MAIN_MENU_TEXT } = require('./start');
      await messageManager.showFinalScreen(ctx, telegramId, 'main_menu', MAIN_MENU_TEXT, mainMenuKeyboard());
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

module.exports = {
  startCreateDeal,
  handleCreateDealInput,
  handleAssetSelection,
  handleDeadlineSelection,
  handleCommissionSelection,
  handleRoleSelection,
  confirmCreateDeal,
  cancelCreateDeal,
  handleCreateDealBack,
  hasCreateDealSession,
  clearCreateDealSession: deleteCreateDealSession
};
