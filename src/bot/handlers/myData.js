/**
 * My Data Handler
 *
 * Handles user data management:
 * - View saved email
 * - Add/Change/Delete email
 */

const Session = require('../../models/Session');
const User = require('../../models/User');
const emailService = require('../../services/emailService');
const messageManager = require('../utils/messageManager');
const { mainMenuButton, backButton } = require('../keyboards/main');
const { Markup } = require('telegraf');

/**
 * Check if user has active myData session (for email input)
 */
async function hasMyDataSession(telegramId) {
  const session = await Session.getSession(telegramId, 'my_data');
  return !!session;
}

/**
 * Clear myData session
 */
async function clearMyDataSession(telegramId) {
  await Session.deleteSession(telegramId, 'my_data');
}

/**
 * Show My Data screen
 */
async function showMyData(ctx) {
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const telegramId = ctx.from.id;

    // Clear any existing session
    await clearMyDataSession(telegramId);

    // Get user data
    const user = await User.findOne({ telegramId }).select('email username firstName');

    if (!user) {
      const keyboard = mainMenuButton();
      await messageManager.sendNewMessage(ctx, telegramId, '❌ Пользователь не найден.', keyboard);
      return;
    }

    const email = user.email;

    if (email) {
      // User has email saved
      const text = `👤 *Мои данные*

📧 *Email для чеков:*
\`${email}\`

Чеки о транзакциях будут автоматически предлагаться на эту почту.`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✏️ Изменить', 'mydata_change_email')],
        [Markup.button.callback('🗑 Удалить', 'mydata_delete_email')],
        [Markup.button.callback('⬅️ Назад', 'main_menu')]
      ]);

      await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    } else {
      // No email saved
      const text = `👤 *Мои данные*

📧 *Email для чеков:*
_Не указан_

Добавьте email, чтобы получать чеки о транзакциях автоматически.`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить email', 'mydata_add_email')],
        [Markup.button.callback('⬅️ Назад', 'main_menu')]
      ]);

      await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    }
  } catch (error) {
    console.error('Error in showMyData:', error);
  }
}

/**
 * Handle add/change email button - ask for email input
 */
async function handleAddEmail(ctx) {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    // Create session for email input
    await Session.setSession(telegramId, 'my_data', {
      action: 'add_email',
      createdAt: new Date()
    }, 1); // TTL 1 hour

    const text = `📧 *Введите email*

Отправьте адрес электронной почты для получения чеков:`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('❌ Отмена', 'mydata_cancel')]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in handleAddEmail:', error);
  }
}

/**
 * Handle change email button
 */
async function handleChangeEmail(ctx) {
  // Same as add email
  await handleAddEmail(ctx);
}

/**
 * Handle delete email button
 */
async function handleDeleteEmail(ctx) {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    const text = `🗑 *Удалить email?*

Вы уверены, что хотите удалить сохранённый email?

После удаления вам придётся вводить email вручную при каждой сделке.`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Да, удалить', 'mydata_confirm_delete'),
        Markup.button.callback('❌ Отмена', 'my_data')
      ]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in handleDeleteEmail:', error);
  }
}

/**
 * Confirm delete email
 */
async function handleConfirmDelete(ctx) {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    // Delete email from user
    await User.updateOne(
      { telegramId },
      { $set: { email: null } }
    );

    const text = `✅ *Email удалён*

Сохранённый email был удалён.`;

    await messageManager.sendNewMessage(ctx, telegramId, text, { inline_keyboard: [] });

    // After 2 seconds, return to My Data
    setTimeout(async () => {
      try {
        await showMyData(ctx);
      } catch (e) {
        // Message might have been changed
      }
    }, 2000);
  } catch (error) {
    console.error('Error in handleConfirmDelete:', error);
  }
}

/**
 * Handle cancel button - return to My Data
 */
async function handleCancel(ctx) {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    // Clear session
    await clearMyDataSession(telegramId);

    // Return to My Data screen
    await showMyData(ctx);
  } catch (error) {
    console.error('Error in handleCancel:', error);
  }
}

/**
 * Handle email input from user
 */
async function handleMyDataEmailInput(ctx) {
  const telegramId = ctx.from.id;
  const email = ctx.message.text.trim();

  // Delete user message
  await messageManager.deleteUserMessage(ctx);

  const session = await Session.getSession(telegramId, 'my_data');
  if (!session || session.action !== 'add_email') {
    return false;
  }

  // Initialize email service for validation
  emailService.init();

  // Validate email
  if (!emailService.constructor.isValidEmail(email)) {
    const text = `❌ *Неверный формат email*

Пожалуйста, введите корректный адрес электронной почты:`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('❌ Отмена', 'mydata_cancel')]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    return true;
  }

  // Clear session
  await clearMyDataSession(telegramId);

  // Save email to user
  await User.updateOne(
    { telegramId },
    { $set: { email } }
  );

  const text = `✅ *Email сохранён!*

📧 ${email}

Теперь чеки будут автоматически предлагаться на эту почту.`;

  await messageManager.sendNewMessage(ctx, telegramId, text, { inline_keyboard: [] });

  // After 2 seconds, return to My Data
  setTimeout(async () => {
    try {
      await showMyData(ctx);
    } catch (e) {
      // Message might have been changed
    }
  }, 2000);

  return true;
}

module.exports = {
  hasMyDataSession,
  clearMyDataSession,
  showMyData,
  handleAddEmail,
  handleChangeEmail,
  handleDeleteEmail,
  handleConfirmDelete,
  handleCancel,
  handleMyDataEmailInput
};
