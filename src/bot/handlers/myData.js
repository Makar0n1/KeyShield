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
const { t, formatDate } = require('../../locales');
const { languageSync } = require('../middleware/languageSync');
const {
  mainMenuButton,
  backButton,
  myDataMenuKeyboard,
  walletsListKeyboard,
  walletsEmptyKeyboard,
  walletNameInputKeyboard,
  confirmDeleteWalletKeyboard,
  emailActionsKeyboard,
  emailInputKeyboard,
  confirmDeleteEmailKeyboard
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
    const lang = ctx.state?.lang || 'ru';

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const telegramId = ctx.from.id;

    // Clear any existing session
    await clearMyDataSession(telegramId);

    // Get user data
    const user = await User.findOne({ telegramId }).select('email username firstName wallets averageRating ratingsCount');

    if (!user) {
      const keyboard = mainMenuButton(lang);
      await messageManager.sendNewMessage(ctx, telegramId, t(lang, 'common.user_not_found'), keyboard);
      return;
    }

    const email = user.email;
    const wallets = user.wallets || [];
    const walletsCount = wallets.length;

    // Get rating display
    const ratingDisplay = user.getRatingDisplay ? user.getRatingDisplay(lang) :
      (user.ratingsCount > 0 ? `⭐ ${user.averageRating} (${user.ratingsCount})` : t(lang, 'common.no_reviews'));

    // Build display text
    let emailDisplay = t(lang, 'common.not_specified');
    if (email) {
      emailDisplay = `\`${email}\``;
    }

    let walletsDisplay = t(lang, 'myData.no_wallets');
    if (walletsCount > 0) {
      walletsDisplay = wallets.map((w, i) => {
        const name = w.name || t(lang, 'wallet.default_name', { index: i + 1 });
        const shortAddr = w.address.slice(0, 6) + '...' + w.address.slice(-4);
        return `• ${name}: \`${shortAddr}\``;
      }).join('\n');
    }

    const text = t(lang, 'myData.title', { ratingDisplay, emailDisplay, walletsCount, walletsDisplay });

    const keyboard = myDataMenuKeyboard(!!email, walletsCount, lang);
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
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    // Create session for email input
    await Session.setSession(telegramId, 'my_data', {
      action: 'add_email',
      createdAt: new Date()
    }, 1); // TTL 1 hour

    const text = t(lang, 'myData.add_email');

    const keyboard = emailInputKeyboard(lang);

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
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    const text = t(lang, 'myData.delete_email_confirm');

    const keyboard = confirmDeleteEmailKeyboard(lang);

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
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    // Delete email from user
    await User.updateOne(
      { telegramId },
      { $set: { email: null } }
    );

    const text = t(lang, 'myData.email_deleted');

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
  const lang = ctx.state?.lang || 'ru';
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
    const text = t(lang, 'myData.invalid_email');

    const keyboard = emailInputKeyboard(lang);

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

  const text = t(lang, 'myData.email_saved', { email });

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
    const lang = ctx.state?.lang || 'ru';

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const telegramId = ctx.from.id;
    const user = await User.findOne({ telegramId }).select('wallets');

    if (!user) {
      const keyboard = mainMenuButton(lang);
      await messageManager.sendNewMessage(ctx, telegramId, t(lang, 'common.user_not_found'), keyboard);
      return;
    }

    const wallets = user.wallets || [];

    if (wallets.length === 0) {
      const text = t(lang, 'myData.wallets_empty');

      const keyboard = walletsEmptyKeyboard(lang);
      await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
      return;
    }

    // Show wallets list
    let walletsText = wallets.map((w, i) => {
      const name = w.name || t(lang, 'wallet.default_name', { index: i + 1 });
      return `*${i + 1}. ${name}*\n\`${w.address}\``;
    }).join('\n\n');

    const text = t(lang, 'myData.wallets_list', { count: wallets.length, walletsText });

    const keyboard = walletsListKeyboard(wallets, lang);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in showWalletsList:', error);
  }
}

/**
 * View wallet details
 */
async function viewWallet(ctx, walletIndexOverride = null) {
  try {
    const lang = ctx.state?.lang || 'ru';

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const telegramId = ctx.from.id;
    // Check if walletIndexOverride is actually a number (not Telegraf's 'next' function)
    const walletIndex = typeof walletIndexOverride === 'number'
      ? walletIndexOverride
      : parseInt(ctx.callbackQuery.data.split(':')[2]);

    const user = await User.findOne({ telegramId }).select('wallets');
    if (!user || !user.wallets[walletIndex]) {
      if (ctx.callbackQuery) {
        await ctx.answerCbQuery(t(lang, 'wallet.not_found_alert'), { show_alert: true });
      }
      return;
    }

    const wallet = user.wallets[walletIndex];
    const name = wallet.name || t(lang, 'wallet.default_name', { index: walletIndex + 1 });
    const createdAt = wallet.createdAt ? formatDate(lang, wallet.createdAt, { hour: undefined, minute: undefined, second: undefined }) : t(lang, 'myData.wallet_unknown_date');

    const text = t(lang, 'myData.wallet_details', { name, address: wallet.address, createdAt });

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(t(lang, 'btn.edit_name'), `wallet:edit_name:${walletIndex}`),
        Markup.button.callback(t(lang, 'btn.edit_address'), `wallet:edit_address:${walletIndex}`)
      ],
      [Markup.button.callback(t(lang, 'btn.delete_wallet'), `wallet:delete:${walletIndex}`)],
      [Markup.button.callback(t(lang, 'btn.back'), 'mydata:wallets')]
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
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const walletIndex = parseInt(ctx.callbackQuery.data.split(':')[2]);

    const user = await User.findOne({ telegramId }).select('wallets');
    if (!user || !user.wallets[walletIndex]) {
      await ctx.answerCbQuery(t(lang, 'wallet.not_found_alert'), { show_alert: true });
      return;
    }

    const wallet = user.wallets[walletIndex];
    const name = wallet.name || t(lang, 'wallet.default_name', { index: walletIndex + 1 });
    const shortAddr = wallet.address.slice(0, 6) + '...' + wallet.address.slice(-4);

    const text = t(lang, 'myData.delete_wallet_confirm', { name, address: shortAddr });

    const keyboard = confirmDeleteWalletKeyboard(walletIndex, lang);
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
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const walletIndex = parseInt(ctx.callbackQuery.data.split(':')[2]);

    const user = await User.findOne({ telegramId });
    if (!user || !user.wallets[walletIndex]) {
      await ctx.answerCbQuery(t(lang, 'wallet.not_found_alert'), { show_alert: true });
      return;
    }

    const wallet = user.wallets[walletIndex];
    const error = await user.removeWallet(wallet.address);

    if (error) {
      await ctx.answerCbQuery(error, { show_alert: true });
      return;
    }

    const text = t(lang, 'myData.wallet_deleted');
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
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;

    // Check limit
    const user = await User.findOne({ telegramId }).select('wallets');
    if (user && user.wallets && user.wallets.length >= 5) {
      await ctx.answerCbQuery(t(lang, 'wallet.limit_reached'), { show_alert: true });
      return;
    }

    // Create session for wallet input
    await Session.setSession(telegramId, 'my_data', {
      action: 'add_wallet',
      step: 'address',
      createdAt: new Date()
    }, 1); // TTL 1 hour

    const text = t(lang, 'myData.add_wallet');

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.cancel'), 'mydata:wallets')]
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
  const lang = ctx.state?.lang || 'ru';
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
    const text = t(lang, 'wallet.limit_reached_long');

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.back'), 'mydata:wallets')]
    ]);

    await clearMyDataSession(telegramId);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    return true;
  }

  // Check for duplicate
  if (user && user.wallets) {
    const exists = user.wallets.some(w => w.address.toLowerCase() === address.toLowerCase());
    if (exists) {
      const text = t(lang, 'wallet.duplicate');

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(t(lang, 'btn.cancel'), 'mydata:wallets')]
      ]);

      await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
      return true;
    }
  }

  // Show verification loading
  const verifyingText = t(lang, 'common.checking_address');

  await messageManager.sendNewMessage(ctx, telegramId, verifyingText, null);

  // Validate address format first
  if (!blockchainService.isValidAddress(address)) {
    const text = t(lang, 'wallet.invalid_format');

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.cancel'), 'mydata:wallets')]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    return true;
  }

  // Verify wallet exists on TRON network
  const verification = await blockchainService.verifyWalletExists(address);

  if (!verification.valid) {
    let errorMessage;
    if (verification.errorType === 'not_found') {
      errorMessage = t(lang, 'wallet.not_found_detailed');
    } else if (verification.errorType === 'api_error') {
      errorMessage = t(lang, 'wallet.check_error_mydata');
    } else {
      errorMessage = `${t(lang, 'common.error')}\n\n${verification.error || t(lang, 'common.unknown_error')}\n\n${t(lang, 'common.try_again')}`;
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.cancel'), 'mydata:wallets')]
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

  const text = t(lang, 'wallet.save_name_prompt', { address: shortAddr });

  const keyboard = walletNameInputKeyboard(lang);
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  return true;
}

/**
 * Handle wallet name input
 */
async function handleWalletNameInput(ctx) {
  const lang = ctx.state?.lang || 'ru';
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
    const text = t(lang, 'wallet.name_too_long');

    const keyboard = walletNameInputKeyboard(lang);
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

// ============================================
// WALLET EDIT FUNCTIONS
// ============================================

/**
 * Handle edit wallet name button
 */
async function handleEditWalletName(ctx) {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const walletIndex = parseInt(ctx.callbackQuery.data.split(':')[2]);

    const user = await User.findOne({ telegramId }).select('wallets');
    if (!user || !user.wallets[walletIndex]) {
      await ctx.answerCbQuery(t(lang, 'wallet.not_found_alert'), { show_alert: true });
      return;
    }

    const wallet = user.wallets[walletIndex];
    const currentName = wallet.name || t(lang, 'wallet.default_name', { index: walletIndex + 1 });
    const shortAddr = wallet.address.slice(0, 6) + '...' + wallet.address.slice(-4);

    // Create session for name edit
    await Session.setSession(telegramId, 'my_data', {
      action: 'edit_wallet_name',
      walletIndex,
      createdAt: new Date()
    }, 1);

    const text = t(lang, 'myData.edit_name', { address: shortAddr, currentName });

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.cancel'), `wallet:view:${walletIndex}`)]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in handleEditWalletName:', error);
  }
}

/**
 * Handle edit wallet address button
 */
async function handleEditWalletAddress(ctx) {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const walletIndex = parseInt(ctx.callbackQuery.data.split(':')[2]);

    const user = await User.findOne({ telegramId }).select('wallets');
    if (!user || !user.wallets[walletIndex]) {
      await ctx.answerCbQuery(t(lang, 'wallet.not_found_alert'), { show_alert: true });
      return;
    }

    const wallet = user.wallets[walletIndex];
    const name = wallet.name || t(lang, 'wallet.default_name', { index: walletIndex + 1 });

    // Create session for address edit
    await Session.setSession(telegramId, 'my_data', {
      action: 'edit_wallet_address',
      walletIndex,
      walletName: name,
      createdAt: new Date()
    }, 1);

    const text = t(lang, 'myData.edit_address', { name, address: wallet.address });

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.cancel'), `wallet:view:${walletIndex}`)]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in handleEditWalletAddress:', error);
  }
}

/**
 * Handle wallet name edit input
 */
async function handleWalletNameEditInput(ctx) {
  const lang = ctx.state?.lang || 'ru';
  const telegramId = ctx.from.id;
  const newName = ctx.message.text.trim();

  // Delete user message
  await messageManager.deleteUserMessage(ctx);

  const session = await Session.getSession(telegramId, 'my_data');
  if (!session || session.action !== 'edit_wallet_name') {
    return false;
  }

  const walletIndex = session.walletIndex;

  // Validate name length
  if (newName.length > 30) {
    const text = t(lang, 'wallet.name_too_long');

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.cancel'), `wallet:view:${walletIndex}`)]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    return true;
  }

  // Update wallet name
  const user = await User.findOne({ telegramId });
  if (!user || !user.wallets[walletIndex]) {
    await clearMyDataSession(telegramId);
    const text = t(lang, 'myData.wallet_not_found');
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.back'), 'mydata:wallets')]
    ]);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    return true;
  }

  user.wallets[walletIndex].name = newName;
  await user.save();
  await clearMyDataSession(telegramId);

  const shortAddr = user.wallets[walletIndex].address.slice(0, 6) + '...' + user.wallets[walletIndex].address.slice(-4);

  const text = t(lang, 'myData.name_changed', { name: newName, address: shortAddr });

  await messageManager.sendNewMessage(ctx, telegramId, text, { inline_keyboard: [] });

  // Return to wallet details after 1.5 seconds
  setTimeout(async () => {
    try {
      await viewWallet(ctx, walletIndex);
    } catch (e) {
      // Message might have been changed
    }
  }, 1500);

  return true;
}

/**
 * Handle wallet address edit input
 */
async function handleWalletAddressEditInput(ctx) {
  const lang = ctx.state?.lang || 'ru';
  const telegramId = ctx.from.id;
  const newAddress = ctx.message.text.trim();

  // Delete user message
  await messageManager.deleteUserMessage(ctx);

  const session = await Session.getSession(telegramId, 'my_data');
  if (!session || session.action !== 'edit_wallet_address') {
    return false;
  }

  const walletIndex = session.walletIndex;
  const walletName = session.walletName;

  const user = await User.findOne({ telegramId });
  if (!user || !user.wallets[walletIndex]) {
    await clearMyDataSession(telegramId);
    const text = t(lang, 'myData.wallet_not_found');
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.back'), 'mydata:wallets')]
    ]);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    return true;
  }

  // Check for duplicate (excluding current wallet)
  const exists = user.wallets.some((w, i) =>
    i !== walletIndex && w.address.toLowerCase() === newAddress.toLowerCase()
  );
  if (exists) {
    const text = t(lang, 'wallet.duplicate');

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.cancel'), `wallet:view:${walletIndex}`)]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    return true;
  }

  // Show verification loading
  const verifyingText = t(lang, 'common.checking_address');

  await messageManager.sendNewMessage(ctx, telegramId, verifyingText, null);

  // Validate address format
  if (!blockchainService.isValidAddress(newAddress)) {
    const text = t(lang, 'wallet.invalid_format_short');

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.cancel'), `wallet:view:${walletIndex}`)]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    return true;
  }

  // Verify wallet exists on TRON network
  const verification = await blockchainService.verifyWalletExists(newAddress);

  if (!verification.valid) {
    let errorMessage;
    if (verification.errorType === 'not_found') {
      errorMessage = t(lang, 'wallet.not_found_detailed');
    } else if (verification.errorType === 'api_error') {
      errorMessage = t(lang, 'wallet.check_error_mydata');
    } else {
      errorMessage = `${t(lang, 'common.error')}\n\n${verification.error || t(lang, 'common.unknown_error')}\n\n${t(lang, 'common.try_again')}`;
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.cancel'), `wallet:view:${walletIndex}`)]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, errorMessage, keyboard);
    return true;
  }

  // Update wallet address
  user.wallets[walletIndex].address = newAddress;
  await user.save();
  await clearMyDataSession(telegramId);

  const shortAddr = newAddress.slice(0, 6) + '...' + newAddress.slice(-4);

  const text = t(lang, 'myData.address_changed', { name: walletName, address: shortAddr });

  await messageManager.sendNewMessage(ctx, telegramId, text, { inline_keyboard: [] });

  // Return to wallet details after 1.5 seconds
  setTimeout(async () => {
    try {
      await viewWallet(ctx, walletIndex);
    } catch (e) {
      // Message might have been changed
    }
  }, 1500);

  return true;
}

/**
 * Save wallet from session
 */
async function saveWalletFromSession(ctx, telegramId, address, name) {
  try {
    const lang = ctx.state?.lang || 'ru';

    const user = await User.findOne({ telegramId });
    if (!user) {
      await ctx.answerCbQuery(t(lang, 'common.user_not_found'), { show_alert: true });
      return;
    }

    const error = await user.addWallet(address, name);
    await clearMyDataSession(telegramId);

    if (error) {
      const text = `${t(lang, 'common.error')}\n\n${error}`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(t(lang, 'btn.back'), 'mydata:wallets')]
      ]);

      await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
      return;
    }

    const displayName = name || t(lang, 'wallet.default_name', { index: '' }).trim();
    const shortAddr = address.slice(0, 6) + '...' + address.slice(-4);

    const text = t(lang, 'wallet.saved_success', { name: displayName, address: shortAddr });

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

  // Wallet edit flows
  if (session.action === 'edit_wallet_name') {
    return await handleWalletNameEditInput(ctx);
  }

  if (session.action === 'edit_wallet_address') {
    return await handleWalletAddressEditInput(ctx);
  }

  return false;
}

// ============================================
// LANGUAGE SELECTION
// ============================================

const LANGUAGE_LABELS = {
  ru: '🇷🇺 Русский',
  en: '🇬🇧 English',
  uk: '🇺🇦 Українська'
};

/**
 * Show language selection screen
 */
async function showLanguageSelect(ctx) {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const currentLang = LANGUAGE_LABELS[lang] || LANGUAGE_LABELS.ru;

    const text = t(lang, 'myData.language_select', { currentLang });

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🇷🇺 Русский', 'mydata:set_lang:ru')],
      [Markup.button.callback('🇬🇧 English', 'mydata:set_lang:en')],
      [Markup.button.callback('🇺🇦 Українська', 'mydata:set_lang:uk')],
      [Markup.button.callback(t(lang, 'btn.back'), 'my_data')]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in showLanguageSelect:', error);
  }
}

/**
 * Handle language change
 */
async function handleSetLanguage(ctx) {
  try {
    await ctx.answerCbQuery();

    const telegramId = ctx.from.id;
    const newLang = ctx.callbackQuery.data.split(':')[2];

    // Update language via languageSync (updates DB + cache)
    const success = await languageSync.setLanguage(telegramId, newLang);
    if (!success) return;

    // Update ctx.state.lang for immediate use
    ctx.state.lang = newLang;

    const text = t(newLang, 'myData.language_changed');
    await messageManager.sendNewMessage(ctx, telegramId, text, { inline_keyboard: [] });

    // Return to My Data after 1.5 seconds
    setTimeout(async () => {
      try {
        await showMyData(ctx);
      } catch (e) {
        // Message might have been changed
      }
    }, 1500);
  } catch (error) {
    console.error('Error in handleSetLanguage:', error);
  }
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
  // Wallet edit
  handleEditWalletName,
  handleEditWalletAddress,
  // Language
  showLanguageSelect,
  handleSetLanguage,
  // Combined handler
  handleMyDataTextInput
};
