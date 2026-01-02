/**
 * Test Rating Flow Script
 *
 * Creates a fake "completed" deal state and triggers the rating flow
 * to test the rating system without real blockchain transactions.
 *
 * Usage: node scripts/test-rating-flow.js <buyerTelegramId> <sellerTelegramId>
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');

const Deal = require('../src/models/Deal');
const User = require('../src/models/User');
const { showReceiptQuestion, sendReceiptNotification } = require('../src/bot/handlers/receiptEmail');

const bot = new Telegraf(process.env.BOT_TOKEN);

async function testRatingFlow() {
  const buyerId = parseInt(process.argv[2]);
  const sellerId = parseInt(process.argv[3]);

  if (!buyerId || !sellerId) {
    console.log('Usage: node scripts/test-rating-flow.js <buyerTelegramId> <sellerTelegramId>');
    console.log('Example: node scripts/test-rating-flow.js 123456789 987654321');
    process.exit(1);
  }

  console.log(`🧪 Testing rating flow between buyer ${buyerId} and seller ${sellerId}`);

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get users
    const buyer = await User.findOne({ telegramId: buyerId });
    const seller = await User.findOne({ telegramId: sellerId });

    if (!buyer) {
      console.error(`❌ Buyer ${buyerId} not found`);
      process.exit(1);
    }
    if (!seller) {
      console.error(`❌ Seller ${sellerId} not found`);
      process.exit(1);
    }

    console.log(`👤 Buyer: @${buyer.username || buyer.firstName}`);
    console.log(`👤 Seller: @${seller.username || seller.firstName}`);

    // Create a fake completed deal
    const dealId = `TEST-${Date.now().toString(36).toUpperCase()}`;
    const deal = await Deal.create({
      dealId,
      creatorRole: 'buyer',
      buyerId,
      sellerId,
      productName: 'Тестовый товар для проверки рейтинга',
      description: 'Это тестовая сделка для проверки системы рейтингов',
      asset: 'USDT',
      amount: 100,
      commission: 15,
      commissionType: 'buyer',
      status: 'completed',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      uniqueKey: `test-${Date.now()}`,
      multisigAddress: 'TTestAddress123456789',
      buyerAddress: 'TBuyerAddress123456789',
      sellerAddress: 'TSellerAddress123456789',
      completedAt: new Date()
    });

    console.log(`✅ Created test deal: ${dealId}`);

    // Fake transaction data
    const transactionData = {
      type: 'release',
      amount: 85, // amount - commission for seller
      txHash: 'test_tx_' + Date.now(),
      toAddress: 'TSellerAddress123456789'
    };

    // Final messages
    const sellerFinalMessage = `✅ *Средства получены!*

🆔 Сделка: \`${dealId}\`
📦 ${deal.productName}

💸 Получено: *85.00 USDT*
📊 Комиссия сервиса: 15.00 USDT

[Транзакция](https://tronscan.org/#/transaction/${transactionData.txHash})`;

    const buyerFinalMessage = `✅ *Сделка завершена!*

🆔 Сделка: \`${dealId}\`
📦 ${deal.productName}

💸 Сумма покупки: *100.00 USDT*
📊 Комиссия сервиса: 15.00 USDT

Продавец подтвердил получение средств.
Сделка успешно завершена!

[Транзакция](https://tronscan.org/#/transaction/${transactionData.txHash})`;

    // Rating data
    const sellerRatingData = {
      counterpartyId: buyerId,
      counterpartyRole: 'buyer',
      counterpartyUsername: buyer.username || 'Unknown'
    };

    const buyerRatingData = {
      counterpartyId: sellerId,
      counterpartyRole: 'seller',
      counterpartyUsername: seller.username || 'Unknown'
    };

    // Create fake context for seller
    const sellerCtx = {
      from: { id: sellerId },
      telegram: bot.telegram,
      answerCbQuery: async () => {}
    };

    // Create fake context for buyer
    const buyerCtx = {
      from: { id: buyerId },
      telegram: bot.telegram,
      answerCbQuery: async () => {}
    };

    console.log('\n📤 Sending receipt question to SELLER (who will rate buyer)...');
    await showReceiptQuestion(sellerCtx, sellerId, deal, transactionData, sellerFinalMessage, sellerRatingData);

    console.log('📤 Sending receipt notification to BUYER (who will rate seller)...');
    await sendReceiptNotification(buyerCtx, buyerId, deal, {
      type: 'purchase',
      amount: 100,
      txHash: transactionData.txHash,
      toAddress: deal.sellerAddress
    }, buyerFinalMessage, buyerRatingData);

    console.log('\n✅ Test rating flow triggered successfully!');
    console.log('📱 Check your Telegram bots for the receipt/rating prompts.');
    console.log(`\n🗑️  To clean up, delete test deal: db.deals.deleteOne({ dealId: "${dealId}" })`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

testRatingFlow();
