/**
 * Migration: Encrypt existing plaintext sensitive data in MongoDB.
 *
 * Run ONCE after setting ENCRYPTION_KEY in .env:
 *   node scripts/migrate-encrypt.js
 *
 * Safe to run multiple times — skips already-encrypted values.
 * Does NOT modify data if ENCRYPTION_KEY is not set.
 */

require('dotenv').config();

const mongoose = require('mongoose');
const { init, encrypt, isEncrypted, isEnabled } = require('../src/utils/encryption');

async function migrate() {
  // Init encryption
  if (!init()) {
    console.error('❌ ENCRYPTION_KEY not set. Aborting.');
    process.exit(1);
  }

  // Connect to MongoDB
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB\n');

  const db = mongoose.connection.db;

  // ═══════════════════════════════════════════════════════
  //  MultisigWallet
  // ═══════════════════════════════════════════════════════
  console.log('🔐 Encrypting MultisigWallet...');
  const wallets = await db.collection('multisigwallets').find({}).toArray();
  let walletCount = 0;

  for (const w of wallets) {
    const update = {};
    for (const field of ['privateKey', 'buyerPublicKey', 'sellerPublicKey', 'arbiterPublicKey']) {
      if (w[field] && !isEncrypted(w[field])) {
        update[field] = encrypt(w[field]);
      }
    }
    if (Object.keys(update).length > 0) {
      await db.collection('multisigwallets').updateOne({ _id: w._id }, { $set: update });
      walletCount++;
    }
  }
  console.log(`   ✅ ${walletCount}/${wallets.length} wallets encrypted\n`);

  // ═══════════════════════════════════════════════════════
  //  Deal
  // ═══════════════════════════════════════════════════════
  console.log('🔐 Encrypting Deal...');
  const deals = await db.collection('deals').find({}).toArray();
  let dealCount = 0;

  const dealFields = [
    'buyerAddress', 'sellerAddress',
    'buyerPrivateKey', 'sellerPrivateKey',
    'buyerKey', 'sellerKey', 'arbiterKey',
  ];

  for (const d of deals) {
    const update = {};
    for (const field of dealFields) {
      if (d[field] && !isEncrypted(d[field])) {
        update[field] = encrypt(d[field]);
      }
    }
    if (Object.keys(update).length > 0) {
      await db.collection('deals').updateOne({ _id: d._id }, { $set: update });
      dealCount++;
    }
  }
  console.log(`   ✅ ${dealCount}/${deals.length} deals encrypted\n`);

  // ═══════════════════════════════════════════════════════
  //  User
  // ═══════════════════════════════════════════════════════
  console.log('🔐 Encrypting User...');
  const users = await db.collection('users').find({}).toArray();
  let userCount = 0;

  for (const u of users) {
    const update = {};

    // Top-level fields
    for (const field of ['email', 'referralWallet']) {
      if (u[field] && !isEncrypted(u[field])) {
        update[field] = encrypt(u[field]);
      }
    }

    // Wallets array
    if (u.wallets && u.wallets.length > 0) {
      let walletsChanged = false;
      const updatedWallets = u.wallets.map(w => {
        if (w.address && !isEncrypted(w.address)) {
          walletsChanged = true;
          return { ...w, address: encrypt(w.address) };
        }
        return w;
      });
      if (walletsChanged) {
        update.wallets = updatedWallets;
      }
    }

    if (Object.keys(update).length > 0) {
      await db.collection('users').updateOne({ _id: u._id }, { $set: update });
      userCount++;
    }
  }
  console.log(`   ✅ ${userCount}/${users.length} users encrypted\n`);

  // ═══════════════════════════════════════════════════════
  //  Summary
  // ═══════════════════════════════════════════════════════
  console.log('════════════════════════════════════════');
  console.log('  MIGRATION COMPLETE');
  console.log('════════════════════════════════════════');
  console.log(`  MultisigWallets: ${walletCount} encrypted`);
  console.log(`  Deals:           ${dealCount} encrypted`);
  console.log(`  Users:           ${userCount} encrypted`);
  console.log('════════════════════════════════════════');

  await mongoose.disconnect();
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
