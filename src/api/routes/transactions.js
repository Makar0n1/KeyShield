const express = require('express');
const router = express.Router();
const blockchainService = require('../../services/blockchain');
const dealService = require('../../services/dealService');
const Transaction = require('../../models/Transaction');
const Deal = require('../../models/Deal');

/**
 * POST /api/transactions/create-release
 * Create a raw transaction for releasing funds
 */
router.post('/create-release', async (req, res, next) => {
  try {
    const { dealId, to, amount } = req.body;

    if (!dealId || !to || !amount) {
      return res.status(400).json({
        success: false,
        error: 'dealId, to, and amount are required'
      });
    }

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      return res.status(404).json({
        success: false,
        error: 'Deal not found'
      });
    }

    // Create raw transaction
    const rawTx = await blockchainService.createReleaseTransaction(
      deal.multisigAddress,
      to,
      parseFloat(amount),
      deal.asset
    );

    // Determine needed signers based on deal status
    let neededSigners;
    if (deal.status === 'dispute' || deal.status === 'resolved') {
      neededSigners = ['arbiter', deal.getUserRole(to)];
    } else {
      neededSigners = ['buyer', 'seller'];
    }

    res.json({
      success: true,
      rawTx,
      neededSigners,
      dealId: deal.dealId
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/transactions/sign
 * Sign a transaction
 */
router.post('/sign', async (req, res, next) => {
  try {
    const { dealId, signerRole, privateKey, rawTx } = req.body;

    if (!dealId || !signerRole || !privateKey || !rawTx) {
      return res.status(400).json({
        success: false,
        error: 'dealId, signerRole, privateKey, and rawTx are required'
      });
    }

    const signedTx = await blockchainService.signTransaction(rawTx, privateKey);

    res.json({
      success: true,
      signedTx,
      signerRole
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/transactions/broadcast
 * Broadcast a signed transaction
 */
router.post('/broadcast', async (req, res, next) => {
  try {
    const { dealId, signedTx, signatures } = req.body;

    if (!dealId || !signedTx) {
      return res.status(400).json({
        success: false,
        error: 'dealId and signedTx are required'
      });
    }

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      return res.status(404).json({
        success: false,
        error: 'Deal not found'
      });
    }

    // Broadcast transaction
    const result = await blockchainService.broadcastTransaction(signedTx);

    if (result.success) {
      // Create transaction record
      const transaction = new Transaction({
        dealId: deal._id,
        type: 'release',
        asset: deal.asset,
        amount: deal.amount,
        txHash: result.txHash,
        rawTx: JSON.stringify(signedTx),
        signedBy: signatures || [],
        status: 'pending'
      });

      transaction.generateExplorerLink();
      await transaction.save();

      // Update deal status
      await dealService.updateDealStatus(dealId, 'completed', null);
    }

    res.json({
      success: result.success,
      txHash: result.txHash,
      message: result.message,
      explorerLink: result.success ? Transaction.createExplorerLink(result.txHash) : null
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/transactions/deal/:dealId
 * Get all transactions for a deal
 */
router.get('/deal/:dealId', async (req, res, next) => {
  try {
    const deal = await Deal.findOne({ dealId: req.params.dealId });

    if (!deal) {
      return res.status(404).json({
        success: false,
        error: 'Deal not found'
      });
    }

    const transactions = await Transaction.find({ dealId: deal._id })
      .sort({ timestamp: -1 });

    res.json({
      success: true,
      count: transactions.length,
      transactions
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/transactions/:txHash
 * Get transaction info from blockchain
 */
router.get('/:txHash', async (req, res, next) => {
  try {
    const txInfo = await blockchainService.getTransactionInfo(req.params.txHash);

    if (!txInfo) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      transaction: txInfo
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
