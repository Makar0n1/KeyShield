const express = require('express');
const router = express.Router();
const dealService = require('../../services/dealService');
const Deal = require('../../models/Deal');

/**
 * GET /api/deals/:dealId
 * Get deal by ID
 */
router.get('/:dealId', async (req, res, next) => {
  try {
    const deal = await dealService.getDealById(req.params.dealId);

    if (!deal) {
      return res.status(404).json({
        success: false,
        error: 'Deal not found'
      });
    }

    res.json({
      success: true,
      deal
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/deals/user/:telegramId
 * Get user's deals
 */
router.get('/user/:telegramId', async (req, res, next) => {
  try {
    const { status } = req.query;
    const deals = await dealService.getUserDeals(
      parseInt(req.params.telegramId),
      status
    );

    res.json({
      success: true,
      count: deals.length,
      deals
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/deals/create
 * Create a new deal
 */
router.post('/create', async (req, res, next) => {
  try {
    const {
      buyerId,
      sellerId,
      productName,
      description,
      asset,
      amount,
      commissionType,
      deadlineHours
    } = req.body;

    // Validate required fields
    if (!buyerId || !sellerId || !productName || !description || !amount || !commissionType || !deadlineHours) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const result = await dealService.createDeal({
      buyerId: parseInt(buyerId),
      sellerId: parseInt(sellerId),
      productName,
      description,
      asset: asset || 'USDT',
      amount: parseFloat(amount),
      commissionType,
      deadlineHours: parseInt(deadlineHours)
    });

    res.status(201).json({
      success: true,
      message: 'Deal created successfully',
      ...result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/deals/:dealId/submit-work
 * Seller marks work as done
 */
router.post('/:dealId/submit-work', async (req, res, next) => {
  try {
    const { sellerId } = req.body;

    if (!sellerId) {
      return res.status(400).json({
        success: false,
        error: 'sellerId is required'
      });
    }

    const deal = await dealService.submitWork(
      req.params.dealId,
      parseInt(sellerId)
    );

    res.json({
      success: true,
      message: 'Work submitted for buyer review',
      deal
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/deals/:dealId/status
 * Check deal deposit status
 */
router.get('/:dealId/deposit-status', async (req, res, next) => {
  try {
    const deal = await dealService.getDealById(req.params.dealId);

    if (!deal) {
      return res.status(404).json({
        success: false,
        error: 'Deal not found'
      });
    }

    res.json({
      success: true,
      dealId: deal.dealId,
      status: deal.status,
      multisigAddress: deal.multisigAddress,
      depositTxHash: deal.depositTxHash,
      depositDetectedAt: deal.depositDetectedAt
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/deals/:dealId/cancel
 * Cancel a deal (before deposit or by mutual agreement)
 */
router.post('/:dealId/cancel', async (req, res, next) => {
  try {
    const { userId } = req.body;

    const deal = await dealService.getDealById(req.params.dealId);

    if (!deal) {
      return res.status(404).json({
        success: false,
        error: 'Deal not found'
      });
    }

    // Only allow cancellation before deposit
    if (deal.status !== 'waiting_for_deposit' && deal.status !== 'created') {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel deal after deposit'
      });
    }

    const updatedDeal = await dealService.updateDealStatus(
      req.params.dealId,
      'cancelled',
      parseInt(userId)
    );

    res.json({
      success: true,
      message: 'Deal cancelled',
      deal: updatedDeal
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
