/**
 * Reset All Users to Main Menu
 *
 * This script:
 * 1. Finds all users with mainMessageId
 * 2. Tries to delete messages around the mainMessageId (±50 messages)
 * 3. Sends fresh main menu message
 * 4. Updates DB with new state
 *
 * Run: node scripts/reset-all-users-to-main-menu.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// Import User model after mongoose is set up
const User = require('../src/models/User');

// Main menu text
const MAIN_MENU_TEXT = `🛡 *KeyShield — Безопасные сделки*

Защищённый escrow-сервис для сделок между покупателями и продавцами.

🔐 *Мультисиг-кошельки*
Средства хранятся на защищённом кошельке с мультиподписью 2-из-3.

⚡️ *Автоматический контроль*
Система автоматически отслеживает депозиты в блокчейне TRON.

⚖️ *Арбитраж споров*
При конфликте — нейтральный арбитр рассмотрит доказательства.

💰 *Комиссия:* от 15 USDT или 5%
📊 *Минимум:* 50 USDT
💵 *Актив:* USDT (TRC-20)

Выберите действие:`;

// Main menu keyboard
const mainMenuKeyboard = {
  inline_keyboard: [
    [{ text: '📝 Создать сделку', callback_data: 'create_deal' }],
    [{ text: '📋 Мои сделки', callback_data: 'my_deals' }],
    [{ text: 'ℹ️ Помощь', callback_data: 'help' }]
  ]
};

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Delete messages in range around mainMessageId
async function deleteMessagesAroundId(bot, chatId, centerMessageId, range = 50) {
  let deleted = 0;

  // Delete messages from (centerMessageId - range) to (centerMessageId + range)
  for (let i = centerMessageId - range; i <= centerMessageId + range; i++) {
    if (i <= 0) continue;

    try {
      await bot.telegram.deleteMessage(chatId, i);
      deleted++;
    } catch (e) {
      // Message doesn't exist or already deleted - ignore
    }
  }

  return deleted;
}

// Process single user
async function processUser(bot, user, stats) {
  const userId = user.telegramId;

  try {
    // Step 1: Delete messages around mainMessageId
    if (user.mainMessageId) {
      const deleted = await deleteMessagesAroundId(bot, userId, user.mainMessageId, 50);
      if (deleted > 0) {
        console.log(`  🗑 User ${userId}: deleted ${deleted} messages`);
      }
    }

    // Small delay to avoid rate limits
    await sleep(50);

    // Step 2: Send fresh main menu
    const newMsg = await bot.telegram.sendMessage(userId, MAIN_MENU_TEXT, {
      parse_mode: 'Markdown',
      reply_markup: mainMenuKeyboard
    });

    // Step 3: Update DB
    await User.updateOne(
      { telegramId: userId },
      {
        $set: {
          mainMessageId: newMsg.message_id,
          currentScreen: 'main_menu',
          currentScreenData: { text: MAIN_MENU_TEXT, keyboard: mainMenuKeyboard },
          navigationStack: [],
          lastActivity: new Date()
        }
      }
    );

    console.log(`  ✅ User ${userId}: reset to main menu (msgId: ${newMsg.message_id})`);
    stats.success++;

  } catch (error) {
    if (error.description?.includes('bot was blocked') ||
        error.description?.includes('chat not found') ||
        error.description?.includes('user is deactivated')) {
      // User blocked bot or deactivated - clear mainMessageId
      await User.updateOne(
        { telegramId: userId },
        { $set: { mainMessageId: null } }
      );
      console.log(`  ⚠️ User ${userId}: blocked/deactivated - cleared mainMessageId`);
      stats.blocked++;
    } else {
      console.error(`  ❌ User ${userId}: ${error.message}`);
      stats.failed++;
    }
  }
}

// Main function
async function main() {
  console.log('🚀 Starting user reset script...\n');

  // Connect to DB
  await connectDB();

  // Initialize bot
  const bot = new Telegraf(process.env.BOT_TOKEN);
  console.log('✅ Bot initialized\n');

  // Find all users with mainMessageId
  const users = await User.find({
    mainMessageId: { $exists: true, $ne: null },
    blacklisted: { $ne: true }
  }).lean();

  console.log(`📊 Found ${users.length} users to process\n`);

  if (users.length === 0) {
    console.log('No users to process. Exiting.');
    process.exit(0);
  }

  // Stats
  const stats = {
    success: 0,
    blocked: 0,
    failed: 0
  };

  // Process users in batches
  const BATCH_SIZE = 25;
  const BATCH_DELAY = 1000; // 1 second between batches

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(users.length / BATCH_SIZE);

    console.log(`\n📦 Processing batch ${batchNum}/${totalBatches} (${batch.length} users)...`);

    // Process batch sequentially to avoid rate limits
    for (const user of batch) {
      await processUser(bot, user, stats);
      await sleep(100); // 100ms between users
    }

    // Delay between batches
    if (i + BATCH_SIZE < users.length) {
      console.log(`  ⏳ Waiting ${BATCH_DELAY}ms before next batch...`);
      await sleep(BATCH_DELAY);
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Success: ${stats.success}`);
  console.log(`⚠️ Blocked/Deactivated: ${stats.blocked}`);
  console.log(`❌ Failed: ${stats.failed}`);
  console.log(`📊 Total: ${users.length}`);
  console.log('='.repeat(50));

  console.log('\n✅ Script completed!');
  process.exit(0);
}

// Run
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
