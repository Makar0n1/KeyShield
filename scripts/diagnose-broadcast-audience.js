/**
 * Diagnose why a broadcast reached (or didn't reach) the audience you expected.
 *
 * Shows:
 *   - Total user count
 *   - Per-filter breakdown (blacklisted / no mainMessageId / inactive >30d / no languageCode / per-language)
 *   - Final eligible counts for each language target (matching what broadcastService actually sends to)
 *   - Optionally — full state of a specific user (pass telegramId as arg)
 *
 * Usage:
 *   node scripts/diagnose-broadcast-audience.js                # global breakdown
 *   node scripts/diagnose-broadcast-audience.js <telegramId>   # + per-user check
 */

require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = require('../src/config/database');
const User = require('../src/models/User');

async function main() {
  await connectDB();
  console.log('📦 Connected to MongoDB\n');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // 1. Global breakdown
  const total = await User.countDocuments();
  const blacklisted = await User.countDocuments({ blacklisted: true });
  const noMainMsg = await User.countDocuments({ $or: [{ mainMessageId: { $exists: false } }, { mainMessageId: null }] });
  const inactive = await User.countDocuments({ lastActivity: { $lt: thirtyDaysAgo } });
  const noLang = await User.countDocuments({ $or: [{ languageCode: { $exists: false } }, { languageCode: null }, { languageCode: '' }] });

  console.log('═══ Общая статистика ═══');
  console.log(`Всего юзеров в БД:                     ${total}`);
  console.log(`  · заблокированы (blacklisted):       ${blacklisted}`);
  console.log(`  · без mainMessageId:                 ${noMainMsg}`);
  console.log(`  · неактивны >30 дней:                ${inactive}`);
  console.log(`  · без languageCode (легаси):         ${noLang}`);

  // 2. Per-language breakdown of WHO matches each broadcast filter
  console.log('\n═══ Кто получит рассылку (по таргету) ═══');
  const baseFilter = {
    blacklisted: { $ne: true },
    mainMessageId: { $exists: true, $ne: null },
    lastActivity: { $gte: thirtyDaysAgo }
  };
  const allCount = await User.countDocuments(baseFilter);
  console.log(`🌍 Все языки (target='all'):           ${allCount}`);

  for (const lang of ['ru', 'en', 'uk']) {
    const count = await User.countDocuments({ ...baseFilter, languageCode: lang });
    console.log(`🏳  Только ${lang.toUpperCase()} (target='${lang}'):              ${count}`);
  }

  // 3. Per-user diagnostic
  const targetId = process.argv[2];
  if (targetId) {
    console.log(`\n═══ Состояние юзера ${targetId} ═══`);
    const u = await User.findOne({ telegramId: parseInt(targetId, 10) })
      .select('telegramId username languageCode languageSelected mainMessageId currentScreen lastActivity blacklisted botBlocked')
      .lean();

    if (!u) {
      console.log('❌ Юзер не найден в БД');
    } else {
      console.log(`telegramId:        ${u.telegramId}`);
      console.log(`username:          @${u.username || '(нет)'}`);
      console.log(`languageCode:      ${u.languageCode ?? '(null)'} ${u.languageSelected ? '✓ выбран' : '○ дефолт'}`);
      console.log(`mainMessageId:     ${u.mainMessageId ?? '(null)'}`);
      console.log(`currentScreen:     ${u.currentScreen ?? '(null)'}`);
      console.log(`lastActivity:      ${u.lastActivity?.toISOString() ?? '(null)'}`);
      console.log(`blacklisted:       ${u.blacklisted ? 'ДА' : 'нет'}`);
      console.log(`botBlocked:        ${u.botBlocked ? 'ДА' : 'нет'}`);

      // Check each filter
      console.log('\nПройдёт ли фильтры рассылки:');
      const checks = [
        ['blacklisted: false',             !u.blacklisted],
        ['mainMessageId не null',          !!u.mainMessageId],
        ['lastActivity в пределах 30 дней', u.lastActivity && u.lastActivity >= thirtyDaysAgo],
        ['languageCode = ru',               u.languageCode === 'ru'],
        ['languageCode = en',               u.languageCode === 'en'],
        ['languageCode = uk',               u.languageCode === 'uk'],
      ];
      for (const [name, pass] of checks) {
        console.log(`   ${pass ? '✅' : '❌'} ${name}`);
      }

      const wouldGetAll = !u.blacklisted && u.mainMessageId && u.lastActivity && u.lastActivity >= thirtyDaysAgo;
      console.log(`\n👉 Для рассылки target='all': ${wouldGetAll ? '✅ получит' : '❌ НЕ получит'}`);
      if (wouldGetAll && u.languageCode) {
        console.log(`👉 Для рассылки target='${u.languageCode}': ✅ получит`);
      } else if (!u.languageCode) {
        console.log(`👉 Для рассылки target=ru/en/uk: ❌ НЕ получит (нет languageCode — запусти backfill)`);
      }
    }
  } else {
    console.log('\n💡 Чтобы проверить КОНКРЕТНОГО юзера:');
    console.log('   node scripts/diagnose-broadcast-audience.js <твой_telegramId>');
  }

  await mongoose.connection.close();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\n❌ Failed:', err);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
