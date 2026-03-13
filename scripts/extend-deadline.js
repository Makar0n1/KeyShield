/**
 * Extend Deal Deadline Script
 *
 * Extends deadline for a specific deal or all expired/expiring deals.
 *
 * Usage:
 *   node scripts/extend-deadline.js <dealId> [newDeadline]
 *   node scripts/extend-deadline.js DEAL-12345 2026-03-31
 *
 * If newDeadline is omitted, defaults to 2026-03-31.
 */

require('dotenv').config();
const mongoose = require('mongoose');

const Deal = require('../src/models/Deal');

async function extendDeadline() {
  const dealId = process.argv[2];
  const newDeadlineArg = process.argv[3] || '2026-03-31';

  if (!dealId) {
    console.log('Usage: node scripts/extend-deadline.js <dealId> [newDeadline]');
    console.log('Example: node scripts/extend-deadline.js DEAL-12345 2026-03-31');
    process.exit(1);
  }

  const newDeadline = new Date(newDeadlineArg);
  if (isNaN(newDeadline.getTime())) {
    console.error(`Invalid date: ${newDeadlineArg}. Use format YYYY-MM-DD.`);
    process.exit(1);
  }
  // Set to end of day UTC
  newDeadline.setUTCHours(23, 59, 59, 0);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB\n');

  const deal = await Deal.findOne({ dealId });

  if (!deal) {
    console.error(`Deal not found: ${dealId}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const oldDeadline = deal.deadline;

  console.log(`Deal found:`);
  console.log(`  ID:          ${deal.dealId}`);
  console.log(`  Status:      ${deal.status}`);
  console.log(`  Old deadline: ${oldDeadline ? oldDeadline.toISOString() : 'none'}`);
  console.log(`  New deadline: ${newDeadline.toISOString()}`);
  console.log();

  deal.deadline = newDeadline;

  // Reset deadline-related flags so monitors/notifications fire fresh
  if (deal.deadlineNotificationSent) {
    deal.deadlineNotificationSent = false;
    console.log('  ↺ Reset deadlineNotificationSent → false');
  }

  // If the deal expired due to deadline, revert to in_progress so it's live again
  if (deal.status === 'expired') {
    deal.status = 'in_progress';
    console.log('  ↺ Status reverted: expired → in_progress');
  }

  await deal.save();
  console.log('\n✅ Deadline extended successfully.');

  await mongoose.disconnect();
}

extendDeadline().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
