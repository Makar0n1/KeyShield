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
const ExportLog = require('../models/ExportLog');

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

// Clean URL routes for pages (no .html extension)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/terms.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/privacy.html'));
});

app.get('/offer', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/offer.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/admin.html'));
});

// Redirect .html URLs to clean URLs
app.get('*.html', (req, res) => {
  const cleanPath = req.path.replace('.html', '');
  res.redirect(301, cleanPath);
});

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
    // TRX to USDT exchange rate
    const TRX_TO_USDT = 0.28;
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

    // Find user by ID or username
    const requestingUser = await findUserByIdOrUsername(userIdentifier);
    if (!requestingUser) {
      return res.status(404).json({ error: 'User not found. Check Telegram ID or username.' });
    }

    const telegramId = requestingUser.telegramId;

    const deal = await Deal.findOne({ dealId }).lean();
    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Only export completed deals (completed, resolved, expired, cancelled with deposit)
    const exportableStatuses = ['completed', 'resolved', 'expired'];
    if (!exportableStatuses.includes(deal.status)) {
      return res.status(400).json({ error: 'Only completed/resolved/expired deals can be exported' });
    }

    // Check if user is participant
    const isParticipant = deal.buyerId === telegramId || deal.sellerId === telegramId;
    if (!isParticipant) {
      return res.status(403).json({ error: 'User is not a participant of this deal' });
    }

    // Get user info for both participants
    const [buyerUser, sellerUser] = await Promise.all([
      User.findOne({ telegramId: deal.buyerId }).lean(),
      User.findOne({ telegramId: deal.sellerId }).lean()
    ]);

    // Create exports directory if not exists
    const exportsDir = pathModule.join(__dirname, '../../exports');
    try {
      await fsPromises.mkdir(exportsDir, { recursive: true });
    } catch (err) {
      // Directory exists
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `Deal_${dealId}_${telegramId}_${timestamp}.pdf`;
    const filePath = pathModule.join(exportsDir, fileName);

    // Generate PDF to file
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Register Roboto font for Russian text
    const fontPath = pathModule.join(__dirname, '../../public/fonts/Roboto.ttf');
    doc.registerFont('Roboto', fontPath);
    doc.font('Roboto');

    // Generate unique statement number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const statementNumber = `${dateStr}-${random}`;

    // Header
    doc.fontSize(24).fillColor('#6366f1').text('KeyShield', { align: 'center' });
    doc.fontSize(10).fillColor('#64748b').text('Безопасный криптовалютный эскроу на TRON', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(8).text('https://keyshield.me', { align: 'center', link: 'https://keyshield.me' });

    doc.moveDown(2);

    // Document title with unique number
    doc.fontSize(18).fillColor('#1e293b').text(`ВЫПИСКА №${statementNumber}`, { align: 'center' });
    doc.fontSize(14).fillColor('#64748b').text(`по сделке ${deal.dealId}`, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#64748b').text(`Сформировано: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC`, { align: 'center' });

    doc.moveDown(2);

    // Requesting user info
    doc.fontSize(10).fillColor('#64748b').text('Документ подготовлен для:');
    doc.fontSize(12).fillColor('#1e293b').text(`@${requestingUser?.username || 'Неизвестно'} (ID: ${telegramId})`);

    doc.moveDown(2);

    // Deal info section
    const drawSection = (title) => {
      doc.moveDown(1);
      doc.fontSize(14).fillColor('#6366f1').text(title);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
      doc.moveDown(0.5);
    };

    const drawRow = (label, value) => {
      doc.fontSize(10).fillColor('#64748b').text(label, { continued: true });
      doc.fontSize(10).fillColor('#1e293b').text(`  ${value}`);
      doc.moveDown(0.3);
    };

    // Basic Info
    drawSection('Основная информация');
    drawRow('ID сделки:', deal.dealId);
    drawRow('Товар/услуга:', deal.productName);
    drawRow('Описание:', deal.description.substring(0, 200) + (deal.description.length > 200 ? '...' : ''));

    // Status with color
    const statusNames = {
      completed: 'Успешно завершена',
      resolved: 'Решена арбитром',
      expired: 'Истекла (авто-возврат)',
      cancelled: 'Отменена'
    };
    drawRow('Статус:', statusNames[deal.status] || deal.status);

    // Participants
    drawSection('Участники сделки');
    const userRole = deal.buyerId === telegramId ? 'Покупатель' : 'Продавец';
    drawRow('Ваша роль:', userRole);
    drawRow('Покупатель:', `@${buyerUser?.username || 'Неизвестно'} (ID: ${deal.buyerId})`);
    drawRow('Продавец:', `@${sellerUser?.username || 'Неизвестно'} (ID: ${deal.sellerId})`);
    drawRow('Инициатор сделки:', deal.creatorRole === 'buyer' ? 'Покупатель' : 'Продавец');

    // Financial Info
    drawSection('Финансовая информация');
    drawRow('Сумма сделки:', `${deal.amount} ${deal.asset}`);
    drawRow('Комиссия:', `${deal.commission} ${deal.asset}`);

    const commissionTypeNames = { buyer: 'Покупатель', seller: 'Продавец', split: 'Пополам 50/50' };
    drawRow('Комиссию оплачивает:', commissionTypeNames[deal.commissionType]);

    let depositAmount = deal.amount;
    if (deal.commissionType === 'buyer') depositAmount += deal.commission;
    else if (deal.commissionType === 'split') depositAmount += deal.commission / 2;
    drawRow('Сумма депозита:', `${depositAmount.toFixed(2)} ${deal.asset}`);

    let sellerPayout = deal.amount;
    if (deal.commissionType === 'seller') sellerPayout -= deal.commission;
    else if (deal.commissionType === 'split') sellerPayout -= deal.commission / 2;
    drawRow('Выплата продавцу:', `${sellerPayout.toFixed(2)} ${deal.asset}`);

    if (deal.actualDepositAmount) {
      drawRow('Фактический депозит:', `${deal.actualDepositAmount} ${deal.asset}`);
    }

    // Wallet addresses
    drawSection('Адреса кошельков');
    drawRow('Multisig адрес:', deal.multisigAddress || 'Н/Д');
    drawRow('Кошелёк покупателя:', deal.buyerAddress || 'Н/Д');
    drawRow('Кошелёк продавца:', deal.sellerAddress || 'Н/Д');

    // Blockchain Info
    if (deal.depositTxHash) {
      drawSection('Блокчейн информация');
      drawRow('TX хеш депозита:', deal.depositTxHash);
      doc.fontSize(8).fillColor('#6366f1').text(
        `Проверить на TronScan: https://tronscan.org/#/transaction/${deal.depositTxHash}`,
        { link: `https://tronscan.org/#/transaction/${deal.depositTxHash}` }
      );
    }

    // Dates
    drawSection('Хронология');
    drawRow('Создана:', new Date(deal.createdAt).toISOString().replace('T', ' ').substring(0, 19) + ' UTC');

    const deadlineHours = Math.round((new Date(deal.deadline) - new Date(deal.createdAt)) / (1000 * 60 * 60));
    drawRow('Срок выполнения:', `${deadlineHours} часов`);
    drawRow('Дедлайн:', new Date(deal.deadline).toISOString().replace('T', ' ').substring(0, 19) + ' UTC');

    if (deal.depositDetectedAt) {
      drawRow('Депозит обнаружен:', new Date(deal.depositDetectedAt).toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    }
    if (deal.completedAt) {
      drawRow('Завершена:', new Date(deal.completedAt).toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    }

    // Partner info if exists
    if (deal.platformCode) {
      drawSection('Партнёрская информация');
      drawRow('Код платформы:', deal.platformCode);
    }

    // Footer
    doc.moveDown(3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
    doc.moveDown(1);
    doc.fontSize(8).fillColor('#64748b').text(
      'Этот документ был автоматически сформирован системой KeyShield и является официальной выпиской по сделке.',
      { align: 'center' }
    );
    doc.moveDown(0.5);
    doc.text('KeyShield не является финансовой организацией. Мы предоставляем технологическую платформу для безопасного обмена криптовалютой.', { align: 'center' });
    doc.moveDown(1);
    doc.fontSize(10).fillColor('#6366f1').text('© 2025 KeyShield. Все права защищены.', { align: 'center' });

    doc.end();

    // Wait for file to be written
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Get file size
    const stats = await fsPromises.stat(filePath);

    // Log the export
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

    // Send file to client
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=KeyShield_Deal_${dealId}.pdf`);
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

    // Find user by ID or username
    const user = await findUserByIdOrUsername(userIdentifier);
    if (!user) {
      return res.status(404).json({ error: 'User not found. Check Telegram ID or username.' });
    }

    const telegramId = user.telegramId;

    // Get all exportable deals for this user
    const exportableStatuses = ['completed', 'resolved', 'expired'];
    const deals = await Deal.find({
      $or: [{ buyerId: telegramId }, { sellerId: telegramId }],
      status: { $in: exportableStatuses }
    }).sort({ createdAt: -1 }).lean();

    if (deals.length === 0) {
      return res.status(404).json({ error: 'No exportable deals found for this user' });
    }

    // Create exports directory if not exists
    const exportsDir = pathModule.join(__dirname, '../../exports');
    try {
      await fsPromises.mkdir(exportsDir, { recursive: true });
    } catch (err) {
      // Directory exists
    }

    // Generate unique filename
    const timestamp = Date.now();
    const fileName = `UserDeals_${telegramId}_${timestamp}.pdf`;
    const filePath = pathModule.join(exportsDir, fileName);

    // Generate PDF to file
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    // Register Roboto font for Russian text
    const fontPath = pathModule.join(__dirname, '../../public/fonts/Roboto.ttf');
    doc.registerFont('Roboto', fontPath);
    doc.font('Roboto');

    // Generate unique statement number (timestamp + random)
    const generateStatementNumber = () => {
      const date = new Date();
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
      const random = Math.random().toString(36).substring(2, 8).toUpperCase();
      return `${dateStr}-${random}`;
    };

    // Helper functions for drawing
    const drawSection = (title) => {
      doc.moveDown(1);
      doc.fontSize(14).fillColor('#6366f1').text(title);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
      doc.moveDown(0.5);
    };

    const drawRow = (label, value) => {
      doc.fontSize(10).fillColor('#64748b').text(label, { continued: true });
      doc.fontSize(10).fillColor('#1e293b').text(`  ${value}`);
      doc.moveDown(0.3);
    };

    const statusNames = {
      completed: 'Успешно завершена',
      resolved: 'Решена арбитром',
      expired: 'Истекла (авто-возврат)',
      cancelled: 'Отменена'
    };

    const commissionTypeNames = { buyer: 'Покупатель', seller: 'Продавец', split: 'Пополам 50/50' };

    // Get all participants info
    const allUserIds = [...new Set(deals.flatMap(d => [d.buyerId, d.sellerId]))];
    const allUsers = await User.find({ telegramId: { $in: allUserIds } }).lean();
    const usersMap = {};
    allUsers.forEach(u => { usersMap[u.telegramId] = u; });

    // Generate full statement for each deal
    for (let i = 0; i < deals.length; i++) {
      const deal = deals[i];
      const statementNumber = generateStatementNumber();
      const buyerUser = usersMap[deal.buyerId];
      const sellerUser = usersMap[deal.sellerId];

      // New page for each deal (except first)
      if (i > 0) {
        doc.addPage();
      }

      // Header
      doc.fontSize(24).fillColor('#6366f1').text('KeyShield', { align: 'center' });
      doc.fontSize(10).fillColor('#64748b').text('Безопасный криптовалютный эскроу на TRON', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(8).text('https://keyshield.me', { align: 'center', link: 'https://keyshield.me' });

      doc.moveDown(2);

      // Document title with unique number
      doc.fontSize(18).fillColor('#1e293b').text(`ВЫПИСКА №${statementNumber}`, { align: 'center' });
      doc.fontSize(14).fillColor('#64748b').text(`по сделке ${deal.dealId}`, { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(12).fillColor('#64748b').text(`Сформировано: ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC`, { align: 'center' });

      doc.moveDown(2);

      // Requesting user info
      doc.fontSize(10).fillColor('#64748b').text('Документ подготовлен для:');
      doc.fontSize(12).fillColor('#1e293b').text(`@${user.username || 'Неизвестно'} (ID: ${telegramId})`);

      doc.moveDown(2);

      // Basic Info
      drawSection('Основная информация');
      drawRow('ID сделки:', deal.dealId);
      drawRow('Товар/услуга:', deal.productName);
      drawRow('Описание:', deal.description.substring(0, 200) + (deal.description.length > 200 ? '...' : ''));
      drawRow('Статус:', statusNames[deal.status] || deal.status);

      // Participants
      drawSection('Участники сделки');
      const userRole = deal.buyerId === telegramId ? 'Покупатель' : 'Продавец';
      drawRow('Ваша роль:', userRole);
      drawRow('Покупатель:', `@${buyerUser?.username || 'Неизвестно'} (ID: ${deal.buyerId})`);
      drawRow('Продавец:', `@${sellerUser?.username || 'Неизвестно'} (ID: ${deal.sellerId})`);
      drawRow('Инициатор сделки:', deal.creatorRole === 'buyer' ? 'Покупатель' : 'Продавец');

      // Financial Info
      drawSection('Финансовая информация');
      drawRow('Сумма сделки:', `${deal.amount} ${deal.asset}`);
      drawRow('Комиссия:', `${deal.commission} ${deal.asset}`);
      drawRow('Комиссию оплачивает:', commissionTypeNames[deal.commissionType]);

      let depositAmount = deal.amount;
      if (deal.commissionType === 'buyer') depositAmount += deal.commission;
      else if (deal.commissionType === 'split') depositAmount += deal.commission / 2;
      drawRow('Сумма депозита:', `${depositAmount.toFixed(2)} ${deal.asset}`);

      let sellerPayout = deal.amount;
      if (deal.commissionType === 'seller') sellerPayout -= deal.commission;
      else if (deal.commissionType === 'split') sellerPayout -= deal.commission / 2;
      drawRow('Выплата продавцу:', `${sellerPayout.toFixed(2)} ${deal.asset}`);

      if (deal.actualDepositAmount) {
        drawRow('Фактический депозит:', `${deal.actualDepositAmount} ${deal.asset}`);
      }

      // Wallet addresses
      drawSection('Адреса кошельков');
      drawRow('Multisig адрес:', deal.multisigAddress || 'Н/Д');
      drawRow('Кошелёк покупателя:', deal.buyerAddress || 'Н/Д');
      drawRow('Кошелёк продавца:', deal.sellerAddress || 'Н/Д');

      // Blockchain Info
      if (deal.depositTxHash) {
        drawSection('Блокчейн информация');
        drawRow('TX хеш депозита:', deal.depositTxHash);
        doc.fontSize(8).fillColor('#6366f1').text(
          `Проверить на TronScan: https://tronscan.org/#/transaction/${deal.depositTxHash}`,
          { link: `https://tronscan.org/#/transaction/${deal.depositTxHash}` }
        );
      }

      // Dates
      drawSection('Хронология');
      drawRow('Создана:', new Date(deal.createdAt).toISOString().replace('T', ' ').substring(0, 19) + ' UTC');

      const deadlineHours = Math.round((new Date(deal.deadline) - new Date(deal.createdAt)) / (1000 * 60 * 60));
      drawRow('Срок выполнения:', `${deadlineHours} часов`);
      drawRow('Дедлайн:', new Date(deal.deadline).toISOString().replace('T', ' ').substring(0, 19) + ' UTC');

      if (deal.depositDetectedAt) {
        drawRow('Депозит обнаружен:', new Date(deal.depositDetectedAt).toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
      }
      if (deal.completedAt) {
        drawRow('Завершена:', new Date(deal.completedAt).toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
      }

      // Partner info if exists
      if (deal.platformCode) {
        drawSection('Партнёрская информация');
        drawRow('Код платформы:', deal.platformCode);
      }

      // Footer
      doc.moveDown(3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
      doc.moveDown(1);
      doc.fontSize(8).fillColor('#64748b').text(
        'Этот документ был автоматически сформирован системой KeyShield и является официальной выпиской по сделке.',
        { align: 'center' }
      );
      doc.moveDown(0.5);
      doc.text('KeyShield не является финансовой организацией. Мы предоставляем технологическую платформу для безопасного обмена криптовалютой.', { align: 'center' });
      doc.moveDown(1);
      doc.fontSize(10).fillColor('#6366f1').text('© 2025 KeyShield. Все права защищены.', { align: 'center' });

      // Page number
      doc.fontSize(8).fillColor('#94a3b8').text(
        `Страница ${i + 1} из ${deals.length}`,
        50, 780, { align: 'center' }
      );
    }

    doc.end();

    // Wait for file to be written
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Get file size
    const stats = await fsPromises.stat(filePath);

    // Log the export
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

    // Send file to client
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=KeyShield_User_${telegramId}_Deals.pdf`);
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
  res.status(404).sendFile(path.join(__dirname, '../../public/not-found.html'));
});

// Start server
const startWebServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`\n🌐 Web server started!`);
      console.log(`   URL: http://localhost:${PORT}`);
      console.log(`   Admin panel: http://localhost:${PORT}/admin`);
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
