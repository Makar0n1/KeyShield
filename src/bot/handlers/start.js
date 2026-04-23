const User = require('../../models/User');
const Platform = require('../../models/Platform');
const Deal = require('../../models/Deal');
const WebDeal = require('../../models/WebDeal');
const Session = require('../../models/Session');
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

    // Handle web deal link: /start web_TOKEN
    if (startPayload && startPayload.startsWith('web_')) {
      const webToken = startPayload.replace('web_', '');
      await handleWebDealClaim(ctx, telegramId, username, firstName, webToken);
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

    // Find or create user (atomic upsert to prevent duplicate key errors)
    const user = await User.findOneAndUpdate(
      { telegramId },
      {
        $set: { username, firstName },
        $setOnInsert: {
          telegramId,
          platformId,
          platformCode,
          source,
          referredBy: referredByTelegramId,
          createdAt: new Date()
        }
      },
      { upsert: true, new: true }
    );

    const isNewUser = !user.platformId && platformId; // First time setting platformId

    if (isNewUser) {
      console.log(`✅ New user registered: ${telegramId} (@${username}) from: ${source}`);
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

    // Check if user has a Telegram username (required for all bot functionality)
    if (!ctx.from.username) {
      const { usernameRequiredPersistentKeyboard } = require('../keyboards/main');
      const screenText = t(lang, 'usernameRequired.screen');
      const keyboard = usernameRequiredPersistentKeyboard(lang);
      const msg = await ctx.telegram.sendMessage(telegramId, screenText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      console.log(`🚫 [UsernameRequired] Username gate shown to ${telegramId}`);
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
/**
 * Handle web deal claim: user clicked link from website deal builder
 * Pre-populates create_deal session with WebDeal data, starts from description step
 */
async function handleWebDealClaim(ctx, telegramId, username, firstName, webToken) {
  try {
    // Find or create user (atomic upsert to prevent duplicate key errors)
    const user = await User.findOneAndUpdate(
      { telegramId },
      {
        $set: { username, firstName },
        $setOnInsert: { telegramId, source: 'web_deal', createdAt: new Date() }
      },
      { upsert: true, new: true }
    );

    const isNewUser = user.createdAt && (Date.now() - user.createdAt.getTime()) < 5000;
    if (isNewUser) {
      console.log(`✅ New user registered via web deal: ${telegramId} (@${username})`);
      await adminAlertService.alertNewUser(user);
    }

    const lang = user?.languageCode || 'ru';

    // Check if user is banned
    if (user.blacklisted) {
      await messageManager.deleteMainMessage(ctx, telegramId);
      const msg = await ctx.telegram.sendMessage(telegramId, getBanScreenText(lang), {
        parse_mode: 'Markdown'
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      return;
    }

    // Delete old bot message
    await messageManager.deleteMainMessage(ctx, telegramId);

    // Step 1: If no language selected yet → show language picker
    // (WebDeal token saved in pendingWebDeal for later verification)
    if (!user.languageSelected) {
      await User.updateOne({ telegramId }, { $set: { pendingWebDeal: webToken } });
      const keyboard = languageSelectKeyboard();
      const msg = await ctx.telegram.sendMessage(telegramId, LANGUAGE_SELECT_TEXT, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      console.log(`🌐 WebDeal: language picker shown for ${telegramId}`);
      return;
    }

    // Step 2: Check if user has username (required)
    // Save pendingWebDeal so it persists through username gate
    if (!ctx.from.username) {
      await User.updateOne({ telegramId }, { $set: { pendingWebDeal: webToken } });
      const { usernameRequiredPersistentKeyboard } = require('../keyboards/main');
      const screenText = t(lang, 'usernameRequired.screen');
      const keyboard = usernameRequiredPersistentKeyboard(lang);
      const msg = await ctx.telegram.sendMessage(telegramId, screenText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      console.log(`🚫 WebDeal: username gate shown for ${telegramId}`);
      return;
    }

    // Step 3: All prerequisites met, NOW check WebDeal status
    const webDeal = await WebDeal.findOne({ token: webToken });

    if (!webDeal) {
      console.log(`❌ WebDeal not found: ${webToken}`);
      const errorText = t(lang, 'invite.invalid');
      const keyboard = mainMenuButton(lang);
      const msg = await ctx.telegram.sendMessage(telegramId, errorText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      await messageManager.resetNavigation(telegramId);
      return;
    }

    if (webDeal.status === 'expired' || new Date() > webDeal.expiresAt) {
      console.log(`⚠️ WebDeal expired: ${webToken}`);
      const errorText = t(lang, 'invite.expired_long');
      const keyboard = mainMenuButton(lang);
      const msg = await ctx.telegram.sendMessage(telegramId, errorText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      await messageManager.resetNavigation(telegramId);
      return;
    }

    if (webDeal.status === 'claimed') {
      console.log(`⚠️ WebDeal already claimed (one-time): ${webToken} by user ${webDeal.claimedBy}`);
      const errorText = t(lang, 'webdeal.link_inactive');
      const keyboard = mainMenuButton(lang);
      const msg = await ctx.telegram.sendMessage(telegramId, errorText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      await messageManager.resetNavigation(telegramId);
      return;
    }

    // All checks passed → claim and start web deal session
    await webDeal.claim(telegramId);
    console.log(`🌐 WebDeal claimed: ${webToken} by ${telegramId}`);
    await startWebDealSession(ctx, telegramId, user, webDeal, webToken);

  } catch (error) {
    console.error('Error handling web deal claim:', error);
    const lang = 'ru';
    const keyboard = mainMenuButton(lang);
    await messageManager.deleteMainMessage(ctx, telegramId);
    const msg = await ctx.telegram.sendMessage(telegramId, t(lang, 'common.error_generic'), {
      parse_mode: 'Markdown',
      reply_markup: keyboard.reply_markup
    });
    await messageManager.setMainMessage(telegramId, msg.message_id);
  }
}

const handleDealInvite = async (ctx, telegramId, username, firstName, inviteToken) => {
  try {
    const lang = ctx.state?.lang || 'ru';

    // Find or create user (atomic upsert to prevent duplicate key errors)
    const user = await User.findOneAndUpdate(
      { telegramId },
      {
        $set: { username, firstName },
        $setOnInsert: { telegramId, source: 'invite_link', createdAt: new Date() }
      },
      { upsert: true, new: true }
    );

    const isNewUser = user.createdAt && (Date.now() - user.createdAt.getTime()) < 5000; // Created in last 5 seconds
    if (isNewUser) {
      console.log(`✅ New user registered via invite link: ${telegramId} (@${username})`);
      await adminAlertService.alertNewUser(user);
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

    // FIRST: Check if user has selected language (show picker if not)
    if (!user.languageSelected) {
      const keyboard = languageSelectKeyboard();
      await messageManager.deleteMainMessage(ctx, telegramId);
      const msg = await ctx.telegram.sendMessage(telegramId, LANGUAGE_SELECT_TEXT, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      // Save invite token so we can resume after language selection
      await User.updateOne({ telegramId }, { $set: { pendingDealInvite: inviteToken } });
      console.log(`🌐 [DealInvite] Language picker shown to ${telegramId}, invite saved`);
      return;
    }

    // SECOND: Check if user has username (required for everything)
    if (!ctx.from.username) {
      const selectedLang = user.languageCode || 'ru';
      const { usernameRequiredPersistentKeyboard } = require('../keyboards/main');
      const screenText = t(selectedLang, 'usernameRequired.screen');
      const keyboard = usernameRequiredPersistentKeyboard(selectedLang);

      // Save invite token so we can resume after username is set
      console.log(`💾 [DealInvite] Saving pendingDealInvite: ${inviteToken}`);
      await User.updateOne({ telegramId }, { $set: { pendingDealInvite: inviteToken } });

      await messageManager.deleteMainMessage(ctx, telegramId);
      const msg = await ctx.telegram.sendMessage(telegramId, screenText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard.reply_markup
      });
      await messageManager.setMainMessage(telegramId, msg.message_id);
      console.log(`🚫 [DealInvite] Username gate shown to ${telegramId}, invite saved: ${inviteToken}`);
      return;
    }

    // Find the deal by invite token
    const deal = await dealService.getDealByInviteToken(inviteToken);

    if (!deal) {
      // Invalid or expired link — show error in existing message
      const errorText = t(lang, 'invite.invalid');
      const keyboard = mainMenuButton(lang);

      try {
        // Try to edit existing main message
        await messageManager.updateScreen(ctx, telegramId, 'invite_invalid', errorText, keyboard);
      } catch (e) {
        // Fallback: delete old and send new
        await messageManager.deleteMainMessage(ctx, telegramId);
        const msg = await ctx.telegram.sendMessage(telegramId, errorText, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
        await messageManager.setMainMessage(telegramId, msg.message_id);
      }
      await messageManager.resetNavigation(telegramId);
      return;
    }

    // Check if link expired
    if (deal.inviteExpiresAt < new Date()) {
      // Mark as cancelled
      deal.status = 'cancelled';
      deal.inviteToken = null;
      await deal.save();

      const errorText = t(lang, 'invite.expired_long');
      const keyboard = mainMenuButton(lang);
      try {
        await messageManager.updateScreen(ctx, telegramId, 'invite_expired', errorText, keyboard);
      } catch (e) {
        await messageManager.deleteMainMessage(ctx, telegramId);
        const msg = await ctx.telegram.sendMessage(telegramId, errorText, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
        await messageManager.setMainMessage(telegramId, msg.message_id);
      }
      await messageManager.resetNavigation(telegramId);

      deal.status = 'cancelled';
      deal.inviteToken = null;
      await deal.save();
      return;
    }

    // Check if user is the creator (can't accept own deal)
    const creatorId = deal.creatorRole === 'buyer' ? deal.buyerId : deal.sellerId;
    if (telegramId === creatorId) {
      const errorText = t(lang, 'invite.own_deal');
      const keyboard = mainMenuButton(lang);
      try {
        await messageManager.updateScreen(ctx, telegramId, 'invite_own', errorText, keyboard);
      } catch (e) {
        await messageManager.deleteMainMessage(ctx, telegramId);
        const msg = await ctx.telegram.sendMessage(telegramId, errorText, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
        await messageManager.setMainMessage(telegramId, msg.message_id);
      }
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
    const creatorUsername = creator?.username ? `\`@${creator.username}\`` : t(lang, 'common.unknown_user');

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

    // Reload user
    const user = await User.findOne({ telegramId });
    if (!user) return;

    if (user.blacklisted) {
      const banText = getBanScreenText(selectedLang);
      await messageManager.showFinalScreen(ctx, telegramId, 'ban', banText, null);
      return;
    }

    // Check if there's a pending deal invite FIRST (before username check)
    if (user.pendingDealInvite) {
      console.log(`📨 Resuming deal invite ${user.pendingDealInvite} after language selection`);
      await handleDealInvite(ctx, telegramId, ctx.from.username, ctx.from.first_name, user.pendingDealInvite);
      return;
    }

    // Check if user has a Telegram username (required for everything else)
    if (!ctx.from.username) {
      const { usernameRequiredPersistentKeyboard } = require('../keyboards/main');
      const screenText = t(selectedLang, 'usernameRequired.screen');
      const keyboard = usernameRequiredPersistentKeyboard(selectedLang);
      await messageManager.showFinalScreen(ctx, telegramId, 'username_required', screenText, keyboard);
      console.log(`🚫 [UsernameRequired] Username gate shown to ${telegramId} after language selection`);
      return;
    }

    // Check if there's a pending web deal to resume (after both invite and username check)
    if (user.pendingWebDeal) {
      const webDeal = await WebDeal.findOne({ token: user.pendingWebDeal });

      if (!webDeal) {
        console.log(`❌ Pending WebDeal not found: ${user.pendingWebDeal}`);
        await User.updateOne({ telegramId }, { $unset: { pendingWebDeal: 1 } });
      } else if (webDeal.status === 'claimed') {
        console.log(`⚠️ Pending WebDeal already claimed (one-time): ${user.pendingWebDeal}`);
        const { mainMenuButton } = require('../keyboards/main');
        const errorText = t(selectedLang, 'webdeal.link_inactive');
        const keyboard = mainMenuButton(selectedLang);
        await messageManager.showFinalScreen(ctx, telegramId, 'webdeal_inactive', errorText, keyboard);
        await messageManager.resetNavigation(telegramId);
        await User.updateOne({ telegramId }, { $unset: { pendingWebDeal: 1 } });
        return;
      } else if (webDeal.status === 'expired' || new Date() > webDeal.expiresAt) {
        console.log(`⚠️ Pending WebDeal expired: ${user.pendingWebDeal}`);
        const { mainMenuButton } = require('../keyboards/main');
        const errorText = t(selectedLang, 'invite.expired_long');
        const keyboard = mainMenuButton(selectedLang);
        await messageManager.showFinalScreen(ctx, telegramId, 'webdeal_expired', errorText, keyboard);
        await messageManager.resetNavigation(telegramId);
        await User.updateOne({ telegramId }, { $unset: { pendingWebDeal: 1 } });
        return;
      } else {
        // WebDeal is valid
        console.log(`🌐 Resuming web deal ${user.pendingWebDeal} after language selection`);
        await webDeal.claim(telegramId);
        await startWebDealSession(ctx, telegramId, user, webDeal, user.pendingWebDeal);
        return;
      }
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

/**
 * Start web deal session — creates pre-populated create_deal session
 */
async function startWebDealSession(ctx, telegramId, user, webDeal, webToken) {
  const lang = user.languageCode || 'ru';

  // Delete previous message (language picker etc)
  await messageManager.deleteMainMessage(ctx, telegramId);

  const sessionData = {
    step: 'description',
    data: {
      creatorRole: webDeal.creatorRole,
      isInviteLink: true,
      productName: webDeal.productName,
      amount: webDeal.amount,
      asset: webDeal.asset || 'USDT',
      commissionType: webDeal.commissionType || 'buyer',
      webDealToken: webToken,
    }
  };

  if (webDeal.creatorRole === 'buyer') {
    sessionData.data.buyerId = telegramId;
    sessionData.data.sellerId = 0;
  } else {
    sessionData.data.sellerId = telegramId;
    sessionData.data.buyerId = 0;
  }

  await Session.setSession(telegramId, 'create_deal', sessionData, 2);

  const text = t(lang, 'createDeal.step4_description');
  const { backButton } = require('../keyboards/main');
  const keyboard = backButton(lang);

  const msg = await ctx.telegram.sendMessage(telegramId, text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard.reply_markup
  });

  await User.updateOne({ telegramId }, {
    $set: {
      mainMessageId: msg.message_id,
      currentScreen: 'create_deal_description',
      lastActivity: new Date()
    },
    $unset: { pendingWebDeal: 1 }
  });

  console.log(`🌐 WebDeal session started for ${telegramId}, step: description`);
}

module.exports = {
  startHandler,
  mainMenuHandler,
  backHandler,
  handleDealInvite,
  handleWebDealClaim,
  handleLanguageSelection,
  startWebDealSession,
  getMainMenuText,
  getWelcomeText,
  LANGUAGE_SELECT_TEXT,
  MAIN_MENU_TEXT: getMainMenuText('ru')
};
