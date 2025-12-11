/**
 * Test MongoDB Latency (Long-running)
 *
 * This script tests MongoDB response times to diagnose
 * slow callback query handling. Runs continuously with
 * tests at 30 seconds, 5 minutes, 30 minutes, and 1 hour intervals.
 *
 * Run: node scripts/test-db-latency.js
 * Or with PM2: pm2 start scripts/test-db-latency.js --name db-latency-test
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Time formatting helper
const formatTime = (ms) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`;
  return `${(ms / 3600000).toFixed(1)}h`;
};

const timestamp = () => new Date().toISOString().replace('T', ' ').substring(0, 19);

const connectDB = async () => {
  console.log(`[${timestamp()}] Connecting to MongoDB...`);
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

  console.log(`[${timestamp()}] ✅ Connected in ${Date.now() - startConnect}ms`);
};

const User = require('../src/models/User');

let testUsers = [];

async function testQuery(userId) {
  const start = Date.now();
  try {
    const user = await User.findOne({ telegramId: userId })
      .select('navigationStack currentScreen currentScreenData lastActivity mainMessageId')
      .lean();
    const duration = Date.now() - start;
    return { found: !!user, duration, error: null };
  } catch (error) {
    const duration = Date.now() - start;
    return { found: false, duration, error: error.message };
  }
}

async function runTestBatch(testName) {
  console.log(`\n[${timestamp()}] ========== ${testName} ==========`);
  console.log(`[${timestamp()}] Connection state: ${mongoose.connection.readyState} (1=connected)`);

  const results = [];

  for (const user of testUsers) {
    const result = await testQuery(user.telegramId);
    results.push(result);

    const status = result.error ? `❌ ERROR: ${result.error}` : `✅ ${result.duration}ms`;
    const warning = result.duration > 1000 ? ' ⚠️ SLOW!' : '';
    const critical = result.duration > 3000 ? ' 🔴 CRITICAL!' : '';

    console.log(`[${timestamp()}] User ${user.telegramId}: ${status}${warning}${critical}`);
  }

  // Summary
  const durations = results.filter(r => !r.error).map(r => r.duration);
  if (durations.length > 0) {
    const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
    const max = Math.max(...durations);
    const min = Math.min(...durations);
    console.log(`[${timestamp()}] 📊 Summary: avg=${avg}ms, min=${min}ms, max=${max}ms`);

    if (max > 3000) {
      console.log(`[${timestamp()}] 🔴 PROBLEM DETECTED: Max query time ${max}ms > 3000ms threshold`);
    }
  }

  return results;
}

async function main() {
  console.log(`[${timestamp()}] 🚀 MongoDB Latency Test (Long-running)`);
  console.log(`[${timestamp()}] This script will run tests at: 0s, 30s, 5min, 30min, 1h intervals`);
  console.log(`[${timestamp()}] Press Ctrl+C to stop\n`);

  await connectDB();

  // Get test users
  testUsers = await User.find({}).select('telegramId').limit(5).lean();

  if (testUsers.length === 0) {
    console.log(`[${timestamp()}] ❌ No users found in database`);
    process.exit(1);
  }

  console.log(`[${timestamp()}] Found ${testUsers.length} users for testing`);

  // Test schedule (delay in ms, test name)
  const schedule = [
    { delay: 0, name: 'Initial (cold start)' },
    { delay: 30 * 1000, name: 'After 30 seconds' },
    { delay: 5 * 60 * 1000, name: 'After 5 minutes' },
    { delay: 30 * 60 * 1000, name: 'After 30 minutes' },
    { delay: 60 * 60 * 1000, name: 'After 1 hour' },
  ];

  let totalWait = 0;

  for (let i = 0; i < schedule.length; i++) {
    const test = schedule[i];

    if (test.delay > 0) {
      const waitTime = test.delay - totalWait;
      console.log(`\n[${timestamp()}] ⏳ Waiting ${formatTime(waitTime)} until next test...`);

      // Show countdown every minute for long waits
      if (waitTime > 60000) {
        const intervals = Math.floor(waitTime / 60000);
        for (let j = 0; j < intervals; j++) {
          await new Promise(r => setTimeout(r, 60000));
          const remaining = waitTime - (j + 1) * 60000;
          if (remaining > 0) {
            console.log(`[${timestamp()}] ⏳ ${formatTime(remaining)} remaining...`);
          }
        }
        // Wait remaining time
        const remainingMs = waitTime % 60000;
        if (remainingMs > 0) {
          await new Promise(r => setTimeout(r, remainingMs));
        }
      } else {
        await new Promise(r => setTimeout(r, waitTime));
      }

      totalWait = test.delay;
    }

    await runTestBatch(test.name);
  }

  // Continue with hourly tests
  console.log(`\n[${timestamp()}] 🔄 Continuing with hourly tests...`);

  let hourCount = 2;
  while (true) {
    console.log(`\n[${timestamp()}] ⏳ Waiting 1 hour until next test...`);

    // Wait 1 hour with minute countdown
    for (let j = 0; j < 60; j++) {
      await new Promise(r => setTimeout(r, 60000));
      const remaining = (60 - j - 1) * 60000;
      if (remaining > 0 && (60 - j - 1) % 10 === 0) {
        console.log(`[${timestamp()}] ⏳ ${formatTime(remaining)} remaining...`);
      }
    }

    await runTestBatch(`After ${hourCount} hours`);
    hourCount++;
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n[${timestamp()}] 🛑 Received SIGINT, shutting down...`);
  mongoose.connection.close().then(() => {
    console.log(`[${timestamp()}] MongoDB connection closed`);
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log(`\n[${timestamp()}] 🛑 Received SIGTERM, shutting down...`);
  mongoose.connection.close().then(() => {
    console.log(`[${timestamp()}] MongoDB connection closed`);
    process.exit(0);
  });
});

main().catch(err => {
  console.error(`[${timestamp()}] ❌ Fatal error:`, err);
  process.exit(1);
});
