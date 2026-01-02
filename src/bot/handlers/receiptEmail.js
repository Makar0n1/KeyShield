/**
 * Receipt Email Handler
 *
 * Handles the flow for sending transaction receipts via email:
 * 1. After successful payout - check if user has saved email
 * 2. If saved email - ask to send to that email
 * 3. If no saved email - ask if user wants receipt, then ask for email
 * 4. After sending - offer to save email for future
 */

const Session = require('../../models/Session');
const Deal = require('../../models/Deal');
const User = require('../../models/User');
const emailService = require('../../services/emailService');
const messageManager = require('../utils/messageManager');
const { mainMenuButton } = require('../keyboards/main');
const { Markup } = require('telegraf');
const { showRatingScreen } = require('./ratingHandler');

/**
 * Check if user has active receipt session
 */
async function hasReceiptSession(telegramId) {
  const session = await Session.getSession(telegramId, 'receipt_email');
  return !!session;
}

/**
 * Clear receipt session
 */
async function clearReceiptSession(telegramId) {
  await Session.deleteSession(telegramId, 'receipt_email');
}

/**
 * Create receipt session after successful payout
 * @param {number} telegramId - User telegram ID
 * @param {string} dealId - Deal ID
 * @param {Object} transactionData - Transaction details for receipt
 * @param {string} finalMessage - The final success message to show after
 * @param {string|null} savedEmail - User's saved email (if any)
 * @param {Object|null} ratingData - Data for rating step (if applicable)
 */
async function createReceiptSession(telegramId, dealId, transactionData, finalMessage, savedEmail = null, ratingData = null) {
  await Session.setSession(telegramId, 'receipt_email', {
    dealId,
    transactionData,
    finalMessage,
    savedEmail,
    ratingData, // { counterpartyId, counterpartyRole, counterpartyUsername }
    step: savedEmail ? 'ask_saved' : 'ask', // 'ask_saved' | 'ask' | 'waiting_email'
    emailUsed: null, // Email that was used to send receipt
    createdAt: new Date()
  }, 1); // TTL 1 hour
}

/**
 * Show receipt question after successful payout
 * Main entry point - checks if user has saved email
 * @param {Object} ctx - Telegraf context
 * @param {number} telegramId - User telegram ID
 * @param {Object} deal - Deal object
 * @param {Object} transactionData - Transaction details
 * @param {string} finalMessage - Message to show at the end
 * @param {Object|null} ratingData - Data for rating step { counterpartyId, counterpartyRole, counterpartyUsername }
 */
async function showReceiptQuestion(ctx, telegramId, deal, transactionData, finalMessage, ratingData = null) {
  // Initialize email service if not already
  emailService.init();

  // If email service is not configured, go to rating or final message
  if (!emailService.isEnabled()) {
    if (ratingData) {
      await showRatingScreen(ctx, telegramId, deal, ratingData.counterpartyId, ratingData.counterpartyRole, ratingData.counterpartyUsername, finalMessage);
    } else {
      const keyboard = mainMenuButton();
      await messageManager.sendNewMessage(ctx, telegramId, finalMessage, keyboard);
    }
    return;
  }

  // Check if user has saved email
  const user = await User.findOne({ telegramId }).select('email');
  const savedEmail = user?.email || null;

  // Create session for this flow
  await createReceiptSession(telegramId, deal.dealId, transactionData, finalMessage, savedEmail, ratingData);

  if (savedEmail) {
    // User has saved email - ask if they want to send to it
    const text = `📧 *Отправить чек на email?*

Отправить чек на сохранённую почту?
📮 \`${savedEmail}\``;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Да', `receipt_send_saved:${deal.dealId}`),
        Markup.button.callback('❌ Нет', `receipt_no:${deal.dealId}`)
      ]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } else {
    // No saved email - ask if user wants receipt
    const text = `📧 *Отправить чек на email?*

Хотите получить чек о транзакции на вашу электронную почту?`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Да', `receipt_yes:${deal.dealId}`),
        Markup.button.callback('❌ Нет', `receipt_no:${deal.dealId}`)
      ]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  }
}

/**
 * Helper: Proceed to rating or show final message
 */
async function proceedAfterReceipt(ctx, telegramId, session, deal, messagePrefix = '') {
  const fullMessage = messagePrefix ? `${messagePrefix}\n\n${session.finalMessage}` : session.finalMessage;

  if (session.ratingData) {
    // Show rating screen before final message
    await showRatingScreen(
      ctx,
      telegramId,
      deal,
      session.ratingData.counterpartyId,
      session.ratingData.counterpartyRole,
      session.ratingData.counterpartyUsername,
      fullMessage
    );
  } else {
    // No rating needed - show final message directly
    const keyboard = mainMenuButton();
    await messageManager.sendNewMessage(ctx, telegramId, fullMessage, keyboard);
  }
}

/**
 * Handle sending to saved email
 */
async function handleReceiptSendSaved(ctx) {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    const session = await Session.getSession(telegramId, 'receipt_email');
    if (!session || !session.savedEmail) {
      const keyboard = mainMenuButton();
      await messageManager.sendNewMessage(ctx, telegramId, '⚠️ Сессия истекла. Возвращаемся в главное меню.', keyboard);
      return;
    }

    // Show sending message
    const sendingText = `📧 *Отправка чека...*

Отправляем чек на: ${session.savedEmail}`;

    await messageManager.sendNewMessage(ctx, telegramId, sendingText, { inline_keyboard: [] });

    // Get deal for receipt
    const deal = await Deal.findOne({ dealId: session.dealId });
    if (!deal) {
      await clearReceiptSession(telegramId);
      const keyboard = mainMenuButton();
      await messageManager.sendNewMessage(ctx, telegramId, '❌ Сделка не найдена.', keyboard);
      return;
    }

    // Get user for PDF generation
    const user = await User.findOne({ telegramId }).select('username telegramId firstName');

    // Send receipt
    const sent = await emailService.sendReceipt(session.savedEmail, deal, session.transactionData, user);

    // Clear session before proceeding
    const ratingData = session.ratingData;
    const finalMessage = session.finalMessage;
    await clearReceiptSession(telegramId);

    // Proceed to rating or final message
    if (sent) {
      const prefix = `✅ *Чек отправлен!*\n\n📧 Email: ${session.savedEmail}`;
      await proceedAfterReceipt(ctx, telegramId, { ratingData, finalMessage }, deal, prefix);
    } else {
      const prefix = `⚠️ *Не удалось отправить чек*\n\nВозникла ошибка при отправке.`;
      await proceedAfterReceipt(ctx, telegramId, { ratingData, finalMessage }, deal, prefix);
    }
  } catch (error) {
    console.error('Error in handleReceiptSendSaved:', error);
  }
}

/**
 * Handle "Yes" button - ask for email (no saved email)
 */
async function handleReceiptYes(ctx) {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    const session = await Session.getSession(telegramId, 'receipt_email');
    if (!session) {
      const keyboard = mainMenuButton();
      await messageManager.sendNewMessage(ctx, telegramId, '⚠️ Сессия истекла. Возвращаемся в главное меню.', keyboard);
      return;
    }

    // Update session step
    session.step = 'waiting_email';
    await Session.setSession(telegramId, 'receipt_email', session, 1);

    const text = `📧 *Введите ваш email*

Отправьте адрес электронной почты, на который хотите получить чек:`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('❌ Отмена', `receipt_cancel:${session.dealId}`)]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in handleReceiptYes:', error);
  }
}

/**
 * Handle "No" button - proceed to rating or show final message
 */
async function handleReceiptNo(ctx) {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    const session = await Session.getSession(telegramId, 'receipt_email');
    if (!session) {
      const keyboard = mainMenuButton();
      await messageManager.sendNewMessage(ctx, telegramId, '⚠️ Сессия истекла. Возвращаемся в главное меню.', keyboard);
      return;
    }

    // Get deal for rating
    const deal = await Deal.findOne({ dealId: session.dealId });

    // Save rating data before clearing session
    const ratingData = session.ratingData;
    const finalMessage = session.finalMessage;

    // Clear session
    await clearReceiptSession(telegramId);

    // Proceed to rating or final message
    await proceedAfterReceipt(ctx, telegramId, { ratingData, finalMessage }, deal);
  } catch (error) {
    console.error('Error in handleReceiptNo:', error);
  }
}

/**
 * Handle cancel button
 */
async function handleReceiptCancel(ctx) {
  await handleReceiptNo(ctx);
}

/**
 * Handle email input from user (new email, not saved)
 */
async function handleEmailInput(ctx) {
  const telegramId = ctx.from.id;
  const email = ctx.message.text.trim();

  // Delete user message (email should not stay in chat)
  await messageManager.deleteUserMessage(ctx);

  const session = await Session.getSession(telegramId, 'receipt_email');
  if (!session || session.step !== 'waiting_email') {
    return false;
  }

  // Validate email
  if (!emailService.constructor.isValidEmail(email)) {
    const text = `❌ *Неверный формат email*

Пожалуйста, введите корректный адрес электронной почты:`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('❌ Отмена', `receipt_cancel:${session.dealId}`)]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    return true;
  }

  // Show sending message
  const sendingText = `📧 *Отправка чека...*

Отправляем чек на: ${email}`;

  await messageManager.sendNewMessage(ctx, telegramId, sendingText, { inline_keyboard: [] });

  // Get deal for receipt
  const deal = await Deal.findOne({ dealId: session.dealId });
  if (!deal) {
    await clearReceiptSession(telegramId);
    const keyboard = mainMenuButton();
    await messageManager.sendNewMessage(ctx, telegramId, '❌ Сделка не найдена.', keyboard);
    return true;
  }

  // Get user for PDF generation
  const user = await User.findOne({ telegramId }).select('username telegramId firstName');

  // Send receipt
  const sent = await emailService.sendReceipt(email, deal, session.transactionData, user);

  // Save data before clearing session
  const ratingData = session.ratingData;
  const finalMessage = session.finalMessage;

  // Clear session
  await clearReceiptSession(telegramId);

  // Show result
  if (sent) {
    // If there's rating to show, proceed to rating with success prefix
    if (ratingData) {
      const prefix = `✅ *Чек отправлен!*\n\n📧 Email: ${email}`;
      await proceedAfterReceipt(ctx, telegramId, { ratingData, finalMessage }, deal, prefix);
    } else {
      // No rating - show save email option
      const successText = `✅ *Чек отправлен!*

📧 Email: ${email}

${finalMessage}`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💾 Сохранить почту', `save_email:${encodeURIComponent(email)}`)],
        [Markup.button.callback('🏠 Главное меню', 'main_menu')]
      ]);

      await messageManager.sendNewMessage(ctx, telegramId, successText, keyboard);
    }
  } else {
    const prefix = `⚠️ *Не удалось отправить чек*\n\nВозникла ошибка при отправке.`;
    await proceedAfterReceipt(ctx, telegramId, { ratingData, finalMessage }, deal, prefix);
  }

  return true;
}

/**
 * Handle "Save email" button after sending receipt
 */
async function handleSaveEmail(ctx) {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    // Extract email from callback data
    const data = ctx.callbackQuery.data;
    const email = decodeURIComponent(data.replace('save_email:', ''));

    if (!email || !emailService.constructor.isValidEmail(email)) {
      return;
    }

    // Save email to user
    await User.updateOne(
      { telegramId },
      { $set: { email } }
    );

    // Show confirmation
    const text = `✅ *Почта сохранена!*

📧 ${email}

Теперь чеки будут автоматически предлагаться на эту почту.`;

    await messageManager.sendNewMessage(ctx, telegramId, text, { inline_keyboard: [] });

    // After 2 seconds, return to main menu
    setTimeout(async () => {
      try {
        const keyboard = mainMenuButton();
        await messageManager.sendNewMessage(ctx, telegramId, '🏠 *Главное меню*\n\nВыберите действие:', keyboard);
      } catch (e) {
        // Message might have been changed
      }
    }, 2000);
  } catch (error) {
    console.error('Error in handleSaveEmail:', error);
  }
}

/**
 * Send receipt to user (for notification flow - no interaction needed)
 * Used when sending to the OTHER party (e.g., buyer notification when seller completes)
 * @param {Object} ctx - Telegraf context
 * @param {number} telegramId - User telegram ID
 * @param {Object} deal - Deal object
 * @param {Object} transactionData - Transaction details
 * @param {string} notificationText - Notification text to show
 * @param {Object|null} ratingData - Data for rating step { counterpartyId, counterpartyRole, counterpartyUsername }
 */
async function sendReceiptNotification(ctx, telegramId, deal, transactionData, notificationText, ratingData = null) {
  // Initialize email service
  emailService.init();

  // If email service is not configured, go to rating or show notification
  if (!emailService.isEnabled()) {
    if (ratingData) {
      await showRatingScreen(ctx, telegramId, deal, ratingData.counterpartyId, ratingData.counterpartyRole, ratingData.counterpartyUsername, notificationText);
    } else {
      const keyboard = mainMenuButton();
      await messageManager.showNotification(ctx, telegramId, notificationText, keyboard);
    }
    return;
  }

  // Check if user has saved email
  const user = await User.findOne({ telegramId }).select('email');
  const savedEmail = user?.email || null;

  if (savedEmail) {
    // User has saved email - create session for receipt flow
    await createReceiptSession(telegramId, deal.dealId, transactionData, notificationText, savedEmail, ratingData);

    const text = `📧 *Отправить чек на email?*

Отправить чек на сохранённую почту?
📮 \`${savedEmail}\``;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Да', `receipt_send_saved:${deal.dealId}`),
        Markup.button.callback('❌ Нет', `receipt_no:${deal.dealId}`)
      ]
    ]);

    await messageManager.showNotification(ctx, telegramId, text, keyboard);
  } else {
    // No saved email - ask if user wants receipt
    await createReceiptSession(telegramId, deal.dealId, transactionData, notificationText, null, ratingData);

    const text = `📧 *Отправить чек на email?*

Хотите получить чек о транзакции на вашу электронную почту?`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Да', `receipt_yes:${deal.dealId}`),
        Markup.button.callback('❌ Нет', `receipt_no:${deal.dealId}`)
      ]
    ]);

    await messageManager.showNotification(ctx, telegramId, text, keyboard);
  }
}

module.exports = {
  hasReceiptSession,
  clearReceiptSession,
  createReceiptSession,
  showReceiptQuestion,
  sendReceiptNotification,
  handleReceiptSendSaved,
  handleReceiptYes,
  handleReceiptNo,
  handleReceiptCancel,
  handleEmailInput,
  handleSaveEmail
};
