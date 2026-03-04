const {
  helpMenuKeyboard,
  helpSectionKeyboard
} = require('../keyboards/main');
const messageManager = require('../utils/messageManager');
const { t } = require('../../locales');
const {
  COMMISSION_TIER_1_MAX,
  COMMISSION_TIER_1_FIXED,
  COMMISSION_TIER_2_MAX,
  COMMISSION_TIER_2_RATE,
  COMMISSION_TIER_3_MAX,
  COMMISSION_TIER_3_RATE,
  COMMISSION_TIER_4_RATE,
  AUTO_BAN_LOSS_STREAK,
  MIN_DEAL_AMOUNT
} = require('../../config/constants');

// ============================================
// HELP MENU
// ============================================

/**
 * Help menu handler
 */
const showHelp = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    const isCallbackQuery = !!ctx.callbackQuery;
    if (isCallbackQuery) await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    const text = t(lang, 'help.menu');

    const keyboard = helpMenuKeyboard(lang);
    await messageManager.navigateToScreen(ctx, telegramId, 'help', text, keyboard);
  } catch (error) {
    console.error('Error in showHelp:', error);
  }
};

// ============================================
// HOW IT WORKS
// ============================================

/**
 * How it works handler
 */
const howItWorks = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    const text = t(lang, 'help.how_it_works', {
      autoBanStreak: AUTO_BAN_LOSS_STREAK,
      minAmount: MIN_DEAL_AMOUNT
    });

    const keyboard = helpSectionKeyboard(lang);
    await messageManager.navigateToScreen(ctx, telegramId, 'how_it_works', text, keyboard);
  } catch (error) {
    console.error('Error in howItWorks:', error);
  }
};

// ============================================
// RULES AND FEES
// ============================================

/**
 * Rules and fees handler
 */
const rulesAndFees = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    const text = t(lang, 'help.rules_fees', {
      tier1Max: COMMISSION_TIER_1_MAX,
      tier1Fixed: COMMISSION_TIER_1_FIXED,
      tier2Max: COMMISSION_TIER_2_MAX,
      tier2Rate: COMMISSION_TIER_2_RATE,
      tier3Max: COMMISSION_TIER_3_MAX,
      tier3Rate: COMMISSION_TIER_3_RATE,
      tier4Rate: COMMISSION_TIER_4_RATE,
      autoBanStreak: AUTO_BAN_LOSS_STREAK,
      minAmount: MIN_DEAL_AMOUNT
    });

    const keyboard = helpSectionKeyboard(lang);
    await messageManager.navigateToScreen(ctx, telegramId, 'rules', text, keyboard);
  } catch (error) {
    console.error('Error in rulesAndFees:', error);
  }
};

// ============================================
// SUPPORT
// ============================================

/**
 * Support handler
 */
const support = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    const text = t(lang, 'help.support', {
      tier1Fixed: COMMISSION_TIER_1_FIXED,
      minAmount: MIN_DEAL_AMOUNT
    });

    const keyboard = helpSectionKeyboard(lang);
    await messageManager.navigateToScreen(ctx, telegramId, 'support', text, keyboard);
  } catch (error) {
    console.error('Error in support:', error);
  }
};

module.exports = {
  showHelp,
  howItWorks,
  rulesAndFees,
  support
};
