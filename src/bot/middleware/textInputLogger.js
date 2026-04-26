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
    // Логируем текстовые сообщения
    // ==========================================
    if (ctx.message?.text) {
      const text = ctx.message.text;

      // Логируем с маскировкой чувствительных данных
      const { sanitized, suspicious, type } = logTextInput(
        telegramId,
        username,
        text,
        'text_message'
      );

      // Если детектили атаку - отправляем ALERT администратору
      if (suspicious) {
        console.error(`⚠️  SECURITY ALERT: ${type} detected from @${username} (${telegramId})`);

        try {
          await adminAlertService.alert(
            `🚨 *POTENTIAL ATTACK DETECTED*\n\n` +
            `Type: ${type}\n` +
            `User: @${username} (${telegramId})\n` +
            `Text: ${text.slice(0, 100)}\n` +
            `Time: ${new Date().toISOString()}`
          );
        } catch (e) {
          console.error('Error sending security alert:', e);
        }
      }

      // Сохраняем в контекст для использования в других middleware
      ctx.userTextInput = {
        raw: text,
        sanitized: sanitized,
        suspicious: suspicious,
        type: type
      };
    }

    // ==========================================
    // Логируем callback queries (кнопки)
    // ==========================================
    if (ctx.callbackQuery?.data) {
      const data = ctx.callbackQuery.data;

      // Callback queries обычно не содержат чувствительные данные,
      // но логируем для полноты (format: action:param1:param2)
      console.log(
        `🔘 [${new Date().toISOString()}] @${username} (${telegramId}): callback "${data}"`
      );
    }

    // ==========================================
    // Логируем команды
    // ==========================================
    if (ctx.message?.text?.startsWith('/')) {
      const command = ctx.message.text.split(' ')[0];
      const param = ctx.message.text.split(' ')[1] || '';

      console.log(
        `⌘  [${new Date().toISOString()}] @${username} (${telegramId}): command "${command}" ${param ? `param="${param}"` : ''}`
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
