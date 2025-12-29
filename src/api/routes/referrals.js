const express = require('express');
const router = express.Router();
const ReferralWithdrawal = require('../../models/ReferralWithdrawal');
const User = require('../../models/User');
const notificationService = require('../../services/notificationService');
const { Markup } = require('telegraf');

/**
 * GET /api/referrals/withdrawals
 * Get all withdrawal requests with optional status filter
 */
router.get('/withdrawals', async (req, res, next) => {
  try {
    const { status, page = 0, limit = 20 } = req.query;

    const query = {};
    if (status) {
      query.status = status;
    }

    const [withdrawals, total] = await Promise.all([
      ReferralWithdrawal.find(query)
        .sort({ createdAt: -1 })
        .skip(parseInt(page) * parseInt(limit))
        .limit(parseInt(limit))
        .lean(),
      ReferralWithdrawal.countDocuments(query)
    ]);

    // Enrich with user data
    for (const w of withdrawals) {
      const user = await User.findOne({ telegramId: w.userId })
        .select('username firstName referralStats createdAt')
        .lean();
      w.user = user;
    }

    res.json({
      success: true,
      withdrawals,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/referrals/withdrawals/pending-count
 * Get count of pending withdrawals
 */
router.get('/withdrawals/pending-count', async (req, res, next) => {
  try {
    const count = await ReferralWithdrawal.getPendingCount();
    res.json({ success: true, count });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/referrals/withdrawals/:id
 * Get single withdrawal details
 */
router.get('/withdrawals/:id', async (req, res, next) => {
  try {
    const withdrawal = await ReferralWithdrawal.findOne({
      withdrawalId: req.params.id
    }).lean();

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal not found'
      });
    }

    // Get user data
    const user = await User.findOne({ telegramId: withdrawal.userId })
      .select('username firstName referralStats referralTotalEarned createdAt')
      .lean();
    withdrawal.user = user;

    // Get referral count
    const referralsCount = await User.countDocuments({ referredBy: withdrawal.userId });
    withdrawal.referralsCount = referralsCount;

    res.json({ success: true, withdrawal });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/referrals/withdrawals/:id/start
 * Start processing a withdrawal (change status to 'processing')
 */
router.post('/withdrawals/:id/start', async (req, res, next) => {
  try {
    const withdrawal = await ReferralWithdrawal.findOne({
      withdrawalId: req.params.id,
      status: 'pending'
    });

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        error: 'Pending withdrawal not found'
      });
    }

    withdrawal.status = 'processing';
    withdrawal.processingStartedAt = new Date();
    await withdrawal.save();

    res.json({
      success: true,
      message: 'Withdrawal processing started',
      withdrawal
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/referrals/withdrawals/:id/complete
 * Mark withdrawal as completed
 */
router.post('/withdrawals/:id/complete', async (req, res, next) => {
  try {
    const { txHash } = req.body;

    const withdrawal = await ReferralWithdrawal.findOne({
      withdrawalId: req.params.id,
      status: 'processing'
    });

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        error: 'Processing withdrawal not found'
      });
    }

    withdrawal.status = 'completed';
    withdrawal.completedAt = new Date();
    withdrawal.txHash = txHash || null;
    await withdrawal.save();

    // Update user stats
    await User.updateOne(
      { telegramId: withdrawal.userId },
      { $inc: { referralWithdrawnTotal: withdrawal.amount } }
    );

    // Notify user about completion
    const bot = notificationService.getBotInstance();
    if (bot) {
      try {
        const text = `✅ *Выплата выполнена!*

💰 Сумма: *${withdrawal.amount.toFixed(2)} USDT*
📋 Заявка: \`${withdrawal.withdrawalId}\`

${txHash ? `[Транзакция](https://tronscan.org/#/transaction/${txHash})` : 'Средства отправлены на ваш кошелёк.'}

Спасибо, что приглашаете друзей! 🎉`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('🎁 Рефералы', 'referrals')],
          [Markup.button.callback('🏠 Главное меню', 'main_menu')]
        ]);

        await bot.telegram.sendMessage(withdrawal.userId, text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
      } catch (e) {
        console.error('Failed to notify user about withdrawal completion:', e.message);
      }
    }

    res.json({
      success: true,
      message: 'Withdrawal completed',
      withdrawal
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/referrals/withdrawals/:id/reject
 * Reject a withdrawal request
 */
router.post('/withdrawals/:id/reject', async (req, res, next) => {
  try {
    const { reason } = req.body;

    const withdrawal = await ReferralWithdrawal.findOne({
      withdrawalId: req.params.id,
      status: { $in: ['pending', 'processing'] }
    });

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal not found or already processed'
      });
    }

    const amount = withdrawal.amount;

    withdrawal.status = 'rejected';
    withdrawal.completedAt = new Date();
    withdrawal.adminNotes = reason || 'Rejected by admin';
    await withdrawal.save();

    // Return funds to user balance
    await User.updateOne(
      { telegramId: withdrawal.userId },
      { $inc: { referralBalance: amount } }
    );

    // Notify user about rejection
    const bot = notificationService.getBotInstance();
    if (bot) {
      try {
        const text = `❌ *Заявка на вывод отклонена*

📋 Заявка: \`${withdrawal.withdrawalId}\`
💰 Сумма: *${amount.toFixed(2)} USDT*

${reason ? `Причина: ${reason}` : ''}

Средства возвращены на ваш реферальный баланс.
Свяжитесь с поддержкой, если у вас есть вопросы.`;

        const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('🎁 Рефералы', 'referrals')],
          [Markup.button.callback('🏠 Главное меню', 'main_menu')]
        ]);

        await bot.telegram.sendMessage(withdrawal.userId, text, {
          parse_mode: 'Markdown',
          reply_markup: keyboard.reply_markup
        });
      } catch (e) {
        console.error('Failed to notify user about withdrawal rejection:', e.message);
      }
    }

    res.json({
      success: true,
      message: 'Withdrawal rejected, funds returned to user',
      withdrawal
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/referrals/stats
 * Get overall referral program statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const [
      totalWithdrawals,
      pendingCount,
      processingCount,
      completedCount,
      rejectedCount,
      totalPaidOut,
      totalRejected,
      totalReferrers,
      totalEarned
    ] = await Promise.all([
      ReferralWithdrawal.countDocuments(),
      ReferralWithdrawal.countDocuments({ status: 'pending' }),
      ReferralWithdrawal.countDocuments({ status: 'processing' }),
      ReferralWithdrawal.countDocuments({ status: 'completed' }),
      ReferralWithdrawal.countDocuments({ status: 'rejected' }),
      ReferralWithdrawal.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      ReferralWithdrawal.aggregate([
        { $match: { status: 'rejected' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      User.countDocuments({ 'referralStats.totalInvited': { $gt: 0 } }),
      User.aggregate([
        { $match: { referralTotalEarned: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$referralTotalEarned' } } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalWithdrawals,
        pendingCount,
        processingCount,
        completedCount,
        rejectedCount,
        totalPaidOut: totalPaidOut[0]?.total || 0,
        totalRejected: totalRejected[0]?.total || 0,
        totalReferrers,
        totalEarned: totalEarned[0]?.total || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
