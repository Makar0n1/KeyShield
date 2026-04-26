/**
 * Log Sanitizer - маскирует чувствительные данные для логирования
 * Позволяет видеть что вводит пользователь без утечки приватных данных
 *
 * ВАЖНО: Это детектор рисков, а НЕ основная защита!
 * Основная защита: allowlist-валидация, параметризация запросов, экранирование вывода.
 * Эти regex лишь дополнительный слой для раннего обнаружения подозрительного ввода.
 */

// Нормализует вход: URL decode, HTML entity decode, Unicode normalize
function normalizeForDetection(text) {
  if (!text) return '';

  let normalized = text;

  // URL decode (может повторяться несколько раз для обхода двойного кодирования)
  try {
    normalized = decodeURIComponent(normalized);
    // Второй раунд для двойного кодирования
    if (normalized.includes('%')) {
      normalized = decodeURIComponent(normalized);
    }
  } catch (e) {
    // Ignore decode errors
  }

  // HTML entity decode
  normalized = normalized
    .replace(/&#x([0-9a-f]+);?/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (m, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'");

  // Hex/unicode escape sequences
  normalized = normalized
    .replace(/\\x([0-9a-f]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16)));

  // Remove null bytes
  normalized = normalized.replace(/\x00/g, '');

  // Lowercase for case-insensitive matching
  normalized = normalized.toLowerCase();

  return normalized;
}

// Более точные паттерны, учитывающие real-world атаки
const SUSPICIOUS_PATTERNS = [
  {
    regex: /(\bUNION\b\s+\bSELECT\b|\bSELECT\b.+\bFROM\b|\bDROP\b\s+\bTABLE\b|\bINSERT\b\s+\bINTO\b|\bDELETE\b\s+\bFROM\b|--|\/\*|\*\/|;\s*(?:SELECT|INSERT|UPDATE|DELETE|DROP)\b)/gi,
    name: 'SQL_INJECTION',
    risk: 'high'
  },
  {
    regex: /(javascript:|vbscript:|data:text\/html|<script|<\/script|srcdoc=|<iframe|<svg|<math|\bon\w+\s*=|eval\(|Function\()/gi,
    name: 'XSS_ATTEMPT',
    risk: 'high'
  },
  {
    regex: /(\{\{[^{}]{0,200}\}\}|\$\{[^{}]{0,200}\}|<%=?[\s\S]{0,200}?%>|\[%[\s\S]{0,200}?%\]|#\{[^{}]{0,200}\})/g,
    name: 'SSTI_ATTEMPT',
    risk: 'high'
  },
  {
    regex: /(base64_decode|system\(|exec\(|passthru\(|shell_exec\(|\|\||&&|`|\$\(|\${IFS}|;\s*(?:bash|sh|zsh|whoami|cat|ls|dir|curl|wget|nc|ncat|netcat|telnet|ssh|scp|powershell|pwsh|cmd|python|perl|ruby|node)\b|(?:^|[\s;|&])(?:bash|sh|zsh|powershell|pwsh|cmd)(?:[\s/]|$)|\b(?:invoke-expression|iex|start-process)\b|\b\/c\b|\b-enc\b)/gi,
    name: 'COMMAND_INJECTION',
    risk: 'high'
  },
  {
    regex: /(\.\.\/|\.\.\\|\.\.%2f|\.\.%5c|%2e%2e%2f|%2e%2e%5c|%252e%252e%252f|%252e%252e%255c|cmd\.exe|\/bin\/bash|\/bin\/sh|\/etc\/passwd|\/proc\/self|boot\.ini|win\.ini)/gi,
    name: 'PATH_TRAVERSAL',
    risk: 'high'
  },
  {
    regex: /(\b(?:file|gopher|dict|smb|ldap|ldaps|tftp|data|jar|php|phar):\/\/|(?:https?:)?\/\/(?:localhost|127\..+?|0\.0\.0\.0|\[?::1\]?|10\..+?|172\.(?:1[6-9]|2\d|3[01])\..+?|192\.168\..+?|169\.254\..+?)(?:[\s:/]|$)|localhost|127\.0\.0\.1|0\.0\.0\.0|::1)/gi,
    name: 'SSRF_ATTEMPT',
    risk: 'high'
  },
  {
    regex: /((?:\r|\n|%0d|%0a|\\r|\\n)+\s*(?:host:|set-cookie:|location:|x-forwarded-|content-length:))/gi,
    name: 'CRLF_HEADER_INJECTION',
    risk: 'high'
  },
  {
    regex: /(<!DOCTYPE|<!ENTITY|SYSTEM\s+["']|PUBLIC\s+["']|\]\]>)/gi,
    name: 'XXE_ATTEMPT',
    risk: 'high'
  },
  {
    regex: /((?:^|[{"'\s])\$(?:ne|gt|gte|lt|lte|in|nin|or|and|where|regex)\b)/gi,
    name: 'NOSQL_INJECTION',
    risk: 'high'
  },
  {
    regex: /(__proto__|constructor\.prototype|prototype\s*:)/gi,
    name: 'PROTOTYPE_POLLUTION',
    risk: 'high'
  },
  {
    regex: /(\.(?:php\d*|phtml|phar|jsp|jspx|asp|aspx|cgi|pl|py|sh|bat|cmd|ps1|exe|dll)(?:[;\s]|$)|\.(?:jpg|jpeg|png|gif|pdf|txt)\.(?:php|jsp|asp|aspx|exe)\b)/gi,
    name: 'MALICIOUS_FILE_UPLOAD',
    risk: 'high'
  },
  {
    regex: /(%25[0-9a-f]{2}|&#x?[0-9a-f]{2,8};?|\\x[0-9a-f]{2}|\\u[0-9a-f]{4}|%00)/gi,
    name: 'ENCODED_OBFUSCATION',
    risk: 'medium'
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
 * Проверяет как raw, так и normalized версии (для обхода кодировки)
 * Возвращает { threat: string, risk: string } или null
 *
 * ВАЖНО: Это детектор, а не блокировщик!
 * Используется для логирования и алерта, но не должен блокировать пользователя полностью.
 */
function detectSuspiciousPatterns(text) {
  if (!text) return null;

  // Проверяем обе версии: raw и normalized
  const normalized = normalizeForDetection(text);

  // Проверяем raw текст
  for (const pattern of SUSPICIOUS_PATTERNS) {
    // Важно! Сбросить lastIndex для regex с флагом /g перед каждым тестом
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) {
      return {
        threat: pattern.name,
        risk: pattern.risk,
        matched: 'raw',
        normalized: false
      };
    }
  }

  // Проверяем normalized (ловит обходы через кодировку)
  if (normalized !== text) {
    for (const pattern of SUSPICIOUS_PATTERNS) {
      // Сбросить lastIndex перед каждым тестом
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(normalized)) {
        return {
          threat: pattern.name,
          risk: pattern.risk,
          matched: 'normalized',
          normalized: true
        };
      }
    }
  }

  return null;
}

/**
 * Логирует текстовый ввод пользователя безопасно
 * Возвращает { sanitized, suspicious, type, risk, matched }
 */
function logTextInput(telegramId, username, text, context = 'text_input') {
  const sanitized = sanitizeForLog(text);
  const suspicion = detectSuspiciousPatterns(text);

  if (suspicion) {
    // ⚠️ ALERT - потенциальная атака
    const alertMsg = suspicion.normalized
      ? `🚨 [SECURITY] @${username} (${telegramId}): ${context} - DETECTED ${suspicion.threat} (via encoding)`
      : `🚨 [SECURITY] @${username} (${telegramId}): ${context} - DETECTED ${suspicion.threat}`;

    console.error(
      alertMsg,
      `\nRisk: ${suspicion.risk.toUpperCase()}`,
      `\nOriginal: ${text.slice(0, 100)}`,
      `\nSanitized: "${sanitized}"`
    );

    return {
      sanitized,
      suspicious: true,
      type: suspicion.threat,
      risk: suspicion.risk,
      matched: suspicion.matched,
      normalized: suspicion.normalized
    };
  }

  // Обычное логирование
  console.log(`👤 [${new Date().toISOString()}] @${username} (${telegramId}): ${context} "${sanitized}"`);
  return {
    sanitized,
    suspicious: false,
    type: null,
    risk: null,
    matched: null,
    normalized: false
  };
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
  normalizeForDetection,
  detectSuspiciousPatterns,
  logTextInput,
  logAddressInput,
  logAmountInput,
  formatLog,
  // Export patterns for testing/documentation
  SUSPICIOUS_PATTERNS
};
