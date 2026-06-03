/**
 * One-time backfill: set languageCode='ru' for every legacy user that
 * doesn't have it (missing field, null, or empty string).
 *
 * KeyShield's primary audience is Russian-speaking and the User schema
 * already declares `default: 'ru'`, so semantically this is just bringing
 * old documents in line with the current default. After this runs, the
 * targeted broadcast filter (languageCode: 'ru') reaches everyone it should.
 *
 * Usage:
 *   node scripts/backfill-language-codes.js          # dry run (counts only)
 *   node scripts/backfill-language-codes.js --apply  # actually write
 */

require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = require('../src/config/database');
const User = require('../src/models/User');

const apply = process.argv.includes('--apply');

async function main() {
  await connectDB();
  console.log('📦 Connected to MongoDB\n');

  const missingFilter = {
    $or: [
      { languageCode: { $exists: false } },
      { languageCode: null },
      { languageCode: '' }
    ]
  };

  const total = await User.countDocuments();
  const missing = await User.countDocuments(missingFilter);

  console.log('Текущее состояние:');
  console.log(`   Всего пользователей:           ${total}`);
  console.log(`   Без languageCode (легаси):     ${missing}`);

  // Breakdown of users WITH languageCode by value (so you know what you're keeping)
  const byLang = await User.aggregate([
    { $match: { languageCode: { $in: ['ru', 'en', 'uk'] } } },
    { $group: { _id: '$languageCode', count: { $sum: 1 } } }
  ]);
  console.log('   С languageCode (по языкам):');
  for (const row of byLang) {
    console.log(`     · ${row._id}: ${row.count}`);
  }

  if (missing === 0) {
    console.log('\n✅ Нечего обновлять — у всех уже есть languageCode.');
    await mongoose.connection.close();
    process.exit(0);
  }

  if (!apply) {
    console.log(`\n💡 Это dry-run. Чтобы реально обновить ${missing} юзеров на languageCode='ru',`);
    console.log('   запусти:  node scripts/backfill-language-codes.js --apply');
    await mongoose.connection.close();
    process.exit(0);
  }

  console.log(`\n⏳ Обновляю ${missing} пользователей → languageCode='ru'...`);
  const result = await User.updateMany(missingFilter, { $set: { languageCode: 'ru' } });
  console.log(`✅ Готово. modifiedCount = ${result.modifiedCount}`);

  // Verify
  const remaining = await User.countDocuments(missingFilter);
  console.log(`   Осталось без languageCode: ${remaining}`);
  if (remaining > 0) {
    console.log('⚠️  Что-то не обновилось — проверьте логи.');
  }

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\n❌ Backfill failed:', err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
