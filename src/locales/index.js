/**
 * KeyShield i18n System
 *
 * Usage in handlers (with ctx):
 *   const { t, formatDate } = require('../../locales');
 *   const lang = ctx.state.lang || 'ru';
 *   const text = t(lang, 'welcome.title');
 *   const text = t(lang, 'welcome.commission', { amount: 6 });
 *
 * Usage in services (without ctx):
 *   const user = await User.findOne({ telegramId }).select('languageCode').lean();
 *   const lang = user?.languageCode || 'ru';
 *   const text = t(lang, 'notifications.deposit_confirmed', { dealId, amount });
 */

const ru = require('./ru');
const en = require('./en');
const uk = require('./uk');

const locales = { ru, en, uk };

const LOCALE_MAP = {
  ru: 'ru-RU',
  en: 'en-US',
  uk: 'uk-UA'
};

/**
 * Get translation by key with interpolation support
 * @param {string} lang - Language code ('ru', 'en', 'uk')
 * @param {string} key - Dot-separated key (e.g., 'welcome.title')
 * @param {Object} params - Interpolation parameters
 * @returns {string} Translated string
 */
function t(lang, key, params = {}) {
  const keys = key.split('.');
  let value = locales[lang] || locales.ru;

  for (const k of keys) {
    value = value?.[k];
    if (value === undefined) break;
  }

  // Fallback to Russian
  if (value === undefined || value === null) {
    value = locales.ru;
    for (const k of keys) {
      value = value?.[k];
      if (value === undefined) break;
    }
  }

  // Still not found — return key
  if (value === undefined || value === null) {
    return key;
  }

  // Function-style translation (for complex interpolation)
  if (typeof value === 'function') {
    return value(params);
  }

  // Simple string interpolation: {amount}, {dealId}, etc.
  if (typeof value === 'string' && Object.keys(params).length > 0) {
    return value.replace(/\{(\w+)\}/g, (_, k) => {
      return params[k] !== undefined ? params[k] : `{${k}}`;
    });
  }

  return value;
}

/**
 * Format date according to locale
 * @param {string} lang - Language code
 * @param {Date} date - Date to format
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string}
 */
function formatDate(lang, date, options = {}) {
  const locale = LOCALE_MAP[lang] || 'ru-RU';
  const defaultOptions = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    ...options
  };
  return new Date(date).toLocaleString(locale, defaultOptions);
}

/**
 * Get locale string for date-fns or toLocaleString
 */
function getLocale(lang) {
  return LOCALE_MAP[lang] || 'ru-RU';
}

module.exports = { t, formatDate, getLocale, LOCALE_MAP };
