const express = require('express');
const router = express.Router();
const blockchainService = require('../../services/blockchain');
const MultisigWallet = require('../../models/MultisigWallet');

/**
 * POST /api/multisig/create
 * Create a new multisig wallet
 */
router.post('/create', async (req, res, next) => {
  try {
    const { buyerKey, sellerKey, arbiterKey, dealId } = req.body;

    if (!buyerKey || !sellerKey || !arbiterKey) {
      return res.status(400).json({
        success: false,
        error: 'All keys (buyer, seller, arbiter) are required'
      });
    }

    const wallet = await blockchainService.createMultisigWallet(
      buyerKey,
      sellerKey,
      arbiterKey
    );

    res.status(201).json({
      success: true,
      message: 'Multisig wallet created',
      wallet
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/multisig/:address/balance
 * Get wallet balance
 */
router.get('/:address/balance', async (req, res, next) => {
  try {
    const { asset } = req.query;
    const address = req.params.address;

    if (!blockchainService.isValidAddress(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid TRON address'
      });
    }

    const balance = await blockchainService.getBalance(address, asset || 'USDT');

    res.json({
      success: true,
      address,
      asset: asset || 'USDT',
      balance
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/multisig/deal/:dealId
 * Get multisig wallet for a deal
 */
router.get('/deal/:dealId', async (req, res, next) => {
  try {
    const Deal = require('../../models/Deal');
    const deal = await Deal.findOne({ dealId: req.params.dealId });

    if (!deal) {
      return res.status(404).json({
        success: false,
        error: 'Deal not found'
      });
    }

    const wallet = await MultisigWallet.findOne({ dealId: deal._id });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: 'Multisig wallet not found'
      });
    }

    res.json({
      success: true,
      wallet
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
