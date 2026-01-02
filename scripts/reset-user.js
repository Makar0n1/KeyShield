/**
 * Reset User Script
 *
 * Resets a specific user to main menu.
 * Use for users stuck on old screens without active sessions.
 *
 * Usage: node scripts/reset-user.js <telegramId>
 * Example: node scripts/reset-user.js 2117505606
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');

const Session = require('../src/models/Session');
const User = require('../src/models/User');

const bot = new Telegraf(process.env.BOT_TOKEN);

async function resetUser() {
  const telegramId = parseInt(process.argv[2]);

  if (!telegramId) {
    console.log('Usage: node scripts/reset-user.js <telegramId>');
    console.log('Example: node scripts/reset-user.js 2117505606');
    process.exit(1);
  }

  console.log(`🔄 Resetting user ${telegramId}...\n`);

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const { MAIN_MENU_TEXT } = require('../src/bot/handlers/start');
    const { mainMenuKeyboard } = require('../src/bot/keyboards/main');

    // Get user
    const user = await User.findOne({ telegramId }).lean();

    if (!user) {
      console.log('❌ User not found!');
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`📋 User: @${user.username || user.firstName || 'unknown'}`);
    console.log(`   Current screen: ${user.currentScreen || 'unknown'}`);
    console.log(`   Bot blocked: ${user.botBlocked || false}`);

    // Delete any sessions
    const deletedSessions = await Session.deleteMany({ telegramId });
    console.log(`   Deleted sessions: ${deletedSessions.deletedCount}`);

    // Try to delete old message
    if (user.mainMessageId) {
      try {
        await bot.telegram.deleteMessage(telegramId, user.mainMessageId);
        console.log('   Deleted old message: yes');
      } catch (e) {
        console.log('   Deleted old message: no (already deleted or expired)');
      }
    }

    // Send main menu
    const keyboard = mainMenuKeyboard();

    try {
      const newMsg = await bot.telegram.sendMessage(telegramId, MAIN_MENU_TEXT, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });

      // Update user
      await User.updateOne({ telegramId }, {
        $set: {
          mainMessageId: newMsg.message_id,
          currentScreen: 'main_menu',
          currentScreenData: { text: MAIN_MENU_TEXT, keyboard: keyboard.reply_markup },
          navigationStack: [],
          lastActivity: new Date()
        },
        $unset: { pendingDealId: 1, pendingWallet: 1 }
      });

      console.log('\n✅ User reset to main menu successfully!');

    } catch (e) {
      if (e.description?.includes('blocked') ||
          e.description?.includes('not found') ||
          e.description?.includes('deactivated')) {
        await User.updateOne({ telegramId }, {
          $set: {
            botBlocked: true,
            botBlockedAt: new Date(),
            mainMessageId: null,
            currentScreen: 'blocked'
          }
        });
        console.log('\n⚠️ Bot blocked by user - marked as blocked in DB');
      } else {
        console.log('\n❌ Error sending message:', e.message);
      }
    }

  } catch (error) {
    console.error('❌ Script error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

resetUser();
