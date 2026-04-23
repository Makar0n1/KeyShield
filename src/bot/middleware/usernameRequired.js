/**
 * Username Required Middleware
 *
 * Blocks ALL bot interactions for users who have no Telegram username,
 * AFTER they have completed language selection.
 *
 * Whitelist (always passes through):
 *   - /start command
 *   - lang_select:XX callbacks (language picker)
 *   - lang_change callback (re-show language picker)
 *   - username_set callback (user claims they set username)
 *
 * For all other interactions: if user exists in DB without username
 * AND has already selected a language → block and show persistent screen.
 */

const User = require('../../models/User');
const { t } = require('../../locales');

// Callback data patterns that must always pass through
const WHITELISTED_CALLBACKS = new Set(['lang_change', 'username_set']);
const WHITELISTED_CALLBACK_PREFIXES = ['lang_select:'];

// Commands that always pass through
const WHITELISTED_COMMANDS = ['/start'];

class UsernameRequired {
  constructor() {
    // Cache: telegramId -> { hasUsername: bool, languageSelected: bool, lastChecked: timestamp }
    this.cache = new Map();
    this.cacheTtlMs = 60 * 1000; // 1 minute — shorter than usernameSync to detect changes faster

    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  /**
   * Determine whether this update should be blocked.
   * Returns { blocked: true, lang } if blocked, or { blocked: false } to pass through.
   */
  async check(ctx) {
    const telegramId = ctx.from?.id;
    if (!telegramId) return { blocked: false };

    // --- Whitelist checks (no DB needed) ---

    // /start command always passes through
    if (ctx.message?.text?.startsWith('/start')) {
      return { blocked: false };
    }

    // Whitelisted callback actions
    if (ctx.callbackQuery?.data) {
      const data = ctx.callbackQuery.data;
      if (WHITELISTED_CALLBACKS.has(data)) return { blocked: false };
      for (const prefix of WHITELISTED_CALLBACK_PREFIXES) {
        if (data.startsWith(prefix)) return { blocked: false };
      }
    }

    // --- User state check ---
    const currentUsername = ctx.from?.username || null;

    // If Telegram reports a username, no need to block
    if (currentUsername) return { blocked: false };

    // No username from Telegram → check DB
    const now = Date.now();
    const cached = this.cache.get(telegramId);

    let languageSelected = false;
    let lang = 'ru';

    if (cached && (now - cached.lastChecked) < this.cacheTtlMs) {
      languageSelected = cached.languageSelected;
      lang = cached.lang;
    } else {
      try {
        const user = await User.findOne({ telegramId })
          .select('languageSelected languageCode')
          .lean();

        if (!user) {
          // Not registered yet — /start will handle them
          return { blocked: false };
        }

        languageSelected = user.languageSelected || false;
        lang = user.languageCode || 'ru';

        this.cache.set(telegramId, {
          languageSelected,
          lang,
          lastChecked: now
        });
      } catch (err) {
        console.error('[UsernameRequired] DB error:', err.message);
        return { blocked: false }; // Fail open — don't block on DB errors
      }
    }

    // Only block if user has gone through language selection
    // (before that, /start handles everything)
    if (!languageSelected) return { blocked: false };

    return { blocked: true, lang };
  }

  /**
   * Invalidate cache for a user (e.g., after they set username)
   */
  invalidate(telegramId) {
    this.cache.delete(telegramId);
    console.log(`🔄 [UsernameRequired] Cache invalidated: ${telegramId}`);
  }

  cleanup() {
    const now = Date.now();
    let deleted = 0;
    for (const [userId, data] of this.cache.entries()) {
      if (now - data.lastChecked > this.cacheTtlMs * 2) {
        this.cache.delete(userId);
        deleted++;
      }
    }
    if (deleted > 0) {
      console.log(`🧹 [UsernameRequired] Cache cleanup: removed ${deleted} entries`);
    }
  }

  destroy() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

const usernameRequired = new UsernameRequired();

/**
 * Telegraf middleware
 */
const usernameRequiredMiddleware = async (ctx, next) => {
  const { blocked, lang } = await usernameRequired.check(ctx);

  if (!blocked) return next();

  // User is blocked — show persistent screen
  const telegramId = ctx.from.id;
  const action = ctx.message?.text ? 'text_input' : (ctx.callbackQuery?.data || 'unknown');

  console.log(`🚫 [UsernameRequired] Blocked interaction: ${telegramId}, action: ${action}`);

  // Must answerCbQuery if this is a callback to prevent "loading" spinner
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch (e) { /* ignore */ }
  }

  // Import here to avoid circular dependency issues (keyboards/main has no circular deps)
  const { usernameRequiredPersistentKeyboard } = require('../keyboards/main');
  const messageManager = require('../utils/messageManager');

  // Load user to preserve pendingDealInvite if it exists
  try {
    const user = await User.findOne({ telegramId }).select('pendingDealInvite').lean();
    if (user?.pendingDealInvite) {
      console.log(`💾 [UsernameRequired] Preserving pendingDealInvite for ${telegramId}`);
    }
  } catch (err) {
    // Ignore DB errors
  }

  const screenText = t(lang, 'usernameRequired.screen');
  const keyboard = usernameRequiredPersistentKeyboard(lang);

  try {
    await messageManager.showFinalScreen(ctx, telegramId, 'username_required', screenText, keyboard);
    console.log(`📢 [UsernameRequired] Persistent screen shown: ${telegramId}`);
  } catch (err) {
    console.error('[UsernameRequired] Error showing screen:', err.message);
  }

  // Do NOT call next() — this request is blocked
};

module.exports = {
  usernameRequiredMiddleware,
  usernameRequired
};
