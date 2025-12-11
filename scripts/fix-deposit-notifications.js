/**
 * Fix Deposit Notifications Flag
 *
 * Sets depositNotificationSent=true for all existing locked deals
 * that already have depositTxHash. This prevents duplicate notifications
 * on bot restart.
 *
 * Run ONCE after deploying the new code:
 * node scripts/fix-deposit-notifications.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
  console.log('Connecting to MongoDB...');

  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  console.log('✅ Connected\n');

  const Deal = require('../src/models/Deal');

  // Find all locked deals with deposit that don't have the flag set
  const deals = await Deal.find({
    status: 'locked',
    depositTxHash: { $ne: null },
    depositNotificationSent: { $ne: true }
  });

  console.log(`Found ${deals.length} deals to update\n`);

  if (deals.length === 0) {
    console.log('Nothing to update.');
    process.exit(0);
  }

  // Update all at once
  const result = await Deal.updateMany(
    {
      status: 'locked',
      depositTxHash: { $ne: null },
      depositNotificationSent: { $ne: true }
    },
    {
      $set: { depositNotificationSent: true }
    }
  );

  console.log(`✅ Updated ${result.modifiedCount} deals`);
  console.log('\nDeals updated:');

  for (const deal of deals) {
    console.log(`  - ${deal.dealId} (buyer: ${deal.buyerId}, seller: ${deal.sellerId})`);
  }

  console.log('\n✅ Done! Bot restart will no longer send duplicate deposit notifications.');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
