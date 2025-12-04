const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const connectDB = require('../config/database');
const notificationService = require('../services/notificationService');
const { Telegraf } = require('telegraf');

// Import models
const Deal = require('../models/Deal');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Dispute = require('../models/Dispute');
const Platform = require('../models/Platform');

// Import routes
const partnerRoutes = require('./routes/partner');

const app = express();
const PORT = process.env.WEB_PORT || 3000;

// Create separate bot instance for web server (avoids timing issues)
const webBot = new Telegraf(process.env.BOT_TOKEN);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../../public')));

// Partner routes (before admin auth)
app.use('/partner', partnerRoutes);

// Basic auth for admin panel
const adminAuth = (req, res, next) => {
  const auth = req.headers['authorization'];

  if (!auth) {
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).send('Authentication required');
  }

  const [scheme, credentials] = auth.split(' ');
  if (scheme !== 'Basic') {
    return res.status(401).send('Invalid authentication scheme');
  }

  const [username, password] = Buffer.from(credentials, 'base64').toString().split(':');

  // Check credentials (use environment variables in production)
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).send('Invalid credentials');
  }
};

// API Routes for Admin Panel

// Get all deals with filters
app.get('/api/admin/deals', adminAuth, async (req, res) => {
  try {
    const { status, search, limit = 50, skip = 0 } = req.query;

    let query = {};
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { dealId: new RegExp(search, 'i') },
        { productName: new RegExp(search, 'i') }
      ];
    }

    const deals = await Deal.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await Deal.countDocuments(query);

    res.json({ deals, total });
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get deal details
app.get('/api/admin/deals/:dealId', adminAuth, async (req, res) => {
  try {
    const deal = await Deal.findOne({ dealId: req.params.dealId }).lean();
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Get related transactions
    const transactions = await Transaction.find({ dealId: deal._id }).lean();

    // Get user info
    const buyer = await User.findOne({ telegramId: deal.buyerId }).lean();
    const seller = await User.findOne({ telegramId: deal.sellerId }).lean();

    res.json({ deal, transactions, buyer, seller });
  } catch (error) {
    console.error('Error fetching deal details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all users
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const { search, banned, limit = 50, skip = 0 } = req.query;

    let query = {};
    if (search) {
      query.$or = [
        { username: new RegExp(search, 'i') },
        { telegramId: parseInt(search) || 0 }
      ];
    }
    if (banned !== undefined) {
      query.blacklisted = banned === 'true';
    }

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await User.countDocuments(query);

    // Calculate deals count for each user
    const usersWithDeals = await Promise.all(users.map(async (user) => {
      const dealsAsBuyer = await Deal.countDocuments({ buyerId: user.telegramId });
      const dealsAsSeller = await Deal.countDocuments({ sellerId: user.telegramId });
      return {
        ...user,
        dealsAsBuyer,
        dealsAsSeller
      };
    }));

    res.json({ users: usersWithDeals, total });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: error.message });
  }
});

// Ban/Unban user
app.post('/api/admin/users/:telegramId/ban', adminAuth, async (req, res) => {
  try {
    const { telegramId } = req.params;
    const { banned, reason } = req.body;

    const user = await User.findOne({ telegramId: parseInt(telegramId) });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.blacklisted = banned;
    await user.save();

    console.log(`User ${telegramId} ${banned ? 'banned' : 'unbanned'} by admin. Reason: ${reason}`);

    res.json({ success: true, user });
  } catch (error) {
    console.error('Error banning user:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all disputes
app.get('/api/admin/disputes', adminAuth, async (req, res) => {
  try {
    const { status = 'pending', limit = 50, skip = 0 } = req.query;

    let query = status === 'all' ? {} : { status };

    const disputes = await Dispute.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .populate('dealId')
      .lean();

    const total = await Dispute.countDocuments(query);

    res.json({ disputes, total });
  } catch (error) {
    console.error('Error fetching disputes:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get dispute details
app.get('/api/admin/disputes/:disputeId', adminAuth, async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.disputeId)
      .populate('dealId')
      .lean();

    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    // Get users info
    const buyer = await User.findOne({ telegramId: dispute.dealId.buyerId }).lean();
    const seller = await User.findOne({ telegramId: dispute.dealId.sellerId }).lean();

    res.json({ dispute, buyer, seller });
  } catch (error) {
    console.error('Error fetching dispute details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Resolve dispute
app.post('/api/admin/disputes/:disputeId/resolve', adminAuth, async (req, res) => {
  try {
    const { disputeId } = req.params;
    const { winner, note } = req.body;

    if (!['buyer', 'seller', 'refund_buyer', 'release_seller'].includes(winner)) {
      return res.status(400).json({ error: 'Winner must be buyer, seller, refund_buyer, or release_seller' });
    }

    const dispute = await Dispute.findById(disputeId).populate('dealId');
    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    // Normalize winner value
    let decision = winner;
    if (winner === 'buyer') decision = 'refund_buyer';
    if (winner === 'seller') decision = 'release_seller';

    dispute.status = 'resolved';
    dispute.decision = decision;
    dispute.resolvedAt = new Date();
    await dispute.save();

    // Update deal status
    const deal = dispute.dealId;
    if (deal) {
      deal.status = 'resolved';
      await deal.save();

      // Send notifications to both parties
      await notificationService.notifyDisputeResolved(
        deal.buyerId,
        deal.sellerId,
        deal.dealId,
        decision
      );
    }

    console.log(`Dispute ${disputeId} resolved with decision: ${decision}`);

    res.json({ success: true, dispute });
  } catch (error) {
    console.error('Error resolving dispute:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Telegram file (proxy endpoint for displaying files in admin panel)
app.get('/api/admin/telegram-file/:fileId', adminAuth, async (req, res) => {
  try {
    const { fileId } = req.params;
    const { download } = req.query;

    // Get file info from Telegram using webBot instance
    const file = await webBot.telegram.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

    // Fetch the file from Telegram
    const fetch = require('node-fetch');
    const fileResponse = await fetch(fileUrl);

    if (!fileResponse.ok) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get content type from Telegram response or guess from file extension
    const contentType = fileResponse.headers.get('content-type') || 'application/octet-stream';

    // Extract filename and extension from file_path
    const pathParts = file.file_path.split('/');
    const filename = pathParts[pathParts.length - 1];
    const ext = filename.split('.').pop();

    // Generate proper filename
    const properFilename = `telegram_file_${fileId.substring(0, 8)}.${ext}`;

    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day

    // If download parameter is present, force download with proper filename
    if (download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${properFilename}"`);
    }

    // Pipe the file to response
    fileResponse.body.pipe(res);
  } catch (error) {
    console.error('Error fetching Telegram file:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel dispute
app.post('/api/admin/disputes/:disputeId/cancel', adminAuth, async (req, res) => {
  try {
    const { disputeId } = req.params;

    const dispute = await Dispute.findById(disputeId).populate('dealId');
    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    if (dispute.status === 'resolved') {
      return res.status(400).json({ error: 'Cannot cancel a resolved dispute' });
    }

    const deal = dispute.dealId;

    // Delete the dispute
    await Dispute.findByIdAndDelete(disputeId);

    // Update deal status back to in_progress
    if (deal) {
      deal.status = 'in_progress';
      await deal.save();

      // Send notifications to both parties
      await notificationService.notifyDisputeCancelled(
        deal.buyerId,
        deal.sellerId,
        deal.dealId
      );
    }

    console.log(`Dispute ${disputeId} cancelled by admin`);

    res.json({ success: true, message: 'Dispute cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling dispute:', error);
    res.status(500).json({ error: error.message });
  }
});

// Return dispute to in-progress (allows parties to continue working)
app.post('/api/admin/disputes/:disputeId/return-to-progress', adminAuth, async (req, res) => {
  try {
    const { disputeId } = req.params;

    const dispute = await Dispute.findById(disputeId).populate('dealId');
    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' });
    }

    if (dispute.status === 'resolved') {
      return res.status(400).json({ error: 'Cannot modify a resolved dispute' });
    }

    const deal = dispute.dealId;

    // Delete the dispute
    await Dispute.findByIdAndDelete(disputeId);

    // Update deal status back to locked (seller can mark work as done, buyer can accept)
    if (deal) {
      deal.status = 'locked';
      deal.sellerCompleted = false; // Reset seller completion flag
      await deal.save();

      // Send notifications to both parties
      const sellerMessage = `ℹ️ *Спор возвращен в работу администратором*\n\n` +
        `Сделка: \`${deal.dealId}\`\n\n` +
        `Администратор вернул сделку в рабочее состояние. Вы можете продолжить работу.\n\n` +
        `Когда работа будет завершена, используйте /my_deals и отметьте "Работа выполнена".`;

      const buyerMessage = `ℹ️ *Спор возвращен в работу администратором*\n\n` +
        `Сделка: \`${deal.dealId}\`\n\n` +
        `Администратор вернул сделку в рабочее состояние. Продавец может продолжить работу.\n\n` +
        `Когда продавец завершит работу, вы сможете принять её через /my_deals.`;

      await notificationService.sendNotification(deal.sellerId, sellerMessage);
      await notificationService.sendNotification(deal.buyerId, buyerMessage);
    }

    console.log(`Dispute ${disputeId} returned to locked status by admin`);

    res.json({ success: true, message: 'Dispute returned to in-progress successfully' });
  } catch (error) {
    console.error('Error returning dispute to in-progress:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get statistics
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    const totalDeals = await Deal.countDocuments();
    const activeDeals = await Deal.countDocuments({
      status: { $in: ['waiting_for_deposit', 'locked', 'in_progress'] }
    });
    const completedDeals = await Deal.countDocuments({ status: 'completed' });
    const disputedDeals = await Deal.countDocuments({ status: 'dispute' });

    const totalUsers = await User.countDocuments();
    const bannedUsers = await User.countDocuments({ blacklisted: true });

    // Calculate total volume and commission
    const deals = await Deal.find({ status: 'completed' }).lean();
    const totalVolume = deals.reduce((sum, deal) => sum + deal.amount, 0);
    const totalCommission = deals.reduce((sum, deal) => sum + deal.commission, 0);
    const totalOperationalCosts = deals.reduce((sum, deal) => {
      return sum + (deal.operationalCosts?.totalCostUsd || 0);
    }, 0);
    const netProfit = totalCommission - totalOperationalCosts;

    // Recent activity
    const recentDeals = await Deal.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const recentDisputes = await Dispute.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('dealId')
      .lean();

    res.json({
      deals: {
        total: totalDeals,
        active: activeDeals,
        completed: completedDeals,
        disputed: disputedDeals
      },
      users: {
        total: totalUsers,
        banned: bannedUsers
      },
      finance: {
        totalVolume: totalVolume.toFixed(2),
        totalCommission: totalCommission.toFixed(2),
        totalOperationalCosts: totalOperationalCosts.toFixed(2),
        netProfit: netProfit.toFixed(2)
      },
      recent: {
        deals: recentDeals,
        disputes: recentDisputes
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get system logs
app.get('/api/admin/logs', adminAuth, async (req, res) => {
  try {
    const { limit = 100 } = req.query;

    // Get recent transactions
    const transactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('dealId')
      .lean();

    res.json({ transactions });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ Platform Management API ============

// Get all platforms
app.get('/api/admin/platforms', adminAuth, async (req, res) => {
  try {
    const platforms = await Platform.find().sort({ createdAt: -1 }).lean();

    // Update stats for each platform
    for (const platform of platforms) {
      const p = await Platform.findById(platform._id);
      await p.updateStats();
    }

    const updatedPlatforms = await Platform.find().sort({ createdAt: -1 }).lean();
    res.json({ platforms: updatedPlatforms });
  } catch (error) {
    console.error('Error fetching platforms:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new platform
app.post('/api/admin/platforms', adminAuth, async (req, res) => {
  try {
    const { name, telegramChannel, login, password, commissionPercent = 10 } = req.body;

    // Validate required fields
    if (!name || !telegramChannel || !login || !password) {
      return res.status(400).json({ error: 'All fields are required: name, telegramChannel, login, password' });
    }

    // Check if login already exists
    const existingLogin = await Platform.findOne({ login });
    if (existingLogin) {
      return res.status(400).json({ error: 'Login already exists' });
    }

    // Generate unique code
    let code;
    let isUnique = false;
    while (!isUnique) {
      code = Platform.generateCode();
      const existing = await Platform.findOne({ code });
      isUnique = !existing;
    }

    const platform = new Platform({
      code,
      name,
      telegramChannel,
      login,
      passwordHash: password, // Will be hashed by pre-save hook
      commissionPercent
    });

    await platform.save();

    // Get referral link
    const BOT_USERNAME = process.env.BOT_USERNAME || 'KeyShieldBot';
    const referralLink = platform.getReferralLink(BOT_USERNAME);

    console.log(`✅ New platform created: ${name} (${code})`);

    res.json({
      success: true,
      platform: {
        ...platform.toObject(),
        passwordHash: undefined, // Don't send password hash
        referralLink
      }
    });
  } catch (error) {
    console.error('Error creating platform:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update platform
app.put('/api/admin/platforms/:platformId', adminAuth, async (req, res) => {
  try {
    const { platformId } = req.params;
    const { name, telegramChannel, login, password, commissionPercent, isActive } = req.body;

    const platform = await Platform.findById(platformId);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    if (name) platform.name = name;
    if (telegramChannel) platform.telegramChannel = telegramChannel;
    if (login) platform.login = login;
    if (password) platform.passwordHash = password; // Will be hashed by pre-save hook
    if (commissionPercent !== undefined) platform.commissionPercent = commissionPercent;
    if (isActive !== undefined) platform.isActive = isActive;

    await platform.save();

    res.json({ success: true, platform });
  } catch (error) {
    console.error('Error updating platform:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete platform
app.delete('/api/admin/platforms/:platformId', adminAuth, async (req, res) => {
  try {
    const { platformId } = req.params;

    const platform = await Platform.findById(platformId);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    // Get counts for info (but don't block deletion)
    const usersCount = await User.countDocuments({ platformId });
    const dealsCount = await Deal.countDocuments({ platformId });

    // Delete the platform
    await Platform.findByIdAndDelete(platformId);

    // Note: Users and deals keep their platformCode for historical reference
    // but platformId will become orphaned (which is fine)

    res.json({
      success: true,
      message: 'Platform deleted',
      info: `Platform had ${usersCount} users and ${dealsCount} deals (references preserved)`
    });
  } catch (error) {
    console.error('Error deleting platform:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get platform details
app.get('/api/admin/platforms/:platformId', adminAuth, async (req, res) => {
  try {
    const { platformId } = req.params;

    const platform = await Platform.findById(platformId);
    if (!platform) {
      return res.status(404).json({ error: 'Platform not found' });
    }

    await platform.updateStats();

    // Get users and deals for this platform
    const users = await User.find({ platformId }).sort({ createdAt: -1 }).limit(50).lean();
    const deals = await Deal.find({ platformId }).sort({ createdAt: -1 }).limit(50).lean();

    const BOT_USERNAME = process.env.BOT_USERNAME || 'KeyShieldBot';
    const referralLink = platform.getReferralLink(BOT_USERNAME);

    res.json({
      platform: {
        ...platform.toObject(),
        passwordHash: undefined,
        referralLink
      },
      users,
      deals
    });
  } catch (error) {
    console.error('Error fetching platform details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
const startWebServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`\n🌐 Web server started!`);
      console.log(`   URL: http://localhost:${PORT}`);
      console.log(`   Admin panel: http://localhost:${PORT}/admin.html`);
      console.log(`   Default admin credentials: admin / admin123`);
      console.log(`   ⚠️  Change credentials in .env: ADMIN_USERNAME and ADMIN_PASSWORD\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start web server:', error);
    process.exit(1);
  }
};

// Only start server if this file is run directly
if (require.main === module) {
  startWebServer();
}

module.exports = { app, startWebServer };
