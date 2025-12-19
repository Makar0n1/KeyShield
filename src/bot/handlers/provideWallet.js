const Deal = require('../../models/Deal');
const blockchainService = require('../../services/blockchain');
const dealService = require('../../services/dealService');
const { Markup } = require('telegraf');
const {
  mainMenuButton,
  depositWarningKeyboard,
  walletVerificationErrorKeyboard,
  backButton
} = require('../keyboards/main');
const User = require('../../models/User');
const messageManager = require('../utils/messageManager');

// Escape special Markdown characters
function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/([_*`\[\]])/g, '\\$1');
}

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
// SELLER WALLET INPUT (with existence verification)
// ============================================

/**
 * Handle seller providing wallet address (text input)
 * Now includes wallet verification: address validity, existence check
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

    // Validate TRON address format
    if (!blockchainService.isValidAddress(text)) {
      const errorText = `❌ *Неверный адрес кошелька!*

Адрес должен начинаться с T и содержать 34 символа.
_Пример: TQRfXYMDSspGDB7GB8MevZpkYgUXkviCSj_

Попробуйте ещё раз:`;

      const keyboard = backButton();
      await messageManager.updateScreen(ctx, telegramId, 'seller_wallet_error', errorText, keyboard);
      return true;
    }

    // ========== STEP 1: Show verification loading screen ==========
    await User.findOneAndUpdate(
      { telegramId },
      { currentScreen: 'wallet_verification' }
    );

    const verifyingText = `⏳ *Проверяем ваш адрес...*

Проверка кошелька в сети TRON.`;

    await messageManager.updateScreen(ctx, telegramId, 'wallet_verification', verifyingText, null);

    // ========== STEP 2: Verify wallet exists ==========
    const verification = await blockchainService.verifyWalletExists(text);

    if (!verification.valid) {
      // Wallet verification failed - show error
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
      await messageManager.updateScreen(ctx, telegramId, 'seller_wallet_error', errorMessage, keyboard);
      return true;
    }

    // ========== STEP 3: Verification passed! Show success ==========
    const successText = `✅ *Кошелёк проверен!*

Адрес: \`${text}\`

Подготовка данных...`;

    await User.findOneAndUpdate({ telegramId }, { currentScreen: 'wallet_verified' });
    await messageManager.updateScreen(ctx, telegramId, 'wallet_verified', successText, null);
    await new Promise(resolve => setTimeout(resolve, 3000));

    // ========== STEP 4: Generate private key and save deal ==========
    const sellerKeys = await blockchainService.generateKeyPair();
    const sellerPrivateKey = sellerKeys.privateKey;

    // Update deal with seller address and private key
    deal.sellerAddress = text;
    deal.sellerPrivateKey = sellerPrivateKey;
    deal.status = 'waiting_for_deposit';
    await deal.save();

    console.log(`✅ Seller wallet verified and set for deal ${deal.dealId}: ${text}`);

    // Show confirmation to seller FIRST (main message)
    const sellerText = `✅ *Кошелек сохранен!*

Адрес: \`${text}\`

🆔 Сделка: \`${deal.dealId}\`
📦 ${escapeMarkdown(deal.productName)}

Ожидаем депозит от покупателя.
Вы получите уведомление, когда средства поступят.`;

    const sellerKeyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'wallet_saved', sellerText, sellerKeyboard);

    // ========== SHOW PRIVATE KEY (separate message below with button) ==========
    const keyText = `🔐 *ВАЖНО: Ваш приватный ключ!*

🆔 Сделка: \`${deal.dealId}\`

Ваш приватный ключ продавца:
\`${sellerPrivateKey}\`

⚠️ *СОХРАНИТЕ ЭТОТ КЛЮЧ ПРЯМО СЕЙЧАС!*

• Скопируйте и сохраните в надёжном месте
• Этот ключ показан *ОДИН РАЗ* и *НЕ ХРАНИТСЯ* на сервере
• Без этого ключа вы НЕ сможете получить средства по сделке!

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
        // Already deleted by button
      }
    }, 60000);

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
Переведите ТОЧНО ${depositAmount} ${deal.asset}.

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
// BUYER WALLET INPUT (with balance verification)
// ============================================

/**
 * Handle buyer providing wallet address (text input)
 * Now includes wallet verification: address validity, USDT balance check
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

    // ========== STEP 1: Show verification loading screen ==========
    // Set currentScreen to wallet_verification to exclude from loading middleware
    await User.findOneAndUpdate(
      { telegramId },
      { currentScreen: 'wallet_verification' }
    );

    const verifyingText = `⏳ *Проверяем ваш адрес...*

Пожалуйста, подождите. Мы проверяем:
• Корректность адреса
• Наличие средств на кошельке

Это может занять несколько секунд.`;

    await messageManager.updateScreen(ctx, telegramId, 'wallet_verification', verifyingText, null);

    // ========== STEP 2: Calculate required amount ==========
    let depositAmount = deal.amount;
    if (deal.commissionType === 'buyer') {
      depositAmount = deal.amount + deal.commission;
    } else if (deal.commissionType === 'split') {
      depositAmount = deal.amount + deal.commission / 2;
    }

    // Required amount = deposit amount + 5 USDT buffer
    const requiredAmount = depositAmount + 5;

    // ========== STEP 3: Verify wallet ==========
    const verification = await blockchainService.verifyBuyerWallet(text, requiredAmount, depositAmount);

    if (!verification.valid) {
      // Wallet verification failed - show error with options
      let errorIcon = '❌';
      if (verification.errorType === 'no_buffer') {
        errorIcon = '⚠️';
      }

      const errorText = `${errorIcon} *Проверка кошелька не пройдена*

${verification.error}

Выберите действие:`;

      const keyboard = walletVerificationErrorKeyboard(deal.dealId);
      await messageManager.updateScreen(ctx, telegramId, 'wallet_verification_error', errorText, keyboard);
      return true;
    }

    // ========== STEP 4: Verification passed! Show success message for 3 seconds ==========
    // Don't show balance for privacy
    const successText = `✅ *Кошелёк проверен!*

✓ Баланс достаточен для совершения сделки.

Подготовка данных...`;

    await User.findOneAndUpdate({ telegramId }, { currentScreen: 'wallet_verified' });
    await messageManager.updateScreen(ctx, telegramId, 'wallet_verified', successText, null);

    // Wait 3 seconds before proceeding
    await new Promise(resolve => setTimeout(resolve, 3000));

    // ========== STEP 5: Generate private key and save deal ==========
    const buyerKeys = await blockchainService.generateKeyPair();
    const buyerPrivateKey = buyerKeys.privateKey;

    deal.buyerAddress = text;
    deal.buyerPrivateKey = buyerPrivateKey;
    deal.status = 'waiting_for_deposit';
    await deal.save();

    console.log(`✅ Buyer wallet verified and set for deal ${deal.dealId}: ${text} (balance: ${verification.balance} USDT)`);

    // Calculate deposit note for display
    let depositNote = '';
    if (deal.commissionType === 'buyer') {
      depositNote = `\n💡 Включая комиссию: ${deal.commission} ${deal.asset}`;
    } else if (deal.commissionType === 'split') {
      const halfCommission = deal.commission / 2;
      depositNote = `\n💡 Включая 50% комиссии: ${halfCommission.toFixed(2)} ${deal.asset}`;
    }

    // ========== STEP 6: Show deposit instructions ==========
    const buyerDepositText = `✅ *Кошелек подтверждён! Теперь внесите депозит.*

🆔 Сделка: \`${deal.dealId}\`
📦 ${escapeMarkdown(deal.productName)}

🔐 *Адрес для депозита (${deal.asset}):*
\`${deal.multisigAddress}\`

💸 *К оплате: ${depositAmount.toFixed(2)} ${deal.asset}*${depositNote}

⚠️ *ВАЖНО:*
• Переведите ТОЧНО ${depositAmount.toFixed(2)} ${deal.asset}
• Срок: 24 часа

⏱ Система автоматически обнаружит депозит.

[🔍 Проверить в TronScan](https://tronscan.org/#/address/${deal.multisigAddress})`;

    const buyerKeyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'deposit_instructions', buyerDepositText, buyerKeyboard);

    // ========== STEP 7: Show private key (separate message) ==========
    const keyText = `🔐 *ВАЖНО: Ваш приватный ключ!*

🆔 Сделка: \`${deal.dealId}\`

Ваш приватный ключ покупателя:
\`${buyerPrivateKey}\`

⚠️ *СОХРАНИТЕ ЭТОТ КЛЮЧ ПРЯМО СЕЙЧАС!*

• Скопируйте и сохраните в надёжном месте
• Этот ключ показан *ОДИН РАЗ* и *НЕ ХРАНИТСЯ* на сервере
• Без этого ключа вы НЕ сможете подтвердить/отменить сделку!

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
        // Already deleted by button
      }
    }, 60000);

    // ========== STEP 8: Notify seller ==========
    const sellerNotifyText = `✅ *Покупатель указал кошелек!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${escapeMarkdown(deal.productName)}

Ожидаем депозит от покупателя.
Вы получите уведомление, когда средства поступят.`;

    const sellerKeyboard = mainMenuButton();
    await messageManager.showNotification(ctx, deal.sellerId, sellerNotifyText, sellerKeyboard);

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
