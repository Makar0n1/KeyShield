const Deal = require('../models/Deal');
const User = require('../models/User');
const Platform = require('../models/Platform');
const MultisigWallet = require('../models/MultisigWallet');
const AuditLog = require('../models/AuditLog');
const blockchainService = require('./blockchain');
const constants = require('../config/constants');

class DealService {
  /**
   * Check if user has any active deals
   * @param {number} telegramId
   * @returns {Promise<boolean>}
   */
  async hasActiveDeal(telegramId) {
    const activeDeal = await Deal.findOne({
      $or: [
        { buyerId: telegramId },
        { sellerId: telegramId }
      ],
      status: { $in: constants.ACTIVE_DEAL_STATUSES }
    }).lean();

    return !!activeDeal;
  }

  /**
   * Check if both users have started the bot
   * @param {number} buyerId
   * @param {number} sellerId
   * @returns {Promise<Object>} - { buyerExists, sellerExists, both }
   */
  async checkUsersExist(buyerId, sellerId) {
    // Optimized: single query for both users
    const users = await User.find({
      telegramId: { $in: [buyerId, sellerId] }
    }).lean();

    const buyer = users.find(u => u.telegramId === buyerId);
    const seller = users.find(u => u.telegramId === sellerId);

    return {
      buyerExists: !!buyer,
      sellerExists: !!seller,
      both: !!buyer && !!seller,
      buyer,
      seller
    };
  }

  /**
   * Validate deal creation constraints (optimized with batch queries)
   * @param {number} buyerId
   * @param {number} sellerId
   * @param {string} description
   * @param {number} amount
   * @returns {Promise<Object>} - { valid, error }
   */
  async validateDealCreation(buyerId, sellerId, description, amount) {
    // Validate amount first (no DB query needed)
    if (amount < constants.MIN_DEAL_AMOUNT) {
      return { valid: false, error: `Minimum deal amount is ${constants.MIN_DEAL_AMOUNT} USDT` };
    }

    const uniqueKey = Deal.generateUniqueKey(buyerId, sellerId, description);

    // Execute all queries in parallel (batch optimization: 5 queries -> 1 batch)
    const [users, activeDeal, existingDeal] = await Promise.all([
      // Get both users in single query
      User.find({ telegramId: { $in: [buyerId, sellerId] } }).lean(),

      // Check active deals for both users in single query
      Deal.findOne({
        $or: [
          { buyerId: { $in: [buyerId, sellerId] } },
          { sellerId: { $in: [buyerId, sellerId] } }
        ],
        status: { $in: constants.ACTIVE_DEAL_STATUSES }
      }).lean(),

      // Check for duplicate deal
      Deal.findOne({
        uniqueKey,
        status: { $in: constants.ACTIVE_DEAL_STATUSES }
      }).lean()
    ]);

    // Extract buyer and seller from results
    const buyer = users.find(u => u.telegramId === buyerId);
    const seller = users.find(u => u.telegramId === sellerId);

    // Validate users exist
    if (!buyer) {
      return { valid: false, error: 'Buyer has not started the bot yet' };
    }

    if (!seller) {
      return { valid: false, error: 'Seller has not started the bot yet. Ask them to start @YourBotName first.' };
    }

    // Check if users are blacklisted
    if (buyer.blacklisted) {
      return { valid: false, error: 'Buyer is blacklisted and cannot create deals' };
    }

    if (seller.blacklisted) {
      return { valid: false, error: 'Seller is blacklisted and cannot participate in deals' };
    }

    // Check active deals
    if (activeDeal) {
      // Determine who has the active deal
      if (activeDeal.buyerId === buyerId || activeDeal.sellerId === buyerId) {
        return { valid: false, error: 'You already have an active deal. Complete it before creating a new one.' };
      }
      if (activeDeal.buyerId === sellerId || activeDeal.sellerId === sellerId) {
        return { valid: false, error: 'The seller already has an active deal. They must complete it first.' };
      }
    }

    // Check for duplicate deal
    if (existingDeal) {
      return { valid: false, error: 'A similar deal already exists between these parties' };
    }

    return { valid: true };
  }

  /**
   * Create a new deal with multisig wallet
   * @param {Object} dealData
   * @returns {Promise<Object>} - Created deal
   */
  async createDeal(dealData) {
    const {
      creatorRole,
      buyerId,
      sellerId,
      productName,
      description,
      asset,
      amount,
      commissionType,
      deadlineHours,
      buyerAddress,
      sellerAddress
    } = dealData;

    // Validate
    const validation = await this.validateDealCreation(buyerId, sellerId, description, amount);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Calculate commission
    const commission = Deal.calculateCommission(amount);

    // Generate deal ID
    let dealId;
    let isUnique = false;
    while (!isUnique) {
      dealId = Deal.generateDealId();
      const existing = await Deal.findOne({ dealId });
      isUnique = !existing;
    }

    // Calculate deadline
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + deadlineHours);

    // Generate unique key
    const uniqueKey = Deal.generateUniqueKey(buyerId, sellerId, description);

    // Validate wallet addresses based on creator role
    if (creatorRole === 'buyer') {
      // Buyer created deal - buyer wallet is required, seller wallet is optional
      if (!buyerAddress || !blockchainService.isValidAddress(buyerAddress)) {
        throw new Error('Invalid buyer wallet address');
      }
      // Seller address is optional - they provide it later
    } else {
      // Seller created deal - seller wallet is required, buyer wallet is optional
      if (!sellerAddress || !blockchainService.isValidAddress(sellerAddress)) {
        throw new Error('Invalid seller wallet address');
      }
      // Buyer address is optional - they provide it later
    }

    // Get arbiter key from environment
    const arbiterPrivateKey = process.env.ARBITER_PRIVATE_KEY;

    // Create multisig wallet (for escrow only, not for payout addresses)
    // We still need a multisig wallet to hold funds, but we use user addresses for payouts
    const tempBuyerKeys = await blockchainService.generateKeyPair();
    const tempSellerKeys = await blockchainService.generateKeyPair();

    const multisigWallet = await blockchainService.createMultisigWallet(
      tempBuyerKeys.privateKey,
      tempSellerKeys.privateKey,
      arbiterPrivateKey
    );

    // Determine status based on creator role and which wallets are provided
    let initialStatus;
    if (creatorRole === 'buyer') {
      // Buyer created - needs seller wallet
      initialStatus = sellerAddress ? 'waiting_for_deposit' : 'waiting_for_seller_wallet';
    } else {
      // Seller created - needs buyer wallet
      initialStatus = buyerAddress ? 'waiting_for_deposit' : 'waiting_for_buyer_wallet';
    }

    // Get platform info - check BOTH participants (chain reaction: if any is partner-referred, deal is partner's)
    const [buyer, seller] = await Promise.all([
      User.findOne({ telegramId: buyerId }),
      User.findOne({ telegramId: sellerId })
    ]);

    // Priority: if either participant has a platform, use it (first found)
    // Chain reaction: non-partner user becomes partner-referred when dealing with partner user
    let platformId = null;
    let platformCode = null;

    if (buyer?.platformId) {
      platformId = buyer.platformId;
      platformCode = buyer.platformCode;

      // Chain reaction: link seller to this platform if not already linked
      if (seller && !seller.platformId) {
        const Platform = require('../models/Platform');
        seller.platformId = buyer.platformId;
        seller.platformCode = buyer.platformCode;
        await seller.save();
        // Update platform stats
        await Platform.findByIdAndUpdate(buyer.platformId, {
          $inc: { 'stats.totalUsers': 1 }
        });
        console.log(`🔗 Chain reaction: User ${sellerId} linked to platform ${buyer.platformCode} via deal with ${buyerId}`);
      }
    } else if (seller?.platformId) {
      platformId = seller.platformId;
      platformCode = seller.platformCode;

      // Chain reaction: link buyer to this platform if not already linked
      if (buyer && !buyer.platformId) {
        const Platform = require('../models/Platform');
        buyer.platformId = seller.platformId;
        buyer.platformCode = seller.platformCode;
        await buyer.save();
        // Update platform stats
        await Platform.findByIdAndUpdate(seller.platformId, {
          $inc: { 'stats.totalUsers': 1 }
        });
        console.log(`🔗 Chain reaction: User ${buyerId} linked to platform ${seller.platformCode} via deal with ${sellerId}`);
      }
    }

    // Create deal record
    const deal = new Deal({
      dealId,
      creatorRole,
      buyerId,
      sellerId,
      platformId,
      platformCode,
      productName,
      description,
      asset,
      amount,
      commission,
      commissionType,
      multisigAddress: multisigWallet.address,
      status: initialStatus,
      deadline,
      uniqueKey,
      buyerKey: tempBuyerKeys.privateKey, // Temp keys for multisig structure
      sellerKey: tempSellerKeys.privateKey, // Not used for payouts
      arbiterKey: arbiterPrivateKey,
      buyerAddress: buyerAddress || null,  // User-provided wallet for payout
      sellerAddress: sellerAddress || null  // Will be set when seller provides it
    });

    await deal.save();

    // Create multisig wallet record
    const wallet = new MultisigWallet({
      dealId: deal._id,
      address: multisigWallet.address,
      privateKey: multisigWallet.privateKey, // Save multisig wallet private key
      buyerPublicKey: tempBuyerKeys.address,
      sellerPublicKey: tempSellerKeys.address,
      arbiterPublicKey: constants.ARBITER_ADDRESS,
      threshold: constants.MULTISIG_THRESHOLD,
      permissionsJson: multisigWallet.permissionsJson
    });

    await wallet.save();

    // NOTE: Multisig wallet activation moved to depositMonitor
    // It will be activated AFTER deposit is confirmed to save TRX costs

    // Log creation
    await AuditLog.logDealCreated(buyerId, deal._id, {
      dealId: deal.dealId,
      sellerId,
      amount,
      asset,
      multisigAddress: multisigWallet.address
    });

    return {
      deal,
      wallet,
      buyerAddress: buyerAddress,
      sellerAddress: sellerAddress
    };
  }

  /**
   * Get user's deals
   * @param {number} telegramId
   * @param {string} status - Optional status filter
   * @returns {Promise<Array>}
   */
  async getUserDeals(telegramId, status = null) {
    const query = {
      $or: [
        { buyerId: telegramId },
        { sellerId: telegramId }
      ]
    };

    if (status) {
      query.status = status;
    }

    const deals = await Deal.find(query).sort({ createdAt: -1 }).limit(20);
    return deals;
  }

  /**
   * Get deal by ID
   * @param {string} dealId
   * @returns {Promise<Object>}
   */
  async getDealById(dealId) {
    return await Deal.findOne({ dealId });
  }

  /**
   * Update deal status
   * @param {string} dealId
   * @param {string} newStatus
   * @param {number} userId - Who triggered the update
   * @returns {Promise<Object>}
   */
  async updateDealStatus(dealId, newStatus, userId) {
    const deal = await this.getDealById(dealId);
    if (!deal) {
      throw new Error('Deal not found');
    }

    const oldStatus = deal.status;
    deal.status = newStatus;

    if (newStatus === 'completed' || newStatus === 'resolved') {
      deal.completedAt = new Date();
    }

    await deal.save();

    // Update platform stats if deal belongs to a platform
    if (deal.platformId) {
      await this.updatePlatformStats(deal.platformId);
    }

    // Log status change
    await AuditLog.log(userId, 'deal_status_change', {
      dealId,
      oldStatus,
      newStatus
    }, { dealId: deal._id });

    return deal;
  }

  /**
   * Update platform statistics
   * @param {ObjectId} platformId
   */
  async updatePlatformStats(platformId) {
    try {
      const platform = await Platform.findById(platformId);
      if (platform) {
        await platform.updateStats();
      }
    } catch (error) {
      console.error('Error updating platform stats:', error);
    }
  }

  /**
   * Mark deal as work submitted (seller action)
   * @param {string} dealId
   * @param {number} sellerId
   * @returns {Promise<Object>}
   */
  async submitWork(dealId, sellerId) {
    const deal = await this.getDealById(dealId);

    if (!deal) {
      throw new Error('Deal not found');
    }

    if (deal.sellerId !== sellerId) {
      throw new Error('Only the seller can submit work');
    }

    if (deal.status !== 'locked' && deal.status !== 'in_progress') {
      throw new Error(`Cannot submit work in status: ${deal.status}`);
    }

    return await this.updateDealStatus(dealId, 'in_progress', sellerId);
  }

  /**
   * Get commission breakdown based on commission type
   * @param {Object} deal
   * @returns {Object} - { buyerPays, sellerPays, serviceFee }
   */
  getCommissionBreakdown(deal) {
    const commission = deal.commission;

    switch (deal.commissionType) {
      case 'buyer':
        return {
          buyerPays: commission,
          sellerPays: 0,
          serviceFee: commission
        };
      case 'seller':
        return {
          buyerPays: 0,
          sellerPays: commission,
          serviceFee: commission
        };
      case 'split':
        const half = commission / 2;
        return {
          buyerPays: half,
          sellerPays: half,
          serviceFee: commission
        };
      default:
        return {
          buyerPays: 0,
          sellerPays: 0,
          serviceFee: 0
        };
    }
  }
}

module.exports = new DealService();
