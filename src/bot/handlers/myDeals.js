const dealService = require('../../services/dealService');
const { dealActionKeyboard, backToMainMenu } = require('../keyboards/main');
const messageManager = require('../utils/messageManager');

/**
 * Show user's deals
 */
const showMyDeals = async (ctx) => {
  try {
    // Check if this is a callback query (inline button) or text message (custom keyboard)
    const isCallbackQuery = !!ctx.callbackQuery;

    if (isCallbackQuery) {
      await ctx.answerCbQuery();
    }

    const telegramId = ctx.from.id;

    // Delete command if already on my_deals screen
    if (!isCallbackQuery) {
      await messageManager.deleteCommandIfOnScreen(ctx, 'my_deals');
    }

    // Track navigation
    messageManager.navigateTo(telegramId, 'my_deals');

    const deals = await dealService.getUserDeals(telegramId);

    if (deals.length === 0) {
      const message = '📋 *Мои сделки*\n\n' +
        'У вас пока нет сделок.\n\n' +
        'Создайте новую сделку через главное меню!';

      return messageManager.sendOrEdit(ctx, telegramId, message, backToMainMenu());
    }

    // Format deals list
    let text = '📋 *Мои сделки*\n\n';

    for (const deal of deals.slice(0, 10)) {
      const role = deal.getUserRole(telegramId);
      const statusEmoji = {
        'waiting_for_deposit': '⏳',
        'locked': '🔒',
        'in_progress': '⚙️',
        'completed': '✅',
        'dispute': '⚠️',
        'resolved': '✅',
        'cancelled': '❌'
      }[deal.status] || '📦';

      const statusText = {
        'waiting_for_deposit': 'Ожидание депозита',
        'locked': 'Средства заморожены',
        'in_progress': 'В работе',
        'completed': 'Завершена',
        'dispute': 'Спор',
        'resolved': 'Решена',
        'cancelled': 'Отменена'
      }[deal.status] || deal.status;

      text += `${statusEmoji} \`${deal.dealId}\` — ${deal.productName}\n`;
      text += `   Роль: ${role === 'buyer' ? 'Покупатель' : 'Продавец'}\n`;
      text += `   Статус: ${statusText}\n`;
      text += `   Сумма: ${deal.amount} ${deal.asset}\n\n`;
    }

    text += '\nОтправьте ID сделки (например, `DL-123456`) для подробностей.';

    await messageManager.sendOrEdit(ctx, telegramId, text, backToMainMenu());
  } catch (error) {
    console.error('Error showing deals:', error);
    ctx.reply('❌ Произошла ошибка при загрузке сделок.');
  }
};

/**
 * Show specific deal details
 */
const showDealDetails = async (ctx, dealId) => {
  try {
    const telegramId = ctx.from.id;
    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      return ctx.reply('❌ Сделка не найдена.');
    }

    if (!deal.isParticipant(telegramId)) {
      return ctx.reply('❌ Вы не являетесь участником этой сделки.');
    }

    // Track navigation
    messageManager.navigateTo(telegramId, `deal_${dealId}`);

    const role = deal.getUserRole(telegramId);
    const commission = dealService.getCommissionBreakdown(deal);

    let text = `📦 *Сделка ${deal.dealId}*\n\n`;
    text += `*Название:* ${deal.productName}\n`;
    text += `*Описание:* ${deal.description}\n\n`;
    text += `*Ваша роль:* ${role === 'buyer' ? 'Покупатель 💵' : 'Продавец 🛠'}\n`;
    text += `*Вторая сторона:* ${role === 'buyer' ? 'Продавец' : 'Покупатель'} (ID: ${role === 'buyer' ? deal.sellerId : deal.buyerId})\n\n`;
    text += `*Сумма:* ${deal.amount} ${deal.asset}\n`;
    text += `*Комиссия:* ${deal.commission} ${deal.asset}\n`;

    if (role === 'buyer') {
      text += `*Вы платите комиссию:* ${commission.buyerPays} ${deal.asset}\n`;
    } else {
      text += `*Вы платите комиссию:* ${commission.sellerPays} ${deal.asset}\n`;
    }

    text += `\n*Статус:* ${getStatusText(deal.status)}\n`;
    text += `*Срок:* ${deal.deadline.toLocaleString('ru-RU')}\n\n`;

    if (deal.status === 'waiting_for_deposit') {
      text += `🔐 *Адрес депозита:*\n\`${deal.multisigAddress}\`\n\n`;
      text += `[Проверить на TronScan](https://tronscan.org/#/address/${deal.multisigAddress})`;
    }

    if (deal.depositTxHash) {
      text += `\n✅ Депозит: [${deal.depositTxHash.substring(0, 10)}...](https://tronscan.org/#/transaction/${deal.depositTxHash})`;
    }

    await messageManager.sendOrEdit(
      ctx,
      telegramId,
      text,
      dealActionKeyboard(deal.dealId, role, deal.status)
    );
  } catch (error) {
    console.error('Error showing deal details:', error);
    ctx.reply('❌ Произошла ошибка.');
  }
};

/**
 * Submit work (seller action)
 */
const submitWork = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const deal = await dealService.submitWork(dealId, telegramId);

    await messageManager.sendOrEdit(
      ctx,
      telegramId,
      `✅ *Работа отмечена как выполненная*\n\n` +
      `Покупатель получил уведомление и может принять работу или открыть спор.`,
      backToMainMenu()
    );

    // Notify buyer (use main message with inline button to view deal)
    const { Markup } = require('telegraf');
    await messageManager.sendOrEdit(
      ctx,
      deal.buyerId,
      `📬 *Сделка ${deal.dealId}*\n\n` +
      `Продавец отметил работу как выполненную.\n\n` +
      `Пожалуйста, проверьте результат и примите работу или откройте спор, если есть проблемы.`,
      Markup.inlineKeyboard([
        [Markup.button.callback(`📦 Просмотр сделки ${deal.dealId}`, `view_deal:${deal.dealId}`)],
        [Markup.button.callback('🏠 Главное меню', 'main_menu')]
      ])
    );
  } catch (error) {
    console.error('Error submitting work:', error);
    await ctx.answerCbQuery('❌ Ошибка');
    ctx.reply(`❌ ${error.message}`);
  }
};

/**
 * Accept work (buyer action)
 * This triggers automatic payout to seller with commission deduction
 */
const acceptWork = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    await ctx.editMessageText(
      `✅ *Принятие работы*\n\n` +
      `Создаём транзакцию для перевода средств продавцу...\n\n` +
      `⏳ Подождите...`,
      { parse_mode: 'Markdown' }
    );

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      return ctx.reply('❌ Сделка не найдена.');
    }

    if (deal.buyerId !== telegramId) {
      return ctx.reply('❌ Только покупатель может принять работу.');
    }

    if (deal.status !== 'in_progress') {
      return ctx.reply(`❌ Невозможно принять работу в статусе: ${deal.status}`);
    }

    // Import blockchain service and transaction model
    const blockchainService = require('../../services/blockchain');
    const Transaction = require('../../models/Transaction');

    // Calculate amounts
    const commissionBreakdown = dealService.getCommissionBreakdown(deal);
    const sellerAmount = deal.amount - commissionBreakdown.sellerPays;
    const serviceAmount = deal.commission;

    // Get seller address from deal
    const Deal = require('../../models/Deal');
    const fullDeal = await Deal.findOne({ dealId }).select('+sellerKey +sellerAddress');

    // Use stored address if available, otherwise derive from private key
    let sellerAddress = fullDeal.sellerAddress;
    if (!sellerAddress && fullDeal.sellerKey) {
      sellerAddress = blockchainService.privateKeyToAddress(fullDeal.sellerKey);
    }

    if (!sellerAddress) {
      throw new Error('Seller address not found. Seller must provide their USDT wallet address.');
    }

    console.log(`💰 Seller address for payout: ${sellerAddress}`);

    // Get multisig wallet private key
    const MultisigWallet = require('../../models/MultisigWallet');
    const wallet = await MultisigWallet.findOne({ dealId: deal._id }).select('+privateKey');

    if (!wallet || !wallet.privateKey) {
      throw new Error('Multisig wallet private key not found');
    }

    console.log(`🔑 Using multisig wallet key for address: ${wallet.address}`);

    try {
      // Create transaction to seller
      console.log(`💸 Creating payout for deal ${dealId}: ${sellerAmount} ${deal.asset} to seller`);

      const sellerTx = await blockchainService.createReleaseTransaction(
        deal.multisigAddress,
        sellerAddress,
        sellerAmount,
        deal.asset
      );

      // Sign with multisig wallet private key
      const signedSellerTx = await blockchainService.signTransaction(sellerTx, wallet.privateKey);

      // Broadcast transaction
      const sellerResult = await blockchainService.broadcastTransaction(signedSellerTx);

      if (!sellerResult.success) {
        throw new Error(`Failed to send to seller: ${sellerResult.message}`);
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

      // Create transaction to service wallet for commission
      if (serviceAmount > 0) {
        console.log(`💰 Sending commission: ${serviceAmount} ${deal.asset} to service wallet`);

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

      // Notify buyer
      await ctx.telegram.sendMessage(
        telegramId,
        `✅ *Работа принята!*\n\n` +
        `Сделка ${dealId} завершена.\n\n` +
        `💸 Продавцу отправлено: ${sellerAmount} ${deal.asset}\n` +
        `💰 Комиссия сервиса: ${serviceAmount} ${deal.asset}\n\n` +
        `[Транзакция продавцу](https://tronscan.org/#/transaction/${sellerResult.txHash})`,
        { parse_mode: 'Markdown' }
      );

      // Notify seller
      await ctx.telegram.sendMessage(
        deal.sellerId,
        `🎉 *Работа принята!*\n\n` +
        `Сделка ${dealId} завершена успешно!\n\n` +
        `💰 Вам отправлено: ${sellerAmount} ${deal.asset}\n` +
        `🎯 Комиссия удержана: ${commissionBreakdown.sellerPays} ${deal.asset}\n\n` +
        `[Проверить транзакцию](https://tronscan.org/#/transaction/${sellerResult.txHash})`,
        { parse_mode: 'Markdown' }
      );

      console.log(`✅ Deal ${dealId} completed successfully`);

    } catch (error) {
      console.error(`Error processing payout for deal ${dealId}:`, error);

      await ctx.telegram.sendMessage(
        telegramId,
        `❌ *Ошибка при выплате*\n\n` +
        `${error.message}\n\n` +
        `Обратитесь к администратору.`,
        { parse_mode: 'Markdown' }
      );
    }

  } catch (error) {
    console.error('Error accepting work:', error);
    ctx.reply(`❌ Произошла ошибка: ${error.message}`);
  }
};

/**
 * Helper: Get status text in Russian
 */
function getStatusText(status) {
  const statusMap = {
    'created': 'Создана',
    'waiting_for_deposit': '⏳ Ожидание депозита',
    'locked': '🔒 Средства заморожены',
    'in_progress': '⚙️ В работе',
    'completed': '✅ Завершена',
    'dispute': '⚠️ Спор',
    'resolved': '✅ Решена',
    'cancelled': '❌ Отменена'
  };

  return statusMap[status] || status;
}

module.exports = {
  showMyDeals,
  showDealDetails,
  submitWork,
  acceptWork
};
