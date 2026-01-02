/**
 * Cleanup Stale Sessions Script
 *
 * Finds users stuck in old sessions and returns them to main menu.
 * Use this for users who got stuck before timeout monitors were active.
 *
 * Usage: node scripts/cleanup-stale-sessions.js [--dry-run]
 *
 * Options:
 *   --dry-run    Show what would be done without actually doing it
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { Telegraf } = require('telegraf');

const Session = require('../src/models/Session');
const User = require('../src/models/User');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Sessions older than this are considered stale (in hours)
const STALE_THRESHOLD_HOURS = 1;

async function cleanupStaleSessions() {
  const isDryRun = process.argv.includes('--dry-run');

  console.log('🧹 Stale Sessions Cleanup Script');
  console.log('================================');
  if (isDryRun) {
    console.log('🔍 DRY RUN MODE - no changes will be made\n');
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const cutoffTime = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000);

    // Find all stale sessions
    const staleSessions = await Session.find({
      updatedAt: { $lt: cutoffTime }
    }).lean();

    if (staleSessions.length === 0) {
      console.log('✅ No stale sessions found!');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`Found ${staleSessions.length} stale session(s):\n`);

    // Group by type for summary
    const byType = {};
    for (const session of staleSessions) {
      byType[session.type] = (byType[session.type] || 0) + 1;
    }
    console.log('By type:', byType, '\n');

    // Get main menu text and keyboard
    const { MAIN_MENU_TEXT } = require('../src/bot/handlers/start');
    const { mainMenuKeyboard } = require('../src/bot/keyboards/main');

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const session of staleSessions) {
      const telegramId = session.telegramId;
      const sessionType = session.type;
      const lastUpdate = new Date(session.updatedAt).toLocaleString('ru-RU');

      // Get user info
      const user = await User.findOne({ telegramId }).select('username firstName mainMessageId currentScreen botBlocked').lean();

      const displayName = user?.username ? `@${user.username}` : (user?.firstName || telegramId);

      console.log(`📋 ${displayName} (${telegramId})`);
      console.log(`   Session: ${sessionType}`);
      console.log(`   Current screen: ${user?.currentScreen || 'unknown'}`);
      console.log(`   Last update: ${lastUpdate}`);

      // Skip if user is already on main_menu - just delete orphan session silently
      if (user?.currentScreen === 'main_menu') {
        if (!isDryRun) {
          await Session.deleteSession(telegramId, sessionType);
        }
        console.log(`   ⏭️ SKIP: already on main_menu (deleted orphan session)\n`);
        skipped++;
        continue;
      }

      // Skip if user blocked bot - just clean session
      if (user?.botBlocked) {
        if (!isDryRun) {
          await Session.deleteSession(telegramId, sessionType);
        }
        console.log(`   ⏭️ SKIP: bot blocked (deleted orphan session)\n`);
        skipped++;
        continue;
      }

      // Skip screens that don't need intervention (help, rules, etc.)
      const safeScreens = ['rules', 'help', 'how_it_works', 'rules_and_fees', 'support'];
      if (safeScreens.includes(user?.currentScreen)) {
        if (!isDryRun) {
          await Session.deleteSession(telegramId, sessionType);
        }
        console.log(`   ⏭️ SKIP: on safe screen "${user.currentScreen}" (deleted orphan session)\n`);
        skipped++;
        continue;
      }

      if (isDryRun) {
        console.log(`   ➡️ Would: delete session, send main menu\n`);
        processed++;
        continue;
      }

      try {
        // Delete the session
        await Session.deleteSession(telegramId, sessionType);

        // Clear any pending data
        await User.updateOne({ telegramId }, {
          $unset: { pendingDealId: 1, pendingWallet: 1 }
        });

        // Try to send main menu
        if (user?.mainMessageId) {
          try {
            await bot.telegram.deleteMessage(telegramId, user.mainMessageId);
          } catch (e) {
            // Message already deleted
          }
        }

        const text = `⏰ *Сессия истекла*

Вы были неактивны слишком долго. Возвращаем вас в главное меню.

${MAIN_MENU_TEXT}`;

        const keyboard = mainMenuKeyboard();

        const newMsg = await bot.telegram.sendMessage(telegramId, text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });

        // Update user state
        await User.updateOne({ telegramId }, {
          $set: {
            mainMessageId: newMsg.message_id,
            currentScreen: 'main_menu',
            currentScreenData: { text: MAIN_MENU_TEXT, keyboard: keyboard.reply_markup },
            navigationStack: [],
            lastActivity: new Date()
          }
        });

        console.log(`   ✅ Cleaned up and sent main menu\n`);
        processed++;

      } catch (error) {
        if (error.description?.includes('bot was blocked') ||
            error.description?.includes('chat not found') ||
            error.description?.includes('user is deactivated')) {
          // User blocked bot - just clean up session
          await Session.deleteSession(telegramId, sessionType);
          await User.updateOne({ telegramId }, {
            $set: { botBlocked: true, botBlockedAt: new Date(), mainMessageId: null }
          });
          console.log(`   ⚠️ Bot blocked by user - session cleaned\n`);
          skipped++;
        } else {
          console.log(`   ❌ Error: ${error.message}\n`);
          errors++;
        }
      }
    }

    console.log('================================');
    console.log(`✅ Processed: ${processed}`);
    console.log(`⚠️ Skipped (blocked): ${skipped}`);
    console.log(`❌ Errors: ${errors}`);

  } catch (error) {
    console.error('❌ Script error:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

cleanupStaleSessions();
