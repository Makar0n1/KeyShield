const express = require('express');
const router = express.Router();
const disputeService = require('../../services/disputeService');

/**
 * POST /api/disputes/create
 * Open a new dispute
 */
router.post('/create', async (req, res, next) => {
  try {
    const { dealId, openedBy, reasonText, media } = req.body;

    if (!dealId || !openedBy || !reasonText) {
      return res.status(400).json({
        success: false,
        error: 'dealId, openedBy, and reasonText are required'
      });
    }

    const dispute = await disputeService.openDispute(
      dealId,
      parseInt(openedBy),
      reasonText,
      media || []
    );

    res.status(201).json({
      success: true,
      message: 'Dispute created successfully',
      dispute
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/disputes/comment
 * Add comment to dispute
 */
router.post('/comment', async (req, res, next) => {
  try {
    const { dealId, userId, text, media } = req.body;

    if (!dealId || !userId || !text) {
      return res.status(400).json({
        success: false,
        error: 'dealId, userId, and text are required'
      });
    }

    const dispute = await disputeService.addComment(
      dealId,
      parseInt(userId),
      text,
      media || []
    );

    res.json({
      success: true,
      message: 'Comment added',
      dispute
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/disputes/resolve
 * Resolve a dispute (admin/arbiter action)
 */
router.post('/resolve', async (req, res, next) => {
  try {
    const { dealId, decision, arbiterId } = req.body;

    if (!dealId || !decision || !arbiterId) {
      return res.status(400).json({
        success: false,
        error: 'dealId, decision, and arbiterId are required'
      });
    }

    if (!['refund_buyer', 'release_seller'].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: 'decision must be "refund_buyer" or "release_seller"'
      });
    }

    const result = await disputeService.resolveDispute(
      dealId,
      decision,
      parseInt(arbiterId)
    );

    res.json({
      success: true,
      message: 'Dispute resolved',
      ...result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/disputes/deal/:dealId
 * Get dispute for a deal
 */
router.get('/deal/:dealId', async (req, res, next) => {
  try {
    const dispute = await disputeService.getDisputeByDealId(req.params.dealId);

    if (!dispute) {
      return res.status(404).json({
        success: false,
        error: 'Dispute not found'
      });
    }

    res.json({
      success: true,
      dispute
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/disputes
 * Get all disputes (with filters)
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, openedBy, limit } = req.query;

    const disputes = await disputeService.getDisputes({
      status,
      openedBy: openedBy ? parseInt(openedBy) : undefined,
      limit: limit ? parseInt(limit) : undefined
    });

    res.json({
      success: true,
      count: disputes.length,
      disputes
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/disputes/open
 * Get all open disputes (for admin queue)
 */
router.get('/open', async (req, res, next) => {
  try {
    const disputes = await disputeService.getOpenDisputes();

    res.json({
      success: true,
      count: disputes.length,
      disputes
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
