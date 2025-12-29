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
const referralMenuKeyboard = (canWithdraw, hasBalance) => {
  const buttons = [];

  buttons.push([Markup.button.callback('🔗 Моя ссылка', 'referral:link')]);
  buttons.push([Markup.button.callback('👥 Мои рефералы', 'referral:list')]);
  buttons.push([Markup.button.callback('📊 История начислений', 'referral:history')]);

  if (hasBalance) {
    if (canWithdraw) {
      buttons.push([Markup.button.callback('💸 Вывести баланс', 'referral:withdraw')]);
    } else {
      buttons.push([Markup.button.callback('💸 Вывести (мин. 10$)', 'referral:withdraw_info')]);
    }
  }

  buttons.push([Markup.button.callback('⬅️ Назад', 'main_menu')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Referral link screen keyboard
 */
const referralLinkKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Назад', 'referral:back')],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
};

/**
 * Referrals list keyboard with pagination
 */
const referralsListKeyboard = (page, totalPages, hasReferrals) => {
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

  buttons.push([Markup.button.callback('⬅️ Назад', 'referral:back')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * History keyboard with pagination
 */
const historyKeyboard = (page, totalPages, hasHistory) => {
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

  buttons.push([Markup.button.callback('⬅️ Назад', 'referral:back')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Withdrawal wallet input keyboard
 */
const withdrawalWalletKeyboard = (savedWallets = []) => {
  const buttons = [];

  // Show saved wallets as options
  savedWallets.forEach((wallet, index) => {
    const displayName = wallet.name || `Кошелёк ${index + 1}`;
    const shortAddr = wallet.address.slice(0, 6) + '...' + wallet.address.slice(-4);
    buttons.push([
      Markup.button.callback(`💳 ${displayName}: ${shortAddr}`, `referral:use_wallet:${index}`)
    ]);
  });

  buttons.push([Markup.button.callback('❌ Отмена', 'referral:back')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Withdrawal confirmation keyboard
 */
const withdrawalConfirmKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Подтвердить', 'referral:confirm_withdraw')],
    [Markup.button.callback('❌ Отмена', 'referral:back')]
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
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
    }

    const telegramId = ctx.from.id;

    // Clear any existing session
    await clearReferralSession(telegramId);

    // Get user with referral data
    const user = await User.findOne({ telegramId });
    if (!user) {
      await messageManager.sendNewMessage(ctx, telegramId, '❌ Пользователь не найден.',
        Markup.inlineKeyboard([[Markup.button.callback('🏠 Главное меню', 'main_menu')]]));
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
      const statusText = pendingWithdrawal.status === 'pending' ? 'ожидает обработки' : 'в процессе';
      withdrawalStatus = `\n\n⏳ *Заявка ${pendingWithdrawal.withdrawalId}*: ${statusText}`;
    }

    const text = `🎁 *Реферальная программа*

Приглашай друзей и получай *10%* от комиссии сервиса с каждой их сделки!

━━━━━━━━━━━━━━━━━━━━━━
💰 *Баланс:* ${balance.toFixed(2)} USDT
📊 *Всего заработано:* ${totalEarned.toFixed(2)} USDT
💸 *Выведено:* ${withdrawn.toFixed(2)} USDT
━━━━━━━━━━━━━━━━━━━━━━
👥 *Приглашено:* ${totalInvited}
✅ *Активных:* ${activeReferrals}
━━━━━━━━━━━━━━━━━━━━━━${withdrawalStatus}

_Минимальная сумма для вывода: 10 USDT_`;

    const keyboard = referralMenuKeyboard(canWithdraw && !pendingWithdrawal, hasBalance);
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
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    const user = await User.findOne({ telegramId });
    if (!user) return;

    const referralLink = await user.getReferralLink();
    const referralCode = user.referralCode;

    const text = `🔗 *Твоя реферальная ссылка*

Поделись ссылкой с друзьями:

\`${referralLink}\`

Или код для ввода: \`${referralCode}\`

━━━━━━━━━━━━━━━━━━━━━━

*Как это работает:*
1️⃣ Друг переходит по твоей ссылке
2️⃣ Регистрируется в боте
3️⃣ Совершает сделку
4️⃣ Ты получаешь *10%* от комиссии сервиса!

_Бонус начисляется после успешного завершения сделки._`;

    const keyboard = referralLinkKeyboard();
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

    let text = `👥 *Мои рефералы*\n\n`;

    if (referrals.length === 0) {
      text += `_У вас пока нет приглашённых пользователей._\n\n`;
      text += `Поделитесь своей реферальной ссылкой, чтобы начать зарабатывать!`;
    } else {
      // Get earnings per referral
      const earnings = await ReferralTransaction.aggregate([
        { $match: { referrerId: telegramId } },
        { $group: { _id: '$refereeId', total: { $sum: '$bonusAmount' } } }
      ]);
      const earningsMap = new Map(earnings.map(e => [e._id, e.total]));

      text += `Всего: ${totalReferrals}\n\n`;

      for (const ref of referrals) {
        // Escape username/firstName to prevent Markdown parsing errors
        const safeName = ref.username
          ? `@${escapeMarkdown(ref.username)}`
          : (escapeMarkdown(ref.firstName) || `ID: ${ref.telegramId}`);
        const dealsCompleted = ref.stats?.dealsCompleted || 0;
        const earned = earningsMap.get(ref.telegramId) || 0;
        const date = new Date(ref.createdAt).toLocaleDateString('ru-RU');

        const status = dealsCompleted > 0 ? '✅' : '⏳';
        text += `${status} ${safeName}\n`;
        text += `   📅 ${date} • 📊 ${dealsCompleted} сделок • 💰 ${earned.toFixed(2)}$\n\n`;
      }
    }

    const keyboard = referralsListKeyboard(page, totalPages, referrals.length > 0);
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

    let text = `📊 *История начислений*\n\n`;

    if (transactions.length === 0) {
      text += `_Пока нет начислений._\n\n`;
      text += `Начисления появятся после того, как ваши рефералы завершат сделки.`;
    } else {
      text += `Всего операций: ${totalTransactions}\n\n`;

      for (const tx of transactions) {
        const date = new Date(tx.createdAt).toLocaleDateString('ru-RU');
        const referee = await User.findOne({ telegramId: tx.refereeId }).select('username firstName').lean();
        const refName = referee?.username
          ? `@${escapeMarkdown(referee.username)}`
          : (escapeMarkdown(referee?.firstName) || 'Пользователь');

        text += `💰 *+${tx.bonusAmount.toFixed(2)} USDT*\n`;
        text += `   ${refName} • Сделка ${tx.dealId}\n`;
        text += `   📅 ${date}\n\n`;
      }
    }

    const keyboard = historyKeyboard(page, totalPages, transactions.length > 0);
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
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    const user = await User.findOne({ telegramId }).select('referralBalance');
    const balance = user?.referralBalance || 0;
    const needed = (10 - balance).toFixed(2);

    const text = `💸 *Вывод средств*

Минимальная сумма для вывода: *10 USDT*

Ваш баланс: *${balance.toFixed(2)} USDT*
Осталось накопить: *${needed} USDT*

_Продолжайте приглашать друзей, чтобы быстрее достичь минимальной суммы!_`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('⬅️ Назад', 'referral:back')]
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
    await ctx.answerCbQuery();
    const telegramId = ctx.from.id;

    // Check for pending withdrawal
    const pendingWithdrawal = await ReferralWithdrawal.getUserPendingWithdrawal(telegramId);
    if (pendingWithdrawal) {
      const text = `⚠️ *У вас уже есть активная заявка*

Заявка: \`${pendingWithdrawal.withdrawalId}\`
Статус: ${pendingWithdrawal.status === 'pending' ? 'ожидает обработки' : 'в процессе'}

Дождитесь завершения текущей заявки.`;

      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Назад', 'referral:back')]
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

    let text = `💸 *Вывод реферального баланса*

💰 Сумма к выводу: *${user.referralBalance.toFixed(2)} USDT*

`;

    if (savedWallets.length > 0) {
      text += `Выберите кошелёк из сохранённых или введите новый адрес TRC-20:`;
    } else {
      text += `Введите адрес кошелька TRC-20 для получения выплаты:`;
    }

    const keyboard = withdrawalWalletKeyboard(savedWallets);
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

  const shortAddr = walletAddress.slice(0, 8) + '...' + walletAddress.slice(-6);

  const text = `📤 *Подтверждение вывода*

💰 Сумма: *${amount.toFixed(2)} USDT*
📍 Кошелёк: \`${walletAddress}\`

⚠️ Выплаты обрабатываются вручную в течение 24-48 часов.

Подтвердить заявку на вывод?`;

  const keyboard = withdrawalConfirmKeyboard();
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
}

/**
 * Confirm withdrawal - create request
 */
async function confirmWithdrawal(ctx) {
  try {
    await ctx.answerCbQuery();
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

    const text = `✅ *Заявка на вывод создана!*

📋 Номер заявки: \`${withdrawal.withdrawalId}\`
💰 Сумма: *${amount.toFixed(2)} USDT*
📍 Кошелёк: \`${walletAddress}\`

⏳ Заявка будет обработана в течение 24-48 часов.

Вы получите уведомление о выполнении.`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🎁 Рефералы', 'referral:main')],
      [Markup.button.callback('🏠 Главное меню', 'main_menu')]
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
        const errorText = `❌ *Неверный адрес*

Введите корректный адрес кошелька TRC-20 (начинается с T):`;

        const user = await User.findOne({ telegramId }).select('wallets');
        const keyboard = withdrawalWalletKeyboard(user?.wallets || []);

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
