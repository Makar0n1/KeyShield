/**
 * CLI bootstrap: create a manager account.
 *
 * Used to seed the very first manager (before the admin UI exists in your
 * deploy), or any time you'd rather make one from the shell than the web.
 *
 * Usage:
 *   node scripts/create-manager.js <username> [displayName]
 *
 * Prompts for a password (input is hidden). Refuses to create duplicates.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const connectDB = require('../src/config/database');
const Manager = require('../src/models/Manager');

function promptPassword(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Suppress echoed characters so the password isn't visible
    const stdin = process.openStdin();
    process.stdin.on('data', (char) => {
      char = char + '';
      switch (char) {
        case '\n': case '\r': case '':
          stdin.pause();
          break;
        default:
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(promptText + Array(rl.line.length + 1).join('*'));
          break;
      }
    });
    rl.question(promptText, (val) => { rl.close(); resolve(val); });
  });
}

async function main() {
  const [, , rawUsername, ...displayParts] = process.argv;
  if (!rawUsername) {
    console.error('Usage: node scripts/create-manager.js <username> [displayName]');
    process.exit(1);
  }
  const username = String(rawUsername).toLowerCase().trim();
  if (username.length < 3 || username.length > 32) {
    console.error('username must be 3..32 chars');
    process.exit(1);
  }
  const displayName = displayParts.join(' ').trim();

  await connectDB();
  console.log('📦 Connected to MongoDB');

  const existing = await Manager.findOne({ username }).lean();
  if (existing) {
    console.error(`❌ Manager @${username} already exists. Use admin UI to reset password.`);
    await mongoose.connection.close();
    process.exit(1);
  }

  const password = await promptPassword('Password (min 8 chars): ');
  console.log('');
  if (!password || password.length < 8) {
    console.error('❌ Password must be at least 8 characters');
    await mongoose.connection.close();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const manager = await Manager.create({
    username,
    passwordHash,
    displayName: displayName || '',
    createdBy: 'cli',
    active: true
  });

  console.log('');
  console.log('✅ Manager created');
  console.log(`   id:        ${manager._id}`);
  console.log(`   username:  @${manager.username}`);
  if (manager.displayName) console.log(`   display:   ${manager.displayName}`);
  console.log('');
  console.log(`👉 Login URL: <your-domain>/manager/login`);
  console.log('   Hand the password to the manager via a secure channel — it is NOT stored in plain text.');

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err.message);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
