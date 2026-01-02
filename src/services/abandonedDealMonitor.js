/**
 * Abandoned Deal Creation Monitor
 *
 * Monitors users who started creating a deal but didn't finish.
 * After 5 minutes of inactivity:
 * 1. Shows reminder with support links
 * 2. Buttons: "Continue" (back to their step), "Main Menu"
 * 3. If no action after another 5 minutes - auto-return to main menu
 */

const Session = require('../models/Session');
const User = require('../models/User');
const ServiceStatus = require('../models/ServiceStatus');
const messageManager = require('../bot/utils/messageManager');
const { Markup } = require('telegraf');

const SERVICE_NAME = 'AbandonedDealMonitor';

// Step labels for display
const STEP_LABELS = {
  'role_selection': 'выбор роли',
  'counterparty_username': 'ввод контрагента',
  'product_name': 'название товара',
  'description': 'описание',
  'asset_selection': 'выбор актива',
  'amount': 'ввод суммы',
  'commission_selection': 'выбор комиссии',
  'deadline_selection': 'выбор срока',
  'creator_wallet': 'ввод кошелька',
  'wallet_balance_warning': 'предупреждение о балансе',
  'wallet_name_input': 'название кошелька',
  'save_wallet_prompt': 'сохранение кошелька',
  'confirmation': 'подтверждение'
};

class AbandonedDealMonitor {
  constructor() {
    this.isRunning = false;
    this.isChecking = false;
    this.interval = null;
    this.botInstance = null;

    // Check every 1 minute
    this.CHECK_INTERVAL = 60 * 1000;

    // Time until first reminder (5 minutes)
    this.REMINDER_DELAY = 5 * 60 * 1000;

    // Time until auto-return to main menu (5 minutes after reminder)
    this.AUTO_RETURN_DELAY = 5 * 60 * 1000;

    // Batch settings
    this.BATCH_SIZE = 10;
    this.BATCH_DELAY = 500; // 500ms between batches
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
      console.log('⚠️ Abandoned deal monitor already running');
      return;
    }

    console.log('✅ Starting abandoned deal monitor...');
    this.isRunning = true;

    try {
      await ServiceStatus.markStarted(SERVICE_NAME);
    } catch (e) {
      console.error('Failed to update service status:', e.message);
    }

    // Run immediately
    this.checkAbandonedSessions();

    // Then run on interval
    this.interval = setInterval(() => {
      this.checkAbandonedSessions();
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

    console.log('⛔ Abandoned deal monitor stopped');
  }

  /**
   * Check for abandoned sessions
   */
  async checkAbandonedSessions() {
    if (this.isChecking || !this.botInstance) return;
    this.isChecking = true;

    try {
      const now = Date.now();

      // Find all create_deal sessions
      const sessions = await Session.find({
        type: 'create_deal',
        expiresAt: { $gt: new Date() } // Still valid (not expired by TTL)
      }).lean();

      if (sessions.length === 0) {
        return;
      }

      let remindedCount = 0;
      let autoReturnedCount = 0;

      for (let i = 0; i < sessions.length; i += this.BATCH_SIZE) {
        const batch = sessions.slice(i, i + this.BATCH_SIZE);

        for (const session of batch) {
          const result = await this.processSession(session, now);
          if (result === 'reminded') remindedCount++;
          if (result === 'auto_returned') autoReturnedCount++;
        }

        // Delay between batches
        if (i + this.BATCH_SIZE < sessions.length) {
          await this.sleep(this.BATCH_DELAY);
        }
      }

      if (remindedCount > 0 || autoReturnedCount > 0) {
        console.log(`📋 Abandoned deal check: reminded=${remindedCount}, auto_returned=${autoReturnedCount}`);
      }

      // Update heartbeat
      try {
        await ServiceStatus.heartbeat(SERVICE_NAME, {
          sessionsChecked: sessions.length,
          reminded: remindedCount,
          autoReturned: autoReturnedCount
        });
      } catch (e) { /* ignore */ }

    } catch (error) {
      console.error('❌ Error in abandoned deal check:', error);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Process a single session
   * @returns 'reminded' | 'auto_returned' | null
   */
  async processSession(session, now) {
    try {
      const telegramId = session.telegramId;
      const data = session.data || {};
      const updatedAt = new Date(session.updatedAt).getTime();

      // Skip if user is in the middle of typing (last update < 30 seconds ago)
      if (now - updatedAt < 30 * 1000) {
        return null;
      }

      // Check if reminder was already sent
      const reminderSentAt = data.reminderSentAt ? new Date(data.reminderSentAt).getTime() : null;

      if (reminderSentAt) {
        // Reminder was sent - check if we need to auto-return
        const timeSinceReminder = now - reminderSentAt;

        if (timeSinceReminder >= this.AUTO_RETURN_DELAY) {
          // Auto-return to main menu
          await this.autoReturnToMainMenu(telegramId, session);
          return 'auto_returned';
        }
        // Still waiting for user action
        return null;
      }

      // No reminder sent yet - check if it's time
      const timeSinceUpdate = now - updatedAt;

      if (timeSinceUpdate >= this.REMINDER_DELAY) {
        // Time to send reminder
        await this.sendReminder(telegramId, session);
        return 'reminded';
      }

      return null;
    } catch (error) {
      console.error(`Error processing session for ${session.telegramId}:`, error.message);
      return null;
    }
  }

  /**
   * Send reminder to user
   */
  async sendReminder(telegramId, session) {
    try {
      const data = session.data || {};
      const step = data.step || 'role_selection';
      const stepLabel = STEP_LABELS[step] || step;

      const text = `⏰ *Возникли сложности?*

Вы остановились на шаге: *${stepLabel}*

Если у вас возникли вопросы:
• Напишите в поддержку: @keyshield\\_support
• Инструкция на сайте: [keyshield.me/blog/keyshield-instruction-usdt-escrow](https://keyshield.me/blog/keyshield-instruction-usdt-escrow)

Продолжить создание сделки или вернуться в главное меню?`;

      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('▶️ Продолжить', 'abandoned_continue'),
          Markup.button.callback('🏠 Главное меню', 'abandoned_main_menu')
        ]
      ]);

      // Update session with reminderSentAt
      const newData = { ...data, reminderSentAt: new Date() };
      await Session.setSession(telegramId, 'create_deal', newData, 2);

      // Send notification (replaces current message)
      const user = await User.findOne({ telegramId }).select('mainMessageId navigationStack currentScreen currentScreenData').lean();
      if (!user || !user.mainMessageId) return;

      // Save current screen to stack if not already a reminder
      if (user.currentScreen !== 'abandoned_reminder' && user.currentScreenData?.text) {
        const newStack = [...(user.navigationStack || [])];
        newStack.push({
          screen: user.currentScreen || 'create_deal',
          text: user.currentScreenData.text,
          keyboard: user.currentScreenData.keyboard
        });
        await User.updateOne({ telegramId }, { $set: { navigationStack: newStack } });
      }

      // Delete old message and send new one (push notification)
      try {
        await this.botInstance.telegram.deleteMessage(telegramId, user.mainMessageId);
      } catch (e) { /* message already deleted */ }

      const newMsg = await this.botInstance.telegram.sendMessage(telegramId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup,
        disable_web_page_preview: true
      });

      // Update user state
      await User.updateOne({ telegramId }, {
        $set: {
          mainMessageId: newMsg.message_id,
          currentScreen: 'abandoned_reminder',
          currentScreenData: {
            text,
            keyboard: keyboard.reply_markup
          },
          lastActivity: new Date()
        }
      });

      console.log(`📢 Sent abandoned deal reminder to ${telegramId} (step: ${step})`);
    } catch (error) {
      console.error(`Failed to send reminder to ${telegramId}:`, error.message);

      // Handle blocked bot
      if (
        error.description?.includes('bot was blocked') ||
        error.description?.includes('chat not found') ||
        error.description?.includes('user is deactivated')
      ) {
        await User.updateOne({ telegramId }, {
          $set: { botBlocked: true, botBlockedAt: new Date(), mainMessageId: null }
        });
        // Clean up session
        await Session.deleteSession(telegramId, 'create_deal');
      }
    }
  }

  /**
   * Auto-return user to main menu
   */
  async autoReturnToMainMenu(telegramId, session) {
    try {
      // Delete the create_deal session
      await Session.deleteSession(telegramId, 'create_deal');

      const user = await User.findOne({ telegramId }).select('mainMessageId').lean();
      if (!user || !user.mainMessageId) return;

      // Use the same main menu as startHandler
      const { MAIN_MENU_TEXT } = require('../bot/handlers/start');
      const { mainMenuKeyboard } = require('../bot/keyboards/main');

      const text = MAIN_MENU_TEXT;
      const keyboard = mainMenuKeyboard();

      // Delete old message and send new one
      try {
        await this.botInstance.telegram.deleteMessage(telegramId, user.mainMessageId);
      } catch (e) { /* message already deleted */ }

      const newMsg = await this.botInstance.telegram.sendMessage(telegramId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });

      // Update user state - clear navigation stack too
      await User.updateOne({ telegramId }, {
        $set: {
          mainMessageId: newMsg.message_id,
          currentScreen: 'main_menu',
          currentScreenData: {
            text,
            keyboard: keyboard.reply_markup
          },
          navigationStack: [],
          lastActivity: new Date()
        }
      });

      console.log(`🏠 Auto-returned ${telegramId} to main menu (abandoned deal timeout)`);
    } catch (error) {
      console.error(`Failed to auto-return ${telegramId}:`, error.message);

      // Handle blocked bot
      if (
        error.description?.includes('bot was blocked') ||
        error.description?.includes('chat not found') ||
        error.description?.includes('user is deactivated')
      ) {
        await User.updateOne({ telegramId }, {
          $set: { botBlocked: true, botBlockedAt: new Date(), mainMessageId: null }
        });
      }

      // Clean up session anyway
      await Session.deleteSession(telegramId, 'create_deal');
    }
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton
module.exports = new AbandonedDealMonitor();
