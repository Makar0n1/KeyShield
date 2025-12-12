/**
 * KeyShield Frontend + API Server (ESM)
 * Порт: WEB_PORT (3001)
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { Telegraf } from 'telegraf';
import { createServer as createViteServer } from 'vite';

// Get __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamic imports for CommonJS modules from parent directory
const connectDB = (await import('../src/config/database.js')).default;
const notificationService = (await import('../src/services/notificationService.js')).default;
const blogNotificationService = (await import('../src/services/blogNotificationService.js')).default;
const priceService = (await import('../src/services/priceService.js')).default;

// Models
const Deal = (await import('../src/models/Deal.js')).default;
const User = (await import('../src/models/User.js')).default;
const Transaction = (await import('../src/models/Transaction.js')).default;
const Dispute = (await import('../src/models/Dispute.js')).default;
const Platform = (await import('../src/models/Platform.js')).default;
const ExportLog = (await import('../src/models/ExportLog.js')).default;

// Routes
const partnerRoutes = (await import('../src/web/routes/partner.js')).default;
const blogAdminRoutes = (await import('../src/web/routes/blog.js')).default;
const blogPublicRoutes = (await import('../src/web/routes/blogPublic.js')).default;

const app = express();
const PORT = process.env.WEB_PORT || 3001;
const isDev = process.env.NODE_ENV !== 'production';

// Create bot instance for notifications
const webBot = new Telegraf(process.env.BOT_TOKEN);
notificationService.setBotInstance(webBot);
blogNotificationService.setBotInstance(webBot);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Handle aborted requests gracefully (prevents ECONNABORTED errors in logs)
app.use((req, res, next) => {
  req.on('aborted', () => {
    // Request was aborted by client - this is normal during development
  });
  next();
});

// Global error handler for body-parser errors
app.use((err, req, res, next) => {
  if (err.code === 'ECONNABORTED' || err.type === 'request.aborted') {
    // Client disconnected before request completed - ignore silently
    return;
  }
  next(err);
});

// CORS for dev
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// JWT Auth middleware
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

// ============ API ROUTES ============

// Admin login
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
    res.json({ success: true, token, admin: { username, role: 'admin' } });
  } else {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
  }
});

// Admin verify token
app.get('/api/admin/verify', adminAuth, (req, res) => {
  res.json({ valid: true, admin: { username: req.admin.username, role: req.admin.role } });
});

// Public blog API
app.use('/api/blog', blogPublicRoutes);

// Blog admin routes
app.use('/api/admin/blog', adminAuth, blogAdminRoutes);

// Partner routes
app.use('/partner', partnerRoutes);

// Admin stats
app.get('/api/admin/stats', adminAuth, async (req, res) => {
  try {
    // Get current TRX price
    const TRX_TO_USDT = await priceService.getTrxPrice();

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

    // Calculate finances from finished deals
    const finishedDeals = await Deal.find({
      status: { $in: ['completed', 'resolved', 'expired'] }
    }).lean();

    const totalVolume = finishedDeals.reduce((sum, deal) => sum + deal.amount, 0);
    const totalCommission = finishedDeals.reduce((sum, deal) => sum + deal.commission, 0);

    // Calculate REAL TRX expenses from operational costs
    let totalTrxSpent = 0;
    let totalCostUsd = 0;
    let dealsWithCostData = 0;
    let feesaverDeals = 0;
    let fallbackDeals = 0;

    for (const deal of finishedDeals) {
      if (deal.operationalCosts && deal.operationalCosts.totalTrxSpent > 0) {
        totalTrxSpent += deal.operationalCosts.totalTrxSpent || 0;
        totalCostUsd += deal.operationalCosts.totalCostUsd || 0;
        dealsWithCostData++;
        if (deal.operationalCosts.energyMethod === 'feesaver') feesaverDeals++;
        if (deal.operationalCosts.energyMethod === 'trx') fallbackDeals++;
      } else {
        // Fallback estimate for old deals
        const estimatedTrx = 2.2;
        totalTrxSpent += estimatedTrx;
        totalCostUsd += estimatedTrx * TRX_TO_USDT;
      }
    }

    // Net profit = commission - TRX expenses
    const netProfit = totalCommission - totalCostUsd;

    // Calculate partner payouts
    const activePlatforms = await Platform.find({ isActive: true }).lean();
    const partnerEligibleDeals = finishedDeals.filter(d => d.status !== 'expired');

    let totalPartnerPayouts = 0;
    const partnerDetails = [];

    for (const platform of activePlatforms) {
      const platformDeals = partnerEligibleDeals.filter(d =>
        d.platformId && d.platformId.toString() === platform._id.toString()
      );

      if (platformDeals.length > 0) {
        const platformCommission = platformDeals.reduce((sum, deal) => sum + deal.commission, 0);
        let platformCostUsd = 0;

        for (const deal of platformDeals) {
          if (deal.operationalCosts && deal.operationalCosts.totalCostUsd > 0) {
            platformCostUsd += deal.operationalCosts.totalCostUsd;
          } else {
            platformCostUsd += 2.2 * TRX_TO_USDT;
          }
        }

        const platformNetProfit = platformCommission - platformCostUsd;
        const platformPayout = platformNetProfit * (platform.commissionPercent / 100);

        totalPartnerPayouts += platformPayout > 0 ? platformPayout : 0;

        partnerDetails.push({
          name: platform.name,
          code: platform.code,
          deals: platformDeals.length,
          commission: platformCommission,
          costUsd: platformCostUsd,
          netProfit: platformNetProfit,
          percent: platform.commissionPercent,
          payout: platformPayout > 0 ? platformPayout : 0
        });
      }
    }

    const pureProfit = netProfit - totalPartnerPayouts;
    const avgTrxPerDeal = finishedDeals.length > 0 ? totalTrxSpent / finishedDeals.length : 0;
    const avgCostPerDeal = finishedDeals.length > 0 ? totalCostUsd / finishedDeals.length : 0;

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
        totalTrxSpentUsdt: totalCostUsd.toFixed(2),
        totalCostUsd: totalCostUsd.toFixed(2),
        netProfit: netProfit.toFixed(2),
        trxRate: TRX_TO_USDT,
        trxPerDeal: avgTrxPerDeal.toFixed(2),
        avgTrxPerDeal: avgTrxPerDeal.toFixed(2),
        avgCostPerDeal: avgCostPerDeal.toFixed(2),
        dealsWithCostData,
        feesaverDeals,
        fallbackDeals
      },
      partners: {
        count: activePlatforms.length,
        totalPayouts: totalPartnerPayouts.toFixed(2),
        pureProfit: pureProfit.toFixed(2),
        details: partnerDetails
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Deals API
app.get('/api/admin/deals', adminAuth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {};
    if (status === 'active') {
      query.status = { $in: ['waiting_for_deposit', 'locked', 'in_progress', 'work_submitted'] };
    } else if (status) {
      query.status = status;
    }
    if (search) {
      const searchNum = parseInt(search);
      const searchConditions = [
        { dealId: new RegExp(search, 'i') },
        { productName: new RegExp(search, 'i') }
      ];
      // If search is a number, also search by buyerId/sellerId
      if (!isNaN(searchNum)) {
        searchConditions.push({ buyerId: searchNum });
        searchConditions.push({ sellerId: searchNum });
      }
      query.$or = searchConditions;
    }

    const deals = await Deal.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    const total = await Deal.countDocuments(query);

    res.json({ deals, total, totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/deals/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    let deal = null;

    // Try by MongoDB ObjectId first (24 hex chars)
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      deal = await Deal.findById(id).lean();
    }

    // If not found, try by dealId code
    if (!deal) {
      deal = await Deal.findOne({ dealId: id }).lean();
    }

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json({ deal });
  } catch (error) {
    console.error('Error fetching deal:', error);
    res.status(500).json({ error: error.message });
  }
});

// Users API
app.get('/api/admin/users', adminAuth, async (req, res) => {
  try {
    const { search, blacklisted, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {};
    if (search) {
      query.$or = [
        { username: new RegExp(search, 'i') },
        { telegramId: parseInt(search) || 0 }
      ];
    }
    if (blacklisted === 'true') query.blacklisted = true;

    const users = await User.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    const total = await User.countDocuments(query);

    res.json({ users, total, totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/users/:telegramId', adminAuth, async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: parseInt(req.params.telegramId) }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users/:telegramId/ban', adminAuth, async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findOne({ telegramId: parseInt(req.params.telegramId) });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.blacklisted = true;
    user.blacklistReason = reason;
    await user.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/users/:telegramId/unban', adminAuth, async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: parseInt(req.params.telegramId) });
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.blacklisted = false;
    user.blacklistReason = null;
    await user.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Disputes API
app.get('/api/admin/disputes', adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {};
    if (status) query.status = status;

    const disputes = await Dispute.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate('dealId')
      .lean();

    const total = await Dispute.countDocuments(query);

    res.json({ disputes, total, totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/disputes/:id', adminAuth, async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id).populate('dealId').lean();
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    res.json({ dispute });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/disputes/:id/resolve', adminAuth, async (req, res) => {
  try {
    const { winner, reason } = req.body;
    const dispute = await Dispute.findById(req.params.id).populate('dealId');
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    dispute.status = 'resolved';
    dispute.decision = reason;
    dispute.winner = winner;
    dispute.resolvedAt = new Date();
    await dispute.save();

    if (dispute.dealId) {
      dispute.dealId.status = 'resolved';
      await dispute.dealId.save();
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/disputes/:id/cancel', adminAuth, async (req, res) => {
  try {
    const dispute = await Dispute.findById(req.params.id).populate('dealId');
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    if (dispute.dealId) {
      dispute.dealId.status = 'in_progress';
      await dispute.dealId.save();
    }

    await Dispute.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Platforms API
app.get('/api/admin/platforms', adminAuth, async (req, res) => {
  try {
    const platforms = await Platform.find().sort({ createdAt: -1 }).lean();
    res.json({ platforms });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/platforms', adminAuth, async (req, res) => {
  try {
    const { name, telegramChannel, login, password, commissionPercent = 10 } = req.body;

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
      passwordHash: password,
      commissionPercent
    });

    await platform.save();
    res.json({ platform });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/platforms/:id', adminAuth, async (req, res) => {
  try {
    const { name, telegramChannel, login, password, commissionPercent } = req.body;
    const platform = await Platform.findById(req.params.id);
    if (!platform) return res.status(404).json({ error: 'Platform not found' });

    if (name) platform.name = name;
    if (telegramChannel) platform.telegramChannel = telegramChannel;
    if (login) platform.login = login;
    if (password) platform.passwordHash = password;
    if (commissionPercent !== undefined) platform.commissionPercent = commissionPercent;

    await platform.save();
    res.json({ platform });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/platforms/:id/toggle', adminAuth, async (req, res) => {
  try {
    const platform = await Platform.findById(req.params.id);
    if (!platform) return res.status(404).json({ error: 'Platform not found' });
    platform.isActive = !platform.isActive;
    await platform.save();
    res.json({ platform });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/platforms/:id', adminAuth, async (req, res) => {
  try {
    await Platform.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Transactions API
app.get('/api/admin/transactions', adminAuth, async (req, res) => {
  try {
    const { type, dealId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let query = {};
    if (type) query.type = type;
    if (dealId) query.dealId = dealId;

    const transactions = await Transaction.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .lean();

    const total = await Transaction.countDocuments(query);

    res.json({ transactions, total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Export API (PDF) ============

// Helper: Find user by ID or username (@username supported)
async function findUserByIdOrUsername(identifier) {
  if (!identifier) return null;
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
    const { default: PDFDocument } = await import('pdfkit');
    const fs = await import('fs');
    const fsPromises = fs.promises;

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

    // Try to find deal by MongoDB _id or by dealId string (e.g., "DL-100001")
    let deal = null;
    if (/^[0-9a-fA-F]{24}$/.test(dealId)) {
      deal = await Deal.findById(dealId).lean();
    }
    if (!deal) {
      deal = await Deal.findOne({ dealId }).lean();
    }
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

    const exportsDir = join(__dirname, '../exports');
    try { await fsPromises.mkdir(exportsDir, { recursive: true }); } catch (err) {}

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const statementNumber = `${dateStr}-${random}`;

    const safeUsername = (requestingUser?.username || String(telegramId)).replace(/[^a-zA-Z0-9_]/g, '');
    const fileName = `KeyShield_User_${safeUsername}_Deal_${statementNumber}.pdf`;
    const filePath = join(exportsDir, fileName);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const fontPath = join(__dirname, 'public/fonts/Roboto.ttf');
    try {
      doc.registerFont('Roboto', fontPath);
      doc.font('Roboto');
    } catch (e) {
      // Fallback to default font
    }

    // ===== TITLE PAGE =====
    doc.rect(0, 0, 595, 8).fill('#6366f1');

    doc.moveDown(4);
    doc.fontSize(42).fillColor('#6366f1').text('KeyShield', { align: 'center' });
    doc.fontSize(14).fillColor('#64748b').text('Безопасный криптовалютный эскроу на TRON', { align: 'center' });

    doc.moveDown(4);

    doc.rect(150, doc.y, 295, 80).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#64748b').text('ВЫПИСКА', { align: 'center' });
    doc.fontSize(28).fillColor('#1e293b').text(`№${statementNumber}`, { align: 'center' });

    doc.moveDown(4);

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

    doc.fontSize(9).fillColor('#94a3b8').text('https://keyshield.me', 50, 750, { align: 'center', link: 'https://keyshield.me' });
    doc.rect(0, 834, 595, 8).fill('#6366f1');

    // ===== DEAL PAGE =====
    doc.addPage();

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

    doc.fontSize(18).fillColor('#1e293b').text(deal.productName, 50, 60);
    doc.fontSize(10).fillColor(statusColors[deal.status] || '#64748b').text(statusNames[deal.status] || deal.status, 50, 82);

    doc.moveDown(3);

    const drawSection = (title, yPos) => {
      doc.rect(50, yPos, 495, 24).fill('#f1f5f9');
      doc.fontSize(11).fillColor('#475569').text(title, 60, yPos + 6);
      return yPos + 30;
    };

    const drawRow = (label, value, y) => {
      doc.fontSize(10).fillColor('#64748b').text(label, 60, y);
      doc.fontSize(10).fillColor('#1e293b').text(String(value || 'Н/Д'), 200, y);
      return y + 18;
    };

    let y = 110;

    // Basic Info
    y = drawSection('Основная информация', y);
    y = drawRow('ID сделки:', deal.dealId, y);
    const desc = deal.description || '';
    y = drawRow('Описание:', desc.substring(0, 60) + (desc.length > 60 ? '...' : ''), y);
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

    // Footer
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

// Export user deals history to PDF
app.get('/api/admin/export/user/:userIdentifier', adminAuth, async (req, res) => {
  try {
    const { default: PDFDocument } = await import('pdfkit');
    const fs = await import('fs');
    const fsPromises = fs.promises;

    const { userIdentifier } = req.params;

    const user = await findUserByIdOrUsername(userIdentifier);
    if (!user) {
      return res.status(404).json({ error: 'User not found. Check Telegram ID or @username.' });
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

    const exportsDir = join(__dirname, '../exports');
    try { await fsPromises.mkdir(exportsDir, { recursive: true }); } catch (err) {}

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const statementNumber = `${dateStr}-${random}`;

    const safeUsername = (user?.username || String(telegramId)).replace(/[^a-zA-Z0-9_]/g, '');
    const fileName = `KeyShield_User_${safeUsername}_Deals_${statementNumber}.pdf`;
    const filePath = join(exportsDir, fileName);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const fontPath = join(__dirname, 'public/fonts/Roboto.ttf');
    try {
      doc.registerFont('Roboto', fontPath);
      doc.font('Roboto');
    } catch (e) {}

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

    doc.rect(150, doc.y, 295, 80).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.moveDown(0.5);
    doc.fontSize(12).fillColor('#64748b').text('ВЫПИСКА', { align: 'center' });
    doc.fontSize(28).fillColor('#1e293b').text(`№${statementNumber}`, { align: 'center' });

    doc.moveDown(4);

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

    doc.fontSize(9).fillColor('#94a3b8').text('https://keyshield.me', 50, 750, { align: 'center', link: 'https://keyshield.me' });
    doc.rect(0, 834, 595, 8).fill('#6366f1');

    // ===== DEAL PAGES =====
    const totalPages = deals.length + 1;

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
        doc.fontSize(10).fillColor('#1e293b').text(String(value || 'Н/Д'), 200, y);
        return y + 18;
      };

      let y = 110;

      // Basic Info
      y = drawSection('Основная информация', y);
      y = drawRow('ID сделки:', deal.dealId, y);
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

      // Footer on last deal page
      const isLastDeal = i === deals.length - 1;
      const footerY = 780;
      if (isLastDeal && y < footerY) {
        doc.fontSize(9).fillColor('#94a3b8').text(
          'Документ сформирован автоматически системой KeyShield.',
          50, footerY, { align: 'center', width: 495 }
        );
      }

      // Page number
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
      targetUsername: user?.username || null,
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

// Export history
app.get('/api/admin/export/history', adminAuth, async (req, res) => {
  try {
    const exports = await ExportLog.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json({ exports });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download export file by ID
app.get('/api/admin/export/:id/download', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const exportLog = await ExportLog.findById(id);
    if (!exportLog) {
      return res.status(404).json({ error: 'Export not found' });
    }

    const fs = await import('fs');
    // Check if file exists
    try {
      await fs.promises.access(exportLog.filePath);
    } catch {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${exportLog.fileName}"`);

    const fileStream = fs.createReadStream(exportLog.filePath);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete export record
app.delete('/api/admin/export/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const exportLog = await ExportLog.findById(id);
    if (!exportLog) {
      return res.status(404).json({ error: 'Export not found' });
    }

    // Try to delete the file
    const fs = await import('fs');
    try {
      await fs.promises.unlink(exportLog.filePath);
    } catch (err) {
      // File might already be deleted
    }

    // Delete the record
    await ExportLog.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// IP Check
app.get('/api/admin/system/ip-check', adminAuth, async (req, res) => {
  const { ip } = req.query;
  res.json({
    result: {
      ip,
      country: 'Unknown',
      proxy: false,
      vpn: false,
      tor: false,
      hosting: false
    }
  });
});

// ============ FINAL ERROR HANDLER ============

// Catch-all error handler (must be last before static files)
app.use((err, req, res, next) => {
  // Silently ignore aborted requests
  if (err.code === 'ECONNABORTED' || err.type === 'request.aborted') {
    return;
  }

  console.error('Server error:', err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ STATIC FILES & VITE ============

// Serve uploads directory (works in both dev and prod)
app.use('/uploads', express.static(join(__dirname, 'public/uploads')));

async function startServer() {
  try {
    await connectDB();

    if (isDev) {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa'
      });
      app.use(vite.middlewares);
    } else {
      app.use(express.static(join(__dirname, 'dist')));
      // Catch-all for SPA routing (Express 5 syntax)
      app.get('/{*splat}', (req, res) => {
        res.sendFile(join(__dirname, 'dist', 'index.html'));
      });
    }

    app.listen(PORT, () => {
      console.log(`\n🌐 KeyShield Frontend Server started!`);
      console.log(`   Mode: ${isDev ? 'DEVELOPMENT' : 'PRODUCTION'}`);
      console.log(`   URL: http://localhost:${PORT}`);
      console.log(`   Admin: http://localhost:${PORT}/admin/login`);
      console.log(`   Credentials: admin / admin123\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
