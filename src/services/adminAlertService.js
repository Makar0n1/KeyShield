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
   * Escape special Markdown characters for safe Telegram message
   * Handles: _ * [ ] ( ) ~ ` > # + - = | { } . ! \ and more
   */
  escapeMarkdown(text) {
    if (!text) return '';
    // Replace special characters with safe alternatives or remove them
    return String(text)
      .replace(/\\/g, '\\\\')  // Backslash first!
      .replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
      .slice(0, 100);  // Cap at 100 chars to prevent long entity errors
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

    const username = user.username ? '`@' + user.username + '`' : 'не указан';
    const platform = user.platformCode ? this.escapeMarkdown(user.platformCode) : null;

    const text = `👤 *Новый пользователь!*

🆔 ID: \`${user.telegramId}\`
👤 Username: ${username}
📅 Дата: ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}
${platform ? `🏷 Платформа: ${platform}` : ''}`;

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

    const productName = this.escapeMarkdown(deal.productName);
    const platform = deal.platformCode ? this.escapeMarkdown(deal.platformCode) : null;

    const text = `💼 *Новая сделка!*

🆔 ID: \`${deal.dealId}\`
📦 ${productName}
💰 Сумма: *${deal.amount} ${deal.asset}*
💵 Комиссия: ${deal.commission} ${deal.asset}

👤 Покупатель: \`${deal.buyerId}\`
👤 Продавец: \`${deal.sellerId}\`
${platform ? `🏷 Платформа: ${platform}` : ''}

📅 ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`;

    await this.sendAlert(text);
  }

  /**
   * Deposit received
   */
  async alertDepositReceived(deal, depositAmount) {
    const productName = this.escapeMarkdown(deal.productName);

    const text = `💰 *Депозит получен!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${productName}
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
    const productName = this.escapeMarkdown(deal.productName);

    const text = `${typeEmoji} *${typeText}!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${productName}

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
    const productName = this.escapeMarkdown(deal.productName);
    const escapedReason = this.escapeMarkdown(reason.substring(0, 200));

    const text = `⚠️ *СПОР ОТКРЫТ!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${productName}
💰 Сумма: ${deal.amount} ${deal.asset}

👤 Открыл: ${roleText} (\`${openedBy}\`)
📝 Причина: ${escapedReason}${reason.length > 200 ? '...' : ''}

⚡️ Требуется решение арбитра!`;

    await this.sendAlert(text);
  }

  /**
   * Dispute resolved
   */
  async alertDisputeResolved(deal, winner, loser) {
    const winnerRole = winner === deal.buyerId ? 'Покупатель' : 'Продавец';
    const productName = this.escapeMarkdown(deal.productName);

    const text = `⚖️ *Спор решён!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${productName}

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

    const productName = this.escapeMarkdown(deal.productName);

    const text = `⏰ *Дедлайн истёк!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${productName}
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
    const productName = this.escapeMarkdown(deal.productName);

    const text = `🔄 *${actionText}!*

🆔 Сделка: \`${deal.dealId}\`
📦 ${productName}
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

      // Get services status from DB (accurate across all processes)
      const ServiceStatus = require('../models/ServiceStatus');
      const allServices = await ServiceStatus.getAllStatus();

      // Build services status map
      const servicesMap = {};
      allServices.forEach(s => { servicesMap[s.serviceName] = s; });

      // Format service status line
      const formatServiceStatus = (name, fallbackEnabled = null) => {
        const service = servicesMap[name];
        if (!service) {
          // Service never registered - check fallback
          if (fallbackEnabled !== null) {
            return fallbackEnabled ? '🟡 ' + name + ' (не запущен)' : '⚪ ' + name + ' (отключён)';
          }
          return '⚪ ' + name + ' (нет данных)';
        }

        if (service.isHealthy) {
          const lastCheck = service.stats?.lastCheckAt
            ? new Date(service.stats.lastCheckAt).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' })
            : '';
          return `🟢 ${name}${lastCheck ? ' (' + lastCheck + ')' : ''}`;
        } else if (service.isStale) {
          return `🟡 ${name} (нет heartbeat >5 мин)`;
        } else {
          return `🔴 ${name} (остановлен)`;
        }
      };

      // Check blockchain service (CircuitBreaker state)
      const circuitBreakerState = blockchainService.circuitBreaker?.getState() || 'UNKNOWN';
      const cbEmoji = circuitBreakerState === 'CLOSED' ? '🟢' : circuitBreakerState === 'HALF_OPEN' ? '🟡' : '🔴';

      // Calculate estimated deals remaining
      const totalTrx = (arbiterBalance >= 0 ? arbiterBalance : 0) + (feesaverBalance >= 0 ? feesaverBalance : 0);
      const estimatedDeals = Math.floor(totalTrx / 9);

      // MongoDB connection status
      const mongoose = require('mongoose');
      const dbState = mongoose.connection.readyState;
      const dbStatus = dbState === 1 ? '🟢 MongoDB' : dbState === 2 ? '🟡 MongoDB (connecting)' : '🔴 MongoDB';

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
🏦 Сервис: ${arbiterBalance >= 0 ? arbiterBalance.toFixed(2) + ' TRX' : '❌ ошибка'}
🔋 FeeSaver: ${feesaverBalance >= 0 ? feesaverBalance.toFixed(2) + ' TRX' : '❌ ошибка'}
📊 Итого: ${totalTrx >= 0 ? totalTrx.toFixed(2) + ' TRX' : '—'}
📈 Хватит на: ~${estimatedDeals} сделок

*🔧 ИНФРАСТРУКТУРА:*
${dbStatus}
${cbEmoji} TronGrid API (${circuitBreakerState})
${formatServiceStatus('DepositMonitor')}
${formatServiceStatus('DeadlineMonitor')}
${feesaverService.isEnabled() ? '🟢' : '⚪'} FeeSaver${feesaverService.isEnabled() ? '' : ' (отключён)'}

*⚡ ОПЕРАЦИИ:*
${await this.formatOperationsStatus()}

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
   * Format operations status for daily report
   * Shows health of key bot operations (deal creation, payouts, deposits, etc.)
   */
  async formatOperationsStatus() {
    try {
      const ServiceStatus = require('../models/ServiceStatus');
      const operations = await ServiceStatus.getOperationsStatus();

      if (!operations || operations.length === 0) {
        return '📭 Нет данных об операциях';
      }

      const lines = [];
      const now = new Date();
      const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

      // Operation name translations
      const opNames = {
        'deal_created': 'Создание сделок',
        'deposit_received': 'Депозиты',
        'payout_completed': 'Выплаты',
        'blog_notification': 'Рассылка блога'
      };

      for (const op of operations) {
        const name = opNames[op.serviceName] || op.serviceName;
        // lastHeartbeat stores the time of last successful operation
        const lastSuccess = op.lastHeartbeat ? new Date(op.lastHeartbeat) : null;
        const lastError = op.lastErrorAt ? new Date(op.lastErrorAt) : null;

        let emoji = '⚪'; // No data
        let status = 'нет данных';

        if (lastSuccess) {
          if (lastSuccess >= oneDayAgo) {
            emoji = '🟢';
            status = this.formatTimeAgo(lastSuccess);
          } else if (lastSuccess >= oneWeekAgo) {
            emoji = '🟡';
            status = this.formatTimeAgo(lastSuccess);
          } else {
            emoji = '🟠';
            status = this.formatTimeAgo(lastSuccess);
          }
        }

        // Check for recent errors
        if (lastError && lastError >= oneDayAgo) {
          if (!lastSuccess || lastError > lastSuccess) {
            emoji = '🔴';
            status = `ошибка ${this.formatTimeAgo(lastError)}`;
          }
        }

        // Stats
        const successCount = op.successCount || 0;
        const failCount = op.failCount || 0;
        const statsText = failCount > 0
          ? `✅${successCount} ❌${failCount}`
          : `✅${successCount}`;

        lines.push(`${emoji} ${name}: ${status} (${statsText})`);
      }

      return lines.join('\n');
    } catch (error) {
      console.error('Error formatting operations status:', error);
      return '❌ Ошибка получения статуса операций';
    }
  }

  /**
   * Format time ago helper
   */
  formatTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    if (diffDays < 7) return `${diffDays} дн назад`;
    return date.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' });
  }

  /**
   * Send immediate system status (can be triggered manually)
   */
  async sendSystemStatus() {
    await this.sendDailyReport();
  }

  // ============================================
  // REFERRAL PROGRAM
  // ============================================

  /**
   * Alert about new referral withdrawal request
   */
  async alertReferralWithdrawal(withdrawal, user) {
    const username = user?.username ? '`@' + user.username + '`' : `ID: ${withdrawal.userId}`;
    const shortAddr = withdrawal.walletAddress.slice(0, 8) + '...' + withdrawal.walletAddress.slice(-6);

    const text = `💸 *Заявка на вывод рефералки*

📋 Номер: \`${withdrawal.withdrawalId}\`
👤 Пользователь: ${username}
💰 Сумма: *${withdrawal.amount.toFixed(2)} USDT*
📍 Кошелёк: \`${shortAddr}\`

👥 Приглашено: ${user?.referralStats?.totalInvited || 0}
✅ Активных: ${user?.referralStats?.activeReferrals || 0}
📊 Всего заработал: ${(user?.referralTotalEarned || 0).toFixed(2)} USDT

⏰ ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`;

    await this.sendAlert(text);
  }

  // ============================================
  // SECURITY EVENTS
  // ============================================

  /**
   * Security threat detected (SQL injection, XSS, code injection, etc.)
   */
  async alertSecurityThreat(threatType, username, telegramId, originalText) {
    const threatTypeEscaped = this.escapeMarkdown(threatType);
    const usernameEscaped = this.escapeMarkdown(username);
    const textEscaped = this.escapeMarkdown(originalText.slice(0, 80));

    const text = `🚨 *SECURITY THREAT DETECTED!*

🔒 Тип атаки: *${threatTypeEscaped}*
👤 Пользователь: \`@${usernameEscaped}\`
🆔 ID: \`${telegramId}\`
📝 Текст: \`${textEscaped}...\`

⏰ ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`;

    try {
      await this.sendAlert(text);
    } catch (error) {
      // If message parsing fails, try with even simpler format
      console.error(`[AdminAlert] Error sending rich alert: ${error.message}`);
      const fallbackText = `🚨 SECURITY THREAT: ${threatTypeEscaped} by @${usernameEscaped}`;
      await this.sendAlert(fallbackText);
    }
  }
}

// Export singleton instance
module.exports = new AdminAlertService();
