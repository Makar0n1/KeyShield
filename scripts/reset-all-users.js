/**
 * Reset All Users for New Navigation System
 *
 * This script:
 * 1. Deletes old bot messages via Telegram API
 * 2. Sends fresh main menu to all users
 * 3. Updates mainMessageId in database
 * 4. Clears navigationStack and resets currentScreen
 *
 * After running this script, all users will have a clean main menu
 * with the new DELETE + SEND navigation system.
 *
 * Usage: node scripts/reset-all-users.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');
const User = require('../src/models/User');

// Main menu text and keyboard (same as in start.js)
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

const mainMenuKeyboard = {
  inline_keyboard: [
    [{ text: '➕ Создать сделку', callback_data: 'create_deal' }],
    [{ text: '📋 Мои сделки', callback_data: 'my_deals' }],
    [{ text: '❓ Помощь', callback_data: 'help' }]
  ]
};

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

async function resetAllUsers() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/keyshield';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Get all users with messages
    const users = await User.find({}).select('telegramId mainMessageId username');
    console.log(`\nTotal users: ${users.length}`);

    const usersWithMessages = users.filter(u => u.mainMessageId);
    console.log(`Users with active messages: ${usersWithMessages.length}`);

    let deleted = 0;
    let sent = 0;
    let errors = 0;
    let blocked = 0;

    console.log('\n--- Starting migration ---\n');

    for (const user of users) {
      const { telegramId, mainMessageId, username } = user;

      try {
        // 1. Delete old message if exists
        if (mainMessageId) {
          try {
            await bot.telegram.deleteMessage(telegramId, mainMessageId);
            deleted++;
            console.log(`🗑️  Deleted old message for @${username || telegramId}`);
          } catch (e) {
            // Message already deleted - not critical
            if (!e.description?.includes('message to delete not found')) {
              console.log(`⚠️  Could not delete message for @${username || telegramId}: ${e.description || e.message}`);
            }
          }
        }

        // 2. Send new main menu
        const newMsg = await bot.telegram.sendMessage(telegramId, MAIN_MENU_TEXT, {
          parse_mode: 'Markdown',
          reply_markup: mainMenuKeyboard
        });

        // 3. Update user in database
        await User.updateOne(
          { telegramId },
          {
            $set: {
              mainMessageId: newMsg.message_id,
              navigationStack: [],
              currentScreen: 'main_menu',
              currentScreenData: {
                text: MAIN_MENU_TEXT,
                keyboard: mainMenuKeyboard
              },
              lastActivity: new Date()
            }
          }
        );

        sent++;
        console.log(`✅ Sent main menu to @${username || telegramId} (msg: ${newMsg.message_id})`);

        // Rate limiting - Telegram allows ~30 messages/second
        await sleep(50);

      } catch (error) {
        if (error.description?.includes('bot was blocked') ||
            error.description?.includes('user is deactivated') ||
            error.description?.includes('chat not found')) {
          blocked++;
          console.log(`🚫 User blocked/deactivated: @${username || telegramId}`);

          // Clear message ID for blocked users
          await User.updateOne(
            { telegramId },
            {
              $set: {
                mainMessageId: null,
                navigationStack: [],
                currentScreen: 'main_menu',
                currentScreenData: null
              }
            }
          );
        } else {
          errors++;
          console.error(`❌ Error for @${username || telegramId}: ${error.message}`);
        }
      }
    }

    // Also clear any active sessions
    const Session = require('../src/models/Session');
    const sessionResult = await Session.deleteMany({
      type: { $in: ['create_deal', 'dispute'] }
    });

    console.log('\n--- Migration complete ---\n');
    console.log(`📊 Results:`);
    console.log(`   Total users: ${users.length}`);
    console.log(`   Old messages deleted: ${deleted}`);
    console.log(`   New menus sent: ${sent}`);
    console.log(`   Blocked/deactivated: ${blocked}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Sessions cleared: ${sessionResult.deletedCount}`);

    if (sent === users.length - blocked) {
      console.log('\n✅ All active users successfully migrated!');
    } else {
      console.log('\n⚠️ Some users could not be migrated - check errors above');
    }

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run
resetAllUsers();
