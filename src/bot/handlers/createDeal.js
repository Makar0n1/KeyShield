const dealService = require('../../services/dealService');
const User = require('../../models/User');
const { Markup } = require('telegraf');
const {
  assetSelectionKeyboard,
  commissionTypeKeyboard,
  deadlineKeyboard,
  confirmationKeyboard,
  backToMainMenu,
  cancelDealButton,
  cancelActiveDealButton
} = require('../keyboards/main');
const messageManager = require('../utils/messageManager');

// Store temporary deal creation data (in production, use Redis or session storage)
const createDealSessions = new Map();

// Session cleanup configuration
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes

// Cleanup old/abandoned sessions periodically
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

/**
 * Start deal creation process
 */
const startCreateDeal = async (ctx) => {
  try {
    // Check if this is a callback query or text message
    const isCallbackQuery = !!ctx.callbackQuery;

    if (isCallbackQuery) {
      await ctx.answerCbQuery();
    }

    const telegramId = ctx.from.id;

    // Delete command if already creating a deal
    if (!isCallbackQuery) {
      await messageManager.deleteCommandIfOnScreen(ctx, 'create_deal');
    }

    // Track navigation
    messageManager.navigateTo(telegramId, 'create_deal');

    // Check if user is banned
    const user = await User.findOne({ telegramId });
    if (user?.blacklisted) {
      return messageManager.sendOrEdit(
        ctx,
        telegramId,
        '🚫 Вы не можете создавать сделки, так как ваш аккаунт заблокирован.',
        backToMainMenu()
      );
    }

    // Check if user already has an active deal
    if (await dealService.hasActiveDeal(telegramId)) {
      const message = '⚠️ *У вас уже есть активная сделка*\n\n' +
        'Завершите или отмените текущую сделку перед созданием новой.';

      return messageManager.sendOrEdit(ctx, telegramId, message, backToMainMenu());
    }

    // Initialize session with role selection and timestamp
    createDealSessions.set(telegramId, {
      step: 'role_selection',
      data: {},
      createdAt: Date.now()
    });

    const message = '📝 *Создание сделки - Шаг 1/9*\n\n' +
      '👤 Выберите вашу роль в сделке:';

    await messageManager.sendOrEdit(
      ctx,
      telegramId,
      message,
      Markup.inlineKeyboard([
        [Markup.button.callback('💵 Я покупатель', 'role:buyer')],
        [Markup.button.callback('🛠 Я продавец', 'role:seller')],
        [Markup.button.callback('❌ Отмена', 'cancel_create_deal')]
      ])
    );
  } catch (error) {
    console.error('Error starting deal creation:', error);
    await messageManager.sendOrEdit(
      ctx,
      ctx.from.id,
      '❌ Произошла ошибка. Попробуйте ещё раз.',
      backToMainMenu()
    );
  }
};

/**
 * Handle text input during deal creation
 */
const handleCreateDealInput = async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const session = createDealSessions.get(telegramId);

    if (!session) {
      return; // Not in deal creation flow
    }

    const text = ctx.message.text.trim();

    // Handle cancel
    if (text === '/cancel') {
      createDealSessions.delete(telegramId);
      return messageManager.sendOrEdit(
        ctx,
        telegramId,
        '❌ Создание сделки отменено.',
        backToMainMenu()
      );
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
    await messageManager.sendOrEdit(
      ctx,
      ctx.from.id,
      '❌ Произошла ошибка. Попробуйте ещё раз.',
      cancelDealButton()
    );
  }
};

/**
 * Handle counterparty username input (seller or buyer depending on role)
 */
const handleCounterpartyUsername = async (ctx, session, text) => {
  const telegramId = ctx.from.id;
  const creatorRole = session.data.creatorRole;

  // Extract username
  const username = text.replace('@', '');

  // Check if trying to create deal with themselves
  if (username.toLowerCase() === ctx.from.username?.toLowerCase()) {
    return messageManager.sendOrEdit(
      ctx,
      telegramId,
      '❌ Вы не можете создать сделку с самим собой!\n\nОтправьте другой @username или /cancel для отмены.',
      cancelDealButton()
    );
  }

  // Find counterparty by username
  const counterparty = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });

  const counterpartyLabel = creatorRole === 'buyer' ? 'Продавец' : 'Покупатель';

  if (!counterparty) {
    return messageManager.sendOrEdit(
      ctx,
      telegramId,
      '❌ *Пользователь не найден*\n\n' +
      `Пользователь @${username} ещё не запустил бота.\n` +
      'Попросите его отправить /start боту, затем попробуйте снова.\n\n' +
      'Отправьте другой @username или /cancel для отмены.',
      cancelDealButton()
    );
  }

  // Check if counterparty is banned
  if (counterparty.blacklisted) {
    return messageManager.sendOrEdit(
      ctx,
      telegramId,
      '❌ Этот пользователь заблокирован и не может участвовать в сделках.\n\n' +
      'Отправьте другой @username или /cancel для отмены.',
      cancelDealButton()
    );
  }

  // Check if counterparty has active deals
  if (await dealService.hasActiveDeal(counterparty.telegramId)) {
    return messageManager.sendOrEdit(
      ctx,
      telegramId,
      '⚠️ У этого пользователя уже есть активная сделка.\n' +
      'Он должен завершить её перед участием в новой.\n\n' +
      'Отправьте другой @username или /cancel для отмены.',
      cancelDealButton()
    );
  }

  // Assign roles based on creator role
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

  await messageManager.sendOrEdit(
    ctx,
    telegramId,
    `✅ ${counterpartyLabel} найден!\n\n` +
    '📝 *Шаг 3/9: Название работы*\n\n' +
    'Укажите краткое название работы (например: "Логотип для сайта", "Перевод статьи")\n\n' +
    'Отправьте название или /cancel для отмены.',
    cancelDealButton()
  );
};

/**
 * Handle product name input
 */
const handleProductName = async (ctx, session, text) => {
  const telegramId = ctx.from.id;

  if (text.length < 5 || text.length > 200) {
    return messageManager.sendOrEdit(
      ctx,
      telegramId,
      '❌ Название должно быть от 5 до 200 символов. Попробуйте ещё раз.',
      cancelDealButton()
    );
  }

  session.data.productName = text;
  session.step = 'description';
  createDealSessions.set(telegramId, session);

  await messageManager.sendOrEdit(
    ctx,
    telegramId,
    '📝 *Шаг 4/9: Подробное описание*\n\n' +
    'Опишите подробно условия работы:\n' +
    '• Что именно нужно сделать\n' +
    '• Требования к результату\n' +
    '• Формат сдачи\n' +
    '• Любые важные детали\n\n' +
    '⚠️ *Важно:* Это описание будет использовано арбитром при разрешении споров!\n\n' +
    'Отправьте описание или /cancel для отмены.',
    cancelDealButton()
  );
};

/**
 * Handle description input
 */
const handleDescription = async (ctx, session, text) => {
  const telegramId = ctx.from.id;

  if (text.length < 20 || text.length > 5000) {
    return messageManager.sendOrEdit(
      ctx,
      telegramId,
      '❌ Описание должно быть от 20 до 5000 символов. Попробуйте ещё раз.',
      cancelDealButton()
    );
  }

  session.data.description = text;
  session.step = 'asset';
  createDealSessions.set(telegramId, session);

  await messageManager.sendOrEdit(
    ctx,
    telegramId,
    '💰 *Шаг 5/9: Выбор актива*\n\n' +
    'Выберите актив для сделки:',
    assetSelectionKeyboard()
  );
};

/**
 * Handle asset selection
 */
const handleAssetSelection = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const session = createDealSessions.get(telegramId);

    if (!session || session.step !== 'asset') {
      return;
    }

    const asset = ctx.callbackQuery.data.split(':')[1];
    session.data.asset = asset;
    session.step = 'amount';
    createDealSessions.set(telegramId, session);

    await messageManager.sendOrEdit(
      ctx,
      telegramId,
      `💰 *Шаг 6/9: Сумма сделки*\n\n` +
      `Укажите сумму в ${asset}.\n\n` +
      `⚠️ Минимальная сумма: 50 ${asset}\n\n` +
      'Отправьте сумму (только число) или /cancel для отмены.',
      cancelDealButton()
    );
  } catch (error) {
    console.error('Error handling asset selection:', error);
  }
};

/**
 * Handle amount input
 */
const handleAmount = async (ctx, session, text) => {
  const telegramId = ctx.from.id;
  const amount = parseFloat(text);

  if (isNaN(amount) || amount < 50) {
    return messageManager.sendOrEdit(
      ctx,
      telegramId,
      '❌ Неверная сумма. Минимум: 50 USDT. Попробуйте ещё раз.',
      cancelDealButton()
    );
  }

  session.data.amount = amount;
  session.step = 'creator_wallet';
  createDealSessions.set(telegramId, session);

  const creatorRole = session.data.creatorRole;
  const roleLabel = creatorRole === 'buyer' ? 'покупателя' : 'продавца';

  await messageManager.sendOrEdit(
    ctx,
    telegramId,
    `💼 *Шаг 7/9: Кошелёк ${roleLabel}*\n\n` +
    `Укажите адрес TRON кошелька ${roleLabel} для ${creatorRole === 'buyer' ? 'возврата средств при отмене/споре' : 'получения оплаты'}.\n\n` +
    '⚠️ Адрес должен начинаться с буквы T и содержать 34 символа.\n\n' +
    'Пример: TQRfXYMDSspFQBXPf9MevZpkYgUXkviCSj\n\n' +
    'Отправьте адрес или /cancel для отмены.',
    cancelDealButton()
  );
};

/**
 * Handle creator wallet input (buyer or seller who is creating the deal)
 */
const handleCreatorWallet = async (ctx, session, text) => {
  const telegramId = ctx.from.id;
  const blockchainService = require('../../services/blockchain');
  const address = text.trim();

  // Validate TRON address
  if (!blockchainService.isValidAddress(address)) {
    return messageManager.sendOrEdit(
      ctx,
      telegramId,
      '❌ Неверный адрес кошелька!\n\n' +
      'Адрес должен начинаться с T и содержать 34 символа.\n' +
      'Пример: TQRfXYMDSspFQBXPf9MevZpkYgUXkviCSj\n\n' +
      'Попробуйте ещё раз или /cancel для отмены.',
      cancelDealButton()
    );
  }

  // Store wallet based on creator role
  const creatorRole = session.data.creatorRole;
  if (creatorRole === 'buyer') {
    session.data.buyerAddress = address;
  } else {
    session.data.sellerAddress = address;
  }

  session.step = 'commission';
  createDealSessions.set(telegramId, session);

  await messageManager.sendOrEdit(
    ctx,
    telegramId,
    '💰 *Шаг 7/9: Комиссия*\n\n' +
    'Кто будет оплачивать комиссию сервиса?',
    commissionTypeKeyboard()
  );
};

/**
 * Handle seller wallet input
 */
const handleSellerWallet = async (ctx, session, text) => {
  const telegramId = ctx.from.id;
  const blockchainService = require('../../services/blockchain');
  const address = text.trim();

  // Validate TRON address
  if (!blockchainService.isValidAddress(address)) {
    return messageManager.sendOrEdit(
      ctx,
      telegramId,
      '❌ Неверный адрес кошелька!\n\n' +
      'Адрес должен начинаться с T и содержать 34 символа.\n' +
      'Пример: TQRfXYMDSspFQBXPf9MevZpkYgUXkviCSj\n\n' +
      'Попробуйте ещё раз или /cancel для отмены.',
      cancelDealButton()
    );
  }

  session.data.sellerAddress = address;
  session.step = 'deadline';
  createDealSessions.set(telegramId, session);

  await messageManager.sendOrEdit(
    ctx,
    telegramId,
    '⏰ *Шаг 8/9: Срок выполнения*\n\n' +
    'Выберите срок выполнения работы:',
    deadlineKeyboard()
  );
};

/**
 * Handle deadline selection
 */
/**
 * Handle commission type selection
 */
const handleCommissionSelection = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const session = createDealSessions.get(telegramId);

    if (!session || session.step !== 'commission') {
      return;
    }

    const commissionType = ctx.callbackQuery.data.split(':')[1];
    session.data.commissionType = commissionType;
    session.step = 'deadline';
    createDealSessions.set(telegramId, session);

    await messageManager.sendOrEdit(
      ctx,
      telegramId,
      '⏰ *Шаг 8/9: Срок выполнения*\n\n' +
      'Выберите срок выполнения работы:',
      deadlineKeyboard()
    );
  } catch (error) {
    console.error('Error handling commission selection:', error);
  }
};

/**
 * Handle deadline selection and show confirmation
 */
const handleDeadlineSelection = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const session = createDealSessions.get(telegramId);

    if (!session || session.step !== 'deadline') {
      return;
    }

    const hours = parseInt(ctx.callbackQuery.data.split(':')[1]);
    session.data.deadlineHours = hours;
    session.step = 'confirm';
    createDealSessions.set(telegramId, session);

    const { data } = session;
    const Deal = require('../../models/Deal');
    const commission = Deal.calculateCommission(data.amount);

    let commissionText;
    if (data.commissionType === 'buyer') {
      commissionText = `Покупатель платит ${commission.toFixed(2)} ${data.asset}`;
    } else if (data.commissionType === 'seller') {
      commissionText = `Продавец платит ${commission.toFixed(2)} ${data.asset}`;
    } else {
      commissionText = `Каждый платит по ${(commission / 2).toFixed(2)} ${data.asset}`;
    }

    // Determine counterparty label and username based on creator role
    const counterpartyLabel = data.creatorRole === 'buyer' ? 'Исполнитель' : 'Заказчик';
    const counterpartyUsername = data.creatorRole === 'buyer' ? data.sellerUsername : data.buyerUsername;

    await messageManager.sendOrEdit(
      ctx,
      telegramId,
      '✅ *Подтверждение сделки*\n\n' +
      `📦 *Название:* ${data.productName}\n` +
      `📝 *Описание:* ${data.description.substring(0, 200)}${data.description.length > 200 ? '...' : ''}\n\n` +
      `👤 *${counterpartyLabel}:* @${counterpartyUsername}\n` +
      `💰 *Сумма:* ${data.amount} ${data.asset}\n` +
      `⏰ *Срок:* ${data.deadlineHours} часов\n` +
      `💸 *Комиссия:* ${commissionText}\n\n` +
      'Всё верно?',
      confirmationKeyboard('create_deal')
    );
  } catch (error) {
    console.error('Error handling commission selection:', error);
  }
};

/**
 * Handle role selection
 */
const handleRoleSelection = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const session = createDealSessions.get(telegramId);

    if (!session || session.step !== 'role_selection') {
      return;
    }

    const role = ctx.callbackQuery.data.split(':')[1];
    session.data.creatorRole = role;
    session.step = 'counterparty_username';
    createDealSessions.set(telegramId, session);

    const counterpartyLabel = role === 'buyer' ? 'продавца' : 'покупателя';

    await messageManager.sendOrEdit(
      ctx,
      telegramId,
      `📝 *Создание сделки - Шаг 2/9*\n\n` +
      `👤 Укажите Telegram username ${counterpartyLabel} в формате @username\n\n` +
      `⚠️ *Важно:* Второй участник должен уже запустить бота хотя бы один раз!\n\n` +
      'Отправьте @username или /cancel для отмены.',
      cancelDealButton()
    );
  } catch (error) {
    console.error('Error handling role selection:', error);
  }
};

/**
 * Confirm and create deal
 */
const confirmCreateDeal = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const session = createDealSessions.get(telegramId);

    if (!session || session.step !== 'confirm') {
      return;
    }

    await messageManager.sendOrEdit(ctx, telegramId, '⏳ Создаём сделку и multisig-кошелёк...', {});

    const result = await dealService.createDeal(session.data);
    const { deal, wallet } = result;

    // Clean up session
    createDealSessions.delete(telegramId);

    // Calculate deposit amount based on who pays commission
    const commissionBreakdown = dealService.getCommissionBreakdown(deal);
    let depositAmount = deal.amount;
    let depositNote = '';

    if (deal.commissionType === 'buyer') {
      depositAmount = deal.amount + deal.commission;
      depositNote = `\n💡 Включая комиссию: ${deal.commission} ${deal.asset}`;
    } else if (deal.commissionType === 'split') {
      const halfCommission = deal.commission / 2;
      depositAmount = deal.amount + halfCommission;
      depositNote = `\n💡 Включая 50% комиссии: ${halfCommission.toFixed(2)} ${deal.asset}`;
    }

    // Calculate seller's payout
    let sellerPayout = deal.amount;
    let payoutNote = '';

    if (deal.commissionType === 'seller') {
      sellerPayout = deal.amount - deal.commission;
      payoutNote = `\n💰 Вы получите: ${sellerPayout} ${deal.asset} (минус комиссия ${deal.commission})`;
    } else if (deal.commissionType === 'split') {
      const halfCommission = deal.commission / 2;
      sellerPayout = deal.amount - halfCommission;
      payoutNote = `\n💰 Вы получите: ${sellerPayout.toFixed(2)} ${deal.asset} (минус 50% комиссии)`;
    } else {
      payoutNote = `\n💰 Вы получите: ${sellerPayout} ${deal.asset} (комиссия оплачена покупателем)`;
    }

    // Handle notifications based on who created the deal
    if (deal.creatorRole === 'buyer') {
      // Buyer created deal - seller needs to provide wallet
      // Notify buyer (waiting for seller wallet)
      await messageManager.sendOrEdit(
        ctx,
        deal.buyerId,
        `✅ *Сделка создана!*\n\n` +
        `🆔 ID сделки: \`${deal.dealId}\`\n` +
        `📦 ${deal.productName}\n` +
        `💰 Сумма сделки: ${deal.amount} ${deal.asset}\n` +
        `📊 Комиссия: ${deal.commission} ${deal.asset}\n` +
        `💸 *К оплате: ${depositAmount} ${deal.asset}*${depositNote}\n\n` +
        `⏳ Ожидаем, пока продавец укажет свой кошелек.\n` +
        `После этого вы получите адрес для депозита.\n\n` +
        `Продавец получил уведомление.`,
        backToMainMenu()
      );

      // Notify seller to provide wallet
      await messageManager.sendOrEdit(
        ctx,
        deal.sellerId,
        `📬 *Новая сделка создана!*\n\n` +
        `🆔 ID: \`${deal.dealId}\`\n` +
        `📦 ${deal.productName}\n` +
        `💰 Сумма: ${deal.amount} ${deal.asset}\n` +
        `📊 Комиссия: ${deal.commission} ${deal.asset}${payoutNote}\n` +
        `👤 Заказчик: @${ctx.from.username}\n\n` +
        `⚠️ *ВАЖНО:* Укажите адрес вашего TRON кошелька для получения оплаты.\n\n` +
        `Отправьте адрес кошелька (начинается с T, 34 символа).\n` +
        `Пример: TQRfXYMDSspFQBXPf9MevZpkYgUXkviCSj`,
        cancelActiveDealButton(deal.dealId)
      );
    } else {
      // Seller created deal - buyer needs to provide wallet and deposit
      // Notify seller (waiting for buyer wallet and deposit)
      await messageManager.sendOrEdit(
        ctx,
        deal.sellerId,
        `✅ *Сделка создана!*\n\n` +
        `🆔 ID сделки: \`${deal.dealId}\`\n` +
        `📦 ${deal.productName}\n` +
        `💰 Сумма сделки: ${deal.amount} ${deal.asset}\n` +
        `📊 Комиссия: ${deal.commission} ${deal.asset}${payoutNote}\n\n` +
        `⏳ Ожидаем, пока покупатель укажет свой кошелек и внесет депозит.\n` +
        `После подтверждения депозита можете приступать к работе.\n\n` +
        `Покупатель получил уведомление.`,
        backToMainMenu()
      );

      // Notify buyer to provide wallet
      await messageManager.sendOrEdit(
        ctx,
        deal.buyerId,
        `📬 *Новая сделка ждёт вас!*\n\n` +
        `🆔 ID: \`${deal.dealId}\`\n` +
        `📦 ${deal.productName}\n` +
        `💰 Сумма: ${deal.amount} ${deal.asset}\n` +
        `📊 Комиссия: ${deal.commission} ${deal.asset}\n` +
        `💸 *К оплате: ${depositAmount} ${deal.asset}*${depositNote}\n` +
        `👤 Продавец: @${ctx.from.username}\n\n` +
        `⚠️ *ВАЖНО:* Укажите адрес вашего TRON кошелька для возврата средств при отмене/споре.\n\n` +
        `Отправьте адрес кошелька (начинается с T, 34 символа).\n` +
        `Пример: TQRfXYMDSspFQBXPf9MevZpkYgUXkviCSj`,
        cancelActiveDealButton(deal.dealId)
      );
    }

    console.log(`✅ Deal ${deal.dealId} created by ${telegramId}`);
  } catch (error) {
    console.error('Error confirming deal creation:', error);

    createDealSessions.delete(ctx.from.id);

    await messageManager.sendOrEdit(
      ctx,
      ctx.from.id,
      `❌ *Ошибка при создании сделки*\n\n${error.message}`,
      backToMainMenu()
    );
  }
};

/**
 * Cancel deal creation
 */
const cancelCreateDeal = async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    createDealSessions.delete(telegramId);

    await messageManager.sendOrEdit(
      ctx,
      telegramId,
      '❌ Создание сделки отменено.',
      backToMainMenu()
    );
  } catch (error) {
    console.error('Error canceling deal creation:', error);
  }
};

module.exports = {
  startCreateDeal,
  handleCreateDealInput,
  handleAssetSelection,
  handleDeadlineSelection,
  handleCommissionSelection,
  handleRoleSelection,
  confirmCreateDeal,
  cancelCreateDeal
};
