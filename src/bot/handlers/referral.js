/**
 * Referral Program Handler
 *
 * Handles referral system:
 * - View referral stats and balance
 * - Share referral link
 * - View list of referrals
 * - Request withdrawal
 * - Enter withdrawal wallet
 */

const Session = require('../../models/Session');
const User = require('../../models/User');
const ReferralTransaction = require('../../models/ReferralTransaction');
const ReferralWithdrawal = require('../../models/ReferralWithdrawal');
const messageManager = require('../utils/messageManager');
const blockchainService = require('../../services/blockchain');
const adminAlertService = require('../../services/adminAlertService');
const { t, formatDate } = require('../../locales');
const { Markup } = require('telegraf');

// ============================================
// SESSION MANAGEMENT
// ============================================

/**
 * Check if user has active referral session
 */
async function hasReferralSession(telegramId) {
  const session = await Session.getSession(telegramId, 'referral');
  return !!session;
}

/**
 * Clear referral session
 */
async function clearReferralSession(telegramId) {
  await Session.deleteSession(telegramId, 'referral');
}

// ============================================
// KEYBOARDS
// ============================================

/**
 * Main referral menu keyboard
 */
const referralMenuKeyboard = (canWithdraw, hasBalance, lang = 'ru') => {
  const buttons = [];

  buttons.push([Markup.button.callback(t(lang, 'btn.my_link'), 'referral:link')]);
  buttons.push([Markup.button.callback(t(lang, 'btn.my_referrals'), 'referral:list')]);
  buttons.push([Markup.button.callback(t(lang, 'btn.accrual_history'), 'referral:history')]);

  if (hasBalance) {
    if (canWithdraw) {
      buttons.push([Markup.button.callback(t(lang, 'btn.withdraw_balance'), 'referral:withdraw')]);
    } else {
      buttons.push([Markup.button.callback(t(lang, 'btn.withdraw_min'), 'referral:withdraw_info')]);
    }
  }

  buttons.push([Markup.button.callback(t(lang, 'btn.back'), 'main_menu')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Referral link screen keyboard
 */
const referralLinkKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.back'), 'referral:back')],
    [Markup.button.callback(t(lang, 'btn.main_menu'), 'main_menu')]
  ]);
};

/**
 * Referrals list keyboard with pagination
 */
const referralsListKeyboard = (page, totalPages, hasReferrals, lang = 'ru') => {
  const buttons = [];

  if (hasReferrals && totalPages > 1) {
    const navRow = [];
    if (page > 0) {
      navRow.push(Markup.button.callback('◀️', `referral:list:${page - 1}`));
    }
    navRow.push(Markup.button.callback(`${page + 1}/${totalPages}`, 'noop'));
    if (page < totalPages - 1) {
      navRow.push(Markup.button.callback('▶️', `referral:list:${page + 1}`));
    }
    buttons.push(navRow);
  }

  buttons.push([Markup.button.callback(t(lang, 'btn.back'), 'referral:back')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * History keyboard with pagination
 */
const historyKeyboard = (page, totalPages, hasHistory, lang = 'ru') => {
  const buttons = [];

  if (hasHistory && totalPages > 1) {
    const navRow = [];
    if (page > 0) {
      navRow.push(Markup.button.callback('◀️', `referral:history:${page - 1}`));
    }
    navRow.push(Markup.button.callback(`${page + 1}/${totalPages}`, 'noop'));
    if (page < totalPages - 1) {
      navRow.push(Markup.button.callback('▶️', `referral:history:${page + 1}`));
    }
    buttons.push(navRow);
  }

  buttons.push([Markup.button.callback(t(lang, 'btn.back'), 'referral:back')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Withdrawal wallet input keyboard
 */
const withdrawalWalletKeyboard = (savedWallets = [], lang = 'ru') => {
  const buttons = [];

  // Show saved wallets as options
  savedWallets.forEach((wallet, index) => {
    const displayName = wallet.name || t(lang, 'wallet.default_name', { index: index + 1 });
    const shortAddr = wallet.address.slice(0, 6) + '...' + wallet.address.slice(-4);
    buttons.push([
      Markup.button.callback(`💳 ${displayName}: ${shortAddr}`, `referral:use_wallet:${index}`)
    ]);
  });

  buttons.push([Markup.button.callback(t(lang, 'btn.cancel'), 'referral:back')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Withdrawal confirmation keyboard
 */
const withdrawalConfirmKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.confirm'), 'referral:confirm_withdraw')],
    [Markup.button.callback(t(lang, 'btn.cancel'), 'referral:back')]
  ]);
};

// ============================================
// MAIN SCREENS
// ============================================

/**
 * Show main referral screen with stats
 */
async function showReferrals(ctx) {
  try {
    const lang = ctx.state?.lang || 'ru';

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const telegramId = ctx.from.id;

    // Clear any existing session
    await clearReferralSession(telegramId);

    // Get user with referral data
    const user = await User.findOne({ telegramId });
    if (!user) {
      await messageManager.sendNewMessage(ctx, telegramId, t(lang, 'common.user_not_found'),
        Markup.inlineKeyboard([[Markup.button.callback(t(lang, 'btn.main_menu'), 'main_menu')]]));
      return;
    }

    // Generate referral code if not exists
    await user.generateReferralCode();

    const balance = user.referralBalance || 0;
    const totalEarned = user.referralTotalEarned || 0;
    const withdrawn = user.referralWithdrawnTotal || 0;
    const totalInvited = user.referralStats?.totalInvited || 0;
    const activeReferrals = user.referralStats?.activeReferrals || 0;

    const canWithdraw = balance >= 10;
    const hasBalance = balance > 0;

    // Check for pending withdrawal
    const pendingWithdrawal = await ReferralWithdrawal.getUserPendingWithdrawal(telegramId);

    let withdrawalStatus = '';
    if (pendingWithdrawal) {
      const statusText = pendingWithdrawal.status === 'pending'
        ? t(lang, 'referral.status_pending')
        : t(lang, 'referral.status_processing');
      withdrawalStatus = t(lang, 'referral.pending_withdrawal', {
        withdrawalId: pendingWithdrawal.withdrawalId,
        status: statusText
      });
    }

    const text = t(lang, 'referral.main', {
      balance: balance.toFixed(2),
      totalEarned: totalEarned.toFixed(2),
      withdrawn: withdrawn.toFixed(2),
      totalInvited,
      activeReferrals,
      withdrawalStatus
    });

    const keyboard = referralMenuKeyboard(canWithdraw && !pendingWithdrawal, hasBalance, lang);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in showReferrals:', error);
  }
}

/**
 * Show referral link screen
 */
async function showReferralLink(ctx) {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    const user = await User.findOne({ telegramId });
    if (!user) return;

    const referralLink = await user.getReferralLink();
    const referralCode = user.referralCode;

    const text = t(lang, 'referral.link', { referralLink, referralCode });

    const keyboard = referralLinkKeyboard(lang);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in showReferralLink:', error);
  }
}

/**
 * Escape Markdown special characters
 */
function escapeMarkdown(text) {
  if (!text) return '';
  return String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

/**
 * Show list of referrals
 */
async function showReferralsList(ctx, page = 0) {
  try {
    const lang = ctx.state?.lang || 'ru';

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const telegramId = ctx.from.id;
    const pageSize = 10;

    // Find all users referred by this user
    const totalReferrals = await User.countDocuments({ referredBy: telegramId });
    const totalPages = Math.ceil(totalReferrals / pageSize) || 1;

    const referrals = await User.find({ referredBy: telegramId })
      .select('username firstName telegramId createdAt stats')
      .sort({ createdAt: -1 })
      .skip(page * pageSize)
      .limit(pageSize)
      .lean();

    let text = t(lang, 'referral.my_referrals_title');

    if (referrals.length === 0) {
      text += t(lang, 'referral.no_referrals');
    } else {
      // Get earnings per referral
      const earnings = await ReferralTransaction.aggregate([
        { $match: { referrerId: telegramId } },
        { $group: { _id: '$refereeId', total: { $sum: '$bonusAmount' } } }
      ]);
      const earningsMap = new Map(earnings.map(e => [e._id, e.total]));

      text += t(lang, 'referral.total_referrals', { count: totalReferrals });

      for (const ref of referrals) {
        // Escape username/firstName to prevent Markdown parsing errors
        const safeName = ref.username
          ? `\`@${ref.username}\``
          : (ref.firstName || `ID: ${ref.telegramId}`);
        const dealsCompleted = ref.stats?.dealsCompleted || 0;
        const earned = earningsMap.get(ref.telegramId) || 0;
        const date = formatDate(lang, ref.createdAt, { hour: undefined, minute: undefined, second: undefined });

        const status = dealsCompleted > 0 ? '✅' : '⏳';
        text += `${status} ${safeName}\n`;
        text += t(lang, 'referral.referral_stats', { date, deals: dealsCompleted, earned: earned.toFixed(2) });
      }
    }

    const keyboard = referralsListKeyboard(page, totalPages, referrals.length > 0, lang);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in showReferralsList:', error);
  }
}

/**
 * Show history of referral earnings
 */
async function showReferralHistory(ctx, page = 0) {
  try {
    const lang = ctx.state?.lang || 'ru';

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const telegramId = ctx.from.id;
    const pageSize = 10;

    // Get transactions
    const totalTransactions = await ReferralTransaction.countDocuments({ referrerId: telegramId });
    const totalPages = Math.ceil(totalTransactions / pageSize) || 1;

    const transactions = await ReferralTransaction.find({ referrerId: telegramId })
      .sort({ createdAt: -1 })
      .skip(page * pageSize)
      .limit(pageSize)
      .lean();

    let text = t(lang, 'referral.history_title');

    if (transactions.length === 0) {
      text += t(lang, 'referral.no_history');
    } else {
      text += t(lang, 'referral.total_operations', { count: totalTransactions });

      for (const tx of transactions) {
        const date = formatDate(lang, tx.createdAt, { hour: undefined, minute: undefined, second: undefined });
        const referee = await User.findOne({ telegramId: tx.refereeId }).select('username firstName').lean();
        const refName = referee?.username
          ? `\`@${referee.username}\``
          : (referee?.firstName || t(lang, 'common.user'));

        text += `💰 *+${tx.bonusAmount.toFixed(2)} USDT*\n`;
        text += `   ${refName} • ${t(lang, 'referral.deal_label')} ${tx.dealId}\n`;
        text += `   📅 ${date}\n\n`;
      }
    }

    const keyboard = historyKeyboard(page, totalPages, transactions.length > 0, lang);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in showReferralHistory:', error);
  }
}

// ============================================
// WITHDRAWAL FLOW
// ============================================

/**
 * Show withdrawal info (when balance < 10)
 */
async function showWithdrawalInfo(ctx) {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    const user = await User.findOne({ telegramId }).select('referralBalance');
    const balance = user?.referralBalance || 0;
    const needed = (10 - balance).toFixed(2);

    const text = t(lang, 'referral.withdraw_not_enough', {
      balance: balance.toFixed(2),
      needed
    });

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.back'), 'referral:back')]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in showWithdrawalInfo:', error);
  }
}

/**
 * Start withdrawal - ask for wallet
 */
async function startWithdrawal(ctx) {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    // Check for pending withdrawal
    const pendingWithdrawal = await ReferralWithdrawal.getUserPendingWithdrawal(telegramId);
    if (pendingWithdrawal) {
      const statusText = pendingWithdrawal.status === 'pending'
        ? t(lang, 'referral.status_pending')
        : t(lang, 'referral.status_processing');

      const text = t(lang, 'referral.withdraw_pending_exists', {
        withdrawalId: pendingWithdrawal.withdrawalId,
        status: statusText
      });

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(t(lang, 'btn.back'), 'referral:back')]
      ]);

      await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
      return;
    }

    const user = await User.findOne({ telegramId }).select('referralBalance wallets referralWallet');

    if (!user || user.referralBalance < 10) {
      await showWithdrawalInfo(ctx);
      return;
    }

    // Create session for wallet input
    await Session.setSession(telegramId, 'referral', {
      action: 'withdrawal',
      step: 'wallet',
      amount: user.referralBalance
    }, 1); // TTL 1 hour

    const savedWallets = user.wallets || [];

    let text = t(lang, 'referral.withdraw_select_wallet', { balance: user.referralBalance.toFixed(2) });

    if (savedWallets.length > 0) {
      text += t(lang, 'referral.withdraw_select_saved');
    } else {
      text += t(lang, 'referral.withdraw_enter_address');
    }

    const keyboard = withdrawalWalletKeyboard(savedWallets, lang);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
  } catch (error) {
    console.error('Error in startWithdrawal:', error);
  }
}

/**
 * Use saved wallet for withdrawal
 */
async function useSavedWallet(ctx, walletIndex) {
  try {
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    const user = await User.findOne({ telegramId }).select('wallets referralBalance');
    if (!user || !user.wallets[walletIndex]) {
      await showReferrals(ctx);
      return;
    }

    const wallet = user.wallets[walletIndex];

    // Update session with wallet
    await Session.setSession(telegramId, 'referral', {
      action: 'withdrawal',
      step: 'confirm',
      amount: user.referralBalance,
      wallet: wallet.address
    }, 1);

    await showWithdrawalConfirmation(ctx, user.referralBalance, wallet.address);
  } catch (error) {
    console.error('Error in useSavedWallet:', error);
  }
}

/**
 * Show withdrawal confirmation
 */
async function showWithdrawalConfirmation(ctx, amount, walletAddress) {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  const text = t(lang, 'referral.withdraw_confirm', {
    amount: amount.toFixed(2),
    walletAddress
  });

  const keyboard = withdrawalConfirmKeyboard(lang);
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
}

/**
 * Confirm withdrawal - create request
 */
async function confirmWithdrawal(ctx) {
  try {
    await ctx.answerCbQuery();
    const lang = ctx.state?.lang || 'ru';
    const telegramId = ctx.from.id;

    const session = await Session.getSession(telegramId, 'referral');
    if (!session || session.step !== 'confirm' || !session.wallet) {
      await showReferrals(ctx);
      return;
    }

    const user = await User.findOne({ telegramId });
    if (!user || user.referralBalance < 10) {
      await showReferrals(ctx);
      return;
    }

    // Double-check no pending withdrawal
    const pendingWithdrawal = await ReferralWithdrawal.getUserPendingWithdrawal(telegramId);
    if (pendingWithdrawal) {
      await clearReferralSession(telegramId);
      await showReferrals(ctx);
      return;
    }

    const amount = user.referralBalance;
    const walletAddress = session.wallet;

    // Create withdrawal request
    const withdrawal = new ReferralWithdrawal({
      userId: telegramId,
      username: user.username,
      amount: amount,
      walletAddress: walletAddress
    });
    await withdrawal.save();

    // Deduct from balance (reserve the amount)
    user.referralBalance = 0;
    user.referralWallet = walletAddress; // Save for future
    await user.save();

    // Clear session
    await clearReferralSession(telegramId);

    const text = t(lang, 'referral.withdraw_success', {
      withdrawalId: withdrawal.withdrawalId,
      amount: amount.toFixed(2),
      walletAddress
    });

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(t(lang, 'btn.referrals_btn'), 'referral:main')],
      [Markup.button.callback(t(lang, 'btn.main_menu'), 'main_menu')]
    ]);

    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);

    // Notify admin about new withdrawal request
    await adminAlertService.alertReferralWithdrawal(withdrawal, user);
    console.log(`📤 New referral withdrawal request: ${withdrawal.withdrawalId} - ${amount} USDT to ${walletAddress}`);
  } catch (error) {
    console.error('Error in confirmWithdrawal:', error);
  }
}

// ============================================
// TEXT INPUT HANDLER
// ============================================

/**
 * Handle text input for referral (wallet address)
 */
async function handleReferralTextInput(ctx) {
  try {
    const telegramId = ctx.from.id;
    const session = await Session.getSession(telegramId, 'referral');

    if (!session) {
      return false; // Not handled
    }

    // Delete user message
    await messageManager.deleteUserMessage(ctx);

    if (session.action === 'withdrawal' && session.step === 'wallet') {
      const text = ctx.message.text.trim();

      // Validate TRC-20 address
      const isValid = blockchainService.validateAddress(text);
      if (!isValid) {
        const lang = ctx.state?.lang || 'ru';
        const errorText = t(lang, 'referral.invalid_address');

        const user = await User.findOne({ telegramId }).select('wallets');
        const keyboard = withdrawalWalletKeyboard(user?.wallets || [], lang);

        await messageManager.sendNewMessage(ctx, telegramId, errorText, keyboard);
        return true;
      }

      // Update session
      await Session.setSession(telegramId, 'referral', {
        ...session,
        step: 'confirm',
        wallet: text
      }, 1);

      await showWithdrawalConfirmation(ctx, session.amount, text);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error in handleReferralTextInput:', error);
    return false;
  }
}

// ============================================
// NAVIGATION
// ============================================

/**
 * Handle back button within referral section
 */
async function handleReferralBack(ctx) {
  await clearReferralSession(ctx.from.id);
  await showReferrals(ctx);
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Session
  hasReferralSession,
  clearReferralSession,

  // Main screens
  showReferrals,
  showReferralLink,
  showReferralsList,
  showReferralHistory,

  // Withdrawal
  showWithdrawalInfo,
  startWithdrawal,
  useSavedWallet,
  confirmWithdrawal,

  // Text input
  handleReferralTextInput,

  // Navigation
  handleReferralBack
};
