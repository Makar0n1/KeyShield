/**
 * Admin Alert Service
 * Sends real-time notifications to admin about important events
 */

const cron = require('node-cron');

class AdminAlertService {
  constructor() {
    this.adminId = parseInt(process.env.ADMIN_TELEGRAM_ID) || 8088233243;
    this.botInstance = null;
    this.isEnabled = true;

    // Track stats for daily report
    this.dailyStats = {
      newUsers: 0,
      newDeals: 0,
      completedDeals: 0,
      disputes: 0,
      expiredDeals: 0,
      totalPayouts: 0,
      totalCommission: 0,
      errors: [],
      lastReset: new Date()
    };
  }

  /**
   * Set bot instance for sending messages
   */
  setBotInstance(bot) {
    this.botInstance = bot;
    console.log(`✅ AdminAlertService initialized for admin ID: ${this.adminId}`);

    // Start daily report cron job (every day at 09:00 Moscow time)
    this.startDailyReport();
  }

  /**
   * Send message to admin
   */
  async sendAlert(text, options = {}) {
    if (!this.botInstance || !this.isEnabled) {
      console.log('⚠️ AdminAlertService: Bot not ready or disabled');
      return false;
    }

    try {
      await this.botInstance.telegram.sendMessage(this.adminId, text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        ...options
      });
      return true;
    } catch (error) {
      console.error('❌ Failed to send admin alert:', error.message);
      return false;
    }
  }

  // ============================================
  // USER EVENTS
  // ============================================

  /**
   * New user registered
   */
  async alertNewUser(user) {
    this.dailyStats.newUsers++;

    const text = `👤 *Новый пользователь!*

🆔 ID: \`${user.telegramId}\`
👤 Username: ${user.username ? '@' + user.username : 'не указан'}
📅 Дата: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
${user.platformCode ? `🏷 Платформа: ${user.platformCode}` : ''}`;

    await this.sendAlert(text);
  }

  // ============================================
  // DEAL EVENTS
  // ============================================

  /**
   * New deal created
   */
  async alertNewDeal(deal) {
    this.dailyStats.newDeals++;

    const text = `💼 *Новая сделка!*

🆔 ID: \`${deal.dealId}\`
📦 ${deal.productName}
💰 Сумма: *${deal.amount} ${deal.asset}*
💵 Комиссия: ${deal.commission} ${deal.asset}

👤 Покупатель: \`${deal.buyerId}\`
👤 Продавец: \`${deal.sellerId}\`
${deal.platformCode ? `🏷 Платформа: ${deal.platformCode}` : ''}

📅 ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`;

    await this.sendAlert(text);
  }

  /**
   * Deposit received
   */
  async alertDepositReceived(deal, depositAmount) {
    const text = `💰 *Депозит получен!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}
💸 Депозит: *${depositAmount} ${deal.asset}*
💰 Сумма сделки: ${deal.amount} ${deal.asset}

🔒 Средства заблокированы в мультисиг`;

    await this.sendAlert(text);
  }

  // ============================================
  // PAYOUT EVENTS
  // ============================================

  /**
   * Payout completed (seller received funds)
   */
  async alertPayoutCompleted(deal, amount, commission, txHash, type = 'release') {
    this.dailyStats.completedDeals++;
    this.dailyStats.totalPayouts += amount;
    this.dailyStats.totalCommission += commission;

    const typeEmoji = type === 'release' ? '✅' : type === 'refund' ? '↩️' : '⚖️';
    const typeText = type === 'release' ? 'Выплата продавцу' : type === 'refund' ? 'Возврат покупателю' : 'Выплата по спору';

    const text = `${typeEmoji} *${typeText}!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

💸 Выплачено: *${amount.toFixed(2)} ${deal.asset}*
💵 Комиссия: *${commission.toFixed(2)} ${deal.asset}*

🔗 [Транзакция](https://tronscan.org/#/transaction/${txHash})`;

    await this.sendAlert(text);
  }

  // ============================================
  // DISPUTE EVENTS
  // ============================================

  /**
   * Dispute opened
   */
  async alertDisputeOpened(deal, openedBy, reason) {
    this.dailyStats.disputes++;

    const roleText = openedBy === deal.buyerId ? 'Покупатель' : 'Продавец';

    const text = `⚠️ *СПОР ОТКРЫТ!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}
💰 Сумма: ${deal.amount} ${deal.asset}

👤 Открыл: ${roleText} (\`${openedBy}\`)
📝 Причина: ${reason.substring(0, 200)}${reason.length > 200 ? '...' : ''}

⚡️ Требуется решение арбитра!`;

    await this.sendAlert(text);
  }

  /**
   * Dispute resolved
   */
  async alertDisputeResolved(deal, winner, loser) {
    const winnerRole = winner === deal.buyerId ? 'Покупатель' : 'Продавец';

    const text = `⚖️ *Спор решён!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}

🏆 Победитель: ${winnerRole} (\`${winner}\`)
❌ Проигравший: \`${loser}\``;

    await this.sendAlert(text);
  }

  // ============================================
  // DEADLINE EVENTS
  // ============================================

  /**
   * Deadline expired
   */
  async alertDeadlineExpired(deal) {
    this.dailyStats.expiredDeals++;

    const text = `⏰ *Дедлайн истёк!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}
💰 Сумма: ${deal.amount} ${deal.asset}
📊 Статус: ${deal.status}

⏳ Grace period: 12 часов
🔄 Авто-действие после grace period`;

    await this.sendAlert(text);
  }

  /**
   * Auto-refund/release triggered
   */
  async alertAutoAction(deal, action) {
    const actionText = action === 'refund' ? 'Автовозврат покупателю' : 'Авто-выплата продавцу';

    const text = `🔄 *${actionText}!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${deal.productName}
💰 Сумма: ${deal.amount} ${deal.asset}

⚡️ Запрошен ключ для выплаты`;

    await this.sendAlert(text);
  }

  // ============================================
  // SYSTEM EVENTS
  // ============================================

  /**
   * Circuit breaker state change
   */
  async alertCircuitBreakerChange(serviceName, oldState, newState) {
    const emoji = newState === 'OPEN' ? '🔴' : newState === 'HALF_OPEN' ? '🟡' : '🟢';

    const text = `${emoji} *CircuitBreaker: ${serviceName}*

📊 ${oldState} → *${newState}*
📅 ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}

${newState === 'OPEN' ? '⚠️ Сервис временно недоступен!' : '✅ Сервис восстановлен'}`;

    await this.sendAlert(text);
  }

  /**
   * Low TRX balance warning
   */
  async alertLowBalance(walletName, balance, threshold) {
    const text = `⚠️ *Низкий баланс TRX!*

💼 Кошелёк: ${walletName}
💰 Баланс: *${balance.toFixed(2)} TRX*
⚠️ Порог: ${threshold} TRX

⚡️ Требуется пополнение!`;

    await this.sendAlert(text);
  }

  /**
   * Critical error occurred
   */
  async alertError(context, error) {
    this.dailyStats.errors.push({
      context,
      error: error.message,
      time: new Date()
    });

    const text = `🚨 *ОШИБКА!*

📍 Контекст: ${context}
❌ Ошибка: ${error.message}
📅 ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`;

    await this.sendAlert(text);
  }

  // ============================================
  // DAILY REPORT
  // ============================================

  /**
   * Start daily report cron job
   */
  startDailyReport() {
    // Run every day at 09:00 Moscow time (06:00 UTC)
    cron.schedule('0 6 * * *', async () => {
      await this.sendDailyReport();
    });

    console.log('📊 Daily report scheduled for 09:00 Moscow time');
  }

  /**
   * Send daily system health report
   */
  async sendDailyReport() {
    try {
      const Deal = require('../models/Deal');
      const User = require('../models/User');
      const blockchainService = require('./blockchain');
      const feesaverService = require('./feesaver');
      const depositMonitor = require('./depositMonitor');
      const deadlineMonitor = require('./deadlineMonitor');

      // Get current stats from DB
      const [
        totalUsers,
        totalDeals,
        activeDeals,
        lockedDeals,
        disputeDeals,
        completedDeals
      ] = await Promise.all([
        User.countDocuments(),
        Deal.countDocuments(),
        Deal.countDocuments({ status: { $in: ['waiting_for_deposit', 'locked', 'in_progress'] } }),
        Deal.countDocuments({ status: 'locked' }),
        Deal.countDocuments({ status: 'dispute' }),
        Deal.countDocuments({ status: 'completed' })
      ]);

      // Get TRX balances
      let arbiterBalance = 0;
      let feesaverBalance = 0;

      try {
        const arbiterAddress = process.env.ARBITER_ADDRESS;
        if (arbiterAddress) {
          arbiterBalance = await blockchainService.getBalance(arbiterAddress, 'TRX');
        }
      } catch (e) {
        arbiterBalance = -1; // Error indicator
      }

      try {
        if (feesaverService.isEnabled()) {
          const balanceData = await feesaverService.checkBalance();
          // API returns balance_trx field
          feesaverBalance = balanceData.balance_trx || balanceData.balance || 0;
        }
      } catch (e) {
        console.error('Error getting FeeSaver balance:', e.message);
        feesaverBalance = -1; // Error indicator
      }

      // Check services status
      const depositMonitorStatus = depositMonitor.isRunning ? '🟢' : '🔴';
      const deadlineMonitorStatus = deadlineMonitor.isRunning ? '🟢' : '🔴';
      const feesaverStatus = feesaverService.isEnabled() ? '🟢' : '🟡';

      // Calculate estimated deals remaining
      const totalTrx = arbiterBalance + feesaverBalance;
      const estimatedDeals = Math.floor(totalTrx / 9);

      const text = `📊 *ЕЖЕДНЕВНЫЙ ОТЧЁТ*
━━━━━━━━━━━━━━━━━━━━

📅 ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}

*📈 СТАТИСТИКА ЗА 24 ЧАСА:*
👤 Новых пользователей: ${this.dailyStats.newUsers}
💼 Новых сделок: ${this.dailyStats.newDeals}
✅ Завершённых сделок: ${this.dailyStats.completedDeals}
⚠️ Споров: ${this.dailyStats.disputes}
⏰ Просроченных: ${this.dailyStats.expiredDeals}
💰 Выплачено: ${this.dailyStats.totalPayouts.toFixed(2)} USDT
💵 Комиссия: ${this.dailyStats.totalCommission.toFixed(2)} USDT
${this.dailyStats.errors.length > 0 ? `🚨 Ошибок: ${this.dailyStats.errors.length}` : ''}

*📊 ОБЩАЯ СТАТИСТИКА:*
👥 Всего пользователей: ${totalUsers}
💼 Всего сделок: ${totalDeals}
🔄 Активных сделок: ${activeDeals}
🔒 В статусе locked: ${lockedDeals}
⚖️ Споров: ${disputeDeals}
✅ Завершено: ${completedDeals}

*💰 БАЛАНСЫ:*
🏦 Сервисный кошелёк: ${arbiterBalance >= 0 ? arbiterBalance.toFixed(2) + ' TRX' : '❌ ошибка'}
🔋 FeeSaver: ${feesaverBalance >= 0 ? feesaverBalance.toFixed(2) + ' TRX' : '❌ ошибка'}
📊 Всего: ${totalTrx >= 0 ? totalTrx.toFixed(2) + ' TRX' : '—'}
📈 Хватит на: ~${estimatedDeals} сделок

*🔧 СЕРВИСЫ:*
${depositMonitorStatus} Deposit Monitor
${deadlineMonitorStatus} Deadline Monitor
${feesaverStatus} FeeSaver

━━━━━━━━━━━━━━━━━━━━
🛡 KeyShield Escrow Bot`;

      await this.sendAlert(text);

      // Reset daily stats
      this.dailyStats = {
        newUsers: 0,
        newDeals: 0,
        completedDeals: 0,
        disputes: 0,
        expiredDeals: 0,
        totalPayouts: 0,
        totalCommission: 0,
        errors: [],
        lastReset: new Date()
      };

      console.log('📊 Daily report sent successfully');

      // Check for low balance warning
      if (totalTrx < 100 && totalTrx >= 0) {
        await this.alertLowBalance('Общий баланс', totalTrx, 100);
      }

    } catch (error) {
      console.error('Error sending daily report:', error);
      await this.alertError('Daily Report', error);
    }
  }

  /**
   * Send immediate system status (can be triggered manually)
   */
  async sendSystemStatus() {
    await this.sendDailyReport();
  }
}

// Export singleton instance
module.exports = new AdminAlertService();
