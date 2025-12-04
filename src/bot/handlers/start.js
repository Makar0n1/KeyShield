const User = require('../../models/User');
const Platform = require('../../models/Platform');
const { mainMenuKeyboard, persistentKeyboard } = require('../keyboards/main');
const messageManager = require('../utils/messageManager');

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

    // Delete the /start command if user is already on main menu
    await messageManager.deleteCommandIfOnScreen(ctx, 'main_menu');

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

      // ВАЖНО: Не меняем платформу если пользователь уже зарегистрирован!
      // Первая платформа навсегда

      await user.save();
    }

    // Check if user is banned
    if (user.blacklisted) {
      return ctx.reply(
        '🚫 *Ваш аккаунт заблокирован*\n\n' +
        'Вы не можете использовать этот сервис. Если считаете, что это ошибка, обратитесь в поддержку.',
        { parse_mode: 'Markdown' }
      );
    }

    // Welcome message
    const welcomeText = `
👋 *Добро пожаловать в KeyShield Multisig Escrow!*

Безопасный криптовалютный эскроу на основе мультиподписи TRON.

🔐 *Что это такое?*
Мы НЕ храним ваши средства на кастодиальном кошельке. Для каждой сделки создаётся отдельный multisig-адрес с 3 ключами:
• Покупатель (1 подпись)
• Продавец (1 подпись)
• Арбитр (1 подпись)

Для перемещения средств нужны *любые 2 подписи из 3*.

✅ Арбитр *не может* украсть средства в одиночку
✅ Покупатель и продавец могут завершить сделку без арбитра
✅ При споре арбитр + победитель подписывают транзакцию

📊 *Поддерживаемые активы:*
• USDT (TRC-20)

💰 *Комиссия:* 5% (минимум 15 USDT)

Выберите действие:
    `.trim();

    // Clear any old temp messages
    await messageManager.clearTempMessages(ctx, telegramId);

    // Reset navigation to main menu
    messageManager.resetNavigation(telegramId);

    // Send or edit main message
    const messageId = await messageManager.sendOrEdit(
      ctx,
      telegramId,
      welcomeText,
      mainMenuKeyboard()
    );

    console.log(`Main menu shown to user ${telegramId}, message ID: ${messageId}`);
  } catch (error) {
    console.error('Error in start handler:', error);
    ctx.reply('❌ Произошла ошибка. Попробуйте ещё раз позже.');
  }
};

/**
 * Main menu callback handler (from inline button)
 */
const mainMenuHandler = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    const text = `
👋 *Добро пожаловать в KeyShield Multisig Escrow!*

Безопасный криптовалютный эскроу на основе мультиподписи TRON.

🔐 *Что это такое?*
Мы НЕ храним ваши средства на кастодиальном кошельке. Для каждой сделки создаётся отдельный multisig-адрес с 3 ключами:
• Покупатель (1 подпись)
• Продавец (1 подпись)
• Арбитр (1 подпись)

Для перемещения средств нужны *любые 2 подписи из 3*.

✅ Арбитр *не может* украсть средства в одиночку
✅ Покупатель и продавец могут завершить сделку без арбитра
✅ При споре арбитр + победитель подписывают транзакцию

📊 *Поддерживаемые активы:*
• USDT (TRC-20)

💰 *Комиссия:* 5% (минимум 15 USDT)

Выберите действие:
    `.trim();

    // Reset navigation to main menu
    messageManager.resetNavigation(telegramId);

    // Edit the message
    await messageManager.sendOrEdit(ctx, telegramId, text, mainMenuKeyboard());
  } catch (error) {
    console.error('Error in main menu handler:', error);
  }
};

module.exports = {
  startHandler,
  mainMenuHandler
};
