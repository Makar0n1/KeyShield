const Deal = require('../models/Deal');
const User = require('../models/User');
const Platform = require('../models/Platform');
const MultisigWallet = require('../models/MultisigWallet');
const AuditLog = require('../models/AuditLog');
const ServiceStatus = require('../models/ServiceStatus');
const blockchainService = require('./blockchain');
const constants = require('../config/constants');

class DealService {
  /**
   * Check if user has any active deals (including pending invite links)
   * @param {number} telegramId
   * @returns {Promise<boolean>}
   */
  async hasActiveDeal(telegramId) {
    const activeDeal = await Deal.findOne({
      $or: [
        { buyerId: telegramId },
        { sellerId: telegramId }
      ],
      status: { $in: constants.BLOCKING_DEAL_STATUSES }
    }).lean();

    return !!activeDeal;
  }

  /**
   * Check if user has a pending invite link deal (that they created)
   * @param {number} telegramId
   * @returns {Promise<Object|null>} Deal with pending invite or null
   */
  async getPendingInviteDeal(telegramId) {
    const deal = await Deal.findOne({
      $or: [
        { buyerId: telegramId },
        { sellerId: telegramId }
      ],
      status: 'pending_counterparty',
      inviteToken: { $ne: null }
    }).lean();

    return deal;
  }

  /**
   * Find deal by invite token
   * @param {string} token
   * @returns {Promise<Object|null>}
   */
  async getDealByInviteToken(token) {
    return await Deal.findOne({
      inviteToken: token,
      status: 'pending_counterparty'
    });
  }

  /**
   * Check if user has a deal pending key validation (refund/release)
   * @param {number} telegramId
   * @returns {Promise<Object|null>} Deal with pending key validation or null
   */
  async getDealPendingKeyValidation(telegramId) {
    const deal = await Deal.findOne({
      $or: [
        { buyerId: telegramId },
        { sellerId: telegramId }
      ],
      pendingKeyValidation: { $ne: null }
    }).lean();

    return deal;
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

      // Check blocking deals for both users in single query (includes pending_counterparty)
      Deal.findOne({
        $or: [
          { buyerId: { $in: [buyerId, sellerId] } },
          { sellerId: { $in: [buyerId, sellerId] } }
        ],
        status: { $in: constants.BLOCKING_DEAL_STATUSES }
      }).lean(),

      // Check for duplicate deal
      Deal.findOne({
        uniqueKey,
        status: { $in: constants.BLOCKING_DEAL_STATUSES }
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
   * Validate invite deal creation (deal without counterparty)
   * Only checks creator constraints
   * @param {number} creatorId
   * @param {number} amount
   * @returns {Promise<Object>} - { valid, error }
   */
  async validateInviteDealCreation(creatorId, amount) {
    // Validate amount first (no DB query needed)
    if (amount < constants.MIN_DEAL_AMOUNT) {
      return { valid: false, error: `Minimum deal amount is ${constants.MIN_DEAL_AMOUNT} USDT` };
    }

    // Execute queries in parallel
    const [creator, activeDeal] = await Promise.all([
      User.findOne({ telegramId: creatorId }).lean(),
      Deal.findOne({
        $or: [
          { buyerId: creatorId },
          { sellerId: creatorId }
        ],
        status: { $in: constants.BLOCKING_DEAL_STATUSES }
      }).lean()
    ]);

    // Validate creator exists
    if (!creator) {
      return { valid: false, error: 'User not found' };
    }

    // Check if creator is blacklisted
    if (creator.blacklisted) {
      return { valid: false, error: 'You are blacklisted and cannot create deals' };
    }

    // Check blocking deals
    if (activeDeal) {
      return { valid: false, error: 'You already have an active deal or pending invite. Complete it before creating a new one.' };
    }

    return { valid: true };
  }

  /**
   * Create a deal with invite link (no counterparty yet)
   * @param {Object} dealData
   * @returns {Promise<Object>} - Created deal with invite token
   */
  async createInviteDeal(dealData) {
    const {
      creatorRole,
      creatorId,
      productName,
      description,
      asset,
      amount,
      commissionType,
      deadlineHours,
      creatorAddress,
      creatorPrivateKey: providedPrivateKey, // Pre-generated key from UI flow
      fromTemplate = false
    } = dealData;

    // Validate
    const validation = await this.validateInviteDealCreation(creatorId, amount);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Calculate commission
    const commission = Deal.calculateCommission(amount);

    // Generate deal ID and invite token
    const dealId = await Deal.generateDealId();
    const inviteToken = Deal.generateInviteToken();

    // Calculate invite expiration (24 hours)
    const inviteExpiresAt = new Date();
    inviteExpiresAt.setHours(inviteExpiresAt.getHours() + constants.INVITE_LINK_EXPIRY_HOURS);

    // Calculate deadline (will start from when counterparty accepts)
    // For now, store deadlineHours and calculate actual deadline on accept
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + deadlineHours);

    // Generate unique key (use creatorId twice since no counterparty yet)
    const uniqueKey = Deal.generateUniqueKey(creatorId, 0, description);

    // Use provided private key or generate new one
    let creatorPrivateKey = providedPrivateKey;
    if (!creatorPrivateKey) {
      const creatorKeys = await blockchainService.generateKeyPair();
      creatorPrivateKey = creatorKeys.privateKey;
    }

    // Set buyer/seller IDs based on creator role
    // The missing party will be set to 0 (placeholder) until counterparty accepts
    const buyerId = creatorRole === 'buyer' ? creatorId : 0;
    const sellerId = creatorRole === 'seller' ? creatorId : 0;

    // Set addresses
    const buyerAddress = creatorRole === 'buyer' ? creatorAddress : null;
    const sellerAddress = creatorRole === 'seller' ? creatorAddress : null;

    // Get platform info from creator
    const creator = await User.findOne({ telegramId: creatorId });
    const platformId = creator?.platformId || null;
    const platformCode = creator?.platformCode || null;

    // Create deal record (without multisig - will be created when counterparty accepts)
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
      multisigAddress: null, // Will be set when counterparty accepts
      status: 'pending_counterparty',
      deadline,
      uniqueKey,
      buyerAddress,
      sellerAddress,
      buyerPrivateKey: creatorRole === 'buyer' ? creatorPrivateKey : null,
      sellerPrivateKey: creatorRole === 'seller' ? creatorPrivateKey : null,
      inviteToken,
      inviteExpiresAt,
      fromTemplate
    });

    await deal.save();

    // Log creation
    await AuditLog.logDealCreated(creatorId, deal._id, {
      dealId: deal.dealId,
      amount,
      asset,
      inviteToken: true // Mark as invite-based deal
    });

    console.log(`📨 Invite deal ${deal.dealId} created by ${creatorId}, token: ${inviteToken}`);

    return {
      deal,
      inviteToken,
      creatorPrivateKey
    };
  }

  /**
   * Accept invite deal - counterparty joins the deal
   * @param {string} token - Invite token
   * @param {number} counterpartyId - Telegram ID of counterparty
   * @param {string} counterpartyAddress - Wallet address
   * @returns {Promise<Object>}
   */
  async acceptInviteDeal(token, counterpartyId, counterpartyAddress) {
    const deal = await this.getDealByInviteToken(token);

    if (!deal) {
      throw new Error('Invite link not found or expired');
    }

    // Check if invite expired
    if (deal.inviteExpiresAt < new Date()) {
      // Mark as cancelled
      deal.status = 'cancelled';
      deal.inviteToken = null;
      await deal.save();
      throw new Error('Invite link has expired');
    }

    // Check counterparty is not the creator
    const creatorId = deal.creatorRole === 'buyer' ? deal.buyerId : deal.sellerId;
    if (counterpartyId === creatorId) {
      throw new Error('You cannot accept your own deal');
    }

    // Check counterparty exists and is valid
    const counterparty = await User.findOne({ telegramId: counterpartyId });
    if (!counterparty) {
      throw new Error('User not found');
    }
    if (counterparty.blacklisted) {
      throw new Error('You are blacklisted and cannot participate in deals');
    }

    // Check counterparty doesn't have blocking deals
    const hasBlocking = await this.hasActiveDeal(counterpartyId);
    if (hasBlocking) {
      throw new Error('You already have an active deal. Complete it first.');
    }

    // Generate private key for counterparty
    const counterpartyKeys = await blockchainService.generateKeyPair();
    const counterpartyPrivateKey = counterpartyKeys.privateKey;

    // Get arbiter key
    const arbiterPrivateKey = process.env.ARBITER_PRIVATE_KEY;

    // Create multisig wallet now that we have both parties
    const tempBuyerKeys = await blockchainService.generateKeyPair();
    const tempSellerKeys = await blockchainService.generateKeyPair();

    const multisigWallet = await blockchainService.createMultisigWallet(
      tempBuyerKeys.privateKey,
      tempSellerKeys.privateKey,
      arbiterPrivateKey
    );

    // Update deal with counterparty info
    if (deal.creatorRole === 'buyer') {
      // Creator is buyer, counterparty is seller
      deal.sellerId = counterpartyId;
      deal.sellerAddress = counterpartyAddress;
      deal.sellerPrivateKey = counterpartyPrivateKey;
      deal.status = 'waiting_for_deposit';
    } else {
      // Creator is seller, counterparty is buyer
      deal.buyerId = counterpartyId;
      deal.buyerAddress = counterpartyAddress;
      deal.buyerPrivateKey = counterpartyPrivateKey;
      deal.status = 'waiting_for_deposit';
    }

    // Set multisig info
    deal.multisigAddress = multisigWallet.address;
    deal.buyerKey = tempBuyerKeys.privateKey;
    deal.sellerKey = tempSellerKeys.privateKey;
    deal.arbiterKey = arbiterPrivateKey;

    // Clear invite token (link is now used)
    deal.inviteToken = null;
    deal.inviteExpiresAt = null;

    // Recalculate deadline from now
    deal.deadline = new Date();
    const testDeadlineMinutes = parseInt(process.env.TEST_DEADLINE_MINUTES);
    const deadlineHours = Math.ceil((deal.deadline - deal.createdAt) / (1000 * 60 * 60));
    if (testDeadlineMinutes > 0) {
      deal.deadline.setMinutes(deal.deadline.getMinutes() + testDeadlineMinutes);
    } else {
      // Use original deadline hours (stored in deal)
      deal.deadline.setHours(deal.deadline.getHours() + 48); // Default 48h if not stored
    }

    await deal.save();

    // Create multisig wallet record
    const wallet = new MultisigWallet({
      dealId: deal._id,
      address: multisigWallet.address,
      privateKey: multisigWallet.privateKey,
      buyerPublicKey: tempBuyerKeys.address,
      sellerPublicKey: tempSellerKeys.address,
      arbiterPublicKey: constants.ARBITER_ADDRESS,
      threshold: constants.MULTISIG_THRESHOLD,
      permissionsJson: multisigWallet.permissionsJson
    });

    await wallet.save();

    // Handle platform chain reaction
    const creator = await User.findOne({ telegramId: creatorId });
    if (creator?.platformId && !counterparty.platformId) {
      counterparty.platformId = creator.platformId;
      counterparty.platformCode = creator.platformCode;
      await counterparty.save();
      await Platform.findByIdAndUpdate(creator.platformId, {
        $inc: { 'stats.totalUsers': 1 }
      });
    }

    // Log acceptance
    await AuditLog.log(counterpartyId, 'deal_invite_accepted', {
      dealId: deal.dealId,
      creatorId
    }, { dealId: deal._id });

    console.log(`✅ Invite deal ${deal.dealId} accepted by ${counterpartyId}`);

    return {
      deal,
      wallet,
      counterpartyPrivateKey
    };
  }

  /**
   * Cancel pending invite deal (by creator)
   * @param {string} dealId
   * @param {number} creatorId
   * @returns {Promise<boolean>}
   */
  async cancelInviteDeal(dealId, creatorId) {
    const deal = await this.getDealById(dealId);

    if (!deal) {
      throw new Error('Deal not found');
    }

    if (deal.status !== 'pending_counterparty') {
      throw new Error('Can only cancel pending invite deals');
    }

    // Check creator owns this deal
    const isCreator = (deal.creatorRole === 'buyer' && deal.buyerId === creatorId) ||
                      (deal.creatorRole === 'seller' && deal.sellerId === creatorId);

    if (!isCreator) {
      throw new Error('Only the creator can cancel this deal');
    }

    deal.status = 'cancelled';
    deal.inviteToken = null;
    deal.inviteExpiresAt = null;
    await deal.save();

    await AuditLog.log(creatorId, 'deal_invite_cancelled', {
      dealId: deal.dealId
    }, { dealId: deal._id });

    console.log(`❌ Invite deal ${deal.dealId} cancelled by creator ${creatorId}`);

    return true;
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
      sellerAddress,
      fromTemplate = false
    } = dealData;

    // Validate
    const validation = await this.validateDealCreation(buyerId, sellerId, description, amount);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Calculate commission
    const commission = Deal.calculateCommission(amount);

    // Generate deal ID (atomic - guaranteed unique, no loops needed)
    const dealId = await Deal.generateDealId();

    // Calculate deadline
    // TEST MODE: Use minutes instead of hours if TEST_DEADLINE_MINUTES is set
    const deadline = new Date();
    const testDeadlineMinutes = parseInt(process.env.TEST_DEADLINE_MINUTES);
    if (testDeadlineMinutes > 0) {
      console.log(`⚠️ TEST MODE: Using ${testDeadlineMinutes} minutes deadline instead of ${deadlineHours} hours`);
      deadline.setMinutes(deadline.getMinutes() + testDeadlineMinutes);
    } else {
      deadline.setHours(deadline.getHours() + deadlineHours);
    }

    // Generate unique key
    const uniqueKey = Deal.generateUniqueKey(buyerId, sellerId, description);

    // Validate wallet addresses based on creator role
    // Also generate private key for creator (pseudo-multisig)
    let creatorPrivateKey = null;

    if (creatorRole === 'buyer') {
      // Buyer created deal - buyer wallet is required, seller wallet is optional
      if (!buyerAddress || !blockchainService.isValidAddress(buyerAddress)) {
        throw new Error('Invalid buyer wallet address');
      }
      // Generate private key for buyer (creator)
      const buyerKeys = await blockchainService.generateKeyPair();
      creatorPrivateKey = buyerKeys.privateKey;
      // Seller address is optional - they provide it later
    } else {
      // Seller created deal - seller wallet is required, buyer wallet is optional
      if (!sellerAddress || !blockchainService.isValidAddress(sellerAddress)) {
        throw new Error('Invalid seller wallet address');
      }
      // Generate private key for seller (creator)
      const sellerKeys = await blockchainService.generateKeyPair();
      creatorPrivateKey = sellerKeys.privateKey;
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

    // Get platform info - check BOTH participants
    // PRIORITY: Buyer's platform wins (buyer brings money to the service)
    // Chain reaction: non-partner user becomes partner-referred when dealing with partner user
    const [buyer, seller] = await Promise.all([
      User.findOne({ telegramId: buyerId }),
      User.findOne({ telegramId: sellerId })
    ]);

    let platformId = null;
    let platformCode = null;

    // Buyer's platform has priority (buyer deposits money)
    if (buyer?.platformId) {
      platformId = buyer.platformId;
      platformCode = buyer.platformCode;

      // Chain reaction: link seller to buyer's platform if seller has no platform
      if (seller && !seller.platformId) {
        const Platform = require('../models/Platform');
        seller.platformId = buyer.platformId;
        seller.platformCode = buyer.platformCode;
        await seller.save();
        await Platform.findByIdAndUpdate(buyer.platformId, {
          $inc: { 'stats.totalUsers': 1 }
        });
        console.log(`🔗 Chain reaction: User ${sellerId} linked to platform ${buyer.platformCode} via deal with ${buyerId}`);
      }
      // If both have different platforms - buyer wins, no chain reaction needed
    } else if (seller?.platformId) {
      // Buyer has no platform, use seller's
      platformId = seller.platformId;
      platformCode = seller.platformCode;

      // Chain reaction: link buyer to seller's platform
      if (buyer && !buyer.platformId) {
        const Platform = require('../models/Platform');
        buyer.platformId = seller.platformId;
        buyer.platformCode = seller.platformCode;
        await buyer.save();
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
      sellerAddress: sellerAddress || null,  // Will be set when seller provides it
      // Private keys for pseudo-multisig (set for creator, other set when they provide wallet)
      buyerPrivateKey: creatorRole === 'buyer' ? creatorPrivateKey : null,
      sellerPrivateKey: creatorRole === 'seller' ? creatorPrivateKey : null,
      fromTemplate
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

    // Track successful deal creation for health monitoring
    try {
      await ServiceStatus.trackSuccess('deal_created', {
        dealId: deal.dealId,
        amount,
        asset
      });
    } catch (e) {
      // Don't fail deal creation if tracking fails
    }

    return {
      deal,
      wallet,
      buyerAddress: buyerAddress,
      sellerAddress: sellerAddress,
      creatorPrivateKey  // Return private key to show to creator
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
