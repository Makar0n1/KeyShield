const User = require('../../models/User');
const Platform = require('../../models/Platform');
const Deal = require('../../models/Deal');
const { mainMenuKeyboard, inviteAcceptKeyboard, mainMenuButton } = require('../keyboards/main');
const messageManager = require('../utils/messageManager');
const adminAlertService = require('../../services/adminAlertService');
const activityLogger = require('../../services/activityLogger');
const dealService = require('../../services/dealService');
const {
  COMMISSION_TIER_1_FIXED,
  COMMISSION_TIER_2_RATE,
  MIN_DEAL_AMOUNT
} = require('../../config/constants'); 

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

💰 *Комиссия:* от ${COMMISSION_TIER_1_FIXED} USDT
📊 *Минимум:* ${MIN_DEAL_AMOUNT} USDT
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

💰 *Комиссия:* от ${COMMISSION_TIER_1_FIXED} USDT
📊 *Минимум:* ${MIN_DEAL_AMOUNT} USDT
💵 *Актив:* USDT (TRC-20)

🌐 [keyshield.me](https://keyshield.me/)

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
 * Handles referral links:
 * - /start ref_PLATFORMCODE - Partner platform referral
 * - /start ref_KS-XXXXXX - User referral (referral program)
 */
const startHandler = async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const username = ctx.from.username;
    const firstName = ctx.from.first_name;

    // Log bot unblocked if user was blocked before (they're back!)
    await activityLogger.logBotUnblocked(telegramId);

    // Log the /start action
    await activityLogger.logAction(telegramId, 'start', { username });

    // Parse referral code from start parameter
    let platformId = null;
    let platformCode = null;
    let source = 'direct';
    let referredByTelegramId = null; // User referral

    const startPayload = ctx.message?.text?.split(' ')[1];

    // Handle deal invite link: /start deal_TOKEN
    if (startPayload && startPayload.startsWith('deal_')) {
      const inviteToken = startPayload.replace('deal_', '');
      await handleDealInvite(ctx, telegramId, username, firstName, inviteToken);
      return;
    }

    if (startPayload && startPayload.startsWith('ref_')) {
      const refCode = startPayload.replace('ref_', '').toUpperCase();

      // Check if it's a user referral code (KS-XXXXXX format)
      if (refCode.startsWith('KS-')) {
        // User referral - find referrer by their code
        const referrer = await User.findOne({ referralCode: refCode });
        if (referrer && referrer.telegramId !== telegramId) { // Can't refer yourself
          referredByTelegramId = referrer.telegramId;
          source = `referral_${refCode}`;
          console.log(`📎 User referral: ${refCode} (user ${referrer.telegramId})`);
        }
      } else {
        // Platform referral
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
        source,
        referredBy: referredByTelegramId // Set referrer if this is a new user
      });
      await user.save();
      console.log(`✅ New user registered: ${telegramId} (@${username}) from: ${source}`);

      // Alert admin about new user
      await adminAlertService.alertNewUser(user);

      // Update platform stats
      if (platformId) {
        await Platform.findByIdAndUpdate(platformId, {
          $inc: { 'stats.totalUsers': 1 }
        });
      }

      // Update referrer stats (increment totalInvited)
      if (referredByTelegramId) {
        await User.updateOne(
          { telegramId: referredByTelegramId },
          { $inc: { 'referralStats.totalInvited': 1 } }
        );
        console.log(`📊 Referrer ${referredByTelegramId} stats updated: +1 invited`);
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
    await messageManager.resetNavigation(telegramId);

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
    await messageManager.setCurrentScreenData(telegramId, 'main_menu', textToShow, keyboard);

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
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const telegramId = ctx.from.id;

    // Reset navigation and show main menu (uses delete + send)
    await messageManager.resetNavigation(telegramId);

    const keyboard = mainMenuKeyboard();
    await messageManager.showFinalScreen(ctx, telegramId, 'main_menu', MAIN_MENU_TEXT, keyboard);
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

    // Try to go back (uses delete + send)
    const previousScreen = await messageManager.goBack(ctx, telegramId);

    // If no previous screen, show main menu
    if (!previousScreen) {
      const keyboard = mainMenuKeyboard();
      await messageManager.showFinalScreen(ctx, telegramId, 'main_menu', MAIN_MENU_TEXT, keyboard);
    }
  } catch (error) {
    console.error('Error in back handler:', error);
  }
};

/**
 * Handle deal invite link
 * User clicked t.me/BotName?start=deal_TOKEN
 */
const handleDealInvite = async (ctx, telegramId, username, firstName, inviteToken) => {
  try {
    // First, ensure user exists (register if new)
    let user = await User.findOne({ telegramId });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = new User({
        telegramId,
        username,
        firstName,
        source: 'invite_link'
      });
      await user.save();
      console.log(`✅ New user registered via invite link: ${telegramId} (@${username})`);
      await adminAlertService.alertNewUser(user);
    } else {
      user.username = username;
      user.firstName = firstName;
      await user.save();
    }

    // Check if user is banned
    if (user.blacklisted) {
      await messageManager.deleteMainMessage(ctx, telegramId);
      const msg = await ctx.telegram.sendMessage(telegramId, BAN_SCREEN_TEXT, {
        parse_mode: 'Markdown'
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      return;
    }

    // Find the deal by invite token
    const deal = await dealService.getDealByInviteToken(inviteToken);

    if (!deal) {
      // Invalid or expired link
      await messageManager.deleteMainMessage(ctx, telegramId);
      await messageManager.resetNavigation(telegramId);

      const errorText = `❌ *Ссылка недействительна*

Эта ссылка-приглашение не найдена или уже истекла.

Возможные причины:
• Ссылка была отменена создателем
• Прошло более 24 часов с момента создания
• Сделка уже принята другим участником`;

      const keyboard = mainMenuButton();
      const msg = await ctx.telegram.sendMessage(telegramId, errorText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      return;
    }

    // Check if link expired
    if (deal.inviteExpiresAt < new Date()) {
      // Mark as cancelled
      deal.status = 'cancelled';
      deal.inviteToken = null;
      await deal.save();

      await messageManager.deleteMainMessage(ctx, telegramId);
      await messageManager.resetNavigation(telegramId);

      const errorText = `❌ *Ссылка истекла*

Эта ссылка-приглашение действовала 24 часа и уже не активна.

Попросите создателя сделки отправить новую ссылку.`;

      const keyboard = mainMenuButton();
      const msg = await ctx.telegram.sendMessage(telegramId, errorText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      return;
    }

    // Check if user is the creator (can't accept own deal)
    const creatorId = deal.creatorRole === 'buyer' ? deal.buyerId : deal.sellerId;
    if (telegramId === creatorId) {
      await messageManager.deleteMainMessage(ctx, telegramId);
      await messageManager.resetNavigation(telegramId);

      const errorText = `❌ *Это ваша сделка*

Вы не можете принять собственную сделку.

Отправьте эту ссылку контрагенту.`;

      const keyboard = mainMenuButton();
      const msg = await ctx.telegram.sendMessage(telegramId, errorText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      return;
    }

    // Check if user already has active deal
    const hasActiveDeal = await dealService.hasActiveDeal(telegramId);
    if (hasActiveDeal) {
      await messageManager.deleteMainMessage(ctx, telegramId);
      await messageManager.resetNavigation(telegramId);

      const errorText = `❌ *У вас уже есть активная сделка*

Завершите текущую сделку, прежде чем принимать новую.`;

      const keyboard = mainMenuButton();
      const msg = await ctx.telegram.sendMessage(telegramId, errorText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      return;
    }

    // Get creator info
    const creator = await User.findOne({ telegramId: creatorId });
    const creatorUsername = creator?.username ? `@${creator.username}` : 'Неизвестный';

    // Get creator rating
    let creatorRatingDisplay = '⭐ Новый пользователь';
    if (creator?.rating?.count > 0) {
      const avgRating = (creator.rating.sum / creator.rating.count).toFixed(1);
      creatorRatingDisplay = `⭐ ${avgRating}/5 (${creator.rating.count} отзывов)`;
    }

    // Calculate amounts
    const commission = deal.commission;
    let depositAmount = deal.amount;
    if (deal.commissionType === 'buyer') {
      depositAmount = deal.amount + commission;
    } else if (deal.commissionType === 'split') {
      depositAmount = deal.amount + (commission / 2);
    }

    let sellerPayout = deal.amount;
    if (deal.commissionType === 'seller') {
      sellerPayout = deal.amount - commission;
    } else if (deal.commissionType === 'split') {
      sellerPayout = deal.amount - (commission / 2);
    }

    // Determine user's role in this deal
    const userRole = deal.creatorRole === 'buyer' ? 'seller' : 'buyer';
    const userRoleLabel = userRole === 'buyer' ? '💵 Покупатель' : '🛠 Продавец';
    const creatorRoleLabel = deal.creatorRole === 'buyer' ? '💵 Покупатель' : '🛠 Продавец';

    // Build invite acceptance screen
    const inviteText = `📨 *Приглашение в сделку*

🆔 ID: \`${deal.dealId}\`

*Ваша роль:* ${userRoleLabel}
*Контрагент:* ${creatorUsername} (${creatorRoleLabel})
*Рейтинг:* ${creatorRatingDisplay}

📦 *Товар/услуга:* ${deal.productName}
${deal.description ? `📝 *Описание:* ${deal.description}\n` : ''}
💰 *Сумма:* ${deal.amount} ${deal.asset}
📊 *Комиссия:* ${commission} ${deal.asset}
${userRole === 'buyer' ? `💸 *К оплате:* ${depositAmount} ${deal.asset}` : `💸 *Вы получите:* ${sellerPayout} ${deal.asset}`}

⚠️ *Внимание:* Для принятия сделки вам нужно будет указать ваш TRON-кошелёк.

Хотите принять эту сделку?`;

    // Delete old message and show invite
    await messageManager.deleteMainMessage(ctx, telegramId);
    await messageManager.resetNavigation(telegramId);

    const keyboard = inviteAcceptKeyboard(deal.dealId);
    const msg = await ctx.telegram.sendMessage(telegramId, inviteText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    await messageManager.setMainMessage(telegramId, msg.message_id);

    console.log(`📨 Invite screen shown to ${telegramId} for deal ${deal.dealId}`);
  } catch (error) {
    console.error('Error handling deal invite:', error);

    const errorText = `❌ *Произошла ошибка*

Попробуйте ещё раз или обратитесь в поддержку.`;

    const keyboard = mainMenuButton();
    try {
      await messageManager.deleteMainMessage(ctx, telegramId);
      const msg = await ctx.telegram.sendMessage(telegramId, errorText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
    } catch (e) {
      console.error('Error showing error screen:', e);
    }
  }
};

module.exports = {
  startHandler,
  mainMenuHandler,
  backHandler,
  handleDealInvite,
  MAIN_MENU_TEXT
};
