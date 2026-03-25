/**
 * Rating Handler
 *
 * Handles the rating flow after successful deal completion:
 * 1. After receipt email step - show rating screen
 * 2. User selects 1-5 stars or skips
 * 3. Rating is saved to counterparty's profile
 * 4. Show final deal completion message
 *
 * IMPORTANT: Rating step only appears for successful deals (not disputes, refunds, etc.)
 */

const Session = require('../../models/Session');
const Deal = require('../../models/Deal');
const User = require('../../models/User');
const messageManager = require('../utils/messageManager');
const { mainMenuButton } = require('../keyboards/main');
const { Markup } = require('telegraf');
const { t } = require('../../locales');

function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/([_*`\[\]])/g, '\\$1');
}

/**
 * Check if user has active rating session
 */
async function hasRatingSession(telegramId) {
  const session = await Session.getSession(telegramId, 'deal_rating');
  return !!session;
}

/**
 * Clear rating session
 */
async function clearRatingSession(telegramId) {
  await Session.deleteSession(telegramId, 'deal_rating');
}

/**
 * Create rating session
 * @param {number} telegramId - User who will rate
 * @param {string} dealId - Deal ID
 * @param {number} counterpartyId - User to be rated
 * @param {string} counterpartyRole - 'buyer' or 'seller' (role of counterparty in this deal)
 * @param {string} counterpartyUsername - Username for display
 * @param {string} finalMessage - Final message to show after rating
 */
async function createRatingSession(telegramId, dealId, counterpartyId, counterpartyRole, counterpartyUsername, finalMessage) {
  await Session.setSession(telegramId, 'deal_rating', {
    dealId,
    counterpartyId,
    counterpartyRole,
    counterpartyUsername,
    finalMessage,
    selectedRating: 0, // 0 = no rating selected yet
    createdAt: new Date()
  }, 1); // TTL 1 hour
}

/**
 * Generate star buttons for rating
 * @param {number} selectedRating - Currently selected rating (0-5)
 * @param {string} dealId - Deal ID for callback data
 * @param {string} lang - Language code
 */
function getRatingKeyboard(selectedRating, dealId, lang = 'ru') {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    // Yellow star if selected, gray/empty if not
    const star = i <= selectedRating ? '⭐' : '☆';
    stars.push(Markup.button.callback(star, `rating_select:${dealId}:${i}`));
  }

  const buttons = [
    stars, // Row of 5 stars
  ];

  // Add confirm button only if rating is selected
  if (selectedRating > 0) {
    buttons.push([Markup.button.callback(t(lang, 'btn.confirm_rating'), `rating_confirm:${dealId}`)]);
  }

  // Skip button always available
  buttons.push([Markup.button.callback(t(lang, 'btn.skip'), `rating_skip:${dealId}`)]);

  return Markup.inlineKeyboard(buttons);
}

/**
 * Show rating screen after receipt step
 * @param {Object} ctx - Telegraf context
 * @param {number} telegramId - User who will rate
 * @param {Object} deal - Deal object
 * @param {number} counterpartyId - User to be rated
 * @param {string} counterpartyRole - 'buyer' or 'seller'
 * @param {string} counterpartyUsername - Username
 * @param {string} finalMessage - Final message to show after rating
 */
async function showRatingScreen(ctx, telegramId, deal, counterpartyId, counterpartyRole, counterpartyUsername, finalMessage) {
  const lang = ctx.state?.lang || 'ru';

  // Create session
  await createRatingSession(telegramId, deal.dealId, counterpartyId, counterpartyRole, counterpartyUsername, finalMessage);

  const roleLabel = counterpartyRole === 'seller' ? t(lang, 'role.seller_gen') : t(lang, 'role.buyer_gen');
  const counterpartyRoleDisplay = counterpartyRole === 'seller' ? t(lang, 'role.seller') : t(lang, 'role.buyer');

  const text = t(lang, 'rating.ask', {
    roleLabel,
    dealId: deal.dealId,
    counterpartyRole: counterpartyRoleDisplay,
    counterpartyUsername: escapeMarkdown(counterpartyUsername)
  });

  const keyboard = getRatingKeyboard(0, deal.dealId, lang);
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
}

/**
 * Handle star selection
 */
async function handleRatingSelect(ctx) {
  try {
    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';
    const [, dealId, ratingStr] = ctx.callbackQuery.data.split(':');
    const rating = parseInt(ratingStr, 10);

    const session = await Session.getSession(telegramId, 'deal_rating');
    if (!session) {
      await ctx.answerCbQuery(t(lang, 'common.session_expired'));
      const keyboard = mainMenuButton(lang);
      await messageManager.sendNewMessage(ctx, telegramId, t(lang, 'common.session_expired'), keyboard);
      return;
    }

    // Update selected rating in session
    session.selectedRating = rating;
    await Session.setSession(telegramId, 'deal_rating', session, 1);

    // Update message with new stars
    const roleLabel = session.counterpartyRole === 'seller' ? t(lang, 'role.seller_gen') : t(lang, 'role.buyer_gen');
    const counterpartyRoleDisplay = session.counterpartyRole === 'seller' ? t(lang, 'role.seller') : t(lang, 'role.buyer');

    const text = t(lang, 'rating.updated', {
      roleLabel,
      dealId: session.dealId,
      counterpartyRole: counterpartyRoleDisplay,
      counterpartyUsername: escapeMarkdown(session.counterpartyUsername),
      stars: '⭐'.repeat(rating),
      emptyStars: '☆'.repeat(5 - rating)
    });

    const keyboard = getRatingKeyboard(rating, session.dealId, lang);

    await ctx.answerCbQuery(t(lang, 'rating.star_count', { rating }));
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in handleRatingSelect:', error);
  }
}

/**
 * Handle rating confirmation
 */
async function handleRatingConfirm(ctx) {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery(t(lang, 'rating.saved'));
    const telegramId = ctx.from.id;

    const session = await Session.getSession(telegramId, 'deal_rating');
    if (!session || session.selectedRating === 0) {
      const keyboard = mainMenuButton(lang);
      await messageManager.sendNewMessage(ctx, telegramId, t(lang, 'common.session_expired'), keyboard);
      return;
    }

    // Save rating to counterparty's profile
    const counterparty = await User.findOne({ telegramId: session.counterpartyId });
    if (counterparty) {
      await counterparty.addRating(telegramId, session.dealId, session.selectedRating, session.counterpartyRole);
      console.log(`✅ Rating ${session.selectedRating} saved for user ${session.counterpartyId} (deal ${session.dealId})`);
    }

    // Clear session
    await clearRatingSession(telegramId);

    // Show final message with thank you
    const thankYouText = t(lang, 'rating.thank_you', {
      stars: '⭐'.repeat(session.selectedRating),
      username: escapeMarkdown(session.counterpartyUsername),
      finalMessage: session.finalMessage
    });

    const keyboard = mainMenuButton(lang);
    await messageManager.sendNewMessage(ctx, telegramId, thankYouText, keyboard);
  } catch (error) {
    console.error('Error in handleRatingConfirm:', error);
  }
}

/**
 * Handle skip rating
 */
async function handleRatingSkip(ctx) {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;
    const lang = ctx.state?.lang || 'ru';

    const session = await Session.getSession(telegramId, 'deal_rating');
    if (!session) {
      const keyboard = mainMenuButton(lang);
      await messageManager.sendNewMessage(ctx, telegramId, t(lang, 'common.session_expired'), keyboard);
      return;
    }

    // Clear session
    await clearRatingSession(telegramId);

    // Show final message without rating
    const keyboard = mainMenuButton(lang);
    await messageManager.sendNewMessage(ctx, telegramId, session.finalMessage, keyboard);
  } catch (error) {
    console.error('Error in handleRatingSkip:', error);
  }
}

module.exports = {
  hasRatingSession,
  clearRatingSession,
  createRatingSession,
  showRatingScreen,
  handleRatingSelect,
  handleRatingConfirm,
  handleRatingSkip
};
