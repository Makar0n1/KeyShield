const { Telegraf } = require('telegraf');
require('dotenv').config();

const connectDB = require('../config/database');
const depositMonitor = require('../services/depositMonitor');
const deadlineMonitor = require('../services/deadlineMonitor');
const disputeService = require('../services/disputeService');
const notificationService = require('../services/notificationService');
const blogNotificationService = require('../services/blogNotificationService');
const adminAlertService = require('../services/adminAlertService');
const emailService = require('../services/emailService');
const messageManager = require('./utils/messageManager');

// Middleware for high-load optimization
const { deduplicationMiddleware } = require('./middleware/deduplication');
const { loadingTimeoutMiddleware } = require('./middleware/loadingTimeout');
const { usernameSyncMiddleware } = require('./middleware/usernameSync');

// Activity logging
const activityLogger = require('../services/activityLogger');

// Handlers
const { startHandler, mainMenuHandler, backHandler, MAIN_MENU_TEXT } = require('./handlers/start');
const {
  startCreateDeal,
  handleCreateDealInput,
  handleAssetSelection,
  handleDeadlineSelection,
  handleCommissionSelection,
  handleRoleSelection,
  confirmCreateDeal,
  cancelCreateDeal,
  handleCreateDealBack,
  hasCreateDealSession,
  clearCreateDealSession,
  handleWalletContinueAnyway,
  handleWalletChangeAddress,
  handleUsernameSet,
  // Wallet selection in deal creation
  handleSelectSavedWallet,
  handleEnterNewWallet,
  handleSaveWalletPrompt,
  handleWalletNameSkipDeal,
  handleWalletNameBackDeal
} = require('./handlers/createDeal');
const {
  showMyDeals,
  showDealDetails,
  submitWork,
  acceptWork
} = require('./handlers/myDeals');
const {
  startDispute,
  handleDisputeInput,
  handleDisputeMedia,
  finalizeDisputeHandler,
  hasDisputeSession,
  clearDisputeSession
} = require('./handlers/dispute');
const {
  showHelp,
  howItWorks,
  rulesAndFees,
  support
} = require('./handlers/help');
const {
  enterWalletHandler,
  handleSellerWalletInput,
  handleBuyerWalletInput,
  handleDepositWarningConfirmation,
  showDepositAddress,
  declineDeal,
  cancelDeal,
  handleWalletContinue,
  // Saved wallet selection for deal acceptance
  handleSelectSavedWalletDeal,
  handleEnterNewWalletDeal,
  // Save wallet prompt handlers
  handleSaveWalletPromptDeal,
  handleWalletNameSkipProvide,
  handleWalletNameBackProvide,
  handleWalletNameInputProvide,
  hasProvideWalletSession,
  deleteProvideWalletSession
} = require('./handlers/provideWallet');
const {
  hasKeyValidationSession,
  handleKeyValidationInput,
  clearKeyValidationSession
} = require('./handlers/keyValidation');
const {
  hasReceiptSession,
  clearReceiptSession,
  handleReceiptSendSaved,
  handleReceiptYes,
  handleReceiptNo,
  handleReceiptCancel,
  handleEmailInput,
  handleSaveEmail
} = require('./handlers/receiptEmail');
const {
  hasMyDataSession,
  clearMyDataSession,
  showMyData,
  handleAddEmail,
  handleChangeEmail,
  handleDeleteEmail,
  handleConfirmDelete,
  handleCancel: handleMyDataCancel,
  handleMyDataEmailInput,
  // Wallets
  showWalletsList,
  viewWallet,
  handleDeleteWallet,
  confirmDeleteWallet,
  handleAddWallet,
  handleWalletNameSkip,
  handleWalletNameBack,
  // Wallet edit
  handleEditWalletName,
  handleEditWalletAddress,
  // Combined text handler
  handleMyDataTextInput
} = require('./handlers/myData');

// Initialize bot with increased timeout for slow connections
const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: {
    apiRoot: 'https://api.telegram.org',
    webhookReply: false,
    agent: null,
    // Increase timeout to 60 seconds (default is 30s)
    timeout: 60000
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
});

// ============================================
// MIDDLEWARE FOR HIGH-LOAD OPTIMIZATION
// ============================================

// 0. Activity logging - logs ALL user actions to console
bot.use(async (ctx, next) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return next();

  const username = ctx.from?.username || 'no_username';
  let actionType = 'unknown';

  if (ctx.callbackQuery?.data) {
    actionType = `button_${ctx.callbackQuery.data}`;
  } else if (ctx.message?.text) {
    if (ctx.message.text.startsWith('/')) {
      actionType = `command_${ctx.message.text.split(' ')[0].slice(1)}`;
    } else {
      actionType = 'text_input';
    }
  } else if (ctx.message?.photo) {
    actionType = 'media_photo';
  } else if (ctx.message?.document) {
    actionType = 'media_document';
  } else if (ctx.message?.video) {
    actionType = 'media_video';
  }

  // Console log (all actions)
  console.log(`👤 [${new Date().toISOString()}] @${username} (${telegramId}): ${actionType}`);

  await next();
});

// 1. Username sync - keeps username up-to-date on every interaction
// Critical for arbitration and finding users by @username
bot.use(usernameSyncMiddleware);

// 2. Callback deduplication - prevents double-tap issues
// User clicks button twice quickly → only first click is processed
bot.use(deduplicationMiddleware);

// 3. Loading timeout - shows "Loading..." if response takes > 2 seconds
// Prevents users from seeing a "hanging" state during high load
bot.use(loadingTimeoutMiddleware);

// ============================================
// NOTE: No middleware needed for session initialization!
// All state is now stored in MongoDB and loaded on-demand by messageManager.
// This eliminates cache sync issues between bot and web server processes.
// ============================================

// ============================================
// COMMANDS
// ============================================

bot.command('start', startHandler);

// /cancel - clear sessions and show main menu
bot.command('cancel', async (ctx) => {
  const telegramId = ctx.from.id;

  // Delete user message
  await messageManager.deleteUserMessage(ctx);

  // Clear any active sessions
  await clearCreateDealSession(telegramId);
  await clearDisputeSession(telegramId);
  await clearKeyValidationSession(telegramId);
  await clearReceiptSession(telegramId);
  await clearMyDataSession(telegramId);
  await deleteProvideWalletSession(telegramId);

  // Show main menu
  await mainMenuHandler(ctx);
});

// ============================================
// CALLBACK QUERIES (Inline buttons)
// ============================================

// Navigation
bot.action('main_menu', mainMenuHandler);
// Smart back handler: check if in deal creation first
bot.action('back', async (ctx) => {
  const telegramId = ctx.from.id;

  // Check if user is in deal creation session
  if (await hasCreateDealSession(telegramId)) {
    const handled = await handleCreateDealBack(ctx);
    if (handled) return;
  }

  // Default back handler
  await backHandler(ctx);
});

// Create deal flow
bot.action('create_deal', startCreateDeal);
bot.action('username_set', handleUsernameSet);
bot.action(/^role:/, handleRoleSelection);
bot.action(/^asset:/, handleAssetSelection);
bot.action(/^deadline:/, handleDeadlineSelection);
bot.action(/^commission:/, handleCommissionSelection);
bot.action('confirm:create_deal', confirmCreateDeal);
// Wallet selection - unified handler that routes based on context
bot.action(/^select_wallet:/, async (ctx) => {
  const telegramId = ctx.from.id;
  // Check if user is in deal creation flow
  if (await hasCreateDealSession(telegramId)) {
    await handleSelectSavedWallet(ctx);
  } else {
    // Otherwise, it's deal acceptance flow
    await handleSelectSavedWalletDeal(ctx);
  }
});
bot.action('enter_new_wallet', async (ctx) => {
  const telegramId = ctx.from.id;
  // Check if user is in deal creation flow
  if (await hasCreateDealSession(telegramId)) {
    await handleEnterNewWallet(ctx);
  } else {
    // Otherwise, it's deal acceptance flow
    await handleEnterNewWalletDeal(ctx);
  }
});
// Save wallet prompt - unified handler for both createDeal and provideWallet flows
bot.action(/^save_wallet:/, async (ctx) => {
  const telegramId = ctx.from.id;
  // Check if user is in deal creation flow
  if (await hasCreateDealSession(telegramId)) {
    await handleSaveWalletPrompt(ctx);
  } else if (await hasProvideWalletSession(telegramId)) {
    // provideWallet flow (deal acceptance)
    await handleSaveWalletPromptDeal(ctx);
  } else {
    await ctx.answerCbQuery('❌ Сессия истекла', { show_alert: true });
  }
});
// Wallet name buttons - unified handler for both flows
bot.action('deal_wallet_name:skip', async (ctx) => {
  const telegramId = ctx.from.id;
  if (await hasCreateDealSession(telegramId)) {
    await handleWalletNameSkipDeal(ctx);
  } else if (await hasProvideWalletSession(telegramId)) {
    await handleWalletNameSkipProvide(ctx);
  } else {
    await ctx.answerCbQuery('❌ Сессия истекла', { show_alert: true });
  }
});
bot.action('deal_wallet_name:back', async (ctx) => {
  const telegramId = ctx.from.id;
  if (await hasCreateDealSession(telegramId)) {
    await handleWalletNameBackDeal(ctx);
  } else if (await hasProvideWalletSession(telegramId)) {
    await handleWalletNameBackProvide(ctx);
  } else {
    await ctx.answerCbQuery('❌ Сессия истекла', { show_alert: true });
  }
});

// My deals
bot.action('my_deals', showMyDeals);
bot.action(/^deals_page:(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  await ctx.answerCbQuery();
  await showMyDeals(ctx, page);
});
bot.action(/^view_deal:/, async (ctx) => {
  const dealId = ctx.callbackQuery.data.split(':')[1];
  await ctx.answerCbQuery();
  await showDealDetails(ctx, dealId);
});

// Deal actions
bot.action(/^submit_work:/, submitWork);
bot.action(/^accept_work:/, acceptWork);
bot.action(/^open_dispute:/, startDispute);
bot.action(/^finalize_dispute:/, finalizeDisputeHandler);

// Wallet & deposit actions
bot.action(/^enter_wallet:/, enterWalletHandler);
bot.action(/^retry_wallet:/, enterWalletHandler); // Same handler - re-enter wallet
bot.action(/^confirm_deposit_warning:/, handleDepositWarningConfirmation);
bot.action(/^show_deposit:/, showDepositAddress);
bot.action(/^decline_deal:/, declineDeal);
bot.action(/^cancel_deal:/, cancelDeal);
bot.action('cancel_create_deal', cancelCreateDeal);

// Wallet balance warning handlers (buyer has funds on exchange)
// For creator (createDeal flow)
bot.action('wallet_continue_anyway', handleWalletContinueAnyway);
bot.action('wallet_change_address', handleWalletChangeAddress);
// For counterparty (provideWallet flow)
bot.action(/^wallet_continue:/, handleWalletContinue);

// Key saved button - just delete the message
bot.action(/^key_saved:/, async (ctx) => {
  try {
    await ctx.answerCbQuery('✅ Ключ сохранён!');
    await ctx.deleteMessage();
  } catch (e) {
    // Message might already be deleted
  }
});

// Deadline expiration actions (from deadlineMonitor notifications)
bot.action(/^confirm_work_/, async (ctx) => {
  const dealId = ctx.callbackQuery.data.replace('confirm_work_', '');
  ctx.callbackQuery.data = `accept_work:${dealId}`;
  await acceptWork(ctx);
});

bot.action(/^work_done_/, async (ctx) => {
  const dealId = ctx.callbackQuery.data.replace('work_done_', '');
  ctx.callbackQuery.data = `submit_work:${dealId}`;
  await submitWork(ctx);
});

bot.action(/^open_dispute_/, async (ctx) => {
  const dealId = ctx.callbackQuery.data.replace('open_dispute_', '');
  ctx.callbackQuery.data = `open_dispute:${dealId}`;
  await startDispute(ctx);
});

bot.action(/^view_deal_/, async (ctx) => {
  const dealId = ctx.callbackQuery.data.replace('view_deal_', '');
  await ctx.answerCbQuery();
  await showDealDetails(ctx, dealId);
});

// Help menu
bot.action('help', showHelp);
bot.action('how_it_works', howItWorks);
bot.action('rules', rulesAndFees);
bot.action('support', support);

// Email receipt handlers
bot.action(/^receipt_send_saved:/, handleReceiptSendSaved);
bot.action(/^receipt_yes:/, handleReceiptYes);
bot.action(/^receipt_no:/, handleReceiptNo);
bot.action(/^receipt_cancel:/, handleReceiptCancel);
bot.action(/^save_email:/, handleSaveEmail);

// My Data handlers
bot.action('my_data', showMyData);
bot.action('mydata_add_email', handleAddEmail);
bot.action('mydata_change_email', handleChangeEmail);
bot.action('mydata_delete_email', handleDeleteEmail);
bot.action('mydata_confirm_delete', handleConfirmDelete);
bot.action('mydata_cancel', handleMyDataCancel);
// My Data - Wallets
bot.action('mydata:wallets', showWalletsList);
bot.action('mydata:add_wallet', handleAddWallet);
bot.action(/^wallet:view:/, viewWallet);
bot.action(/^wallet:delete:/, handleDeleteWallet);
bot.action(/^wallet:confirm_delete:/, confirmDeleteWallet);
bot.action(/^wallet:edit_name:/, handleEditWalletName);
bot.action(/^wallet:edit_address:/, handleEditWalletAddress);
bot.action('mydata_wallet_name:skip', handleWalletNameSkip);
bot.action('mydata_wallet_name:back', handleWalletNameBack);
// My Data - Email (new pattern)
bot.action('mydata:add_email', handleAddEmail);
bot.action('mydata:change_email', handleChangeEmail);

// Blog notification back button (uses goBack - delete + send pattern)
bot.action('blog_notification_back', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    // Use goBack - pops from stack and shows previous screen
    const previousScreen = await messageManager.goBack(ctx, telegramId);

    if (!previousScreen) {
      // No previous screen - show main menu
      const { mainMenuKeyboard } = require('./keyboards/main');
      const keyboard = mainMenuKeyboard();

      await messageManager.showFinalScreen(ctx, telegramId, 'main_menu', MAIN_MENU_TEXT, keyboard);
    }
  } catch (error) {
    console.error('Error handling blog notification back:', error);
  }
});

// ============================================
// TEXT MESSAGES
// ============================================

bot.on('text', async (ctx) => {
  const telegramId = ctx.from.id;
  const text = ctx.message.text.trim();

  // Handle key validation input FIRST (pseudo-multisig)
  // This must be checked before any other handlers
  if (await hasKeyValidationSession(telegramId)) {
    await handleKeyValidationInput(ctx);
    return;
  }

  // Handle email receipt input
  if (await hasReceiptSession(telegramId)) {
    const handled = await handleEmailInput(ctx);
    if (handled) return;
  }

  // Handle my data input (email and wallets)
  if (await hasMyDataSession(telegramId)) {
    const handled = await handleMyDataTextInput(ctx);
    if (handled) return;
  }

  // Handle provideWallet wallet name input (deal acceptance flow)
  if (await hasProvideWalletSession(telegramId)) {
    const handled = await handleWalletNameInputProvide(ctx);
    if (handled) return;
  }

  // Handle wallet input (both seller and buyer)
  // These return true if they handled the message
  if (await handleSellerWalletInput(ctx)) return;
  if (await handleBuyerWalletInput(ctx)) return;

  // Handle deal creation flow
  if (await hasCreateDealSession(telegramId)) {
    await handleCreateDealInput(ctx);
    return;
  }

  // Handle dispute flow
  if (await hasDisputeSession(telegramId)) {
    await handleDisputeInput(ctx);
    return;
  }

  // Check if it's a deal ID
  if (text.match(/^DL-\d+$/i)) {
    await messageManager.deleteUserMessage(ctx);
    await showDealDetails(ctx, text.toUpperCase());
    return;
  }

  // Unknown message - just delete it to keep chat clean
  await messageManager.deleteUserMessage(ctx);
});

// ============================================
// MEDIA MESSAGES (for dispute evidence)
// ============================================

bot.on(['photo', 'video', 'document', 'voice'], async (ctx) => {
  const telegramId = ctx.from.id;

  // Handle dispute media
  if (await hasDisputeSession(telegramId)) {
    await handleDisputeMedia(ctx);
    return;
  }

  // Unknown media - just delete it
  await messageManager.deleteUserMessage(ctx);
});

// ============================================
// START BOT
// ============================================

const startBot = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Pass bot instance to services
    depositMonitor.setBotInstance(bot);
    depositMonitor.start();

    deadlineMonitor.setBotInstance(bot);
    deadlineMonitor.start();

    disputeService.setBotInstance(bot);
    notificationService.setBotInstance(bot);
    blogNotificationService.setBotInstance(bot);
    adminAlertService.setBotInstance(bot);

    // Initialize email service at startup
    emailService.init();

    // Start bot
    await bot.launch();

    console.log('\n🤖 KeyShield Telegram Bot started!');
    console.log('   Bot username: @' + (await bot.telegram.getMe()).username);
    console.log('   Environment:', process.env.NODE_ENV || 'development');
    console.log('\n   ✅ Ready to accept commands\n');

    // Graceful shutdown
    process.once('SIGINT', () => {
      console.log('\n⛔ SIGINT received, shutting down gracefully...');
      depositMonitor.stop();
      deadlineMonitor.stop();
      bot.stop('SIGINT');
      process.exit(0);
    });

    process.once('SIGTERM', () => {
      console.log('\n⛔ SIGTERM received, shutting down gracefully...');
      depositMonitor.stop();
      deadlineMonitor.stop();
      bot.stop('SIGTERM');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
};

// Only start bot if this file is run directly
if (require.main === module) {
  startBot();
}

module.exports = { bot, startBot };
