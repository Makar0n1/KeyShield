/**
 * Seed a test deal + open dispute between two users for E2E-testing
 * the dispute-chat feature.
 *
 * - Both wallet addresses are fake TRON-looking strings (T + 33 base58 chars).
 * - Multisig address is also fake — getBalance() will return 0, payout step
 *   creates a key_validation session but won't broadcast anything real.
 * - Status goes straight to `dispute` so the admin panel sees the dispute
 *   immediately and you can hit "Открыть чат".
 *
 * Usage:
 *   node scripts/seed-test-dispute.js
 *
 * The two telegramIds at the top must already have started the bot at least
 * once (so a User document exists). If not, the script will create stubs,
 * but the bot won't be able to deliver messages until the user does /start.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

const connectDB = require('../src/config/database');
const Deal = require('../src/models/Deal');
const Dispute = require('../src/models/Dispute');
const User = require('../src/models/User');

const BUYER_ID = 349177382;
const SELLER_ID = 8092715080;

// Fake but format-valid TRON addresses (T + 33 base58 chars — won't validate on-chain)
const fakeTron = (seed) => {
  const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const hash = crypto.createHash('sha256').update(seed).digest('hex');
  let out = 'T';
  for (let i = 0; i < 33; i++) {
    out += base58[parseInt(hash[i % hash.length], 16) * 3 % base58.length];
  }
  return out;
};

async function ensureUser(telegramId, role) {
  let user = await User.findOne({ telegramId });
  if (user) {
    console.log(`✅ User ${telegramId} (${role}) already exists: @${user.username || 'no-username'}`);
    return user;
  }
  console.log(`⚠️  User ${telegramId} (${role}) NOT FOUND. Creating stub — bot delivery will fail until they /start the bot.`);
  user = await User.create({
    telegramId,
    username: `test_${role}_${telegramId}`,
    firstName: role === 'buyer' ? 'TestBuyer' : 'TestSeller',
    languageCode: 'ru',
    languageSelected: true,
    sessionCount: 1
  });
  return user;
}

async function main() {
  await connectDB();
  console.log('📦 Connected to MongoDB\n');

  // 1. Make sure both users exist
  const buyer = await ensureUser(BUYER_ID, 'buyer');
  const seller = await ensureUser(SELLER_ID, 'seller');

  // 2. Generate deal IDs / keys / addresses
  const dealId = `DL-TEST-${Date.now().toString().slice(-6)}`;
  const uniqueKey = crypto.randomBytes(16).toString('hex');

  // Random deadline: 6 to 72 hours from now
  const hoursAhead = 6 + Math.floor(Math.random() * 66);
  const deadline = new Date(Date.now() + hoursAhead * 3600 * 1000);

  const amount = 100; // USDT — under 300 → fixed commission 15
  const commission = 15;

  const deal = await Deal.create({
    dealId,
    creatorRole: 'buyer',
    buyerId: BUYER_ID,
    sellerId: SELLER_ID,
    productName: '[TEST] Тестовая сделка для проверки чат-арбитража',
    description: 'Сделка создана сидером для E2E-тестирования feature dispute-chat. Адреса фейковые, фактической выплаты не произойдёт.',
    asset: 'USDT',
    amount,
    commission,
    commissionType: 'split',
    multisigAddress: fakeTron(`multisig-${dealId}`),
    buyerAddress: fakeTron(`buyer-${BUYER_ID}-${dealId}`),
    sellerAddress: fakeTron(`seller-${SELLER_ID}-${dealId}`),
    status: 'dispute',
    deadline,
    uniqueKey,
    depositTxHash: `FAKE-DEPOSIT-${uniqueKey.slice(0, 8)}`,
    depositDetectedAt: new Date(),
    actualDepositAmount: amount
  });

  console.log(`\n✅ Created Deal ${dealId}`);
  console.log(`   _id: ${deal._id}`);
  console.log(`   amount: ${amount} USDT, commission: ${commission} USDT`);
  console.log(`   deadline: ${deadline.toISOString()} (${hoursAhead}h from now)`);
  console.log(`   multisig: ${deal.multisigAddress} (fake)`);
  console.log(`   buyer wallet: ${deal.buyerAddress} (fake)`);
  console.log(`   seller wallet: ${deal.sellerAddress} (fake)`);

  // 3. Create dispute (initiated by buyer)
  const dispute = await Dispute.create({
    dealId: deal._id,
    openedBy: BUYER_ID,
    reasonText: '[TEST] Это тестовый спор для проверки чат-арбитража. Текст был достаточно длинный, чтобы пройти валидацию (минимум 20 символов).',
    media: [],
    status: 'open'
  });

  console.log(`\n✅ Created Dispute ${dispute._id}`);
  console.log(`   status: open`);
  console.log(`   openedBy: ${BUYER_ID} (buyer)`);

  // 4. Print next steps
  console.log('\n' + '='.repeat(70));
  console.log('🎯 NEXT STEPS — open the admin panel:');
  console.log('='.repeat(70));
  console.log(`   1. Go to /admin/disputes/${dispute._id}`);
  console.log(`   2. Click «Открыть чат» (new button)`);
  console.log(`   3. Both ${BUYER_ID} and ${SELLER_ID} should receive an intro in the bot`);
  console.log(`   4. Test text + media exchange in the bot`);
  console.log(`   5. Hit «В пользу покупателя/продавца» in the admin UI`);
  console.log(`      → chat wipes from both bots, dispute resolves via standard flow`);
  console.log(`      → fake addresses mean getBalance=0; payout step creates`);
  console.log(`        key_validation session but cannot broadcast anything.`);
  console.log('='.repeat(70));

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\n❌ Seeder failed:', err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
