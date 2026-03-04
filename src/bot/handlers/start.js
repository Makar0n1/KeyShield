const User = require('../../models/User');
const Platform = require('../../models/Platform');
const Deal = require('../../models/Deal');
const { mainMenuKeyboard, languageSelectKeyboard, inviteAcceptKeyboard, mainMenuButton } = require('../keyboards/main');
const { languageSync } = require('../middleware/languageSync');
const messageManager = require('../utils/messageManager');
const adminAlertService = require('../../services/adminAlertService');
const activityLogger = require('../../services/activityLogger');
const dealService = require('../../services/dealService');
const { t } = require('../../locales');
const {
  COMMISSION_TIER_1_FIXED,
  COMMISSION_TIER_2_RATE,
  MIN_DEAL_AMOUNT
} = require('../../config/constants');

// Language selection screen (trilingual — language unknown at this point)
const LANGUAGE_SELECT_TEXT =
  `🌐 *Choose your language / Выберите язык / Оберіть мову*

🇷🇺 *Русский* — Безопасные сделки в Telegram
🇬🇧 *English* — Secure Telegram deals
🇺🇦 *Українська* — Безпечні угоди в Telegram`;

// Dynamic text functions using i18n
const getWelcomeText = (lang) => t(lang, 'welcome.title', {
  commissionFixed: COMMISSION_TIER_1_FIXED,
  minAmount: MIN_DEAL_AMOUNT
});

const getMainMenuText = (lang) => t(lang, 'welcome.main_menu', {
  commissionFixed: COMMISSION_TIER_1_FIXED,
  minAmount: MIN_DEAL_AMOUNT
});

const getBanScreenText = (lang) => t(lang, 'welcome.ban_screen');

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
    const lang = ctx.state?.lang || 'ru';

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
      const msg = await ctx.telegram.sendMessage(telegramId, getBanScreenText(lang), {
        parse_mode: 'Markdown'
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      return;
    }

    // Delete old bot message if exists (to ensure clean state)
    await messageManager.deleteMainMessage(ctx, telegramId);

    // Reset navigation to main menu
    await messageManager.resetNavigation(telegramId);

    // Show language selection if user hasn't explicitly chosen yet
    if (!user.languageSelected) {
      const keyboard = languageSelectKeyboard();
      const msg = await ctx.telegram.sendMessage(telegramId, LANGUAGE_SELECT_TEXT, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      console.log(`Language picker shown to user ${telegramId}, message ID: ${msg.message_id}`);
      return;
    }

    // Choose text based on new/returning user
    const textToShow = isNewUser ? getWelcomeText(lang) : getMainMenuText(lang);

    // Send new main message
    const keyboard = mainMenuKeyboard(lang);
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
    const lang = ctx.state?.lang || 'ru';

    // Reset navigation and show main menu (uses delete + send)
    await messageManager.resetNavigation(telegramId);

    const keyboard = mainMenuKeyboard(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'main_menu', getMainMenuText(lang), keyboard);
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
    const lang = ctx.state?.lang || 'ru';

    // Try to go back (uses delete + send)
    const previousScreen = await messageManager.goBack(ctx, telegramId);

    // If no previous screen, show main menu
    if (!previousScreen) {
      const keyboard = mainMenuKeyboard(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'main_menu', getMainMenuText(lang), keyboard);
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
    const lang = ctx.state?.lang || 'ru';

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
      const msg = await ctx.telegram.sendMessage(telegramId, getBanScreenText(lang), {
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

      const errorText = t(lang, 'invite.invalid');

      const keyboard = mainMenuButton(lang);
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

      const errorText = t(lang, 'invite.expired_long');

      const keyboard = mainMenuButton(lang);
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

      const errorText = t(lang, 'invite.own_deal');

      const keyboard = mainMenuButton(lang);
      const msg = await ctx.telegram.sendMessage(telegramId, errorText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      return;
    }

    // Check if user hasn't reached the deals limit
    const canCreate = await dealService.canCreateNewDeal(telegramId);
    if (!canCreate) {
      const count = await dealService.countActiveDeals(telegramId);
      const { MAX_ACTIVE_DEALS_PER_USER } = require('../../config/constants');
      await messageManager.deleteMainMessage(ctx, telegramId);
      await messageManager.resetNavigation(telegramId);

      const errorText = t(lang, 'invite.deals_limit', { count, max: MAX_ACTIVE_DEALS_PER_USER });

      const keyboard = mainMenuButton(lang);
      const msg = await ctx.telegram.sendMessage(telegramId, errorText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      return;
    }

    // Get creator info
    const creator = await User.findOne({ telegramId: creatorId });
    const creatorUsername = creator?.username ? `@${creator.username}` : t(lang, 'common.unknown_user');

    // Get creator rating using proper User model fields
    let creatorRatingDisplay = t(lang, 'common.new_user_rating');
    if (creator?.ratingsCount > 0) {
      creatorRatingDisplay = `⭐ ${creator.averageRating}/5 (${creator.ratingsCount} ${t(lang, 'plural.reviews', { count: creator.ratingsCount })})`;
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
    const userRoleLabel = t(lang, `role.${userRole}_icon`);
    const creatorRoleLabel = t(lang, `role.${deal.creatorRole}_icon`);

    // Build invite acceptance screen
    const paymentInfo = userRole === 'buyer'
      ? t(lang, 'invite.to_pay', { amount: depositAmount, asset: deal.asset })
      : t(lang, 'invite.you_receive', { amount: sellerPayout, asset: deal.asset });

    const inviteText = t(lang, 'invite.acceptance', {
      dealId: deal.dealId,
      userRoleLabel,
      creatorUsername,
      creatorRoleLabel,
      creatorRatingDisplay,
      productName: deal.productName,
      description: deal.description || '',
      amount: deal.amount,
      asset: deal.asset,
      commission,
      paymentInfo
    });

    // Delete old message and show invite
    await messageManager.deleteMainMessage(ctx, telegramId);
    await messageManager.resetNavigation(telegramId);

    const keyboard = inviteAcceptKeyboard(deal.dealId, lang);
    const msg = await ctx.telegram.sendMessage(telegramId, inviteText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    await messageManager.setMainMessage(telegramId, msg.message_id);

    console.log(`📨 Invite screen shown to ${telegramId} for deal ${deal.dealId}`);
  } catch (error) {
    console.error('Error handling deal invite:', error);

    const errorText = t(lang, 'common.error_generic');

    const keyboard = mainMenuButton(lang);
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

/**
 * Language selection callback handler
 * Triggered when user taps a language button on the /start picker
 */
const handleLanguageSelection = async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const selectedLang = ctx.callbackQuery.data.split(':')[1]; // 'ru' | 'en' | 'uk'

    // Save chosen language and mark as explicitly selected
    await languageSync.setLanguage(telegramId, selectedLang);

    // Reload user to determine new/returning status
    const user = await User.findOne({ telegramId }).select('blacklisted').lean();
    if (!user) return;

    if (user.blacklisted) {
      const banText = getBanScreenText(selectedLang);
      await messageManager.showFinalScreen(ctx, telegramId, 'ban', banText, null);
      return;
    }

    // Show welcome in chosen language
    const textToShow = getWelcomeText(selectedLang);
    const keyboard = mainMenuKeyboard(selectedLang);

    await messageManager.showFinalScreen(ctx, telegramId, 'main_menu', textToShow, keyboard);
    await messageManager.setCurrentScreenData(telegramId, 'main_menu', textToShow, keyboard);

    console.log(`Language selected: ${selectedLang} for user ${telegramId}`);
  } catch (error) {
    console.error('Error in handleLanguageSelection:', error);
  }
};

module.exports = {
  startHandler,
  mainMenuHandler,
  backHandler,
  handleDealInvite,
  handleLanguageSelection,
  getMainMenuText,
  MAIN_MENU_TEXT: getMainMenuText('ru')
};
