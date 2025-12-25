/**
 * My Data Handler
 *
 * Handles user data management:
 * - View saved email
 * - Add/Change/Delete email
 * - View/Add/Delete saved USDT wallets (max 5)
 */

const Session = require('../../models/Session');
const User = require('../../models/User');
const emailService = require('../../services/emailService');
const blockchainService = require('../../services/blockchain');
const messageManager = require('../utils/messageManager');
const {
  mainMenuButton,
  backButton,
  myDataMenuKeyboard,
  walletsListKeyboard,
  walletsEmptyKeyboard,
  walletNameInputKeyboard,
  confirmDeleteWalletKeyboard,
  emailActionsKeyboard
} = require('../keyboards/main');
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
 * Show My Data screen - main menu with email and wallets
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
    const user = await User.findOne({ telegramId }).select('email username firstName wallets');

    if (!user) {
      const keyboard = mainMenuButton();
      await messageManager.sendNewMessage(ctx, telegramId, '❌ Пользователь не найден.', keyboard);
      return;
    }

    const email = user.email;
    const wallets = user.wallets || [];
    const walletsCount = wallets.length;

    // Build display text
    let emailDisplay = '_Не указан_';
    if (email) {
      emailDisplay = `\`${email}\``;
    }

    let walletsDisplay = '_Нет сохранённых кошельков_';
    if (walletsCount > 0) {
      walletsDisplay = wallets.map((w, i) => {
        const name = w.name || `Кошелёк ${i + 1}`;
        const shortAddr = w.address.slice(0, 6) + '...' + w.address.slice(-4);
        return `• ${name}: \`${shortAddr}\``;
      }).join('\n');
    }

    const text = `👤 *Мои данные*

📧 *Email для чеков:*
${emailDisplay}

💳 *Сохранённые кошельки (${walletsCount}/5):*
${walletsDisplay}

_Выберите раздел для редактирования:_`;

    const keyboard = myDataMenuKeyboard(!!email, walletsCount);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
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

// ============================================
// WALLETS SECTION
// ============================================

/**
 * Show wallets list
 */
async function showWalletsList(ctx) {
  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const telegramId = ctx.from.id;
    const user = await User.findOne({ telegramId }).select('wallets');

    if (!user) {
      const keyboard = mainMenuButton();
      await messageManager.sendNewMessage(ctx, telegramId, '❌ Пользователь не найден.', keyboard);
      return;
    }

    const wallets = user.wallets || [];

    if (wallets.length === 0) {
      const text = `💳 *Мои кошельки*

_У вас нет сохранённых кошельков._

Добавьте кошелёк, чтобы быстро выбирать его при создании или принятии сделок.`;

      const keyboard = walletsEmptyKeyboard();
      await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
      return;
    }

    // Show wallets list
    let walletsText = wallets.map((w, i) => {
      const name = w.name || `Кошелёк ${i + 1}`;
      return `*${i + 1}. ${name}*\n\`${w.address}\``;
    }).join('\n\n');

    const text = `💳 *Мои кошельки (${wallets.length}/5)*

${walletsText}

_Нажмите на кошелёк для просмотра или 🗑️ для удаления._`;

    const keyboard = walletsListKeyboard(wallets);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in showWalletsList:', error);
  }
}

/**
 * View wallet details
 */
async function viewWallet(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const walletIndex = parseInt(ctx.callbackQuery.data.split(':')[2]);

    const user = await User.findOne({ telegramId }).select('wallets');
    if (!user || !user.wallets[walletIndex]) {
      await ctx.answerCbQuery('❌ Кошелёк не найден', { show_alert: true });
      return;
    }

    const wallet = user.wallets[walletIndex];
    const name = wallet.name || `Кошелёк ${walletIndex + 1}`;
    const createdAt = wallet.createdAt ? new Date(wallet.createdAt).toLocaleDateString('ru-RU') : 'Неизвестно';

    const text = `💳 *${name}*

📍 *Адрес:*
\`${wallet.address}\`

📅 *Добавлен:* ${createdAt}

[🔍 Посмотреть в TronScan](https://tronscan.org/#/address/${wallet.address})`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🗑️ Удалить кошелёк', `wallet:delete:${walletIndex}`)],
      [Markup.button.callback('⬅️ Назад', 'mydata:wallets')]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in viewWallet:', error);
  }
}

/**
 * Handle delete wallet button - show confirmation
 */
async function handleDeleteWallet(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const walletIndex = parseInt(ctx.callbackQuery.data.split(':')[2]);

    const user = await User.findOne({ telegramId }).select('wallets');
    if (!user || !user.wallets[walletIndex]) {
      await ctx.answerCbQuery('❌ Кошелёк не найден', { show_alert: true });
      return;
    }

    const wallet = user.wallets[walletIndex];
    const name = wallet.name || `Кошелёк ${walletIndex + 1}`;
    const shortAddr = wallet.address.slice(0, 6) + '...' + wallet.address.slice(-4);

    const text = `🗑️ *Удалить кошелёк?*

*${name}*
\`${shortAddr}\`

Вы уверены, что хотите удалить этот кошелёк?`;

    const keyboard = confirmDeleteWalletKeyboard(walletIndex);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in handleDeleteWallet:', error);
  }
}

/**
 * Confirm wallet deletion
 */
async function confirmDeleteWallet(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const walletIndex = parseInt(ctx.callbackQuery.data.split(':')[2]);

    const user = await User.findOne({ telegramId });
    if (!user || !user.wallets[walletIndex]) {
      await ctx.answerCbQuery('❌ Кошелёк не найден', { show_alert: true });
      return;
    }

    const wallet = user.wallets[walletIndex];
    const error = await user.removeWallet(wallet.address);

    if (error) {
      await ctx.answerCbQuery(error, { show_alert: true });
      return;
    }

    const text = `✅ *Кошелёк удалён*`;
    await messageManager.sendNewMessage(ctx, telegramId, text, { inline_keyboard: [] });

    // Return to wallets list after 1.5 seconds
    setTimeout(async () => {
      try {
        await showWalletsList(ctx);
      } catch (e) {
        // Message might have been changed
      }
    }, 1500);
  } catch (error) {
    console.error('Error in confirmDeleteWallet:', error);
  }
}

/**
 * Handle add wallet button - ask for address
 */
async function handleAddWallet(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    // Check limit
    const user = await User.findOne({ telegramId }).select('wallets');
    if (user && user.wallets && user.wallets.length >= 5) {
      await ctx.answerCbQuery('❌ Достигнут лимит (5) кошельков. Удалите один, чтобы добавить новый.', { show_alert: true });
      return;
    }

    // Create session for wallet input
    await Session.setSession(telegramId, 'my_data', {
      action: 'add_wallet',
      step: 'address',
      createdAt: new Date()
    }, 1); // TTL 1 hour

    const text = `💳 *Добавить кошелёк*

Введите адрес вашего TRON-кошелька (TRC-20):

_Адрес должен начинаться с T и содержать 34 символа_
_Пример: TQRfXYMDSspGDB7GB8MevZpkYgUXkviCSj_`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('❌ Отмена', 'mydata:wallets')]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in handleAddWallet:', error);
  }
}

/**
 * Handle wallet address input
 */
async function handleWalletAddressInput(ctx) {
  const telegramId = ctx.from.id;
  const address = ctx.message.text.trim();

  // Delete user message
  await messageManager.deleteUserMessage(ctx);

  const session = await Session.getSession(telegramId, 'my_data');
  if (!session || session.action !== 'add_wallet' || session.step !== 'address') {
    return false;
  }

  // Check limit again
  const user = await User.findOne({ telegramId }).select('wallets');
  if (user && user.wallets && user.wallets.length >= 5) {
    const text = `❌ *Достигнут лимит кошельков*

У вас уже сохранено 5 кошельков. Удалите один, чтобы добавить новый.`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ К кошелькам', 'mydata:wallets')]
    ]);

    await clearMyDataSession(telegramId);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    return true;
  }

  // Check for duplicate
  if (user && user.wallets) {
    const exists = user.wallets.some(w => w.address.toLowerCase() === address.toLowerCase());
    if (exists) {
      const text = `❌ *Этот адрес уже сохранён*

Введите другой адрес:`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('❌ Отмена', 'mydata:wallets')]
      ]);

      await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
      return true;
    }
  }

  // Show verification loading
  const verifyingText = `⏳ *Проверяем адрес...*

Проверка кошелька в сети TRON.`;

  await messageManager.sendNewMessage(ctx, telegramId, verifyingText, null);

  // Validate address format first
  if (!blockchainService.isValidAddress(address)) {
    const text = `❌ *Неверный формат адреса*

Адрес должен начинаться с T и содержать 34 символа.
_Пример: TQRfXYMDSspGDB7GB8MevZpkYgUXkviCSj_

Попробуйте ещё раз:`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('❌ Отмена', 'mydata:wallets')]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    return true;
  }

  // Verify wallet exists on TRON network
  const verification = await blockchainService.verifyWalletExists(address);

  if (!verification.valid) {
    let errorMessage;
    if (verification.errorType === 'not_found') {
      errorMessage = `❌ *Кошелёк не найден*

Этот адрес не активирован в сети TRON.
Убедитесь, что кошелёк имеет хотя бы одну транзакцию.

Введите другой адрес:`;
    } else if (verification.errorType === 'api_error') {
      errorMessage = `❌ *Ошибка проверки*

Не удалось проверить кошелёк. Попробуйте позже.`;
    } else {
      errorMessage = `❌ *Ошибка*

${verification.error || 'Неизвестная ошибка'}

Введите другой адрес:`;
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('❌ Отмена', 'mydata:wallets')]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, errorMessage, keyboard);
    return true;
  }

  // Wallet verified! Save to session and ask for name
  await Session.setSession(telegramId, 'my_data', {
    action: 'add_wallet',
    step: 'name',
    address: address,
    createdAt: new Date()
  }, 1);

  const shortAddr = address.slice(0, 6) + '...' + address.slice(-4);

  const text = `✅ *Кошелёк проверен!*

📍 \`${shortAddr}\`

Введите название для кошелька (например: "Основной", "Binance")
или нажмите «Пропустить».`;

  const keyboard = walletNameInputKeyboard();
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  return true;
}

/**
 * Handle wallet name input
 */
async function handleWalletNameInput(ctx) {
  const telegramId = ctx.from.id;
  const name = ctx.message.text.trim();

  // Delete user message
  await messageManager.deleteUserMessage(ctx);

  const session = await Session.getSession(telegramId, 'my_data');
  if (!session || session.action !== 'add_wallet' || session.step !== 'name') {
    return false;
  }

  // Validate name length
  if (name.length > 30) {
    const text = `❌ *Слишком длинное название*

Максимум 30 символов. Попробуйте короче:`;

    const keyboard = walletNameInputKeyboard();
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    return true;
  }

  // Save wallet with name
  await saveWalletFromSession(ctx, telegramId, session.address, name);
  return true;
}

/**
 * Handle skip wallet name
 */
async function handleWalletNameSkip(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const session = await Session.getSession(telegramId, 'my_data');

    if (!session || session.action !== 'add_wallet' || session.step !== 'name') {
      await showWalletsList(ctx);
      return;
    }

    // Save wallet without name
    await saveWalletFromSession(ctx, telegramId, session.address, null);
  } catch (error) {
    console.error('Error in handleWalletNameSkip:', error);
  }
}

/**
 * Handle back from wallet name input
 */
async function handleWalletNameBack(ctx) {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    // Clear session and return to wallet input
    await handleAddWallet(ctx);
  } catch (error) {
    console.error('Error in handleWalletNameBack:', error);
  }
}

/**
 * Save wallet from session
 */
async function saveWalletFromSession(ctx, telegramId, address, name) {
  try {
    const user = await User.findOne({ telegramId });
    if (!user) {
      await ctx.answerCbQuery('❌ Пользователь не найден', { show_alert: true });
      return;
    }

    const error = await user.addWallet(address, name);
    await clearMyDataSession(telegramId);

    if (error) {
      const text = `❌ *Ошибка*

${error}`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ К кошелькам', 'mydata:wallets')]
      ]);

      await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
      return;
    }

    const displayName = name || 'Кошелёк';
    const shortAddr = address.slice(0, 6) + '...' + address.slice(-4);

    const text = `✅ *Кошелёк сохранён!*

*${displayName}*
\`${shortAddr}\``;

    await messageManager.sendNewMessage(ctx, telegramId, text, { inline_keyboard: [] });

    // Return to wallets list after 1.5 seconds
    setTimeout(async () => {
      try {
        await showWalletsList(ctx);
      } catch (e) {
        // Message might have been changed
      }
    }, 1500);
  } catch (error) {
    console.error('Error in saveWalletFromSession:', error);
  }
}

// ============================================
// COMBINED TEXT INPUT HANDLER
// ============================================

/**
 * Handle any text input for myData section
 * Called from main bot index.js when my_data session exists
 */
async function handleMyDataTextInput(ctx) {
  const telegramId = ctx.from.id;

  const session = await Session.getSession(telegramId, 'my_data');
  if (!session) {
    return false;
  }

  // Route based on action and step
  if (session.action === 'add_email') {
    return await handleMyDataEmailInput(ctx);
  }

  if (session.action === 'add_wallet') {
    if (session.step === 'address') {
      return await handleWalletAddressInput(ctx);
    }
    if (session.step === 'name') {
      return await handleWalletNameInput(ctx);
    }
  }

  return false;
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
  handleMyDataEmailInput,
  // Wallets
  showWalletsList,
  viewWallet,
  handleDeleteWallet,
  confirmDeleteWallet,
  handleAddWallet,
  handleWalletAddressInput,
  handleWalletNameInput,
  handleWalletNameSkip,
  handleWalletNameBack,
  // Combined handler
  handleMyDataTextInput
};
