const User = require('../../models/User');
const Platform = require('../../models/Platform');
const { mainMenuKeyboard } = require('../keyboards/main');
const messageManager = require('../utils/messageManager');

// Welcome text for NEW users
const WELCOME_TEXT = `👋 *Добро пожаловать в KeyShield!*

🛡 *Что умеет этот бот?*

KeyShield — это escrow-сервис для безопасных сделок между покупателями и продавцами в криптовалюте.

✅ *Защита от мошенничества*
Средства замораживаются на multisig-кошельке, пока сделка не завершена.

✅ *Автоматический контроль*
Бот сам отслеживает депозиты в блокчейне TRON.

✅ *Справедливый арбитраж*
При споре — нейтральный арбитр рассмотрит доказательства обеих сторон.

✅ *Анонимность*
Никакой верификации. Только ваш Telegram и TRON-кошелёк.

💰 *Комиссия:* от 15 USDT или 5%
📊 *Минимум:* 50 USDT
💵 *Актив:* USDT (TRC-20)

Нажмите кнопку ниже, чтобы начать!`;

// Main menu text (used in multiple places)
const MAIN_MENU_TEXT = `🛡 *KeyShield — Безопасные сделки*

Защищённый escrow-сервис для сделок между покупателями и продавцами.

🔐 *Мультисиг-кошельки*
Средства хранятся на защищённом кошельке с мультиподписью 2-из-3.

⚡️ *Автоматический контроль*
Система автоматически отслеживает депозиты в блокчейне TRON.

⚖️ *Арбитраж споров*
При конфликте — нейтральный арбитр рассмотрит доказательства.

💰 *Комиссия:* от 15 USDT или 5%
📊 *Минимум:* 50 USDT
💵 *Актив:* USDT (TRC-20)

Выберите действие:`;

// Ban screen text
const BAN_SCREEN_TEXT = `🚫 *Аккаунт заблокирован*

Ваш аккаунт заблокирован из-за нарушения правил сервиса.

Если вы считаете, что блокировка ошибочна, обратитесь в поддержку:

📧 support@keyshield.io
💬 @keyshield\\_support`;

/**
 * /start command handler
 * Registers or updates user and shows main menu
 * Handles referral links: /start ref_PLATFORMCODE
 */
const startHandler = async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const username = ctx.from.username;
    const firstName = ctx.from.first_name;

    // Parse referral code from start parameter
    let platformId = null;
    let platformCode = null;
    let source = 'direct';

    const startPayload = ctx.message?.text?.split(' ')[1];
    if (startPayload && startPayload.startsWith('ref_')) {
      const refCode = startPayload.replace('ref_', '').toUpperCase();
      const platform = await Platform.findOne({ code: refCode, isActive: true });

      if (platform) {
        platformId = platform._id;
        platformCode = platform.code;
        source = platform.code;

        // Log referral visit
        platform.addLog('referral_visit', {
          telegramId,
          username,
          timestamp: new Date()
        });
        await platform.save();

        console.log(`📎 Referral from platform: ${platform.name} (${platform.code})`);
      }
    }

    // Find or create user
    let user = await User.findOne({ telegramId });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = new User({
        telegramId,
        username,
        firstName,
        platformId,
        platformCode,
        source
      });
      await user.save();
      console.log(`✅ New user registered: ${telegramId} (@${username}) from: ${source}`);

      // Update platform stats
      if (platformId) {
        await Platform.findByIdAndUpdate(platformId, {
          $inc: { 'stats.totalUsers': 1 }
        });
      }
    } else {
      // Update user info if changed
      user.username = username;
      user.firstName = firstName;
      await user.save();
    }

    // Check if user is banned
    if (user.blacklisted) {
      // Delete old bot message if exists
      await messageManager.deleteMainMessage(ctx, telegramId);

      // Send ban screen (no keyboard)
      const msg = await ctx.telegram.sendMessage(telegramId, BAN_SCREEN_TEXT, {
        parse_mode: 'Markdown'
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      return;
    }

    // Delete old bot message if exists (to ensure clean state)
    await messageManager.deleteMainMessage(ctx, telegramId);

    // Reset navigation to main menu
    messageManager.resetNavigation(telegramId);

    // Choose text based on new/returning user
    const textToShow = isNewUser ? WELCOME_TEXT : MAIN_MENU_TEXT;

    // Send new main message
    const keyboard = mainMenuKeyboard();
    const msg = await ctx.telegram.sendMessage(telegramId, textToShow, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });

    // Track main message (persisted to DB)
    await messageManager.setMainMessage(telegramId, msg.message_id);
    messageManager.setCurrentScreenData(telegramId, 'main_menu', textToShow, keyboard);

    console.log(`${isNewUser ? 'Welcome' : 'Main menu'} shown to user ${telegramId}, message ID: ${msg.message_id}`);
  } catch (error) {
    console.error('Error in start handler:', error);
  }
};

/**
 * Main menu callback handler (from inline button)
 */
const mainMenuHandler = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    // Reset navigation to main menu
    messageManager.resetNavigation(telegramId);

    // Show main menu
    const keyboard = mainMenuKeyboard();
    await messageManager.editMainMessage(ctx, telegramId, MAIN_MENU_TEXT, keyboard);
    messageManager.setCurrentScreenData(telegramId, 'main_menu', MAIN_MENU_TEXT, keyboard);
  } catch (error) {
    console.error('Error in main menu handler:', error);
  }
};

/**
 * Back button handler - returns to previous screen
 */
const backHandler = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    // Try to go back
    const previousScreen = await messageManager.goBack(ctx, telegramId);

    // If no previous screen, show main menu
    if (!previousScreen) {
      const keyboard = mainMenuKeyboard();
      await messageManager.editMainMessage(ctx, telegramId, MAIN_MENU_TEXT, keyboard);
      messageManager.setCurrentScreenData(telegramId, 'main_menu', MAIN_MENU_TEXT, keyboard);
    }
  } catch (error) {
    console.error('Error in back handler:', error);
  }
};

module.exports = {
  startHandler,
  mainMenuHandler,
  backHandler,
  MAIN_MENU_TEXT
};
