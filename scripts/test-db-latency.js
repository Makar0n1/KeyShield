/**
 * Test MongoDB Latency
 *
 * This script tests MongoDB response times to diagnose
 * slow callback query handling.
 *
 * Run: node scripts/test-db-latency.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = async () => {
  console.log('Connecting to MongoDB...');
  const startConnect = Date.now();

  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    heartbeatFrequencyMS: 10000,
  });

  console.log(`✅ Connected in ${Date.now() - startConnect}ms`);
};

const User = require('../src/models/User');

async function testQuery(userId) {
  const start = Date.now();
  const user = await User.findOne({ telegramId: userId })
    .select('navigationStack currentScreen currentScreenData lastActivity mainMessageId')
    .lean();
  const duration = Date.now() - start;

  return { found: !!user, duration };
}

async function main() {
  await connectDB();

  // Get some user IDs
  const users = await User.find({}).select('telegramId').limit(5).lean();

  if (users.length === 0) {
    console.log('No users found');
    process.exit(0);
  }

  console.log(`\n📊 Testing queries for ${users.length} users...\n`);

  // Test 1: First query (cold)
  console.log('=== Test 1: Cold queries ===');
  for (const user of users) {
    const result = await testQuery(user.telegramId);
    console.log(`User ${user.telegramId}: ${result.duration}ms (found: ${result.found})`);
  }

  // Wait 2 seconds
  console.log('\n⏳ Waiting 2 seconds...\n');
  await new Promise(r => setTimeout(r, 2000));

  // Test 2: Warm queries
  console.log('=== Test 2: Warm queries ===');
  for (const user of users) {
    const result = await testQuery(user.telegramId);
    console.log(`User ${user.telegramId}: ${result.duration}ms (found: ${result.found})`);
  }

  // Wait 30 seconds
  console.log('\n⏳ Waiting 30 seconds (simulating idle)...\n');
  await new Promise(r => setTimeout(r, 30000));

  // Test 3: After idle
  console.log('=== Test 3: After 30s idle ===');
  for (const user of users) {
    const result = await testQuery(user.telegramId);
    console.log(`User ${user.telegramId}: ${result.duration}ms (found: ${result.found})`);
  }

  // Test 4: Parallel queries
  console.log('\n=== Test 4: Parallel queries ===');
  const parallelStart = Date.now();
  const results = await Promise.all(users.map(u => testQuery(u.telegramId)));
  const parallelTotal = Date.now() - parallelStart;
  console.log(`All ${users.length} queries completed in ${parallelTotal}ms`);
  results.forEach((r, i) => {
    console.log(`  User ${users[i].telegramId}: ${r.duration}ms`);
  });

  // Test 5: Connection state
  console.log('\n=== Connection State ===');
  console.log(`Ready state: ${mongoose.connection.readyState}`);
  console.log(`  0 = disconnected`);
  console.log(`  1 = connected`);
  console.log(`  2 = connecting`);
  console.log(`  3 = disconnecting`);

  console.log('\n✅ Tests completed');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
