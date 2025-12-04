const { Telegraf } = require('telegraf');
require('dotenv').config();

const connectDB = require('../config/database');
const depositMonitor = require('../services/depositMonitor');
const deadlineMonitor = require('../services/deadlineMonitor');
const notificationService = require('../services/notificationService');

// Handlers
const { startHandler, mainMenuHandler } = require('./handlers/start');
const {
  startCreateDeal,
  handleCreateDealInput,
  handleAssetSelection,
  handleDeadlineSelection,
  handleCommissionSelection,
  handleRoleSelection,
  confirmCreateDeal,
  cancelCreateDeal
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
  handleDisputeMedia
} = require('./handlers/dispute');
const {
  howItWorks,
  rulesAndFees,
  support
} = require('./handlers/help');
const {
  handleSellerWalletInput,
  handleBuyerWalletInput,
  handleDepositWarningConfirmation
} = require('./handlers/provideWallet');

// Initialize bot
const bot = new Telegraf(process.env.BOT_TOKEN);

// Error handling
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('❌ Произошла ошибка. Попробуйте позже или обратитесь в поддержку.');
});

// ============================================
// COMMANDS
// ============================================

bot.command('start', startHandler);

bot.command('cancel', (ctx) => {
  ctx.reply('❌ Действие отменено.', require('./keyboards/main').backToMainMenu());
});

// ============================================
// CALLBACK QUERIES (Inline buttons)
// ============================================

// Main menu
bot.action('main_menu', mainMenuHandler);

// Create deal flow
bot.action('create_deal', startCreateDeal);
bot.action(/^role:/, handleRoleSelection);
bot.action(/^asset:/, handleAssetSelection);
bot.action(/^deadline:/, handleDeadlineSelection);
bot.action(/^commission:/, handleCommissionSelection);
bot.action('confirm:create_deal', confirmCreateDeal);
bot.action('cancel_create_deal', cancelCreateDeal);
bot.action('cancel:create_deal', cancelCreateDeal);

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

// Deadline expiration actions (from deadlineMonitor notifications)
bot.action(/^confirm_work_/, async (ctx) => {
  const dealId = ctx.callbackQuery.data.replace('confirm_work_', '');
  await ctx.answerCbQuery();
  // Reuse acceptWork logic
  ctx.callbackQuery.data = `accept_work:${dealId}`;
  await acceptWork(ctx);
});

bot.action(/^work_done_/, async (ctx) => {
  const dealId = ctx.callbackQuery.data.replace('work_done_', '');
  await ctx.answerCbQuery();
  // Reuse submitWork logic
  ctx.callbackQuery.data = `submit_work:${dealId}`;
  await submitWork(ctx);
});

bot.action(/^open_dispute_/, async (ctx) => {
  const dealId = ctx.callbackQuery.data.replace('open_dispute_', '');
  await ctx.answerCbQuery();
  // Reuse startDispute logic
  ctx.callbackQuery.data = `open_dispute:${dealId}`;
  await startDispute(ctx);
});

bot.action(/^view_deal_/, async (ctx) => {
  const dealId = ctx.callbackQuery.data.replace('view_deal_', '');
  await ctx.answerCbQuery();
  await showDealDetails(ctx, dealId);
});

// Help menu
bot.action('help', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const messageManager = require('./utils/messageManager');
  const { helpMenuKeyboard } = require('./keyboards/main');

  messageManager.navigateTo(userId, 'help');

  await messageManager.sendOrEdit(
    ctx,
    userId,
    'ℹ️ *Помощь*\n\nВыберите раздел:',
    helpMenuKeyboard()
  );
});

// Help sections
bot.action('how_it_works', howItWorks);
bot.action('rules', rulesAndFees);
bot.action('support', support);

// Deposit confirmation
bot.action('confirm_deposit_warning', handleDepositWarningConfirmation);

// ============================================
// TEXT MESSAGES
// ============================================

bot.on('text', async (ctx) => {
  const text = ctx.message.text.trim();

  // Handle wallet input (both seller and buyer)
  await handleSellerWalletInput(ctx);
  await handleBuyerWalletInput(ctx);

  // Handle deal creation flow
  await handleCreateDealInput(ctx);

  // Handle dispute flow
  await handleDisputeInput(ctx);

  // Check if it's a deal ID
  if (text.match(/^DL-\d+$/i)) {
    await showDealDetails(ctx, text.toUpperCase());
    return;
  }

  // If no handler processed it, show hint
  // (but only if not in any flow - check would be more sophisticated)
  // For now, just ignore unknown messages
});

// ============================================
// MEDIA MESSAGES (for dispute evidence)
// ============================================

bot.on(['photo', 'video', 'document', 'voice'], handleDisputeMedia);

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
