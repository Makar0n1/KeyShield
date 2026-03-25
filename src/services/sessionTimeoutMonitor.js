/**
 * Session Timeout Monitor
 *
 * Monitors user sessions and handles timeouts for various flows:
 * - receipt_email: Skip receipt, proceed to rating or final message
 * - deal_rating: Skip rating, show final message
 * - my_data: Return to My Data screen
 * - provide_wallet: Return to deal details
 * - dispute: Return to deal details
 * - referral: Return to referrals menu
 *
 * Note: create_deal sessions are handled by abandonedDealMonitor
 */

const Session = require('../models/Session');
const User = require('../models/User');
const Deal = require('../models/Deal');
const ServiceStatus = require('../models/ServiceStatus');
const messageManager = require('../bot/utils/messageManager');
const { Markup } = require('telegraf');

const SERVICE_NAME = 'SessionTimeoutMonitor';

// Session timeout configuration (in milliseconds)
const TIMEOUTS = {
  'receipt_email': 3 * 60 * 1000,   // 3 minutes
  'deal_rating': 3 * 60 * 1000,     // 3 minutes
  'my_data': 5 * 60 * 1000,         // 5 minutes
  'provide_wallet': 5 * 60 * 1000,  // 5 minutes
  'dispute': 10 * 60 * 1000,        // 10 minutes
  'referral': 5 * 60 * 1000,        // 5 minutes
  'deal_template': 5 * 60 * 1000    // 5 minutes
};

// Session types to monitor (excluding create_deal - handled by abandonedDealMonitor)
const MONITORED_TYPES = Object.keys(TIMEOUTS);

class SessionTimeoutMonitor {
  constructor() {
    this.isRunning = false;
    this.isChecking = false;
    this.interval = null;
    this.botInstance = null;

    // Check every 30 seconds
    this.CHECK_INTERVAL = 30 * 1000;

    // Batch settings
    this.BATCH_SIZE = 20;
    this.BATCH_DELAY = 300; // 300ms between batches
  }

  /**
   * Set bot instance for sending notifications
   */
  setBotInstance(bot) {
    this.botInstance = bot;
  }

  /**
   * Start monitoring
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Session timeout monitor already running');
      return;
    }

    console.log('✅ Starting session timeout monitor...');
    this.isRunning = true;

    try {
      await ServiceStatus.markStarted(SERVICE_NAME);
    } catch (e) {
      console.error('Failed to update service status:', e.message);
    }

    // Run immediately
    this.checkTimeouts();

    // Then run on interval
    this.interval = setInterval(() => {
      this.checkTimeouts();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop monitoring
   */
  async stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;

    try {
      await ServiceStatus.markStopped(SERVICE_NAME);
    } catch (e) {
      console.error('Failed to update service status:', e.message);
    }

    console.log('⛔ Session timeout monitor stopped');
  }

  /**
   * Check for timed out sessions
   */
  async checkTimeouts() {
    if (this.isChecking || !this.botInstance) return;
    this.isChecking = true;

    try {
      const now = Date.now();
      let processedCount = 0;

      // Check each session type
      for (const sessionType of MONITORED_TYPES) {
        const timeout = TIMEOUTS[sessionType];

        // Find sessions that have been inactive longer than timeout
        const cutoffTime = new Date(now - timeout);

        const sessions = await Session.find({
          type: sessionType,
          updatedAt: { $lt: cutoffTime },
          expiresAt: { $gt: new Date() } // Not yet expired by TTL
        }).lean();

        if (sessions.length === 0) continue;

        // Process in batches
        for (let i = 0; i < sessions.length; i += this.BATCH_SIZE) {
          const batch = sessions.slice(i, i + this.BATCH_SIZE);

          for (const session of batch) {
            const handled = await this.handleTimeout(sessionType, session);
            if (handled) processedCount++;
          }

          // Delay between batches
          if (i + this.BATCH_SIZE < sessions.length) {
            await this.sleep(this.BATCH_DELAY);
          }
        }
      }

      if (processedCount > 0) {
        console.log(`⏰ Session timeout monitor: processed ${processedCount} timeouts`);
      }

      // Update heartbeat
      try {
        await ServiceStatus.heartbeat(SERVICE_NAME, { processed: processedCount });
      } catch (e) { /* ignore */ }

    } catch (error) {
      console.error('❌ Error in session timeout check:', error);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Handle a single timed out session
   */
  async handleTimeout(sessionType, session) {
    const telegramId = session.telegramId;

    try {
      switch (sessionType) {
        case 'receipt_email':
          return await this.handleReceiptEmailTimeout(telegramId, session);
        case 'deal_rating':
          return await this.handleDealRatingTimeout(telegramId, session);
        case 'my_data':
          return await this.handleMyDataTimeout(telegramId, session);
        case 'provide_wallet':
          return await this.handleProvideWalletTimeout(telegramId, session);
        case 'dispute':
          return await this.handleDisputeTimeout(telegramId, session);
        case 'referral':
          return await this.handleReferralTimeout(telegramId, session);
        case 'deal_template':
          return await this.handleDealTemplateTimeout(telegramId, session);
        default:
          return false;
      }
    } catch (error) {
      console.error(`Error handling ${sessionType} timeout for ${telegramId}:`, error.message);

      // Handle blocked bot
      if (this.isBotBlocked(error)) {
        await this.markBotBlocked(telegramId);
      }

      return false;
    }
  }

  /**
   * Handle receipt_email timeout - skip to rating or final message
   */
  async handleReceiptEmailTimeout(telegramId, session) {
    const data = session.data || {};

    // Delete session first
    await Session.deleteSession(telegramId, 'receipt_email');

    const user = await User.findOne({ telegramId }).select('mainMessageId').lean();
    if (!user || !user.mainMessageId) return false;

    // If there's rating data, show rating screen
    if (data.ratingData) {
      const deal = await Deal.findOne({ dealId: data.dealId });
      if (deal) {
        // Import rating handler dynamically to avoid circular deps
        const { showRatingScreen } = require('../bot/handlers/ratingHandler');

        // Create minimal ctx for showRatingScreen
        const ctx = {
          from: { id: telegramId },
          telegram: this.botInstance.telegram,
          answerCbQuery: async () => {}
        };

        await showRatingScreen(
          ctx,
          telegramId,
          deal,
          data.ratingData.counterpartyId,
          data.ratingData.counterpartyRole,
          data.ratingData.counterpartyUsername,
          data.finalMessage
        );

        console.log(`⏰ Receipt email timeout for ${telegramId} - proceeded to rating`);
        return true;
      }
    }

    // No rating - show final message
    const { mainMenuButton } = require('../bot/keyboards/main');

    const finalText = data.finalMessage || '✅ Сделка завершена!';

    try {
      await this.botInstance.telegram.deleteMessage(telegramId, user.mainMessageId);
    } catch (e) { /* message already deleted */ }

    const keyboard = mainMenuButton();
    const newMsg = await this.botInstance.telegram.sendMessage(telegramId, finalText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });

    await User.updateOne({ telegramId }, {
      $set: {
        mainMessageId: newMsg.message_id,
        currentScreen: 'deal_completed',
        currentScreenData: { text: finalText, keyboard: keyboard.reply_markup },
        lastActivity: new Date()
      }
    });

    console.log(`⏰ Receipt email timeout for ${telegramId} - showed final message`);
    return true;
  }

  /**
   * Handle deal_rating timeout - skip to final message
   */
  async handleDealRatingTimeout(telegramId, session) {
    const data = session.data || {};

    // Delete session
    await Session.deleteSession(telegramId, 'deal_rating');

    const user = await User.findOne({ telegramId }).select('mainMessageId').lean();
    if (!user || !user.mainMessageId) return false;

    const { mainMenuButton } = require('../bot/keyboards/main');

    // Show final message (no extra text about timeout - just the final message)
    const finalText = data.finalMessage || '✅ Сделка завершена!';

    try {
      await this.botInstance.telegram.deleteMessage(telegramId, user.mainMessageId);
    } catch (e) { /* message already deleted */ }

    const keyboard = mainMenuButton();
    const newMsg = await this.botInstance.telegram.sendMessage(telegramId, finalText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });

    await User.updateOne({ telegramId }, {
      $set: {
        mainMessageId: newMsg.message_id,
        currentScreen: 'deal_completed',
        currentScreenData: { text: finalText, keyboard: keyboard.reply_markup },
        lastActivity: new Date()
      }
    });

    console.log(`⏰ Deal rating timeout for ${telegramId} - showed final message`);
    return true;
  }

  /**
   * Handle my_data timeout - return to My Data screen
   */
  async handleMyDataTimeout(telegramId, session) {
    // Delete session
    await Session.deleteSession(telegramId, 'my_data');

    const user = await User.findOne({ telegramId }).select('mainMessageId email wallets averageRating ratingsCount').lean();
    if (!user || !user.mainMessageId) return false;

    const { myDataMenuKeyboard } = require('../bot/keyboards/main');

    // Build My Data screen
    const wallets = user.wallets || [];
    const email = user.email;

    let emailDisplay = '_Не указан_';
    if (email) {
      emailDisplay = `\`${email}\``;
    }

    let walletsDisplay = '_Нет сохранённых кошельков_';
    if (wallets.length > 0) {
      walletsDisplay = wallets.map((w, i) => {
        const name = w.name || `Кошелёк ${i + 1}`;
        const shortAddr = w.address.slice(0, 6) + '...' + w.address.slice(-4);
        return `• ${name}: \`${shortAddr}\``;
      }).join('\n');
    }

    // Get rating display
    const User = require('../models/User');
    const ratingDisplay = user.ratingsCount > 0
      ? `⭐ ${user.averageRating} (${user.ratingsCount})`
      : 'Нет отзывов';

    const text = `⏰ _Время ожидания ввода истекло._

👤 *Мои данные*

⭐ *Ваш рейтинг:*
${ratingDisplay}

📧 *Email для чеков:*
${emailDisplay}

💳 *Сохранённые кошельки (${wallets.length}/5):*
${walletsDisplay}

_Выберите раздел для редактирования:_`;

    try {
      await this.botInstance.telegram.deleteMessage(telegramId, user.mainMessageId);
    } catch (e) { /* message already deleted */ }

    const keyboard = myDataMenuKeyboard(!!email, wallets.length);
    const newMsg = await this.botInstance.telegram.sendMessage(telegramId, text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });

    await User.updateOne({ telegramId }, {
      $set: {
        mainMessageId: newMsg.message_id,
        currentScreen: 'my_data',
        currentScreenData: { text, keyboard: keyboard.reply_markup },
        lastActivity: new Date()
      }
    });

    console.log(`⏰ My data timeout for ${telegramId} - returned to My Data`);
    return true;
  }

  /**
   * Handle provide_wallet timeout - return to deal details
   */
  async handleProvideWalletTimeout(telegramId, session) {
    const data = session.data || {};

    // Delete session
    await Session.deleteSession(telegramId, 'provide_wallet');

    const user = await User.findOne({ telegramId }).select('mainMessageId pendingDealId').lean();
    if (!user || !user.mainMessageId) return false;

    // Clear pending data from user
    await User.updateOne({ telegramId }, { $unset: { pendingDealId: 1, pendingWallet: 1 } });

    // Try to find the deal to show details
    const dealId = data.dealId || user.pendingDealId;

    if (dealId) {
      const deal = await Deal.findOne({ dealId });
      if (deal) {
        // Show timeout message with option to return to deal
        const text = `⏰ *Время на ввод кошелька истекло*

🆔 Сделка: \`${dealId}\`
📦 ${deal.productName}

Вы можете вернуться и ввести кошелёк позже.`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('📋 К сделке', `deal:${dealId}`)],
          [Markup.button.callback('🏠 Главное меню', 'main_menu')]
        ]);

        try {
          await this.botInstance.telegram.deleteMessage(telegramId, user.mainMessageId);
        } catch (e) { /* message already deleted */ }

        const newMsg = await this.botInstance.telegram.sendMessage(telegramId, text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });

        await User.updateOne({ telegramId }, {
          $set: {
            mainMessageId: newMsg.message_id,
            currentScreen: 'wallet_timeout',
            currentScreenData: { text, keyboard: keyboard.reply_markup },
            lastActivity: new Date()
          }
        });

        console.log(`⏰ Provide wallet timeout for ${telegramId} - deal ${dealId}`);
        return true;
      }
    }

    // No deal found - show main menu
    return await this.showMainMenu(telegramId, user.mainMessageId);
  }

  /**
   * Handle dispute timeout - return to deal details
   */
  async handleDisputeTimeout(telegramId, session) {
    const data = session.data || {};

    // Delete session
    await Session.deleteSession(telegramId, 'dispute');

    const user = await User.findOne({ telegramId }).select('mainMessageId').lean();
    if (!user || !user.mainMessageId) return false;

    const dealId = data.dealId;

    if (dealId) {
      const deal = await Deal.findOne({ dealId });
      if (deal) {
        const text = `⏰ *Время на оформление спора истекло*

🆔 Сделка: \`${dealId}\`
📦 ${deal.productName}

Если проблема не решена, вы можете открыть спор позже.`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('📋 К сделке', `deal:${dealId}`)],
          [Markup.button.callback('🏠 Главное меню', 'main_menu')]
        ]);

        try {
          await this.botInstance.telegram.deleteMessage(telegramId, user.mainMessageId);
        } catch (e) { /* message already deleted */ }

        const newMsg = await this.botInstance.telegram.sendMessage(telegramId, text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });

        await User.updateOne({ telegramId }, {
          $set: {
            mainMessageId: newMsg.message_id,
            currentScreen: 'dispute_timeout',
            currentScreenData: { text, keyboard: keyboard.reply_markup },
            lastActivity: new Date()
          }
        });

        console.log(`⏰ Dispute timeout for ${telegramId} - deal ${dealId}`);
        return true;
      }
    }

    // No deal found - show main menu
    return await this.showMainMenu(telegramId, user.mainMessageId);
  }

  /**
   * Handle referral timeout - return to referrals menu
   */
  async handleReferralTimeout(telegramId, session) {
    // Delete session
    await Session.deleteSession(telegramId, 'referral');

    const user = await User.findOne({ telegramId })
      .select('mainMessageId referralBalance referralTotalEarned referralWithdrawnTotal referralStats referralCode')
      .lean();

    if (!user || !user.mainMessageId) return false;

    const balance = user.referralBalance || 0;
    const totalEarned = user.referralTotalEarned || 0;
    const withdrawn = user.referralWithdrawnTotal || 0;
    const totalInvited = user.referralStats?.totalInvited || 0;
    const activeReferrals = user.referralStats?.activeReferrals || 0;

    const canWithdraw = balance >= 10;
    const hasBalance = balance > 0;

    const text = `⏰ _Время на ввод адреса истекло._

🎁 *Реферальная программа*

Приглашай друзей и получай *10%* от комиссии сервиса с каждой их сделки!

━━━━━━━━━━━━━━━━━━━━━━
💰 *Баланс:* ${balance.toFixed(2)} USDT
📊 *Всего заработано:* ${totalEarned.toFixed(2)} USDT
💸 *Выведено:* ${withdrawn.toFixed(2)} USDT
━━━━━━━━━━━━━━━━━━━━━━
👥 *Приглашено:* ${totalInvited}
✅ *Активных:* ${activeReferrals}
━━━━━━━━━━━━━━━━━━━━━━

_Минимальная сумма для вывода: 10 USDT_`;

    // Build keyboard
    const buttons = [];
    buttons.push([Markup.button.callback('🔗 Моя ссылка', 'referral:link')]);
    buttons.push([Markup.button.callback('👥 Мои рефералы', 'referral:list')]);
    buttons.push([Markup.button.callback('📊 История начислений', 'referral:history')]);

    if (hasBalance) {
      if (canWithdraw) {
        buttons.push([Markup.button.callback('💸 Вывести баланс', 'referral:withdraw')]);
      } else {
        buttons.push([Markup.button.callback('💸 Вывести (мин. 10$)', 'referral:withdraw_info')]);
      }
    }

    buttons.push([Markup.button.callback('⬅️ Назад', 'main_menu')]);

    const keyboard = Markup.inlineKeyboard(buttons);

    try {
      await this.botInstance.telegram.deleteMessage(telegramId, user.mainMessageId);
    } catch (e) { /* message already deleted */ }

    const newMsg = await this.botInstance.telegram.sendMessage(telegramId, text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });

    await User.updateOne({ telegramId }, {
      $set: {
        mainMessageId: newMsg.message_id,
        currentScreen: 'referrals',
        currentScreenData: { text, keyboard: keyboard.reply_markup },
        lastActivity: new Date()
      }
    });

    console.log(`⏰ Referral timeout for ${telegramId} - returned to referrals`);
    return true;
  }

  /**
   * Handle deal_template timeout - return to templates list
   */
  async handleDealTemplateTimeout(telegramId, session) {
    const data = session.data || {};

    // Delete session
    await Session.deleteSession(telegramId, 'deal_template');

    const user = await User.findOne({ telegramId }).select('mainMessageId').lean();
    if (!user || !user.mainMessageId) return false;

    const DealTemplate = require('../models/DealTemplate');
    const { templatesListKeyboard, templatesEmptyKeyboard } = require('../bot/keyboards/templates');

    // Get user's templates
    const templates = await DealTemplate.getUserTemplates(telegramId);
    const canCreate = await DealTemplate.canCreateTemplate(telegramId);

    let text;
    let keyboard;

    if (templates.length === 0) {
      text = `⏰ _Время ожидания ввода истекло._

📑 *Мои шаблоны*

_У вас пока нет сохранённых шаблонов._

Шаблоны позволяют создавать сделки в 2 клика!`;

      keyboard = templatesEmptyKeyboard();
    } else {
      text = `⏰ _Время ожидания ввода истекло._

📑 *Мои шаблоны* (${templates.length}/5)\n\n`;

      templates.forEach((tpl, i) => {
        const roleIcon = tpl.creatorRole === 'buyer' ? '💵' : '🛠';
        text += `${i + 1}. ${roleIcon} *${tpl.name}*\n`;
        text += `   ${tpl.productName} • ${tpl.amount} ${tpl.asset}\n\n`;
      });

      text += `_Выберите шаблон для использования:_`;

      keyboard = templatesListKeyboard(templates, canCreate);
    }

    try {
      await this.botInstance.telegram.deleteMessage(telegramId, user.mainMessageId);
    } catch (e) { /* message already deleted */ }

    const newMsg = await this.botInstance.telegram.sendMessage(telegramId, text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });

    await User.updateOne({ telegramId }, {
      $set: {
        mainMessageId: newMsg.message_id,
        currentScreen: 'templates',
        currentScreenData: { text, keyboard: keyboard.reply_markup },
        lastActivity: new Date()
      }
    });

    console.log(`⏰ Deal template timeout for ${telegramId} - returned to templates`);
    return true;
  }

  /**
   * Show main menu as fallback
   */
  async showMainMenu(telegramId, mainMessageId) {
    const { MAIN_MENU_TEXT } = require('../bot/handlers/start');
    const { mainMenuKeyboard } = require('../bot/keyboards/main');

    const text = MAIN_MENU_TEXT;
    const keyboard = mainMenuKeyboard();

    try {
      await this.botInstance.telegram.deleteMessage(telegramId, mainMessageId);
    } catch (e) { /* message already deleted */ }

    const newMsg = await this.botInstance.telegram.sendMessage(telegramId, text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });

    await User.updateOne({ telegramId }, {
      $set: {
        mainMessageId: newMsg.message_id,
        currentScreen: 'main_menu',
        currentScreenData: { text, keyboard: keyboard.reply_markup },
        navigationStack: [],
        lastActivity: new Date()
      }
    });

    return true;
  }

  /**
   * Check if error indicates bot was blocked
   */
  isBotBlocked(error) {
    const desc = error.description || error.message || '';
    return (
      desc.includes('bot was blocked') ||
      desc.includes('chat not found') ||
      desc.includes('user is deactivated')
    );
  }

  /**
   * Mark bot as blocked for user
   */
  async markBotBlocked(telegramId) {
    await User.updateOne({ telegramId }, {
      $set: { botBlocked: true, botBlockedAt: new Date(), mainMessageId: null }
    });
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton
module.exports = new SessionTimeoutMonitor();
