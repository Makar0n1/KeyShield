const { Telegraf } = require('telegraf');
require('dotenv').config();

const connectDB = require('../config/database');
const depositMonitor = require('../services/depositMonitor');
const deadlineMonitor = require('../services/deadlineMonitor');
const notificationService = require('../services/notificationService');
const messageManager = require('./utils/messageManager');

// Handlers
const { startHandler, mainMenuHandler, backHandler } = require('./handlers/start');
const {
  startCreateDeal,
  handleCreateDealInput,
  handleAssetSelection,
  handleDeadlineSelection,
  handleCommissionSelection,
  handleRoleSelection,
  confirmCreateDeal,
  hasCreateDealSession,
  clearCreateDealSession
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
  cancelDeal
} = require('./handlers/provideWallet');

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
});

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
  clearCreateDealSession(telegramId);
  clearDisputeSession(telegramId);

  // Show main menu
  await mainMenuHandler(ctx);
});

// ============================================
// CALLBACK QUERIES (Inline buttons)
// ============================================

// Navigation
bot.action('main_menu', mainMenuHandler);
bot.action('back', backHandler);

// Create deal flow
bot.action('create_deal', startCreateDeal);
bot.action(/^role:/, handleRoleSelection);
bot.action(/^asset:/, handleAssetSelection);
bot.action(/^deadline:/, handleDeadlineSelection);
bot.action(/^commission:/, handleCommissionSelection);
bot.action('confirm:create_deal', confirmCreateDeal);

// My deals
bot.action('my_deals', showMyDeals);
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
bot.action(/^confirm_deposit_warning:/, handleDepositWarningConfirmation);
bot.action(/^show_deposit:/, showDepositAddress);
bot.action(/^decline_deal:/, declineDeal);
bot.action(/^cancel_deal:/, cancelDeal);

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

// ============================================
// TEXT MESSAGES
// ============================================

bot.on('text', async (ctx) => {
  const telegramId = ctx.from.id;
  const text = ctx.message.text.trim();

  // Handle wallet input (both seller and buyer)
  // These return true if they handled the message
  if (await handleSellerWalletInput(ctx)) return;
  if (await handleBuyerWalletInput(ctx)) return;

  // Handle deal creation flow
  if (hasCreateDealSession(telegramId)) {
    await handleCreateDealInput(ctx);
    return;
  }

  // Handle dispute flow
  if (hasDisputeSession(telegramId)) {
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
  if (hasDisputeSession(telegramId)) {
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

    notificationService.setBotInstance(bot);

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
