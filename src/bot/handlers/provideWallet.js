const Deal = require('../../models/Deal');
const blockchainService = require('../../services/blockchain');
const dealService = require('../../services/dealService');
const {
  mainMenuButton,
  depositWarningKeyboard,
  backButton
} = require('../keyboards/main');
const messageManager = require('../utils/messageManager');

// ============================================
// ENTER WALLET CALLBACK (from notification)
// ============================================

/**
 * Handle "Enter Wallet" button click from deal notification
 */
const enterWalletHandler = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Сделка не найдена.', keyboard);
      return;
    }

    // Determine user role
    const role = deal.getUserRole(telegramId);

    if (!role) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Вы не являетесь участником этой сделки.', keyboard);
      return;
    }

    // Check if waiting for this user's wallet
    if (role === 'seller' && deal.status !== 'waiting_for_seller_wallet') {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Сделка не ожидает вашего кошелька.', keyboard);
      return;
    }

    if (role === 'buyer' && deal.status !== 'waiting_for_buyer_wallet') {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Сделка не ожидает вашего кошелька.', keyboard);
      return;
    }

    // Show wallet input prompt
    const text = `💳 *Укажите кошелек для сделки*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}
💰 ${deal.amount} ${deal.asset}

Введите адрес вашего TRON-кошелька (TRC-20):

_Адрес должен начинаться с T и содержать 34 символа_
_Пример: TQRfXYMDSspGDB7GB8MevZpkYgUXkviCSj_`;

    const keyboard = backButton();
    await messageManager.navigateToScreen(ctx, telegramId, `enter_wallet_${dealId}`, text, keyboard);
  } catch (error) {
    console.error('Error in enterWalletHandler:', error);
  }
};

// ============================================
// SELLER WALLET INPUT
// ============================================

/**
 * Handle seller providing wallet address (text input)
 */
const handleSellerWalletInput = async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const text = ctx.message.text.trim();

    // Delete user message
    await messageManager.deleteUserMessage(ctx);

    // Find deal waiting for this seller's wallet
    const deal = await Deal.findOne({
      sellerId: telegramId,
      status: 'waiting_for_seller_wallet'
    });

    if (!deal) {
      return false; // Not waiting for wallet
    }

    // Validate TRON address
    if (!blockchainService.isValidAddress(text)) {
      const errorText = `❌ *Неверный адрес кошелька!*

Адрес должен начинаться с T и содержать 34 символа.
_Пример: TQRfXYMDSspGDB7GB8MevZpkYgUXkviCSj_

Попробуйте ещё раз:`;

      const keyboard = backButton();
      await messageManager.updateScreen(ctx, telegramId, 'seller_wallet_error', errorText, keyboard);
      return true;
    }

    // Generate private key for seller (pseudo-multisig)
    const sellerKeys = await blockchainService.generateKeyPair();
    const sellerPrivateKey = sellerKeys.privateKey;

    // Update deal with seller address and private key
    deal.sellerAddress = text;
    deal.sellerPrivateKey = sellerPrivateKey;
    deal.status = 'waiting_for_deposit';
    await deal.save();

    console.log(`✅ Seller wallet set for deal ${deal.dealId}: ${text}`);

    // Show private key message (will be deleted in 60 seconds)
    const keyText = `🔐 *ВАШ ПРИВАТНЫЙ КЛЮЧ*

⚠️ *СОХРАНИТЕ ЭТОТ КЛЮЧ!*
Он понадобится для получения средств по сделке!

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

🔑 *Ключ:*
\`${sellerPrivateKey}\`

⏱ _Это сообщение удалится через 60 секунд!_

❗️ *Если вы потеряете ключ, вы не сможете получить средства!*`;

    // Send key message (separate from main message flow)
    const keyMsg = await ctx.telegram.sendMessage(telegramId, keyText, {
      parse_mode: 'Markdown'
    });

    // Delete key message after 60 seconds
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(telegramId, keyMsg.message_id);
      } catch (e) {
        // Message might already be deleted
      }
    }, 60000);

    // Show confirmation to seller (final screen)
    const sellerText = `✅ *Кошелек сохранен!*

Адрес: \`${text}\`

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

🔐 *Приватный ключ отправлен выше!*
⚠️ Сохраните его - он нужен для получения средств!

Ожидаем депозит от покупателя.
Вы получите уведомление, когда средства поступят.`;

    const sellerKeyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'wallet_saved', sellerText, sellerKeyboard);

    // Calculate deposit amount for buyer notification
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

    // Show WARNING notification to buyer
    const buyerText = `⚠️ *ВНИМАНИЕ! Прочитайте перед переводом*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}
💸 К оплате: *${depositAmount} ${deal.asset}*${depositNote}

❗️ *ВАЖНЫЕ УСЛОВИЯ:*

1️⃣ *Депозит необратим*
После перевода средства будут заморожены в multisig-кошельке.

2️⃣ *Возврат только через арбитраж*
Если продавец не выполнит работу - открывайте спор.

3️⃣ *Комиссия не возвращается*
Комиссия сервиса (${deal.commission} ${deal.asset}) остаётся у сервиса.

4️⃣ *Точная сумма*
Переведите ТОЧНО ${depositAmount} ${deal.asset}. Допуск: -2 ${deal.asset}.

5️⃣ *Срок 24 часа*
Если не внесёте депозит в течение 24 часов, сделка будет отменена.

✅ *Если вы понимаете и согласны с условиями, нажмите кнопку ниже.*`;

    const buyerKeyboard = depositWarningKeyboard(deal.dealId);
    await messageManager.showNotification(ctx, deal.buyerId, buyerText, buyerKeyboard);

    return true;
  } catch (error) {
    console.error('Error handling seller wallet input:', error);
    return false;
  }
};

// ============================================
// BUYER WALLET INPUT
// ============================================

/**
 * Handle buyer providing wallet address (text input)
 */
const handleBuyerWalletInput = async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const text = ctx.message.text.trim();

    // Delete user message
    await messageManager.deleteUserMessage(ctx);

    // Find deal waiting for this buyer's wallet
    const deal = await Deal.findOne({
      buyerId: telegramId,
      status: 'waiting_for_buyer_wallet'
    });

    if (!deal) {
      return false; // Not waiting for wallet
    }

    // Validate TRON address
    if (!blockchainService.isValidAddress(text)) {
      const errorText = `❌ *Неверный адрес кошелька!*

Адрес должен начинаться с T и содержать 34 символа.
_Пример: TQRfXYMDSspGDB7GB8MevZpkYgUXkviCSj_

Попробуйте ещё раз:`;

      const keyboard = backButton();
      await messageManager.updateScreen(ctx, telegramId, 'buyer_wallet_error', errorText, keyboard);
      return true;
    }

    // Generate private key for buyer (pseudo-multisig)
    const buyerKeys = await blockchainService.generateKeyPair();
    const buyerPrivateKey = buyerKeys.privateKey;

    // Update deal with buyer address and private key
    deal.buyerAddress = text;
    deal.buyerPrivateKey = buyerPrivateKey;
    deal.status = 'waiting_for_deposit';
    await deal.save();

    console.log(`✅ Buyer wallet set for deal ${deal.dealId}: ${text}`);

    // Show private key message (will be deleted in 60 seconds)
    const keyText = `🔐 *ВАШ ПРИВАТНЫЙ КЛЮЧ*

⚠️ *СОХРАНИТЕ ЭТОТ КЛЮЧ!*
Он понадобится для возврата средств в случае спора или отмены!

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

🔑 *Ключ:*
\`${buyerPrivateKey}\`

⏱ _Это сообщение удалится через 60 секунд!_

❗️ *Если вы потеряете ключ, вы не сможете вернуть средства!*`;

    // Send key message (separate from main message flow)
    const keyMsg = await ctx.telegram.sendMessage(telegramId, keyText, {
      parse_mode: 'Markdown'
    });

    // Delete key message after 60 seconds
    setTimeout(async () => {
      try {
        await ctx.telegram.deleteMessage(telegramId, keyMsg.message_id);
      } catch (e) {
        // Message might already be deleted
      }
    }, 60000);

    // Calculate deposit amount
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

    // Show deposit instructions to buyer (final screen with deposit info)
    const buyerText = `✅ *Кошелек сохранен! Теперь внесите депозит.*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

🔐 *Приватный ключ отправлен выше!*
⚠️ Сохраните его - он нужен для возврата средств!

🔐 *Адрес для депозита (${deal.asset}):*
\`${deal.multisigAddress}\`

💸 *К оплате: ${depositAmount} ${deal.asset}*${depositNote}

⚠️ *ВАЖНО:*
• Переведите ТОЧНО ${depositAmount} ${deal.asset}
• Допустимое отклонение: до -2 ${deal.asset}
• Срок: 24 часа

⏱ Система автоматически обнаружит депозит.

[🔍 Проверить в TronScan](https://tronscan.org/#/address/${deal.multisigAddress})`;

    const buyerKeyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'deposit_instructions', buyerText, buyerKeyboard);

    // Notify seller
    const sellerText = `✅ *Покупатель указал кошелек!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

Ожидаем депозит от покупателя.
Вы получите уведомление, когда средства поступят.`;

    const sellerKeyboard = mainMenuButton();
    await messageManager.showNotification(ctx, deal.sellerId, sellerText, sellerKeyboard);

    return true;
  } catch (error) {
    console.error('Error handling buyer wallet input:', error);
    return false;
  }
};

// ============================================
// DEPOSIT WARNING CONFIRMATION
// ============================================

/**
 * Handle deposit warning confirmation button
 */
const handleDepositWarningConfirmation = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    // Find deal
    const deal = await Deal.findOne({
      dealId: dealId,
      buyerId: telegramId,
      status: 'waiting_for_deposit'
    });

    if (!deal) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Сделка не найдена или уже завершена.', keyboard);
      return;
    }

    // Calculate deposit amount
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

    // Show deposit instructions (final screen)
    const text = `✅ *Готово! Теперь внесите депозит*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

🔐 *Адрес для депозита (${deal.asset}):*
\`${deal.multisigAddress}\`

💸 *К оплате: ${depositAmount} ${deal.asset}*${depositNote}

⚠️ *ВАЖНО:*
• Переведите ТОЧНО ${depositAmount} ${deal.asset}
• Допустимое отклонение: до -2 ${deal.asset}
• Срок: 24 часа

⏱ Система автоматически обнаружит депозит в течение 1-3 минут.

[🔍 Проверить в TronScan](https://tronscan.org/#/address/${deal.multisigAddress})`;

    const keyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'deposit_instructions', text, keyboard);
  } catch (error) {
    console.error('Error handling deposit warning confirmation:', error);
  }
};

// ============================================
// SHOW DEPOSIT ADDRESS (from deal details)
// ============================================

/**
 * Handle "Show Deposit Address" button from deal details
 */
const showDepositAddress = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Сделка не найдена.', keyboard);
      return;
    }

    if (deal.buyerId !== telegramId) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Только покупатель может видеть адрес депозита.', keyboard);
      return;
    }

    if (deal.status !== 'waiting_for_deposit') {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Сделка не ожидает депозита.', keyboard);
      return;
    }

    // Calculate deposit amount
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

    const text = `💳 *Адрес для депозита*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

🔐 *Адрес (${deal.asset}):*
\`${deal.multisigAddress}\`

💸 *К оплате: ${depositAmount} ${deal.asset}*${depositNote}

⚠️ *ВАЖНО:*
• Переведите ТОЧНО ${depositAmount} ${deal.asset}
• Допустимое отклонение: до -2 ${deal.asset}
• Срок: 24 часа

⏱ Система автоматически обнаружит депозит.

[🔍 Проверить в TronScan](https://tronscan.org/#/address/${deal.multisigAddress})`;

    const keyboard = mainMenuButton();
    await messageManager.navigateToScreen(ctx, telegramId, `deposit_${dealId}`, text, keyboard);
  } catch (error) {
    console.error('Error showing deposit address:', error);
  }
};

// ============================================
// DECLINE DEAL
// ============================================

/**
 * Handle deal decline from counterparty
 */
const declineDeal = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Сделка не найдена.', keyboard);
      return;
    }

    // Check if user is participant
    if (!deal.isParticipant(telegramId)) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Вы не являетесь участником этой сделки.', keyboard);
      return;
    }

    // Check if deal can be declined
    const declinableStatuses = ['waiting_for_seller_wallet', 'waiting_for_buyer_wallet', 'waiting_for_deposit'];
    if (!declinableStatuses.includes(deal.status)) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Сделку нельзя отклонить на данном этапе.', keyboard);
      return;
    }

    // Cancel deal
    await dealService.updateDealStatus(dealId, 'cancelled', telegramId);

    // Notify decliner
    const declinerText = `❌ *Сделка отклонена*

🆔 Сделка: \`${dealId}\`
📦 ${deal.productName}

Сделка была отменена по вашему запросу.`;

    const declinerKeyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'deal_declined', declinerText, declinerKeyboard);

    // Notify other party
    const otherPartyId = deal.buyerId === telegramId ? deal.sellerId : deal.buyerId;
    const otherPartyRole = deal.buyerId === telegramId ? 'Продавец' : 'Покупатель';

    const otherText = `❌ *Сделка отклонена*

🆔 Сделка: \`${dealId}\`
📦 ${deal.productName}

${otherPartyRole === 'Продавец' ? 'Покупатель' : 'Продавец'} отклонил сделку.`;

    const otherKeyboard = mainMenuButton();
    await messageManager.showNotification(ctx, otherPartyId, otherText, otherKeyboard);

    console.log(`❌ Deal ${dealId} declined by user ${telegramId}`);
  } catch (error) {
    console.error('Error declining deal:', error);
  }
};

// ============================================
// CANCEL DEAL (by creator before deposit)
// ============================================

/**
 * Handle deal cancellation
 */
const cancelDeal = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Сделка не найдена.', keyboard);
      return;
    }

    // Check if deal can be cancelled
    const cancellableStatuses = ['waiting_for_seller_wallet', 'waiting_for_buyer_wallet', 'waiting_for_deposit'];
    if (!cancellableStatuses.includes(deal.status)) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Сделку нельзя отменить на данном этапе.', keyboard);
      return;
    }

    // Cancel deal
    await dealService.updateDealStatus(dealId, 'cancelled', telegramId);

    // Notify canceller
    const text = `❌ *Сделка отменена*

🆔 Сделка: \`${dealId}\`
📦 ${deal.productName}

Сделка была отменена.`;

    const keyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'deal_cancelled', text, keyboard);

    // Notify other party if exists
    const otherPartyId = deal.buyerId === telegramId ? deal.sellerId : deal.buyerId;
    if (otherPartyId && otherPartyId !== telegramId) {
      const otherText = `❌ *Сделка отменена*

🆔 Сделка: \`${dealId}\`
📦 ${deal.productName}

Другой участник отменил сделку.`;

      await messageManager.showNotification(ctx, otherPartyId, otherText, keyboard);
    }

    console.log(`❌ Deal ${dealId} cancelled by user ${telegramId}`);
  } catch (error) {
    console.error('Error cancelling deal:', error);
  }
};

module.exports = {
  enterWalletHandler,
  handleSellerWalletInput,
  handleBuyerWalletInput,
  handleDepositWarningConfirmation,
  showDepositAddress,
  declineDeal,
  cancelDeal
};
