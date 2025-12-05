const dealService = require('../../services/dealService');
const {
  myDealsKeyboard,
  myDealsEmptyKeyboard,
  dealDetailsKeyboard,
  mainMenuButton,
  finalScreenKeyboard,
  workSubmittedKeyboard,
  getStatusIcon
} = require('../keyboards/main');
const messageManager = require('../utils/messageManager');
const { MAIN_MENU_TEXT } = require('./start');

// ============================================
// STATUS HELPERS
// ============================================

function getStatusText(status) {
  const statusMap = {
    'created': 'Создана',
    'waiting_for_seller_wallet': '⏳ Ожидание кошелька продавца',
    'waiting_for_buyer_wallet': '⏳ Ожидание кошелька покупателя',
    'waiting_for_deposit': '💳 Ожидание депозита',
    'locked': '🔒 Депозит заблокирован',
    'in_progress': '⚡ Работа выполнена',
    'completed': '✅ Завершена',
    'dispute': '⚠️ Спор',
    'resolved': '⚖️ Решена',
    'cancelled': '❌ Отменена',
    'expired': '⌛ Истекла'
  };
  return statusMap[status] || status;
}

// ============================================
// MY DEALS LIST
// ============================================

const showMyDeals = async (ctx) => {
  try {
    const isCallbackQuery = !!ctx.callbackQuery;
    if (isCallbackQuery) await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const deals = await dealService.getUserDeals(telegramId);

    if (deals.length === 0) {
      const text = `📋 *Мои сделки*

У вас пока нет сделок.

Создайте первую сделку, чтобы начать!`;

      const keyboard = myDealsEmptyKeyboard();
      await messageManager.navigateToScreen(ctx, telegramId, 'my_deals', text, keyboard);
      return;
    }

    // Format deals list
    let text = '📋 *Мои сделки*\n\n';

    for (const deal of deals.slice(0, 10)) {
      const role = deal.getUserRole(telegramId);
      const statusIcon = getStatusIcon(deal.status);
      const statusText = getStatusText(deal.status);

      text += `${statusIcon} \`${deal.dealId}\`\n`;
      text += `📦 ${deal.productName}\n`;
      text += `👤 ${role === 'buyer' ? 'Покупатель' : 'Продавец'}\n`;
      text += `💰 ${deal.amount} ${deal.asset}\n`;
      text += `📊 ${statusText}\n\n`;
    }

    const keyboard = myDealsKeyboard(deals);
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
    const telegramId = ctx.from.id;

    // Delete user message if text input
    if (ctx.message) {
      await messageManager.deleteUserMessage(ctx);
    }

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      const text = '❌ *Сделка не найдена*\n\nПроверьте ID сделки.';
      const keyboard = mainMenuButton();
      await messageManager.editMainMessage(ctx, telegramId, text, keyboard);
      return;
    }

    if (!deal.isParticipant(telegramId)) {
      const text = '❌ *Доступ запрещён*\n\nВы не являетесь участником этой сделки.';
      const keyboard = mainMenuButton();
      await messageManager.editMainMessage(ctx, telegramId, text, keyboard);
      return;
    }

    const role = deal.getUserRole(telegramId);
    const commission = dealService.getCommissionBreakdown(deal);

    let text = `📋 *Сделка ${deal.dealId}*\n\n`;
    text += `📦 *Название:* ${deal.productName}\n\n`;
    text += `📝 *Описание:*\n${deal.description.substring(0, 300)}${deal.description.length > 300 ? '...' : ''}\n\n`;

    text += `👤 *Ваша роль:* ${role === 'buyer' ? 'Покупатель' : 'Продавец'}\n`;

    // Get counterparty username
    const User = require('../../models/User');
    const counterpartyId = role === 'buyer' ? deal.sellerId : deal.buyerId;
    const counterparty = await User.findOne({ telegramId: counterpartyId });
    const counterpartyUsername = counterparty?.username || `ID: ${counterpartyId}`;

    text += `🤝 *${role === 'buyer' ? 'Продавец' : 'Покупатель'}:* @${counterpartyUsername}\n\n`;

    text += `💰 *Сумма:* ${deal.amount} ${deal.asset}\n`;
    text += `💸 *Комиссия:* ${deal.commission} ${deal.asset}\n`;

    if (role === 'buyer') {
      text += `📥 *Вы платите:* ${deal.amount + commission.buyerPays} ${deal.asset}\n`;
    } else {
      text += `📤 *Вы получите:* ${deal.amount - commission.sellerPays} ${deal.asset}\n`;
    }

    text += `\n📊 *Статус:* ${getStatusText(deal.status)}\n`;

    if (deal.deadline) {
      text += `⏰ *Дедлайн:* ${deal.deadline.toLocaleString('ru-RU')}\n`;
    }

    // Show multisig address for waiting_for_deposit
    if (deal.status === 'waiting_for_deposit' && deal.multisigAddress) {
      text += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `🔐 *Escrow-адрес:*\n\`${deal.multisigAddress}\`\n`;
      text += `\n[Проверить на TronScan](https://tronscan.org/#/address/${deal.multisigAddress})`;
    }

    // Show deposit TX
    if (deal.depositTxHash) {
      text += `\n\n✅ *Депозит:* [Транзакция](https://tronscan.org/#/transaction/${deal.depositTxHash})`;
    }

    const keyboard = dealDetailsKeyboard(deal.dealId, role, deal.status);
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
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const deal = await dealService.submitWork(dealId, telegramId);

    // Show confirmation to seller
    const sellerText = `✅ *Работа отмечена как выполненная*

Сделка: \`${deal.dealId}\`

Покупатель получил уведомление и может:
• Принять работу
• Открыть спор

Ожидайте решения покупателя.`;

    const sellerKeyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'work_submitted', sellerText, sellerKeyboard);

    // Notify buyer with notification
    const buyerText = `📬 *Работа выполнена!*

Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

Продавец отметил работу как выполненную.

Проверьте результат и выберите действие:`;

    const buyerKeyboard = workSubmittedKeyboard(deal.dealId);
    await messageManager.showNotification(ctx, deal.buyerId, buyerText, buyerKeyboard);

  } catch (error) {
    console.error('Error submitting work:', error);
    await ctx.answerCbQuery('❌ Ошибка');
  }
};

// ============================================
// ACCEPT WORK (BUYER)
// ============================================

const acceptWork = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    // Show loading
    await messageManager.editMainMessage(ctx, telegramId, '⏳ *Принятие работы*\n\nСоздаём транзакцию для перевода средств продавцу...', {});

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Сделка не найдена.', keyboard);
      return;
    }

    if (deal.buyerId !== telegramId) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Только покупатель может принять работу.', keyboard);
      return;
    }

    if (deal.status !== 'in_progress') {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', `❌ Невозможно принять работу в статусе: ${getStatusText(deal.status)}`, keyboard);
      return;
    }

    // Import services
    const blockchainService = require('../../services/blockchain');
    const Transaction = require('../../models/Transaction');
    const Deal = require('../../models/Deal');
    const MultisigWallet = require('../../models/MultisigWallet');

    // Calculate amounts
    const commissionBreakdown = dealService.getCommissionBreakdown(deal);
    const sellerAmount = deal.amount - commissionBreakdown.sellerPays;
    const serviceAmount = deal.commission;

    // Get seller address
    const fullDeal = await Deal.findOne({ dealId }).select('+sellerKey +sellerAddress');
    let sellerAddress = fullDeal.sellerAddress;
    if (!sellerAddress && fullDeal.sellerKey) {
      sellerAddress = blockchainService.privateKeyToAddress(fullDeal.sellerKey);
    }

    if (!sellerAddress) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Адрес продавца не найден.', keyboard);
      return;
    }

    // Get multisig wallet
    const wallet = await MultisigWallet.findOne({ dealId: deal._id }).select('+privateKey');
    if (!wallet || !wallet.privateKey) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Ключ кошелька не найден.', keyboard);
      return;
    }

    try {
      console.log(`💸 Creating payout for deal ${dealId}: ${sellerAmount} ${deal.asset} to seller`);

      // Create and send transaction to seller
      const sellerTx = await blockchainService.createReleaseTransaction(
        deal.multisigAddress,
        sellerAddress,
        sellerAmount,
        deal.asset
      );

      const signedSellerTx = await blockchainService.signTransaction(sellerTx, wallet.privateKey);
      const sellerResult = await blockchainService.broadcastTransaction(signedSellerTx);

      if (!sellerResult.success) {
        throw new Error(`Не удалось отправить средства продавцу: ${sellerResult.message}`);
      }

      // Log transaction
      const sellerTransaction = new Transaction({
        dealId: deal._id,
        type: 'release',
        asset: deal.asset,
        amount: sellerAmount,
        txHash: sellerResult.txHash,
        signedBy: ['arbiter'],
        status: 'confirmed',
        toAddress: sellerAddress
      });
      sellerTransaction.generateExplorerLink();
      await sellerTransaction.save();

      // Send commission to service wallet
      if (serviceAmount > 0) {
        const serviceTx = await blockchainService.createReleaseTransaction(
          deal.multisigAddress,
          process.env.SERVICE_WALLET_ADDRESS,
          serviceAmount,
          deal.asset
        );

        const signedServiceTx = await blockchainService.signTransaction(serviceTx, wallet.privateKey);
        const serviceResult = await blockchainService.broadcastTransaction(signedServiceTx);

        if (serviceResult.success) {
          const serviceTransaction = new Transaction({
            dealId: deal._id,
            type: 'fee',
            asset: deal.asset,
            amount: serviceAmount,
            txHash: serviceResult.txHash,
            signedBy: ['arbiter'],
            status: 'confirmed',
            toAddress: process.env.SERVICE_WALLET_ADDRESS
          });
          serviceTransaction.generateExplorerLink();
          await serviceTransaction.save();
        }
      }

      // Update deal status
      await dealService.updateDealStatus(dealId, 'completed', telegramId);

      // Notify buyer (final screen)
      const buyerText = `✅ *Сделка завершена!*

Сделка: \`${dealId}\`
📦 ${deal.productName}

💸 Продавцу отправлено: ${sellerAmount} ${deal.asset}
💰 Комиссия: ${serviceAmount} ${deal.asset}

[Транзакция](https://tronscan.org/#/transaction/${sellerResult.txHash})

Спасибо за использование KeyShield!`;

      const buyerKeyboard = finalScreenKeyboard();
      await messageManager.showFinalScreen(ctx, telegramId, 'deal_completed', buyerText, buyerKeyboard);

      // Notify seller (final screen)
      const sellerText = `🎉 *Оплата получена!*

Сделка: \`${dealId}\`
📦 ${deal.productName}

💰 Вам отправлено: ${sellerAmount} ${deal.asset}

[Проверить транзакцию](https://tronscan.org/#/transaction/${sellerResult.txHash})

Средства поступят в течение нескольких минут.

Спасибо за использование KeyShield!`;

      const sellerKeyboard = finalScreenKeyboard();
      await messageManager.showFinalScreen(ctx, deal.sellerId, 'deal_completed', sellerText, sellerKeyboard);

      console.log(`✅ Deal ${dealId} completed successfully`);

    } catch (error) {
      console.error(`Error processing payout for deal ${dealId}:`, error);

      const errorText = `❌ *Ошибка при выплате*

${error.message}

Обратитесь в поддержку.`;

      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', errorText, keyboard);
    }

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
