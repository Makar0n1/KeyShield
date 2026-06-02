/**
 * Full purge of the test dispute environment for the two seed users:
 *   - Wipes every dispute-chat bot message from both Telegram chats
 *   - Deletes ALL DisputeChat documents involving either user
 *   - Deletes the linked Dispute documents
 *   - Deletes the test Deal(s) (only those flagged as test — DL-TEST-*)
 *   - Clears dispute_chat sessions
 *   - Resets each user's mainMessageId/currentScreen and sends a fresh main menu
 *
 * Difference vs scripts/reset-test-dispute.js:
 *   reset = keep Deal + Dispute, just zero out the chat → "test again"
 *   delete = nuke everything → "done testing, clean it all"
 *
 * Only deals with `dealId` starting with `DL-TEST-` are deleted, so this
 * never touches real production deals even if the seed users participated
 * in one.
 *
 * Usage:
 *   node scripts/delete-test-deal.js
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
  try { await bot.telegram.deleteMessage(chatId, messageId); } catch (_) {}
}

async function wipeChatsForUser(telegramId) {
  console.log(`\n👤 Wiping chats for ${telegramId}...`);
  const chats = await DisputeChat.find({
    $or: [{ buyerTelegramId: telegramId }, { sellerTelegramId: telegramId }]
  });
  console.log(`   📜 DisputeChats touching this user: ${chats.length}`);

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
}

async function restoreUser(telegramId) {
  const user = await User.findOne({ telegramId });
  if (!user) {
    console.log(`   ⚠️  User ${telegramId} not in DB`);
    return;
  }
  const lang = user.languageCode || 'ru';

  await safeDelete(telegramId, user.mainMessageId);
  await Session.deleteSession(telegramId, 'dispute_chat');
  await User.updateOne(
    { telegramId },
    { $set: {
      mainMessageId: null, currentScreen: null,
      currentScreenData: null, navigationStack: []
    }}
  );

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
    console.log(`   ✅ Main menu sent to ${telegramId} (msg ${sent.message_id})`);
  } catch (err) {
    console.error(`   ❌ Failed to send main menu to ${telegramId}: ${err.message}`);
  }
}

async function purgeArtifacts() {
  console.log('\n🧹 Purging DB artifacts...');

  // Collect ids of chats / disputes / deals involving the test users
  const chats = await DisputeChat.find({
    $or: [
      { buyerTelegramId: { $in: TEST_IDS } },
      { sellerTelegramId: { $in: TEST_IDS } }
    ]
  }).select('_id disputeId dealId');

  const dealObjectIds = [...new Set(chats.map(c => c.dealId.toString()))];
  const disputeObjectIds = [...new Set(chats.map(c => c.disputeId.toString()))];

  if (chats.length) {
    await DisputeChat.deleteMany({ _id: { $in: chats.map(c => c._id) } });
    console.log(`   · deleted ${chats.length} DisputeChat docs`);
  }

  // Also pick up any disputes for test users that never had a chat
  const allDisputes = await Dispute.find({
    $or: [
      { _id: { $in: disputeObjectIds } },
      { openedBy: { $in: TEST_IDS } }
    ]
  }).populate('dealId', 'dealId buyerId sellerId');

  const testDisputeIds = [];
  const testDealObjectIds = new Set(dealObjectIds);

  for (const d of allDisputes) {
    const deal = d.dealId;
    if (!deal) continue;
    const isTestDeal = deal.dealId?.startsWith('DL-TEST-');
    const involvesTestUser = TEST_IDS.includes(deal.buyerId) || TEST_IDS.includes(deal.sellerId);
    if (isTestDeal && involvesTestUser) {
      testDisputeIds.push(d._id);
      testDealObjectIds.add(deal._id.toString());
    }
  }

  if (testDisputeIds.length) {
    await Dispute.deleteMany({ _id: { $in: testDisputeIds } });
    console.log(`   · deleted ${testDisputeIds.length} Dispute docs`);
  }

  // Delete the test deals themselves — STRICT filter on DL-TEST- prefix so we
  // never accidentally remove a real deal even if a test user joined one.
  const testDealsToDelete = await Deal.find({
    _id: { $in: [...testDealObjectIds] },
    dealId: { $regex: '^DL-TEST-' }
  }).select('_id dealId');

  if (testDealsToDelete.length) {
    await Deal.deleteMany({ _id: { $in: testDealsToDelete.map(d => d._id) } });
    console.log(`   · deleted ${testDealsToDelete.length} test Deal(s): ${testDealsToDelete.map(d => d.dealId).join(', ')}`);
  } else {
    console.log(`   · no DL-TEST-* deals to delete`);
  }
}

async function main() {
  await connectDB();
  console.log('📦 Connected to MongoDB');

  // Wipe Telegram messages first (needs the DB records to find them)
  for (const id of TEST_IDS) await wipeChatsForUser(id);

  // Now purge DB
  await purgeArtifacts();

  // Restore main menu for both users
  console.log('\n🏠 Restoring main menu...');
  for (const id of TEST_IDS) await restoreUser(id);

  console.log('\n' + '='.repeat(70));
  console.log('✅ Done. Test environment is clean.');
  console.log('   Re-run scripts/seed-test-dispute.js to create a fresh test.');
  console.log('='.repeat(70) + '\n');

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\n❌ Delete failed:', err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
