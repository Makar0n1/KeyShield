/**
 * Invite Accept Handlers
 * Handles accepting/declining deal invitations from invite links
 */

const Deal = require('../../models/Deal');
const User = require('../../models/User');
const { Markup } = require('telegraf');
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
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const dealId = ctx.callbackQuery.data.split(':')[1];

    // Find the deal
    const deal = await Deal.findOne({ dealId, status: 'pending_counterparty' });

    if (!deal) {
      await ctx.answerCbQuery('Сделка не найдена или уже принята', { show_alert: true });
      return;
    }

    // Check if invite expired
    if (deal.inviteExpiresAt < new Date()) {
      deal.status = 'cancelled';
      deal.inviteToken = null;
      await deal.save();

      const text = `❌ *Ссылка истекла*

Время действия ссылки истекло. Попросите создателя отправить новую.`;

      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'invite_expired', text, keyboard);
      return;
    }

    // Check user has saved wallets
    const user = await User.findOne({ telegramId });
    const savedWallets = user?.savedWallets?.filter(w => w.isActive) || [];

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
      const text = `💳 *Выберите кошелёк*

Выберите сохранённый кошелёк или введите новый адрес для участия в сделке.`;

      const keyboard = walletSelectionKeyboard(savedWallets);
      await messageManager.navigateToScreen(ctx, telegramId, 'invite_wallet_select', text, keyboard);
    } else {
      // Ask for wallet address
      const text = `💳 *Введите адрес кошелька*

Введите ваш TRON-кошелёк (начинается с T).

На этот кошелёк ${userRole === 'buyer' ? 'будут возвращены средства в случае отмены' : 'будут отправлены средства после успешной сделки'}.`;

      const keyboard = backButton();
      await messageManager.navigateToScreen(ctx, telegramId, 'invite_wallet_input', text, keyboard);
    }
  } catch (error) {
    console.error('Error accepting invite:', error);
    await ctx.answerCbQuery('Произошла ошибка', { show_alert: true });
  }
};

/**
 * Handle decline_invite button press
 */
const handleDeclineInvite = async (ctx) => {
  try {
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
      const decliningUsername = decliningUser?.username ? `@${decliningUser.username}` : 'Пользователь';

      // Notify creator
      const creatorId = deal.creatorRole === 'buyer' ? deal.buyerId : deal.sellerId;
      if (creatorId && creatorId !== 0) {
        const escapeMarkdown = (text) => {
          if (!text) return '';
          return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
        };

        const creatorText = `❌ *Приглашение отклонено*

🆔 Сделка: \`${deal.dealId}\`
📦 ${escapeMarkdown(deal.productName)}

${decliningUsername} отклонил(а) ваше приглашение в сделку.

Вы можете создать новую сделку в любое время.`;

        const creatorKeyboard = mainMenuButton();
        await messageManager.showNotification(ctx, creatorId, creatorText, creatorKeyboard);
      }

      console.log(`❌ Invite ${deal.dealId} declined by ${telegramId}, creator notified`);
    }

    const text = `❌ *Приглашение отклонено*

Вы отклонили приглашение в сделку.`;

    const keyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'invite_declined', text, keyboard);
  } catch (error) {
    console.error('Error declining invite:', error);
    await ctx.answerCbQuery('Произошла ошибка', { show_alert: true });
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
      const text = `❌ *Неверный адрес*

Введите корректный TRON-адрес (начинается с T, 34 символа).`;

      const keyboard = backButton();
      await messageManager.updateScreen(ctx, telegramId, 'invite_wallet_input', text, keyboard);
      return true;
    }

    // Find the deal
    const deal = await Deal.findOne({ dealId, status: 'pending_counterparty' });
    if (!deal) {
      const text = `❌ *Сделка не найдена*

Сделка была отменена или уже принята.`;

      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'invite_error', text, keyboard);
      await clearInviteAcceptSession(telegramId);
      return true;
    }

    // Show loading
    await messageManager.updateScreen(ctx, telegramId, 'invite_loading', '⏳ Принимаем сделку и создаём multisig-кошелёк...', {});

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
      const buyerText = `✅ *Сделка принята!*

🆔 ID: \`${updatedDeal.dealId}\`
📦 ${escapeMarkdown(updatedDeal.productName)}

💰 Сумма: ${updatedDeal.amount} ${updatedDeal.asset}
💸 К оплате: ${depositAmount} ${updatedDeal.asset}
💳 Ваш кошелёк: \`${shortWallet}\`

📥 *Адрес для депозита:*
\`${updatedDeal.multisigAddress}\`

⚠️ Отправьте *ровно ${depositAmount} USDT* на указанный адрес.
После подтверждения транзакции сделка начнётся автоматически.`;

      const buyerKeyboard = dealCreatedKeyboard(updatedDeal.dealId);
      await messageManager.showFinalScreen(ctx, telegramId, 'deal_accepted', buyerText, buyerKeyboard);
    } else {
      // User is seller - waiting for deposit
      const sellerText = `✅ *Сделка принята!*

🆔 ID: \`${updatedDeal.dealId}\`
📦 ${escapeMarkdown(updatedDeal.productName)}

💰 Сумма: ${updatedDeal.amount} ${updatedDeal.asset}
💸 Вы получите: ${sellerPayout} ${updatedDeal.asset}
💳 Ваш кошелёк: \`${shortWallet}\`

⏳ *Статус:* Ожидание депозита от покупателя

Покупатель получил адрес для оплаты.`;

      const sellerKeyboard = dealCreatedKeyboard(updatedDeal.dealId);
      await messageManager.showFinalScreen(ctx, telegramId, 'deal_accepted', sellerText, sellerKeyboard);
    }

    // Show private key message
    const roleLabel = userRole === 'buyer' ? 'покупателя' : 'продавца';
    const keyText = `🔐 *ВАЖНО: Ваш приватный ключ!*

🆔 Сделка: \`${updatedDeal.dealId}\`

Ваш приватный ключ ${roleLabel}:
\`${counterpartyPrivateKey}\`

⚠️ *СОХРАНИТЕ ЭТОТ КЛЮЧ ПРЯМО СЕЙЧАС!*

• Скопируйте и сохраните в надёжном месте
• Этот ключ показан *ОДИН РАЗ* и *НЕ ХРАНИТСЯ* на сервере
• Без этого ключа вы НЕ сможете получить/вернуть средства!

🗑 Сообщение удалится через 60 секунд или по нажатию кнопки.`;

    const keyKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✅ Я сохранил ключ', `key_saved:${updatedDeal.dealId}`)]
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
    const counterpartyUsername = counterpartyUser?.username ? `@${counterpartyUser.username}` : 'Контрагент';

    if (updatedDeal.creatorRole === 'buyer') {
      // Creator is buyer - now has deposit address
      const creatorText = `✅ *Контрагент принял сделку!*

🆔 ID: \`${updatedDeal.dealId}\`
📦 ${escapeMarkdown(updatedDeal.productName)}

👤 Продавец: ${counterpartyUsername}

📥 *Адрес для депозита:*
\`${updatedDeal.multisigAddress}\`

💸 К оплате: ${depositAmount} ${updatedDeal.asset}

⚠️ Отправьте *ровно ${depositAmount} USDT* на указанный адрес.`;

      const creatorKeyboard = dealCreatedKeyboard(updatedDeal.dealId);
      await messageManager.showNotification(ctx, creatorId, creatorText, creatorKeyboard);
    } else {
      // Creator is seller - buyer should deposit
      const creatorText = `✅ *Контрагент принял сделку!*

🆔 ID: \`${updatedDeal.dealId}\`
📦 ${escapeMarkdown(updatedDeal.productName)}

👤 Покупатель: ${counterpartyUsername}

⏳ *Статус:* Ожидание депозита

Покупатель получил адрес для оплаты. После поступления депозита вы получите уведомление.`;

      const creatorKeyboard = dealCreatedKeyboard(updatedDeal.dealId);
      await messageManager.showNotification(ctx, creatorId, creatorText, creatorKeyboard);
    }

    // Alert admin
    await adminAlertService.alertNewDeal(updatedDeal);

    console.log(`✅ Invite deal ${updatedDeal.dealId} accepted by ${telegramId}`);

    return true;
  } catch (error) {
    console.error('Error processing invite wallet:', error);

    const text = `❌ *Ошибка*

${error.message}`;

    const keyboard = mainMenuButton();
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
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const walletIndex = parseInt(ctx.callbackQuery.data.split(':')[1]);

    // Get user's saved wallets
    const user = await User.findOne({ telegramId });
    const savedWallets = user?.savedWallets?.filter(w => w.isActive) || [];

    if (walletIndex >= savedWallets.length) {
      await ctx.answerCbQuery('Кошелёк не найден', { show_alert: true });
      return;
    }

    const selectedWallet = savedWallets[walletIndex];

    // Process with this wallet
    await handleInviteWalletInput(ctx, selectedWallet.address);
  } catch (error) {
    console.error('Error selecting wallet for invite:', error);
    await ctx.answerCbQuery('Произошла ошибка', { show_alert: true });
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
