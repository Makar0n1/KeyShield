/**
 * Log Sanitizer - маскирует чувствительные данные для логирования
 * Позволяет видеть что вводит пользователь без утечки приватных данных
 */

const SUSPICIOUS_PATTERNS = [
  {
    regex: /(\bOR\b\s|\bAND\b\s|--|;|\/\*|DROP\b|DELETE\b|INSERT\b|UPDATE\b|UNION\b|SELECT\b|EXEC\b|EXECUTE\b)/gi,
    name: 'SQL_INJECTION'
  },
  {
    regex: /(<script|javascript:|onerror|onload|eval\(|<iframe)/gi,
    name: 'XSS_ATTEMPT'
  },
  {
    regex: /(\${.*}|<\?php|<%|<\?=)/gi,
    name: 'CODE_INJECTION'
  },
  {
    regex: /(base64_decode|system\(|exec\(|passthru\(|shell_exec\()/gi,
    name: 'COMMAND_INJECTION'
  },
  {
    regex: /\.\.\/|\.\.\\|cmd\.exe|\/bin\/bash|\/bin\/sh/gi,
    name: 'PATH_TRAVERSAL'
  }
];

function sanitizeForLog(text) {
  if (!text) return '[empty]';

  // Обрезаем длину для логов (слишком длинные строки неудобны)
  let safe = text.slice(0, 150);

  // Маскируем TRON адреса (T + 33 символа)
  safe = safe.replace(/T[A-Za-z0-9]{33}/g, 'T***[addr]');

  // Маскируем Bitcoin адреса (1, 3 или bc1 + >25 символов)
  safe = safe.replace(/\b(1|3|bc1)[A-Za-z0-9]{25,}\b/g, '***[btc_addr]');

  // Маскируем Ethereum адреса (0x + 40 хекс символов)
  safe = safe.replace(/0x[A-Fa-f0-9]{40}\b/g, '0x***[eth_addr]');

  // Маскируем потенциальные суммы (3+ цифр подряд)
  safe = safe.replace(/\b\d{3,}\b/g, '[num]');

  // Маскируем hex строки похожие на ключи (32+ символов)
  safe = safe.replace(/\b[a-f0-9]{32,}\b/gi, '[hex]');

  // Маскируем потенциальные seed phrases (12-24 слова через пробел)
  const wordCount = safe.split(/\s+/).length;
  if (wordCount >= 12 && wordCount <= 24 && safe.split(/\s+/).every(w => /^[a-z]+$/i.test(w))) {
    safe = '[seed_phrase]';
  }

  // Маскируем email адреса
  safe = safe.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]');

  // Маскируем номера телефонов
  safe = safe.replace(/\+?[\d\s\-\(\)]{7,}/g, '[phone]');

  return safe;
}

/**
 * Проверяет текст на подозрительные паттерны атак
 * Возвращает тип подозрения или null
 */
function detectSuspiciousPatterns(text) {
  if (!text) return null;

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.regex.test(text)) {
      return pattern.name;
    }
  }

  return null;
}

/**
 * Логирует текстовый ввод пользователя безопасно
 */
function logTextInput(telegramId, username, text, context = 'text_input') {
  const sanitized = sanitizeForLog(text);
  const suspicious = detectSuspiciousPatterns(text);

  if (suspicious) {
    // ⚠️ ALERT - потенциальная атака
    console.error(
      `🚨 [SECURITY] @${username} (${telegramId}): ${context} - DETECTED ${suspicious}`,
      `\nOriginal: ${text.slice(0, 100)}`,
      `\nSanitized: "${sanitized}"`
    );
    return { sanitized, suspicious: true, type: suspicious };
  }

  // Обычное логирование
  console.log(`👤 [${new Date().toISOString()}] @${username} (${telegramId}): ${context} "${sanitized}"`);
  return { sanitized, suspicious: false };
}

/**
 * Логирует вводы адресов с дополнительной валидацией
 */
function logAddressInput(telegramId, username, address, addressType = 'wallet') {
  const sanitized = sanitizeForLog(address);
  console.log(`📍 [${new Date().toISOString()}] @${username} (${telegramId}): ${addressType}_address "${sanitized}"`);
  return sanitized;
}

/**
 * Логирует вводы сумм
 */
function logAmountInput(telegramId, username, amount) {
  console.log(`💰 [${new Date().toISOString()}] @${username} (${telegramId}): amount_input "[num]"`);
}

/**
 * Форматирует лог в единообразный вид
 */
function formatLog(telegramId, username, action, details = {}) {
  const timestamp = new Date().toISOString();
  let logLine = `👤 [${timestamp}] @${username} (${telegramId}): ${action}`;

  if (Object.keys(details).length > 0) {
    const sanitizedDetails = {};
    for (const [key, value] of Object.entries(details)) {
      if (typeof value === 'string') {
        sanitizedDetails[key] = sanitizeForLog(value);
      } else {
        sanitizedDetails[key] = value;
      }
    }
    logLine += ` ${JSON.stringify(sanitizedDetails)}`;
  }

  return logLine;
}

module.exports = {
  sanitizeForLog,
  detectSuspiciousPatterns,
  logTextInput,
  logAddressInput,
  logAmountInput,
  formatLog
};
