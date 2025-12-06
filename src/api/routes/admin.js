const express = require('express');
const router = express.Router();
const { authMiddleware, generateToken } = require('../middleware/auth');
const Deal = require('../../models/Deal');
const User = require('../../models/User');
const Dispute = require('../../models/Dispute');
const Transaction = require('../../models/Transaction');
const AuditLog = require('../../models/AuditLog');
const banService = require('../../services/banService');

/**
 * GET /api/admin/stats
 * Get basic stats (used for auth check and dashboard)
 */
router.get('/stats', authMiddleware, async (req, res, next) => {
  try {
    const [totalDeals, activeDeals, totalUsers, openDisputes] = await Promise.all([
      Deal.countDocuments(),
      Deal.countDocuments({ status: { $in: ['in_progress', 'locked', 'waiting_for_deposit'] } }),
      User.countDocuments(),
      Dispute.countDocuments({ status: 'open' })
    ]);

    res.json({
      success: true,
      stats: {
        deals: { total: totalDeals, active: activeDeals },
        users: { total: totalUsers },
        disputes: { open: openDisputes }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/login
 * Admin login (simple version, enhance later)
 */
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    // SECURITY TODO: Implement proper admin authentication
    // For MVP, using environment variable
    if (
      username === process.env.ADMIN_USERNAME &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const token = generateToken({
        username,
        role: 'admin'
      });

      res.json({
        success: true,
        token,
        admin: { username, role: 'admin' }
      });
    } else {
      res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/dashboard
 * Get dashboard statistics
 */
router.get('/dashboard', authMiddleware, async (req, res, next) => {
  try {
    const [
      totalDeals,
      activeDeals,
      completedDeals,
      totalDisputes,
      openDisputes,
      bannedUsers,
      totalUsers
    ] = await Promise.all([
      Deal.countDocuments(),
      Deal.countDocuments({ status: { $in: ['waiting_for_deposit', 'locked', 'in_progress'] } }),
      Deal.countDocuments({ status: 'completed' }),
      Dispute.countDocuments(),
      Dispute.countDocuments({ status: { $in: ['open', 'in_review'] } }),
      User.countDocuments({ blacklisted: true }),
      User.countDocuments()
    ]);

    // Calculate total volume
    const volumeResult = await Deal.aggregate([
      { $match: { status: { $in: ['completed', 'resolved'] } } },
      { $group: { _id: '$asset', total: { $sum: '$amount' } } }
    ]);

    // Calculate total commissions
    const commissionResult = await Deal.aggregate([
      { $match: { status: { $in: ['completed', 'resolved'] } } },
      { $group: { _id: null, total: { $sum: '$commission' } } }
    ]);

    res.json({
      success: true,
      stats: {
        deals: {
          total: totalDeals,
          active: activeDeals,
          completed: completedDeals
        },
        disputes: {
          total: totalDisputes,
          open: openDisputes
        },
        users: {
          total: totalUsers,
          banned: bannedUsers
        },
        volume: volumeResult,
        totalCommissions: commissionResult[0]?.total || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/deals
 * Get all deals with filters
 */
router.get('/deals', authMiddleware, async (req, res, next) => {
  try {
    const { status, buyerId, sellerId, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status) query.status = status;
    if (buyerId) query.buyerId = parseInt(buyerId);
    if (sellerId) query.sellerId = parseInt(sellerId);

    const deals = await Deal.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Deal.countDocuments(query);

    res.json({
      success: true,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      deals
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/deal/:dealId
 * Get full deal details
 */
router.get('/deal/:dealId', authMiddleware, async (req, res, next) => {
  try {
    const deal = await Deal.findOne({ dealId: req.params.dealId });

    if (!deal) {
      return res.status(404).json({
        success: false,
        error: 'Deal not found'
      });
    }

    // Get related data
    const [transactions, dispute, buyer, seller] = await Promise.all([
      Transaction.find({ dealId: deal._id }).sort({ timestamp: -1 }),
      Dispute.findOne({ dealId: deal._id }),
      User.findOne({ telegramId: deal.buyerId }),
      User.findOne({ telegramId: deal.sellerId })
    ]);

    res.json({
      success: true,
      deal,
      transactions,
      dispute,
      buyer,
      seller
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/users
 * Get all users with filters
 */
router.get('/users', authMiddleware, async (req, res, next) => {
  try {
    const { blacklisted, page = 1, limit = 50 } = req.query;

    const query = {};
    if (blacklisted !== undefined) {
      query.blacklisted = blacklisted === 'true';
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      users
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/ban-user
 * Ban a user
 */
router.post('/ban-user', authMiddleware, async (req, res, next) => {
  try {
    const { telegramId, reason } = req.body;

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        error: 'telegramId is required'
      });
    }

    const result = await banService.banUser(
      parseInt(telegramId),
      req.admin.username, // Admin ID from JWT
      reason || 'Manual ban by admin'
    );

    res.json({
      success: true,
      message: result.alreadyBanned ? 'User already banned' : 'User banned successfully',
      user: result.user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/unban-user
 * Unban a user
 */
router.post('/unban-user', authMiddleware, async (req, res, next) => {
  try {
    const { telegramId, reason } = req.body;

    if (!telegramId) {
      return res.status(400).json({
        success: false,
        error: 'telegramId is required'
      });
    }

    const result = await banService.unbanUser(
      parseInt(telegramId),
      req.admin.username,
      reason || 'Manual unban by admin'
    );

    res.json({
      success: true,
      message: result.alreadyUnbanned ? 'User not banned' : 'User unbanned successfully',
      user: result.user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/logs
 * Get audit logs
 */
router.get('/logs', authMiddleware, async (req, res, next) => {
  try {
    const { action, userId, dealId, page = 1, limit = 50 } = req.query;

    const query = {};
    if (action) query.action = action;
    if (userId) query.userId = parseInt(userId);
    if (dealId) {
      const Deal = require('../../models/Deal');
      const deal = await Deal.findOne({ dealId });
      if (deal) query.dealId = deal._id;
    }

    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await AuditLog.countDocuments(query);

    res.json({
      success: true,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      logs
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
