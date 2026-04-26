/**
 * Text Input Logger Middleware
 * Логирует ВСЕ текстовые вводы пользователей для security и отладки
 * Должен быть одним из ПЕРВЫХ middleware в цепочке
 */

const { logTextInput, detectSuspiciousPatterns } = require('../../utils/logSanitizer');
const adminAlertService = require('../../services/adminAlertService');

/**
 * Middleware для логирования текстовых вводов
 * Логирует все сообщения, даже те которые потом будут удалены
 */
const textInputLoggerMiddleware = async (ctx, next) => {
  try {
    const telegramId = ctx.from?.id;
    const username = ctx.from?.username || 'unknown';

    // ==========================================
    // Логируем текстовые сообщения (НО НЕ команды - они логируются отдельно)
    // ==========================================
    if (ctx.message?.text && !ctx.message.text.startsWith('/')) {
      const text = ctx.message.text;

      // Логируем с маскировкой чувствительных данных
      const result = logTextInput(
        telegramId,
        username,
        text,
        'text_input'
      );

      // Если детектили атаку - отправляем ALERT администратору
      if (result.suspicious) {
        try {
          const threatDesc = result.normalized
            ? `${result.type} (detected via encoding normalization)`
            : result.type;

          await adminAlertService.alertSecurityThreat(
            threatDesc,
            username,
            telegramId,
            text
          );
        } catch (e) {
          console.error(`[SECURITY] Failed to send alert: ${e.message}`);
        }
      }

      // Сохраняем в контекст для использования в других middleware
      ctx.userTextInput = {
        raw: text,
        sanitized: result.sanitized,
        suspicious: result.suspicious,
        type: result.type,
        risk: result.risk,
        matched: result.matched,
        normalized: result.normalized
      };
    }

    // ==========================================
    // Логируем команды
    // ==========================================
    if (ctx.message?.text?.startsWith('/')) {
      const command = ctx.message.text.split(' ')[0];
      const param = ctx.message.text.split(' ')[1] || '';

      console.log(
        `⌘  [${new Date().toISOString()}] @${username} (${telegramId}): ${command} ${param ? `"${param}"` : ''}`
      );
    }

    // ==========================================
    // Логируем callback queries (кнопки)
    // ==========================================
    if (ctx.callbackQuery?.data) {
      const data = ctx.callbackQuery.data;
      console.log(
        `🔘 [${new Date().toISOString()}] @${username} (${telegramId}): ${data}`
      );
    }

    // Продолжаем цепочку middleware
    return next();

  } catch (error) {
    console.error('Error in textInputLoggerMiddleware:', error);
    // Не блокируем выполнение если ошибка в логировании
    return next();
  }
};

module.exports = {
  textInputLoggerMiddleware
};
