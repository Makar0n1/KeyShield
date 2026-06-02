/**
 * Reset the test dispute-chat environment for the two seed users so you
 * can re-test the chat flow from scratch.
 *
 * For each test user:
 *   1. Wipe every bot message belonging to any DisputeChat involving them
 *      (intro + every chat message + closing notice if any) AND their
 *      current main bot message.
 *   2. Clear dispute_chat sessions, reset User.mainMessageId / currentScreen.
 *   3. Send a fresh main menu and track it as the new mainMessageId.
 *
 * For the underlying test dispute(s):
 *   - Delete the DisputeChat documents entirely.
 *   - Reset the linked Dispute back to status='open' (so the admin panel
 *     shows it as actionable and "Открыть чат" becomes available again).
 *
 * Usage:
 *   node scripts/reset-test-dispute.js
 */

require('dotenv').config();
const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');

const connectDB = require('../src/config/database');
const Deal = require('../src/models/Deal');
const Dispute = require('../src/models/Dispute');
const DisputeChat = require('../src/models/DisputeChat');
const Session = require('../src/models/Session');
const User = require('../src/models/User');
const { mainMenuKeyboard } = require('../src/bot/keyboards/main');
const { getMainMenuText } = require('../src/bot/handlers/start');

const TEST_IDS = [349177382, 8092715080];

const bot = new Telegraf(process.env.BOT_TOKEN);

async function safeDelete(chatId, messageId) {
  if (!messageId) return;
  try {
    await bot.telegram.deleteMessage(chatId, messageId);
  } catch (_) { /* message already gone — fine */ }
}

async function resetUser(telegramId) {
  console.log(`\n👤 Resetting user ${telegramId}...`);

  const user = await User.findOne({ telegramId });
  if (!user) {
    console.log(`   ⚠️  Not in DB — skipped`);
    return;
  }
  const lang = user.languageCode || 'ru';

  // 1. Find every DisputeChat this user is part of and wipe each side's TG msgs
  const chats = await DisputeChat.find({
    $or: [
      { buyerTelegramId: telegramId },
      { sellerTelegramId: telegramId }
    ]
  });
  console.log(`   📜 DisputeChats found: ${chats.length}`);

  for (const chat of chats) {
    const role = chat.buyerTelegramId === telegramId ? 'buyer' : 'seller';
    const deletes = [];
    for (const msg of chat.messages) {
      const id = msg.telegramMessageIds?.[role];
      if (id) deletes.push(safeDelete(telegramId, id));
    }
    if (chat.introMessageIds?.[role]) {
      deletes.push(safeDelete(telegramId, chat.introMessageIds[role]));
    }
    await Promise.all(deletes);
    console.log(`     · wiped ${deletes.length} msgs from chat ${chat._id}`);
  }

  // 2. Wipe current main message + clear sessions/state
  await safeDelete(telegramId, user.mainMessageId);
  await Session.deleteSession(telegramId, 'dispute_chat');

  await User.updateOne(
    { telegramId },
    { $set: { mainMessageId: null, currentScreen: null, currentScreenData: null, navigationStack: [] } }
  );

  // 3. Send fresh main menu
  try {
    const text = getMainMenuText(lang);
    const keyboard = mainMenuKeyboard(lang);
    const sent = await bot.telegram.sendMessage(telegramId, text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    await User.updateOne(
      { telegramId },
      { $set: { mainMessageId: sent.message_id, currentScreen: 'main_menu' } }
    );
    console.log(`   ✅ Main menu sent (msg ${sent.message_id})`);
  } catch (err) {
    console.error(`   ❌ Failed to send main menu: ${err.message}`);
  }
}

async function resetTestArtifacts() {
  console.log('\n🧹 Cleaning DB artifacts...');

  // Find chats involving any test user
  const chats = await DisputeChat.find({
    $or: [
      { buyerTelegramId: { $in: TEST_IDS } },
      { sellerTelegramId: { $in: TEST_IDS } }
    ]
  });

  const disputeIds = [...new Set(chats.map(c => c.disputeId.toString()))];

  // Delete chats
  if (chats.length) {
    await DisputeChat.deleteMany({ _id: { $in: chats.map(c => c._id) } });
    console.log(`   · deleted ${chats.length} DisputeChat docs`);
  }

  // Reset disputes back to 'open' (so they can be re-tested via "Открыть чат")
  if (disputeIds.length) {
    const r = await Dispute.updateMany(
      { _id: { $in: disputeIds }, status: { $ne: 'resolved' } },
      { $set: { status: 'open', arbiterId: null, decision: null, resolvedAt: null } }
    );
    console.log(`   · reset ${r.modifiedCount} disputes to status='open'`);
  } else {
    console.log(`   · no disputes to reset`);
  }
}

async function main() {
  await connectDB();
  console.log('📦 Connected to MongoDB');

  for (const id of TEST_IDS) {
    await resetUser(id);
  }
  await resetTestArtifacts();

  console.log('\n' + '='.repeat(70));
  console.log('✅ Reset complete. Open the admin panel and hit «Открыть чат»');
  console.log('   on the (re-opened) dispute to test the flow again.');
  console.log('='.repeat(70) + '\n');

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\n❌ Reset failed:', err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
