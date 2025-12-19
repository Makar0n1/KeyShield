/**
 * Loading Timeout Middleware
 *
 * Shows "Loading..." message if bot response takes more than 2 seconds.
 * Prevents users from seeing a "hanging" state during high load.
 *
 * Workflow:
 * 1. User sends message/clicks button
 * 2. Timer starts (2 seconds)
 * 3. If handler completes before 2s → normal response
 * 4. If handler takes longer → edit message to "Loading...", then handler completes normally
 */

const User = require('../../models/User');

// Loading message text
const LOADING_TEXT = `⏳ *Идёт загрузка...*

Повышена нагрузка сервиса, пожалуйста, оставайтесь с нами и немного подождите.

Мы обязательно обработаем ваш запрос! 🙏`;

// Timeout before showing loading message (ms)
const LOADING_TIMEOUT = 2000;

// Minimum time to show loading message (ms) - prevents jarring flashes
const MIN_LOADING_DISPLAY = 1000;

// Active timers: Map<uniqueKey, { timer, shown, shownAt }>
const activeTimers = new Map();

/**
 * Generate unique key for request
 */
function getRequestKey(ctx) {
  const userId = ctx.from?.id;
  const updateId = ctx.update?.update_id;
  return `${userId}:${updateId}`;
}

// Screens where loading message should NOT be shown (already have their own loading state)
const EXCLUDED_SCREENS = [
  'payout_processing',
  'payout_complete',
  'payout_error',
  'refund_error',
  'dispute_payout_complete',
  'dispute_payout_error'
];

/**
 * Get message ID and current screen to edit (from callback or stored in DB)
 */
async function getMessageIdAndScreen(ctx, userId) {
  // For callback queries - edit the message that contains the button
  if (ctx.callbackQuery?.message?.message_id) {
    // Get current screen from DB
    try {
      const user = await User.findOne({ telegramId: userId })
        .select('currentScreen')
        .lean();
      return {
        messageId: ctx.callbackQuery.message.message_id,
        currentScreen: user?.currentScreen
      };
    } catch (error) {
      return { messageId: ctx.callbackQuery.message.message_id, currentScreen: null };
    }
  }

  // For text messages - get mainMessageId and currentScreen from DB
  try {
    const user = await User.findOne({ telegramId: userId })
      .select('mainMessageId currentScreen')
      .lean();
    return {
      messageId: user?.mainMessageId,
      currentScreen: user?.currentScreen
    };
  } catch (error) {
    console.error('[loadingTimeout] Error getting messageId:', error.message);
    return { messageId: null, currentScreen: null };
  }
}

/**
 * Show loading message
 */
async function showLoadingMessage(ctx, messageId) {
  if (!messageId) return;

  const chatId = ctx.from?.id;
  if (!chatId) return;

  try {
    await ctx.telegram.editMessageText(
      chatId,
      messageId,
      null,
      LOADING_TEXT,
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    // Message might be deleted or already edited - not critical
    if (!error.description?.includes('message is not modified')) {
      // console.log('[loadingTimeout] Could not show loading message:', error.message);
    }
  }
}

/**
 * Telegraf middleware for loading timeout
 */
const loadingTimeoutMiddleware = async (ctx, next) => {
  // Skip updates without user (e.g., channel posts)
  if (!ctx.from?.id) {
    return next();
  }

  // Skip non-interactive updates
  const isCallback = !!ctx.callbackQuery;
  const isMessage = !!ctx.message;

  if (!isCallback && !isMessage) {
    return next();
  }

  const userId = ctx.from.id;
  const requestKey = getRequestKey(ctx);

  // Get message ID and current screen BEFORE starting handler
  const { messageId, currentScreen } = await getMessageIdAndScreen(ctx, userId);

  // If no message to edit, skip loading mechanism
  if (!messageId) {
    return next();
  }

  // Skip if current screen is in excluded list (e.g., payout processing)
  if (currentScreen && EXCLUDED_SCREENS.includes(currentScreen)) {
    return next();
  }

  // Track if loading message was shown
  let loadingShown = false;
  let handlerCompleted = false;

  // Track when loading message was shown
  let loadingShownAt = null;

  // Set timer to show loading message after 2 seconds
  const timer = setTimeout(async () => {
    // Don't show if handler already completed
    if (handlerCompleted) return;

    loadingShown = true;
    loadingShownAt = Date.now();
    activeTimers.set(requestKey, { shown: true, shownAt: loadingShownAt });

    await showLoadingMessage(ctx, messageId);
  }, LOADING_TIMEOUT);

  // Store timer reference
  activeTimers.set(requestKey, { timer, shown: false, shownAt: null });

  try {
    // Execute the handler
    await next();
  } finally {
    // Mark handler as completed
    handlerCompleted = true;

    // Clear timer if still pending
    const timerData = activeTimers.get(requestKey);
    if (timerData?.timer) {
      clearTimeout(timerData.timer);
    }

    // If loading message was shown, wait minimum display time
    if (timerData?.shown && timerData?.shownAt) {
      const elapsed = Date.now() - timerData.shownAt;
      const remaining = MIN_LOADING_DISPLAY - elapsed;

      if (remaining > 0) {
        // Wait for minimum display time before allowing response
        await new Promise(resolve => setTimeout(resolve, remaining));
      }
    }

    activeTimers.delete(requestKey);
  }
};

/**
 * Check if loading message was shown for current request
 * Can be used by handlers to adjust their behavior if needed
 */
function wasLoadingShown(ctx) {
  const requestKey = getRequestKey(ctx);
  const timerData = activeTimers.get(requestKey);
  return timerData?.shown || false;
}

module.exports = {
  loadingTimeoutMiddleware,
  wasLoadingShown,
  LOADING_TIMEOUT,
  LOADING_TEXT
};
