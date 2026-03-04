/**
 * Language Sync Middleware
 *
 * Detects user's language from Telegram and stores it in DB.
 * Sets ctx.state.lang for quick access in handlers.
 *
 * Uses in-memory cache (same pattern as UsernameSync)
 * to avoid DB writes on every request.
 */

const User = require('../../models/User');

// Map Telegram language codes to our supported languages
const LANGUAGE_MAP = {
  'ru': 'ru',
  'uk': 'uk',
  'ua': 'uk', // some clients send 'ua'
  'en': 'en',
};

const SUPPORTED_LANGUAGES = ['ru', 'en', 'uk'];
const DEFAULT_LANGUAGE = 'ru';

function mapLanguageCode(telegramLangCode) {
  if (!telegramLangCode) return DEFAULT_LANGUAGE;
  const base = telegramLangCode.toLowerCase().split('-')[0];
  return LANGUAGE_MAP[base] || DEFAULT_LANGUAGE;
}

class LanguageSync {
  constructor() {
    this.cache = new Map();
    this.cacheTtlMs = 5 * 60 * 1000;
    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
  }

  async sync(ctx) {
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      ctx.state.lang = DEFAULT_LANGUAGE;
      return;
    }

    const detectedLang = mapLanguageCode(ctx.from?.language_code);
    const now = Date.now();
    const cached = this.cache.get(telegramId);

    // Cache hit - use cached language
    if (cached && (now - cached.lastChecked) < this.cacheTtlMs) {
      ctx.state.lang = cached.lang;
      return;
    }

    try {
      const user = await User.findOne({ telegramId }).select('languageCode languageSelected').lean();

      if (!user) {
        ctx.state.lang = detectedLang;
        return;
      }

      // If user has explicitly selected a language, always respect it
      // Otherwise fall back to detected language
      const userLang = user.languageSelected ? user.languageCode : (user.languageCode || detectedLang);

      // Update cache
      this.cache.set(telegramId, {
        lang: userLang,
        lastChecked: now
      });

      ctx.state.lang = userLang;
    } catch (error) {
      console.error('[LanguageSync] Error:', error.message);
      ctx.state.lang = DEFAULT_LANGUAGE;
    }
  }

  /**
   * Update language for user (when they manually change it)
   */
  async setLanguage(telegramId, lang) {
    if (!SUPPORTED_LANGUAGES.includes(lang)) return false;

    await User.updateOne(
      { telegramId },
      { $set: { languageCode: lang, languageSelected: true } }
    );

    this.cache.set(telegramId, {
      lang,
      lastChecked: Date.now()
    });

    return true;
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
      console.log(`🧹 LanguageSync: cleaned ${deleted} cache entries`);
    }
  }

  invalidate(telegramId) {
    this.cache.delete(telegramId);
  }

  destroy() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

const languageSync = new LanguageSync();

const languageSyncMiddleware = async (ctx, next) => {
  await languageSync.sync(ctx);
  return next();
};

module.exports = {
  languageSyncMiddleware,
  languageSync,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE
};
