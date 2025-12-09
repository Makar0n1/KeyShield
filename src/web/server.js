const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const connectDB = require('../config/database');
const notificationService = require('../services/notificationService');
const priceService = require('../services/priceService');
const { Telegraf } = require('telegraf');

// Import models
const Deal = require('../models/Deal');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Dispute = require('../models/Dispute');
const Platform = require('../models/Platform');
const ExportLog = require('../models/ExportLog');

// Import routes
const partnerRoutes = require('./routes/partner');
const blogAdminRoutes = require('./routes/blog');
const blogPublicRoutes = require('./routes/blogPublic');
const blogPages = require('./routes/blogPages');
const categoryPages = require('./routes/categoryPages');
const tagPages = require('./routes/tagPages');

const app = express();
const PORT = process.env.WEB_PORT || 3000;

// Domain configuration from env
const WEB_DOMAIN = process.env.WEB_DOMAIN || 'localhost:3001';
const API_DOMAIN = process.env.API_DOMAIN || 'localhost:3020';
const INDEXATION = process.env.INDEXATION === 'yes';
const SITE_URL = WEB_DOMAIN.includes('localhost') ? `http://${WEB_DOMAIN}` : `https://${WEB_DOMAIN}`;
const ROBOTS_META = INDEXATION ? 'index, follow' : 'noindex, nofollow';

// Build allowed origins from env domains
const buildAllowedOrigins = () => {
  const origins = [];
  // Add web domain with http and https
  if (WEB_DOMAIN.includes('localhost')) {
    origins.push(`http://${WEB_DOMAIN}`);
  } else {
    origins.push(`https://${WEB_DOMAIN}`);
    origins.push(`https://www.${WEB_DOMAIN}`);
  }
  // Add API domain
  if (API_DOMAIN.includes('localhost')) {
    origins.push(`http://${API_DOMAIN}`);
  } else {
    origins.push(`https://${API_DOMAIN}`);
  }
  return origins;
};

// Create separate bot instance for web server (avoids timing issues)
const webBot = new Telegraf(process.env.BOT_TOKEN);

// CORS middleware for cross-origin requests
app.use((req, res, next) => {
  const allowedOrigins = buildAllowedOrigins();
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Helper to render HTML with env variable substitution
const fs = require('fs');
const renderHtmlWithEnv = (filePath, res) => {
  fs.readFile(filePath, 'utf8', (err, html) => {
    if (err) {
      console.error('Error reading file:', filePath, err);
      return res.status(500).send('Error loading page');
    }

    // Replace environment placeholders
    const rendered = html
      .replace(/https:\/\/keyshield\.me/g, SITE_URL)
      .replace(/<meta name="robots" content="index, follow">/g,
        `<meta name="robots" content="${ROBOTS_META}">`);

    res.type('html').send(rendered);
  });
};

// Intercept HTML page requests BEFORE express.static
// This ensures dynamic variable substitution works
app.get(['/', '/index.html'], (req, res) => {
  renderHtmlWithEnv(path.join(__dirname, '../../public/index.html'), res);
});

app.get(['/terms', '/terms.html'], (req, res) => {
  renderHtmlWithEnv(path.join(__dirname, '../../public/terms.html'), res);
});

app.get(['/privacy', '/privacy.html'], (req, res) => {
  renderHtmlWithEnv(path.join(__dirname, '../../public/privacy.html'), res);
});

app.get(['/offer', '/offer.html'], (req, res) => {
  renderHtmlWithEnv(path.join(__dirname, '../../public/offer.html'), res);
});

app.get(['/not-found', '/not-found.html'], (req, res) => {
  res.status(404);
  renderHtmlWithEnv(path.join(__dirname, '../../public/not-found.html'), res);
});

// Static files with long cache TTL (1 year for versioned assets)
app.use(express.static(path.join(__dirname, '../../public'), {
  maxAge: '1y',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // CSS/JS with version query get immutable cache
    if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
    // Images get 30 days cache
    else if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=2592000');
    }
    // Fonts get 1 year cache
    else if (/\.(woff|woff2|ttf|eot)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Admin panel routes (no env substitution needed)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin.html'));
});

app.get('/admin/blog', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin-blog.html'));
});

// Partner routes (before admin auth)
app.use('/partner', partnerRoutes);

// Public blog API (no auth required)
app.use('/api/blog', blogPublicRoutes);

// Blog pages (SSR)
app.use('/blog', blogPages);
app.use('/category', categoryPages);
app.use('/tag', tagPages);

// Public IP check endpoint for FeeSaver whitelist debugging
app.get('/api/check-ip', async (req, res) => {
  const axios = require('axios');

  try {
    // Get outgoing IP
    const ipifyResponse = await axios.get('https://api.ipify.org?format=json', {
      timeout: 5000
    });
    const outgoingIP = ipifyResponse.data.ip;

    // Check FeeSaver access
    let feesaverStatus = 'not_configured';
    let feesaverError = null;
    let feesaverBalance = null;

    if (process.env.FEESAVER_API_KEY && process.env.FEESAVER_ENABLED === 'true') {
      try {
        const feesaverResponse = await axios.get('https://api.feesaver.com/balance', {
          params: { token: process.env.FEESAVER_API_KEY },
          timeout: 5000
        });
        feesaverStatus = 'accessible';
        feesaverBalance = feesaverResponse.data.balance_trx;
      } catch (error) {
        feesaverStatus = 'blocked';
        feesaverError = error.response?.data?.err || error.message;
      }
    }

    // Return comprehensive info
    res.json({
      success: true,
      outgoing_ip: outgoingIP,
      cloudflare_detected: req.headers['cf-connecting-ip'] ? true : false,
      cloudflare_ip: req.headers['cf-connecting-ip'] || null,
      request_ip: req.ip || req.connection.remoteAddress,
      feesaver: {
        status: feesaverStatus,
        balance: feesaverBalance,
        error: feesaverError,
        whitelist_needed: feesaverStatus === 'blocked'
      },
      env: {
        http_proxy: process.env.HTTP_PROXY ? 'configured' : 'not set',
        https_proxy: process.env.HTTPS_PROXY ? 'configured' : 'not set',
        api_domain: process.env.API_DOMAIN || 'not set'
      },
      recommendation: feesaverStatus === 'blocked'
        ? `Tell FeeSaver support to whitelist IP: ${outgoingIP}`
        : feesaverStatus === 'accessible'
        ? 'FeeSaver is accessible! No action needed.'
        : 'FeeSaver not configured in .env'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// JWT auth middleware for admin panel
const jwt = require('jsonwebtoken');
const adminAuth = (req, res, next) => {
  const auth = req.headers['authorization'];

  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = auth.replace('Bearer ', '');

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Admin login endpoint (JWT)
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = jwt.sign(
      { username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

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
});

// API Routes for Admin Panel

// Blog admin routes (protected by adminAuth)
app.use('/api/admin/blog', adminAuth, blogAdminRoutes);

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
    // Get current TRX price from CoinGecko (cached for 5 min)
    const TRX_TO_USDT = await priceService.getTrxPrice();
    // Fixed TRX cost per completed deal (activation + transfers)
    const TRX_PER_DEAL = 16.1;

    const totalDeals = await Deal.countDocuments();
    const activeDeals = await Deal.countDocuments({
      status: { $in: ['waiting_for_deposit', 'locked', 'in_progress'] }
    });
    const completedDeals = await Deal.countDocuments({ status: 'completed' });
    const disputedDeals = await Deal.countDocuments({ status: 'dispute' });
    const resolvedDeals = await Deal.countDocuments({ status: 'resolved' });
    const cancelledDeals = await Deal.countDocuments({ status: 'cancelled' });
    const expiredDeals = await Deal.countDocuments({ status: 'expired' });

    const totalUsers = await User.countDocuments();
    const bannedUsers = await User.countDocuments({ blacklisted: true });

    // Calculate finances from completed, resolved AND expired deals (where we earned commission)
    // Expired deals also have commission (penalty fee for buyer refund)
    const finishedDeals = await Deal.find({
      status: { $in: ['completed', 'resolved', 'expired'] }
    }).lean();

    const totalVolume = finishedDeals.reduce((sum, deal) => sum + deal.amount, 0);
    const totalCommission = finishedDeals.reduce((sum, deal) => sum + deal.commission, 0);

    // Calculate TRX expenses: 16.1 TRX per finished deal
    const totalTrxSpent = finishedDeals.length * TRX_PER_DEAL;
    const totalTrxSpentUsdt = totalTrxSpent * TRX_TO_USDT;

    // Net profit = commission - TRX expenses in USDT
    const netProfit = totalCommission - totalTrxSpentUsdt;

    // Calculate partner payouts (ONLY completed/resolved - expired deals don't count for partners!)
    const Platform = require('../models/Platform');
    const activePlatforms = await Platform.find({ isActive: true }).lean();

    // Filter out expired deals for partner calculations
    const partnerEligibleDeals = finishedDeals.filter(d => d.status !== 'expired');

    let totalPartnerPayouts = 0;
    const partnerDetails = [];

    for (const platform of activePlatforms) {
      // Get partner-eligible deals for this platform (no expired!)
      const platformDeals = partnerEligibleDeals.filter(d =>
        d.platformId && d.platformId.toString() === platform._id.toString()
      );

      if (platformDeals.length > 0) {
        const platformCommission = platformDeals.reduce((sum, deal) => sum + deal.commission, 0);
        const platformTrxCost = platformDeals.length * TRX_PER_DEAL * TRX_TO_USDT;
        const platformNetProfit = platformCommission - platformTrxCost;
        const platformPayout = platformNetProfit * (platform.commissionPercent / 100);

        totalPartnerPayouts += platformPayout > 0 ? platformPayout : 0;

        partnerDetails.push({
          name: platform.name,
          code: platform.code,
          deals: platformDeals.length,
          commission: platformCommission,
          netProfit: platformNetProfit,
          percent: platform.commissionPercent,
          payout: platformPayout > 0 ? platformPayout : 0
        });
      }
    }

    // Pure profit = net profit - partner payouts (what goes to service wallet)
    const pureProfit = netProfit - totalPartnerPayouts;

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
        disputed: disputedDeals,
        resolved: resolvedDeals,
        cancelled: cancelledDeals,
        expired: expiredDeals,
        finished: finishedDeals.length
      },
      users: {
        total: totalUsers,
        banned: bannedUsers
      },
      finance: {
        totalVolume: totalVolume.toFixed(2),
        totalCommission: totalCommission.toFixed(2),
        totalTrxSpent: totalTrxSpent.toFixed(2),
        totalTrxSpentUsdt: totalTrxSpentUsdt.toFixed(2),
        netProfit: netProfit.toFixed(2),
        trxRate: TRX_TO_USDT,
        trxPerDeal: TRX_PER_DEAL
      },
      partners: {
        count: activePlatforms.length,
        totalPayouts: totalPartnerPayouts.toFixed(2),
        pureProfit: pureProfit.toFixed(2),
        details: partnerDetails
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

// ============ Deal Export API (PDF) ============

// Helper: Find user by ID or username
async function findUserByIdOrUsername(identifier) {
  if (!identifier) return null;

  // Clean the identifier
  const cleanId = identifier.toString().trim().replace('@', '');

  // Try as numeric ID first
  const numericId = parseInt(cleanId);
  if (!isNaN(numericId) && numericId > 0) {
    const userById = await User.findOne({ telegramId: numericId }).lean();
    if (userById) return userById;
  }

  // Try as username (case-insensitive)
  const userByUsername = await User.findOne({
    username: { $regex: new RegExp(`^${cleanId}$`, 'i') }
  }).lean();

  return userByUsername;
}

// Export single deal to PDF
app.get('/api/admin/export/deal/:dealId', adminAuth, async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const fs = require('fs');
    const fsPromises = require('fs').promises;
    const pathModule = require('path');

    const { dealId } = req.params;
    const { userIdentifier } = req.query;

    if (!userIdentifier) {
      return res.status(400).json({ error: 'userIdentifier is required (Telegram ID or @username)' });
    }

    const requestingUser = await findUserByIdOrUsername(userIdentifier);
    if (!requestingUser) {
      return res.status(404).json({ error: 'User not found. Check Telegram ID or username.' });
    }

    const telegramId = requestingUser.telegramId;

    const deal = await Deal.findOne({ dealId }).lean();
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const exportableStatuses = ['completed', 'resolved', 'expired'];
    if (!exportableStatuses.includes(deal.status)) {
      return res.status(400).json({ error: 'Only completed/resolved/expired deals can be exported' });
    }

    const isParticipant = deal.buyerId === telegramId || deal.sellerId === telegramId;
    if (!isParticipant) {
      return res.status(403).json({ error: 'User is not a participant of this deal' });
    }

    const [buyerUser, sellerUser] = await Promise.all([
      User.findOne({ telegramId: deal.buyerId }).lean(),
      User.findOne({ telegramId: deal.sellerId }).lean()
    ]);

    const exportsDir = pathModule.join(__dirname, '../../exports');
    try { await fsPromises.mkdir(exportsDir, { recursive: true }); } catch (err) {}

    // Generate unique statement number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const statementNumber = `${dateStr}-${random}`;

    const safeUsername = (requestingUser?.username || String(telegramId)).replace(/[^a-zA-Z0-9_]/g, '');
    const fileName = `KeyShield_User_${safeUsername}_Deal_${statementNumber}.pdf`;
    const filePath = pathModule.join(exportsDir, fileName);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const fontPath = pathModule.join(__dirname, '../../public/fonts/Roboto.ttf');
    doc.registerFont('Roboto', fontPath);
    doc.font('Roboto');

    // ===== TITLE PAGE =====
    // Decorative top line
    doc.rect(0, 0, 595, 8).fill('#6366f1');

    // Logo area
    doc.moveDown(4);
    doc.fontSize(42).fillColor('#6366f1').text('KeyShield', { align: 'center' });
    doc.fontSize(14).fillColor('#64748b').text('Безопасный криптовалютный эскроу на TRON', { align: 'center' });

    doc.moveDown(4);

    // Statement number box
    doc.rect(150, doc.y, 295, 80).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#64748b').text('ВЫПИСКА', { align: 'center' });
    doc.fontSize(28).fillColor('#1e293b').text(`№${statementNumber}`, { align: 'center' });

    doc.moveDown(4);

    // Document info
    doc.fontSize(11).fillColor('#64748b').text('Тип документа:', { align: 'center' });
    doc.fontSize(14).fillColor('#1e293b').text('Выписка по сделке', { align: 'center' });

    doc.moveDown(1);
    doc.fontSize(11).fillColor('#64748b').text('Сделка:', { align: 'center' });
    doc.fontSize(14).fillColor('#6366f1').text(deal.dealId, { align: 'center' });

    doc.moveDown(1);
    doc.fontSize(11).fillColor('#64748b').text('Подготовлено для:', { align: 'center' });
    doc.fontSize(14).fillColor('#1e293b').text(`@${requestingUser?.username || 'Неизвестно'} (ID: ${telegramId})`, { align: 'center' });

    doc.moveDown(1);
    doc.fontSize(11).fillColor('#64748b').text('Дата формирования:', { align: 'center' });
    doc.fontSize(12).fillColor('#1e293b').text(new Date().toLocaleString('ru-RU', { timeZone: 'UTC' }) + ' UTC', { align: 'center' });

    // Footer on title page
    doc.fontSize(9).fillColor('#94a3b8').text('https://keyshield.me', 50, 750, { align: 'center', link: 'https://keyshield.me' });
    doc.rect(0, 834, 595, 8).fill('#6366f1');

    // ===== DEAL PAGE =====
    doc.addPage();

    // Header bar
    doc.rect(0, 0, 595, 40).fill('#6366f1');
    doc.fontSize(14).fillColor('#ffffff').text(`Выписка №${statementNumber}`, 50, 12);
    doc.fontSize(10).fillColor('#c7d2fe').text(deal.dealId, 450, 14);

    doc.moveDown(3);

    const statusNames = {
      completed: 'Успешно завершена',
      resolved: 'Решена арбитром',
      expired: 'Истекла (авто-возврат)',
      cancelled: 'Отменена'
    };
    const statusColors = {
      completed: '#10b981',
      resolved: '#f59e0b',
      expired: '#ef4444',
      cancelled: '#64748b'
    };

    // Deal header with status
    doc.fontSize(18).fillColor('#1e293b').text(deal.productName, 50, 60);
    doc.fontSize(10).fillColor(statusColors[deal.status] || '#64748b').text(statusNames[deal.status] || deal.status, 50, 82);

    doc.moveDown(3);

    // Helper function for sections
    const drawSection = (title, yPos) => {
      doc.rect(50, yPos, 495, 24).fill('#f1f5f9');
      doc.fontSize(11).fillColor('#475569').text(title, 60, yPos + 6);
      return yPos + 30;
    };

    const drawRow = (label, value, y) => {
      doc.fontSize(10).fillColor('#64748b').text(label, 60, y);
      doc.fontSize(10).fillColor('#1e293b').text(value, 200, y);
      return y + 18;
    };

    let y = 110;

    // Basic Info
    y = drawSection('Основная информация', y);
    y = drawRow('ID сделки:', deal.dealId, y);
    y = drawRow('Описание:', deal.description.substring(0, 60) + (deal.description.length > 60 ? '...' : ''), y);
    y += 10;

    // Participants
    y = drawSection('Участники', y);
    const userRole = deal.buyerId === telegramId ? 'Покупатель' : 'Продавец';
    y = drawRow('Ваша роль:', userRole, y);
    y = drawRow('Покупатель:', `@${buyerUser?.username || 'N/A'} (${deal.buyerId})`, y);
    y = drawRow('Продавец:', `@${sellerUser?.username || 'N/A'} (${deal.sellerId})`, y);
    y = drawRow('Инициатор:', deal.creatorRole === 'buyer' ? 'Покупатель' : 'Продавец', y);
    y += 10;

    // Financial
    y = drawSection('Финансы', y);
    y = drawRow('Сумма сделки:', `${deal.amount} ${deal.asset}`, y);
    y = drawRow('Комиссия:', `${deal.commission} ${deal.asset}`, y);
    const commTypes = { buyer: 'Покупатель', seller: 'Продавец', split: 'Пополам 50/50' };
    y = drawRow('Комиссию платит:', commTypes[deal.commissionType], y);

    let depositAmt = deal.amount;
    if (deal.commissionType === 'buyer') depositAmt += deal.commission;
    else if (deal.commissionType === 'split') depositAmt += deal.commission / 2;
    y = drawRow('Сумма депозита:', `${depositAmt.toFixed(2)} ${deal.asset}`, y);

    let sellerAmt = deal.amount;
    if (deal.commissionType === 'seller') sellerAmt -= deal.commission;
    else if (deal.commissionType === 'split') sellerAmt -= deal.commission / 2;
    y = drawRow('Выплата продавцу:', `${sellerAmt.toFixed(2)} ${deal.asset}`, y);
    y += 10;

    // Wallets
    y = drawSection('Кошельки', y);
    y = drawRow('Multisig:', deal.multisigAddress || 'Н/Д', y);
    y = drawRow('Покупатель:', deal.buyerAddress || 'Н/Д', y);
    y = drawRow('Продавец:', deal.sellerAddress || 'Н/Д', y);
    y += 10;

    // Blockchain
    if (deal.depositTxHash) {
      y = drawSection('Блокчейн', y);
      y = drawRow('TX депозита:', deal.depositTxHash.substring(0, 40) + '...', y);
      doc.fontSize(8).fillColor('#6366f1').text(
        'Проверить на TronScan',
        60, y, { link: `https://tronscan.org/#/transaction/${deal.depositTxHash}` }
      );
      y += 20;
    }

    // Timeline
    y = drawSection('Хронология', y);
    y = drawRow('Создана:', new Date(deal.createdAt).toLocaleString('ru-RU', { timeZone: 'UTC' }) + ' UTC', y);
    const deadlineHrs = Math.round((new Date(deal.deadline) - new Date(deal.createdAt)) / 3600000);
    y = drawRow('Дедлайн:', `${deadlineHrs}ч (${new Date(deal.deadline).toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC)`, y);
    if (deal.depositDetectedAt) {
      y = drawRow('Депозит:', new Date(deal.depositDetectedAt).toLocaleString('ru-RU', { timeZone: 'UTC' }) + ' UTC', y);
    }
    if (deal.completedAt) {
      y = drawRow('Завершена:', new Date(deal.completedAt).toLocaleString('ru-RU', { timeZone: 'UTC' }) + ' UTC', y);
    }

    // Partner
    if (deal.platformCode) {
      y += 10;
      y = drawSection('Партнёр', y);
      y = drawRow('Код платформы:', deal.platformCode, y);
    }

    // Footer - only at bottom of current page if content fits
    const footerY = 780;
    if (y < footerY) {
      doc.fontSize(9).fillColor('#94a3b8').text(
        'Документ сформирован автоматически системой KeyShield.',
        50, footerY, { align: 'center', width: 495 }
      );
    }

    doc.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const stats = await fsPromises.stat(filePath);

    await ExportLog.create({
      exportType: 'single_deal',
      targetUserId: telegramId,
      targetUsername: requestingUser?.username || null,
      dealId: deal.dealId,
      dealsCount: 1,
      fileName,
      filePath,
      fileSize: stats.size
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.sendFile(filePath);

  } catch (error) {
    console.error('Error exporting deal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export all deals for a user to PDF
app.get('/api/admin/export/user/:userIdentifier', adminAuth, async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const fs = require('fs');
    const fsPromises = require('fs').promises;
    const pathModule = require('path');

    const { userIdentifier } = req.params;

    const user = await findUserByIdOrUsername(userIdentifier);
    if (!user) {
      return res.status(404).json({ error: 'User not found. Check Telegram ID or username.' });
    }

    const telegramId = user.telegramId;

    const exportableStatuses = ['completed', 'resolved', 'expired'];
    const deals = await Deal.find({
      $or: [{ buyerId: telegramId }, { sellerId: telegramId }],
      status: { $in: exportableStatuses }
    }).sort({ createdAt: -1 }).lean();

    if (deals.length === 0) {
      return res.status(404).json({ error: 'No exportable deals found for this user' });
    }

    const exportsDir = pathModule.join(__dirname, '../../exports');
    try { await fsPromises.mkdir(exportsDir, { recursive: true }); } catch (err) {}

    // Generate unique statement number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const statementNumber = `${dateStr}-${random}`;

    const safeUsername = (user.username || String(telegramId)).replace(/[^a-zA-Z0-9_]/g, '');
    const fileName = `KeyShield_User_${safeUsername}_Deals_${statementNumber}.pdf`;
    const filePath = pathModule.join(exportsDir, fileName);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const fontPath = pathModule.join(__dirname, '../../public/fonts/Roboto.ttf');
    doc.registerFont('Roboto', fontPath);
    doc.font('Roboto');

    // Get all participants info
    const allUserIds = [...new Set(deals.flatMap(d => [d.buyerId, d.sellerId]))];
    const allUsers = await User.find({ telegramId: { $in: allUserIds } }).lean();
    const usersMap = {};
    allUsers.forEach(u => { usersMap[u.telegramId] = u; });

    // Calculate totals
    let totalAsBuyer = 0, totalAsSeller = 0, totalVolume = 0;
    deals.forEach(deal => {
      totalVolume += deal.amount;
      if (deal.buyerId === telegramId) totalAsBuyer += deal.amount;
      else totalAsSeller += deal.amount;
    });

    const statusNames = {
      completed: 'Успешно завершена',
      resolved: 'Решена арбитром',
      expired: 'Истекла (авто-возврат)',
      cancelled: 'Отменена'
    };
    const statusColors = {
      completed: '#10b981',
      resolved: '#f59e0b',
      expired: '#ef4444',
      cancelled: '#64748b'
    };
    const commTypes = { buyer: 'Покупатель', seller: 'Продавец', split: 'Пополам 50/50' };

    // ===== TITLE PAGE =====
    doc.rect(0, 0, 595, 8).fill('#6366f1');

    doc.moveDown(4);
    doc.fontSize(42).fillColor('#6366f1').text('KeyShield', { align: 'center' });
    doc.fontSize(14).fillColor('#64748b').text('Безопасный криптовалютный эскроу на TRON', { align: 'center' });

    doc.moveDown(4);

    // Statement number box
    doc.rect(150, doc.y, 295, 80).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#64748b').text('ВЫПИСКА', { align: 'center' });
    doc.fontSize(28).fillColor('#1e293b').text(`№${statementNumber}`, { align: 'center' });

    doc.moveDown(4);

    // Document info
    doc.fontSize(11).fillColor('#64748b').text('Тип документа:', { align: 'center' });
    doc.fontSize(14).fillColor('#1e293b').text('Выписка по сделкам пользователя', { align: 'center' });

    doc.moveDown(1);
    doc.fontSize(11).fillColor('#64748b').text('Пользователь:', { align: 'center' });
    doc.fontSize(14).fillColor('#6366f1').text(`@${user.username || 'Неизвестно'} (ID: ${telegramId})`, { align: 'center' });

    doc.moveDown(1);
    doc.fontSize(11).fillColor('#64748b').text('Количество сделок:', { align: 'center' });
    doc.fontSize(14).fillColor('#1e293b').text(`${deals.length}`, { align: 'center' });

    doc.moveDown(1);
    doc.fontSize(11).fillColor('#64748b').text('Дата формирования:', { align: 'center' });
    doc.fontSize(12).fillColor('#1e293b').text(new Date().toLocaleString('ru-RU', { timeZone: 'UTC' }) + ' UTC', { align: 'center' });

    // Summary stats box
    doc.moveDown(2);
    doc.rect(100, doc.y, 395, 70).fillAndStroke('#f1f5f9', '#e2e8f0');
    const statsY = doc.y + 10;
    doc.fontSize(10).fillColor('#64748b').text('Общий объём:', 120, statsY);
    doc.fontSize(12).fillColor('#1e293b').text(`${totalVolume.toFixed(2)} USDT`, 220, statsY);
    doc.fontSize(10).fillColor('#64748b').text('Как покупатель:', 120, statsY + 20);
    doc.fontSize(12).fillColor('#1e293b').text(`${totalAsBuyer.toFixed(2)} USDT`, 220, statsY + 20);
    doc.fontSize(10).fillColor('#64748b').text('Как продавец:', 120, statsY + 40);
    doc.fontSize(12).fillColor('#1e293b').text(`${totalAsSeller.toFixed(2)} USDT`, 220, statsY + 40);

    // Footer on title page
    doc.fontSize(9).fillColor('#94a3b8').text('https://keyshield.me', 50, 750, { align: 'center', link: 'https://keyshield.me' });
    doc.rect(0, 834, 595, 8).fill('#6366f1');

    // ===== DEAL PAGES =====
    const totalPages = deals.length + 1; // +1 for title page

    for (let i = 0; i < deals.length; i++) {
      const deal = deals[i];
      const buyerUser = usersMap[deal.buyerId];
      const sellerUser = usersMap[deal.sellerId];

      doc.addPage();

      // Header bar
      doc.rect(0, 0, 595, 40).fill('#6366f1');
      doc.fontSize(14).fillColor('#ffffff').text(`Выписка №${statementNumber}`, 50, 12);
      doc.fontSize(10).fillColor('#c7d2fe').text(`Сделка ${i + 1} из ${deals.length}`, 420, 14);

      // Deal header
      doc.fontSize(18).fillColor('#1e293b').text(deal.productName, 50, 60);
      doc.fontSize(10).fillColor(statusColors[deal.status] || '#64748b').text(statusNames[deal.status] || deal.status, 50, 82);
      doc.fontSize(10).fillColor('#6366f1').text(deal.dealId, 400, 82);

      // Helper functions
      const drawSection = (title, yPos) => {
        doc.rect(50, yPos, 495, 24).fill('#f1f5f9');
        doc.fontSize(11).fillColor('#475569').text(title, 60, yPos + 6);
        return yPos + 30;
      };

      const drawRow = (label, value, y) => {
        doc.fontSize(10).fillColor('#64748b').text(label, 60, y);
        doc.fontSize(10).fillColor('#1e293b').text(String(value), 200, y);
        return y + 18;
      };

      let y = 110;

      // Basic Info
      y = drawSection('Основная информация', y);
      y = drawRow('ID сделки:', deal.dealId, y);

      // Handle long descriptions
      const desc = deal.description || '';
      if (desc.length > 80) {
        y = drawRow('Описание:', desc.substring(0, 80) + '...', y);
      } else {
        y = drawRow('Описание:', desc || 'Н/Д', y);
      }
      y += 10;

      // Participants
      y = drawSection('Участники', y);
      const userRole = deal.buyerId === telegramId ? 'Покупатель' : 'Продавец';
      y = drawRow('Ваша роль:', userRole, y);
      y = drawRow('Покупатель:', `@${buyerUser?.username || 'N/A'} (${deal.buyerId})`, y);
      y = drawRow('Продавец:', `@${sellerUser?.username || 'N/A'} (${deal.sellerId})`, y);
      y = drawRow('Инициатор:', deal.creatorRole === 'buyer' ? 'Покупатель' : 'Продавец', y);
      y += 10;

      // Financial
      y = drawSection('Финансы', y);
      y = drawRow('Сумма сделки:', `${deal.amount} ${deal.asset}`, y);
      y = drawRow('Комиссия:', `${deal.commission} ${deal.asset}`, y);
      y = drawRow('Комиссию платит:', commTypes[deal.commissionType], y);

      let depositAmt = deal.amount;
      if (deal.commissionType === 'buyer') depositAmt += deal.commission;
      else if (deal.commissionType === 'split') depositAmt += deal.commission / 2;
      y = drawRow('Сумма депозита:', `${depositAmt.toFixed(2)} ${deal.asset}`, y);

      let sellerAmt = deal.amount;
      if (deal.commissionType === 'seller') sellerAmt -= deal.commission;
      else if (deal.commissionType === 'split') sellerAmt -= deal.commission / 2;
      y = drawRow('Выплата продавцу:', `${sellerAmt.toFixed(2)} ${deal.asset}`, y);
      y += 10;

      // Wallets
      y = drawSection('Кошельки', y);
      y = drawRow('Multisig:', deal.multisigAddress || 'Н/Д', y);
      y = drawRow('Покупатель:', deal.buyerAddress || 'Н/Д', y);
      y = drawRow('Продавец:', deal.sellerAddress || 'Н/Д', y);
      y += 10;

      // Blockchain
      if (deal.depositTxHash) {
        y = drawSection('Блокчейн', y);
        y = drawRow('TX депозита:', deal.depositTxHash.substring(0, 40) + '...', y);
        doc.fontSize(8).fillColor('#6366f1').text(
          'Проверить на TronScan',
          60, y, { link: `https://tronscan.org/#/transaction/${deal.depositTxHash}` }
        );
        y += 20;
      }

      // Timeline
      y = drawSection('Хронология', y);
      y = drawRow('Создана:', new Date(deal.createdAt).toLocaleString('ru-RU', { timeZone: 'UTC' }) + ' UTC', y);
      const deadlineHrs = Math.round((new Date(deal.deadline) - new Date(deal.createdAt)) / 3600000);
      y = drawRow('Дедлайн:', `${deadlineHrs}ч (${new Date(deal.deadline).toLocaleString('ru-RU', { timeZone: 'UTC' })} UTC)`, y);
      if (deal.depositDetectedAt) {
        y = drawRow('Депозит:', new Date(deal.depositDetectedAt).toLocaleString('ru-RU', { timeZone: 'UTC' }) + ' UTC', y);
      }
      if (deal.completedAt) {
        y = drawRow('Завершена:', new Date(deal.completedAt).toLocaleString('ru-RU', { timeZone: 'UTC' }) + ' UTC', y);
      }

      // Partner
      if (deal.platformCode) {
        y += 10;
        y = drawSection('Партнёр', y);
        y = drawRow('Код платформы:', deal.platformCode, y);
      }

      // Footer - only on last deal page, if content fits
      const isLastDeal = i === deals.length - 1;
      const footerY = 780;
      if (isLastDeal && y < footerY) {
        doc.fontSize(9).fillColor('#94a3b8').text(
          'Документ сформирован автоматически системой KeyShield.',
          50, footerY, { align: 'center', width: 495 }
        );
      }

      // Page number in corner
      doc.fontSize(8).fillColor('#94a3b8').text(
        `Страница ${i + 2} из ${totalPages}`,
        450, 50, { align: 'right', width: 95 }
      );
    }

    doc.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const stats = await fsPromises.stat(filePath);

    await ExportLog.create({
      exportType: 'all_user_deals',
      targetUserId: telegramId,
      targetUsername: user.username || null,
      dealId: null,
      dealsCount: deals.length,
      fileName,
      filePath,
      fileSize: stats.size
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.sendFile(filePath);

  } catch (error) {
    console.error('Error exporting user deals:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get export logs
app.get('/api/admin/export/logs', adminAuth, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;

    const logs = await ExportLog.find()
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(skip))
      .lean();

    const total = await ExportLog.countDocuments();

    res.json({ logs, total });
  } catch (error) {
    console.error('Error fetching export logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download exported PDF by log ID
app.get('/api/admin/export/download/:logId', adminAuth, async (req, res) => {
  try {
    const { logId } = req.params;

    const exportLog = await ExportLog.findById(logId);
    if (!exportLog) {
      return res.status(404).json({ error: 'Export log not found' });
    }

    // Check if file exists
    const fs = require('fs');
    if (!fs.existsSync(exportLog.filePath)) {
      return res.status(404).json({ error: 'File no longer exists' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${exportLog.fileName}`);
    res.sendFile(exportLog.filePath);

  } catch (error) {
    console.error('Error downloading export:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete export log and file
app.delete('/api/admin/export/logs/:logId', adminAuth, async (req, res) => {
  try {
    const { logId } = req.params;

    const exportLog = await ExportLog.findById(logId);
    if (!exportLog) {
      return res.status(404).json({ error: 'Export log not found' });
    }

    // Try to delete the file
    const fs = require('fs').promises;
    try {
      await fs.unlink(exportLog.filePath);
    } catch (err) {
      console.log(`Could not delete file: ${err.message}`);
    }

    // Delete the log
    await ExportLog.findByIdAndDelete(logId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting export log:', error);
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

// 404 handler - must be last
app.use((req, res) => {
  res.status(404);
  renderHtmlWithEnv(path.join(__dirname, '../../public/not-found.html'), res);
});

// Start server
const startWebServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`\n🌐 Web server started!`);
      console.log(`   URL: http://localhost:${PORT}`);
      console.log(`   SITE_URL: ${SITE_URL}`);
      console.log(`   INDEXATION: ${INDEXATION ? 'yes' : 'no'} (robots: ${ROBOTS_META})`);
      console.log(`   Admin panel: http://localhost:${PORT}/admin`);
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
