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
const feesaverService = require('../../services/feesaver');
const { createKeyValidationSession } = require('./keyValidation');
const Deal = require('../../models/Deal');

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
// MY DEALS LIST WITH PAGINATION
// ============================================

const DEALS_PER_PAGE = 3;

const showMyDeals = async (ctx, page) => {
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

    // Calculate pagination
    const totalPages = Math.ceil(deals.length / DEALS_PER_PAGE);
    const currentPage = Math.max(1, Math.min(parseInt(page) || 1, totalPages));
    const startIndex = (currentPage - 1) * DEALS_PER_PAGE;
    const endIndex = startIndex + DEALS_PER_PAGE;
    const dealsOnPage = deals.slice(startIndex, endIndex);

    // Format deals list
    let text = `📋 *Мои сделки* (${deals.length})\n\n`;

    for (const deal of dealsOnPage) {
      const role = deal.getUserRole(telegramId);
      const statusIcon = getStatusIcon(deal.status);
      const statusText = getStatusText(deal.status);

      text += `${statusIcon} \`${deal.dealId}\`\n`;
      text += `📦 ${deal.productName}\n`;
      text += `👤 ${role === 'buyer' ? 'Покупатель' : 'Продавец'}\n`;
      text += `💰 ${deal.amount} ${deal.asset}\n`;
      text += `📊 ${statusText}\n\n`;
    }

    // Add pagination info
    if (totalPages > 1) {
      text += `━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `📄 Страница ${currentPage} из ${totalPages}`;
    }

    const keyboard = myDealsKeyboard(dealsOnPage, currentPage, totalPages);
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
      await messageManager.updateScreen(ctx, telegramId, 'deal_not_found', text, keyboard);
      return;
    }

    if (!deal.isParticipant(telegramId)) {
      const text = '❌ *Доступ запрещён*\n\nВы не являетесь участником этой сделки.';
      const keyboard = mainMenuButton();
      await messageManager.updateScreen(ctx, telegramId, 'deal_access_denied', text, keyboard);
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

    // Show hint when waiting for wallet
    if (role === 'seller' && deal.status === 'waiting_for_seller_wallet') {
      text += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `⚠️ *Требуется ваш кошелёк!*\n`;
      text += `Нажмите кнопку ниже, чтобы указать адрес TRON-кошелька для получения оплаты.`;
    }

    if (role === 'buyer' && deal.status === 'waiting_for_buyer_wallet') {
      text += `\n━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `⚠️ *Требуется ваш кошелёк!*\n`;
      text += `Нажмите кнопку ниже, чтобы указать адрес TRON-кошелька для возврата средств.`;
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
// Now requests seller's private key instead of direct payout
// ============================================

const acceptWork = async (ctx) => {
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
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Только покупатель может принять работу.', keyboard);
      return;
    }

    if (deal.status !== 'in_progress') {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', `❌ Невозможно принять работу в статусе: ${getStatusText(deal.status)}`, keyboard);
      return;
    }

    // Check seller address
    if (!deal.sellerAddress) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Адрес продавца не найден.', keyboard);
      return;
    }

    // Update deal status to mark pending key validation
    await Deal.findByIdAndUpdate(deal._id, {
      pendingKeyValidation: 'seller_payout'
    });

    // Create key validation session for seller
    await createKeyValidationSession(deal.sellerId, dealId, 'seller_payout', {
      buyerId: telegramId
    });

    console.log(`🔐 Key validation requested for deal ${dealId}: seller must input private key`);

    // Notify buyer - waiting for seller confirmation
    const buyerText = `✅ *Работа принята!*

🆔 Сделка: \`${dealId}\`
📦 ${deal.productName}

⏳ *Ожидаем подтверждение от продавца*

Продавец должен ввести свой приватный ключ для получения средств.
Вы получите уведомление, когда сделка будет завершена.`;

    const buyerKeyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'waiting_seller_key', buyerText, buyerKeyboard);

    // Notify seller - request private key
    const sellerText = `🎉 *Покупатель принял работу!*

🆔 Сделка: \`${dealId}\`
📦 ${deal.productName}

💰 *Для получения средств введите ваш приватный ключ:*

⚠️ Это ключ, который был выдан вам при указании кошелька.

❗️ Без ввода ключа средства НЕ будут переведены!`;

    const sellerKeyboard = mainMenuButton();
    await messageManager.showNotification(ctx, deal.sellerId, sellerText, sellerKeyboard);

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
