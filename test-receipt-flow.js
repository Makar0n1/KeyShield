/**
 * Test script for email receipt flow
 * Creates a fake completed deal and triggers receipt question for both parties
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');

const connectDB = require('./src/config/database');
const Deal = require('./src/models/Deal');
const User = require('./src/models/User');
const { showReceiptQuestion, sendReceiptNotification } = require('./src/bot/handlers/receiptEmail');

// Test users
const SELLER = {
  telegramId: 349177382,
  username: 'mamlyga'
};

const BUYER = {
  telegramId: 8092715080,
  username: 'mike7330'
};

const bot = new Telegraf(process.env.BOT_TOKEN);

async function createTestDeal() {
  // Create fake deal
  const dealId = `DL-TEST-${Date.now()}`;

  const deal = new Deal({
    dealId,
    uniqueKey: Deal.generateUniqueKey(BUYER.telegramId, SELLER.telegramId, 'test'),
    creatorRole: 'seller',
    sellerId: SELLER.telegramId,
    buyerId: BUYER.telegramId,
    productName: 'Тестовый товар для проверки чеков',
    description: 'Тестовое описание для проверки email чеков',
    amount: 100,
    asset: 'USDT',
    commission: 15,
    commissionType: 'buyer',
    deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: 'completed',
    sellerAddress: 'TTestSellerAddress123456789',
    buyerAddress: 'TTestBuyerAddress123456789',
    multisigAddress: 'TTestMultisigAddress123456789',
    completedAt: new Date()
  });

  await deal.save();
  console.log(`✅ Created test deal: ${dealId}`);

  return deal;
}

async function testReceiptFlow() {
  try {
    await connectDB();
    console.log('📦 Connected to MongoDB\n');

    // Ensure users exist
    await User.findOneAndUpdate(
      { telegramId: SELLER.telegramId },
      { $setOnInsert: { username: SELLER.username } },
      { upsert: true }
    );

    await User.findOneAndUpdate(
      { telegramId: BUYER.telegramId },
      { $setOnInsert: { username: BUYER.username } },
      { upsert: true }
    );

    // Check saved emails
    const seller = await User.findOne({ telegramId: SELLER.telegramId });
    const buyer = await User.findOne({ telegramId: BUYER.telegramId });

    console.log(`👤 Seller @${SELLER.username}: email = ${seller?.email || 'NOT SET'}`);
    console.log(`👤 Buyer @${BUYER.username}: email = ${buyer?.email || 'NOT SET'}\n`);

    // Create test deal
    const deal = await createTestDeal();

    // Fake transaction data
    const releaseAmount = deal.amount - deal.commission;
    const txHash = 'fake_tx_hash_' + Date.now();

    // Seller's transaction data (release)
    const sellerTransactionData = {
      type: 'release',
      amount: releaseAmount,
      txHash,
      toAddress: deal.sellerAddress
    };

    // Buyer's transaction data (purchase)
    const buyerTransactionData = {
      type: 'purchase',
      amount: deal.amount,
      txHash,
      toAddress: deal.sellerAddress
    };

    // Final messages
    const sellerText = `✅ *Средства получены!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

💸 Получено: *${releaseAmount.toFixed(2)} ${deal.asset}*
📊 Комиссия сервиса: ${deal.commission.toFixed(2)} ${deal.asset}

[Транзакция](https://tronscan.org/#/transaction/${txHash})`;

    const buyerText = `✅ *Сделка завершена!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

💸 Сумма покупки: *${deal.amount.toFixed(2)} ${deal.asset}*
📊 Комиссия сервиса: ${deal.commission.toFixed(2)} ${deal.asset}

Продавец подтвердил получение средств.
Сделка успешно завершена!

[Транзакция](https://tronscan.org/#/transaction/${txHash})`;

    // Create fake ctx for bot operations
    const createFakeCtx = (telegramId) => ({
      telegram: bot.telegram,
      from: { id: telegramId },
      chat: { id: telegramId },
      answerCbQuery: async () => {},
      reply: async (text, opts) => {
        console.log(`📤 Sending to ${telegramId}:`, text.substring(0, 50) + '...');
        return bot.telegram.sendMessage(telegramId, text, opts);
      }
    });

    console.log('\n🚀 Triggering receipt flow...\n');

    // Send to seller (has saved email)
    console.log(`📧 Sending receipt question to SELLER @${SELLER.username}...`);
    await showReceiptQuestion(
      createFakeCtx(SELLER.telegramId),
      SELLER.telegramId,
      deal,
      sellerTransactionData,
      sellerText
    );

    // Small delay
    await new Promise(r => setTimeout(r, 1000));

    // Send to buyer (no saved email)
    console.log(`📧 Sending receipt question to BUYER @${BUYER.username}...`);
    await sendReceiptNotification(
      createFakeCtx(BUYER.telegramId),
      BUYER.telegramId,
      deal,
      buyerTransactionData,
      buyerText
    );

    console.log('\n✅ Done! Check both Telegram accounts.');
    console.log(`   - @${SELLER.username} should see: "Send to saved email?"`);
    console.log(`   - @${BUYER.username} should see: "Send receipt to email? Yes/No"`);

    // Cleanup - delete test deal after 5 minutes
    setTimeout(async () => {
      await Deal.deleteOne({ dealId: deal.dealId });
      console.log(`🗑️ Cleaned up test deal: ${deal.dealId}`);
      process.exit(0);
    }, 5 * 60 * 1000);

    console.log('\n⏰ Test deal will be auto-deleted in 5 minutes. Press Ctrl+C to exit early.');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testReceiptFlow();
