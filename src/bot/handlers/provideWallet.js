const Deal = require('../../models/Deal');
const blockchainService = require('../../services/blockchain');
const dealService = require('../../services/dealService');
const { depositConfirmationKeyboard } = require('../keyboards/main');
const messageManager = require('../utils/messageManager');

/**
 * Handle seller providing wallet address
 */
const handleSellerWalletInput = async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const text = ctx.message.text.trim();

    // Find deal waiting for this seller's wallet
    const deal = await Deal.findOne({
      sellerId: telegramId,
      status: 'waiting_for_seller_wallet'
    });

    if (!deal) {
      // Not waiting for wallet, ignore
      return;
    }

    // Validate TRON address
    if (!blockchainService.isValidAddress(text)) {
      return ctx.reply(
        '❌ Неверный адрес кошелька!\n\n' +
        'Адрес должен начинаться с T и содержать 34 символа.\n' +
        'Пример: TQRfXYMDSspFQBXPf9MevZpkYgUXkviCSj\n\n' +
        'Попробуйте ещё раз.'
      );
    }

    // Update deal with seller address
    deal.sellerAddress = text;
    deal.status = 'waiting_for_deposit';
    await deal.save();

    console.log(`✅ Seller wallet set for deal ${deal.dealId}: ${text}`);

    // Calculate deposit amount for buyer notification
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

    // Notify seller - wallet saved
    await ctx.reply(
      `✅ *Кошелек сохранен!*\n\n` +
      `Адрес: \`${text}\`\n\n` +
      `Ожидаем депозит от заказчика.\n` +
      `Вы получите уведомление, когда средства поступят на escrow-кошелек.`,
      { parse_mode: 'Markdown' }
    );

    // Send WARNING message to buyer first
    await ctx.telegram.sendMessage(
      deal.buyerId,
      `⚠️ *ВНИМАНИЕ! Прочитайте перед переводом*\n\n` +
      `🆔 Сделка: \`${deal.dealId}\`\n` +
      `📦 ${deal.productName}\n` +
      `💸 К оплате: *${depositAmount} ${deal.asset}*${depositNote}\n\n` +
      `❗️ *ВАЖНЫЕ УСЛОВИЯ:*\n\n` +
      `1️⃣ *Депозит необратим*\n` +
      `После перевода средства будут заморожены в multisig-кошельке.\n\n` +
      `2️⃣ *Возврат только через арбитраж*\n` +
      `Если продавец не выполнит работу - открывайте спор. Арбитр примет решение.\n\n` +
      `3️⃣ *Комиссия не возвращается*\n` +
      `Комиссия сервиса (${deal.commission} ${deal.asset}) остаётся у сервиса даже при возврате.\n\n` +
      `4️⃣ *Точная сумма*\n` +
      `Переведите ТОЧНО ${depositAmount} ${deal.asset}. Допуск: -2 ${deal.asset}.\n\n` +
      `5️⃣ *Срок 24 часа*\n` +
      `Если не внесёте депозит в течение 24 часов, сделка будет отменена.\n\n` +
      `✅ *Если вы понимаете и согласны с условиями, нажмите кнопку ниже.*`,
      {
        parse_mode: 'Markdown',
        ...depositConfirmationKeyboard()
      }
    );

  } catch (error) {
    console.error('Error handling seller wallet input:', error);
    ctx.reply('❌ Произошла ошибка. Попробуйте ещё раз.');
  }
};

/**
 * Handle buyer providing wallet address (when seller creates deal)
 */
const handleBuyerWalletInput = async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const text = ctx.message.text.trim();

    // Find deal waiting for this buyer's wallet
    const deal = await Deal.findOne({
      buyerId: telegramId,
      status: 'waiting_for_buyer_wallet'
    });

    if (!deal) {
      // Not waiting for wallet, ignore
      return;
    }

    // Validate TRON address
    if (!blockchainService.isValidAddress(text)) {
      return ctx.reply(
        '❌ Неверный адрес кошелька!\n\n' +
        'Адрес должен начинаться с T и содержать 34 символа.\n' +
        'Пример: TQRfXYMDSspFQBXPf9MevZpkYgUXkviCSj\n\n' +
        'Попробуйте ещё раз.'
      );
    }

    // Update deal with buyer address
    deal.buyerAddress = text;
    deal.status = 'waiting_for_deposit';
    await deal.save();

    console.log(`✅ Buyer wallet set for deal ${deal.dealId}: ${text}`);

    // Calculate deposit amount
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

    // Notify buyer - wallet saved, now deposit
    await ctx.reply(
      `✅ *Кошелек сохранен!*\n\n` +
      `Адрес: \`${text}\`\n\n` +
      `🔐 *Адрес для депозита (${deal.asset}):*\n\`${deal.multisigAddress}\`\n\n` +
      `💸 *К оплате: ${depositAmount} ${deal.asset}*${depositNote}\n\n` +
      `⚠️ *ВАЖНО:* Переведите ТОЧНО ${depositAmount} ${deal.asset} в течение 24 часов.\n` +
      `⚠️ Допускается отклонение до -2 ${deal.asset}.\n` +
      `⚠️ Если отправите больше - разница пойдет на баланс сервиса.\n\n` +
      `После подтверждения депозита работа официально начнётся.\n\n` +
      `[Проверить в TronScan](https://tronscan.org/#/address/${deal.multisigAddress})`,
      { parse_mode: 'Markdown' }
    );

    // Notify seller - ready for buyer deposit
    await ctx.telegram.sendMessage(
      deal.sellerId,
      `✅ *Покупатель указал кошелек!*\n\n` +
      `🆔 Сделка: \`${deal.dealId}\`\n` +
      `📦 ${deal.productName}\n\n` +
      `Ожидаем депозит от покупателя.\n` +
      `Вы получите уведомление, когда средства поступят на escrow-кошелек.`,
      { parse_mode: 'Markdown' }
    );

  } catch (error) {
    console.error('Error handling buyer wallet input:', error);
    ctx.reply('❌ Произошла ошибка. Попробуйте ещё раз.');
  }
};

/**
 * Handle deposit warning confirmation
 */
const handleDepositWarningConfirmation = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    // Find deal waiting for deposit
    const deal = await Deal.findOne({
      buyerId: telegramId,
      status: 'waiting_for_deposit'
    });

    if (!deal) {
      return ctx.editMessageText(
        '❌ Сделка не найдена или уже завершена.',
        { parse_mode: 'Markdown' }
      );
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

    // Send deposit instructions
    await ctx.editMessageText(
      `✅ *Готово! Теперь внесите депозит*\n\n` +
      `🆔 Сделка: \`${deal.dealId}\`\n` +
      `📦 ${deal.productName}\n\n` +
      `🔐 *Адрес для депозита (${deal.asset}):*\n\`${deal.multisigAddress}\`\n\n` +
      `💸 *К оплате: ${depositAmount} ${deal.asset}*${depositNote}\n\n` +
      `⏱ Система автоматически обнаружит депозит в течение 1-3 минут.\n\n` +
      `[🔍 Проверить в TronScan](https://tronscan.org/#/address/${deal.multisigAddress})`,
      { parse_mode: 'Markdown' }
    );

    // Pin active deal message
    const pinnedText = `📌 *АКТИВНАЯ СДЕЛКА*\n\n` +
      `🆔 ${deal.dealId}\n` +
      `📦 ${deal.productName}\n` +
      `💰 ${deal.amount} ${deal.asset}\n` +
      `📊 Статус: Ожидание депозита\n\n` +
      `Адрес: \`${deal.multisigAddress}\``;

    await messageManager.pinDealMessage(ctx, telegramId, pinnedText);

  } catch (error) {
    console.error('Error handling deposit warning confirmation:', error);
    ctx.reply('❌ Произошла ошибка. Попробуйте ещё раз.');
  }
};

module.exports = {
  handleSellerWalletInput,
  handleBuyerWalletInput,
  handleDepositWarningConfirmation
};
