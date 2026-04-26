#!/usr/bin/env node

/**
 * Утилита для отправки одного payload'а
 *
 * Использование:
 *   node scripts/send-payload.js <BOT_TOKEN> <CHAT_ID> <PAYLOAD>
 *
 * Примеры:
 *   node scripts/send-payload.js "123:ABC" 987654321 '{"$ne": null}'
 *   node scripts/send-payload.js "123:ABC" 987654321 '; whoami'
 */

const TelegramBot = require('node-telegram-bot-api');

const args = process.argv.slice(2);

if (args.length < 3) {
  console.error('❌ Usage: node send-payload.js <BOT_TOKEN> <CHAT_ID> <PAYLOAD>');
  console.error('\nExamples:');
  console.error('  node send-payload.js "123:ABC" 987654321 \'{"$ne": null}\'');
  console.error('  node send-payload.js "123:ABC" 987654321 \'; whoami\'');
  process.exit(1);
}

const TOKEN = args[0];
const CHAT_ID = parseInt(args[1]);
const PAYLOAD = args.slice(2).join(' ');

if (!TOKEN || !CHAT_ID || !PAYLOAD) {
  console.error('❌ Invalid arguments');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN);

console.log(`🚀 Отправляю payload...\n`);
console.log(`📝 Payload: ${PAYLOAD}\n`);

bot.sendMessage(CHAT_ID, PAYLOAD, {
  parse_mode: 'HTML',
  disable_web_page_preview: true
})
  .then(() => {
    console.log(`✅ Отправлено успешно!`);
    console.log(`\n📋 Проверьте логи бота на наличие:`);
    console.log(`   - 🚨 [SECURITY] алертов`);
    console.log(`   - DETECTED threats\n`);
    process.exit(0);
  })
  .catch(err => {
    console.error(`❌ Ошибка: ${err.message}`);
    process.exit(1);
  });
