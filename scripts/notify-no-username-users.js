/**
 * One-time notification: send "username required" screen to existing active users
 * who have no Telegram username and haven't been notified yet.
 *
 * Run: node scripts/notify-no-username-users.js
 *
 * Safe to re-run — noUsernameNotifiedAt flag prevents duplicate sends.
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const User = require('../src/models/User');
    const { usernameRequiredPersistentKeyboard } = require('../src/bot/keyboards/main');
    const { t } = require('../src/locales');

    // Need bot instance for sending messages
    const Telegraf = require('telegraf');
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) {
      throw new Error('BOT_TOKEN not set in .env');
    }
    const botInstance = new Telegraf(botToken);

    console.log('\n📊 Fetching users without username...');

    const users = await User.find({
      username: null,
      botBlocked: { $ne: true },
      mainMessageId: { $ne: null },
      noUsernameNotifiedAt: null
    }).select('telegramId languageCode mainMessageId').lean();

    console.log(`📢 Found ${users.length} users to notify\n`);

    if (users.length === 0) {
      console.log('✅ All users have been notified.');
      await mongoose.disconnect();
      return;
    }

    let sent = 0;
    let failed = 0;
    let blocked = 0;

    for (const user of users) {
      try {
        const lang = user.languageCode || 'ru';
        const text = t(lang, 'usernameRequired.screen');
        const keyboard = usernameRequiredPersistentKeyboard(lang);

        // Delete old main message
        if (user.mainMessageId) {
          try {
            await botInstance.telegram.deleteMessage(user.telegramId, user.mainMessageId);
          } catch (e) {
            // Already deleted or permission denied
          }
        }

        // Send username required screen
        console.log(`📨 Sending to ${user.telegramId}...`);
        const msg = await botInstance.telegram.sendMessage(user.telegramId, text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });

        // Update user state
        await User.updateOne({ telegramId: user.telegramId }, {
          $set: {
            mainMessageId: msg.message_id,
            currentScreen: 'username_required',
            currentScreenData: { text, keyboard: keyboard.reply_markup },
            navigationStack: [],
            noUsernameNotifiedAt: new Date()
          }
        });

        sent++;
        console.log(`   ✅ Notified ${user.telegramId}`);

        // Rate limiting — 50ms between sends (20 msg/sec, well under Telegram's 30 msg/sec limit)
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (err) {
        if (
          err.description?.includes('bot was blocked') ||
          err.description?.includes('chat not found') ||
          err.description?.includes('user is deactivated')
        ) {
          // Mark as blocked
          console.log(`   🚫 User blocked: ${user.telegramId}`);
          await User.updateOne({ telegramId: user.telegramId }, {
            $set: {
              botBlocked: true,
              botBlockedAt: new Date(),
              mainMessageId: null,
              noUsernameNotifiedAt: new Date()
            }
          });
          blocked++;
        } else {
          // Other error
          console.error(`   ⚠️ Failed: ${user.telegramId} — ${err.message}`);
          failed++;
        }
      }
    }

    console.log(`\n📊 Results:`);
    console.log(`   ✅ Sent: ${sent}`);
    console.log(`   🚫 Blocked: ${blocked}`);
    console.log(`   ⚠️ Failed: ${failed}`);

    if (sent + blocked === users.length) {
      console.log(`\n✅ Done! All users have been processed.`);
    } else {
      console.log(`\n⚠️ ${failed} users failed. You can re-run this script to retry.`);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Script failed:', err.message);
    process.exit(1);
  }
}

run();
