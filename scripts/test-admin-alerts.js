/**
 * Test script for Admin Alert Service
 * Run: node scripts/test-admin-alerts.js [command]
 *
 * Commands:
 *   report  - Send daily report
 *   user    - Test new user alert
 *   deal    - Test new deal alert
 *   all     - Send all test alerts
 */

require('dotenv').config();
const { Telegraf } = require('telegraf');

async function main() {
  const connectDB = require('../src/config/database');
  const adminAlertService = require('../src/services/adminAlertService');

  // Connect to DB
  await connectDB();
  console.log('✅ Connected to MongoDB');

  // Initialize bot for sending messages
  const bot = new Telegraf(process.env.BOT_TOKEN);
  adminAlertService.setBotInstance(bot);
  console.log(`✅ Bot initialized, admin ID: ${adminAlertService.adminId}`);

  const command = process.argv[2] || 'report';

  switch (command) {
    case 'report':
      console.log('\n📊 Sending daily report...');
      await adminAlertService.sendDailyReport();
      console.log('✅ Daily report sent!');
      break;

    case 'user':
      console.log('\n👤 Sending test user alert...');
      await adminAlertService.alertNewUser({
        telegramId: 123456789,
        username: 'test_user',
        platformCode: null
      });
      console.log('✅ User alert sent!');
      break;

    case 'deal':
      console.log('\n💼 Sending test deal alert...');
      await adminAlertService.alertNewDeal({
        dealId: 'DL-TEST01',
        productName: 'Тестовый товар',
        amount: 100,
        asset: 'USDT',
        commission: 15,
        buyerId: 111111111,
        sellerId: 222222222,
        platformCode: null
      });
      console.log('✅ Deal alert sent!');
      break;

    case 'deposit':
      console.log('\n💰 Sending test deposit alert...');
      await adminAlertService.alertDepositReceived({
        dealId: 'DL-TEST01',
        productName: 'Тестовый товар',
        amount: 100,
        asset: 'USDT'
      }, 100);
      console.log('✅ Deposit alert sent!');
      break;

    case 'payout':
      console.log('\n✅ Sending test payout alert...');
      await adminAlertService.alertPayoutCompleted({
        dealId: 'DL-TEST01',
        productName: 'Тестовый товар',
        asset: 'USDT'
      }, 85, 15, 'test_tx_hash_123', 'release');
      console.log('✅ Payout alert sent!');
      break;

    case 'dispute':
      console.log('\n⚠️ Sending test dispute alert...');
      await adminAlertService.alertDisputeOpened({
        dealId: 'DL-TEST01',
        productName: 'Тестовый товар',
        amount: 100,
        asset: 'USDT',
        buyerId: 111111111,
        sellerId: 222222222
      }, 111111111, 'Продавец не выполнил работу в срок, качество не соответствует описанию');
      console.log('✅ Dispute alert sent!');
      break;

    case 'error':
      console.log('\n🚨 Sending test error alert...');
      await adminAlertService.alertError('Test Context', new Error('This is a test error'));
      console.log('✅ Error alert sent!');
      break;

    case 'circuit':
      console.log('\n🔴 Sending test circuit breaker alert...');
      await adminAlertService.alertCircuitBreakerChange('TronGrid API', 'CLOSED', 'OPEN');
      await new Promise(r => setTimeout(r, 1000));
      await adminAlertService.alertCircuitBreakerChange('TronGrid API', 'OPEN', 'CLOSED');
      console.log('✅ Circuit breaker alerts sent!');
      break;

    case 'balance':
      console.log('\n⚠️ Sending test low balance alert...');
      await adminAlertService.alertLowBalance('Сервисный кошелёк', 45.5, 100);
      console.log('✅ Low balance alert sent!');
      break;

    case 'all':
      console.log('\n🔄 Sending ALL test alerts...\n');

      await adminAlertService.alertNewUser({ telegramId: 123456789, username: 'test_user' });
      console.log('✅ User alert');
      await new Promise(r => setTimeout(r, 500));

      await adminAlertService.alertNewDeal({
        dealId: 'DL-TEST01', productName: 'Тестовый товар',
        amount: 100, asset: 'USDT', commission: 15,
        buyerId: 111111111, sellerId: 222222222
      });
      console.log('✅ Deal alert');
      await new Promise(r => setTimeout(r, 500));

      await adminAlertService.alertDepositReceived({
        dealId: 'DL-TEST01', productName: 'Тестовый товар', amount: 100, asset: 'USDT'
      }, 100);
      console.log('✅ Deposit alert');
      await new Promise(r => setTimeout(r, 500));

      await adminAlertService.alertPayoutCompleted({
        dealId: 'DL-TEST01', productName: 'Тестовый товар', asset: 'USDT'
      }, 85, 15, 'test_tx_hash', 'release');
      console.log('✅ Payout alert');
      await new Promise(r => setTimeout(r, 500));

      await adminAlertService.alertDisputeOpened({
        dealId: 'DL-TEST01', productName: 'Тестовый товар', amount: 100, asset: 'USDT',
        buyerId: 111111111, sellerId: 222222222
      }, 111111111, 'Тестовая причина спора для проверки уведомлений');
      console.log('✅ Dispute alert');
      await new Promise(r => setTimeout(r, 500));

      await adminAlertService.sendDailyReport();
      console.log('✅ Daily report');

      console.log('\n🎉 All alerts sent!');
      break;

    default:
      console.log(`
Usage: node scripts/test-admin-alerts.js [command]

Commands:
  report   - Send daily system report
  user     - Test new user alert
  deal     - Test new deal alert
  deposit  - Test deposit received alert
  payout   - Test payout completed alert
  dispute  - Test dispute opened alert
  error    - Test error alert
  circuit  - Test circuit breaker alerts
  balance  - Test low balance alert
  all      - Send ALL test alerts
      `);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
