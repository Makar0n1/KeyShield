const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Platform = require('../../models/Platform');
const User = require('../../models/User');
const Deal = require('../../models/Deal');
const priceService = require('../../services/priceService');

const JWT_SECRET = process.env.JWT_SECRET || 'partner-secret-key-change-in-production';
const BOT_USERNAME = process.env.BOT_USERNAME || 'KeyShieldBot';

// Middleware для проверки JWT токена партнера
const authenticatePartner = async (req, res, next) => {
  const token = req.cookies.partnerToken || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.redirect('/partner/login');
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const platform = await Platform.findById(decoded.platformId);

    if (!platform || !platform.isActive) {
      res.clearCookie('partnerToken');
      return res.redirect('/partner/login');
    }

    req.platform = platform;
    next();
  } catch (error) {
    res.clearCookie('partnerToken');
    return res.redirect('/partner/login');
  }
};

// Страница логина
router.get('/login', (req, res) => {
  const error = req.query.error;
  res.send(getLoginPage(error));
});

// Обработка логина
router.post('/login', async (req, res) => {
  try {
    const { login, password } = req.body;

    const platform = await Platform.findOne({ login, isActive: true });
    if (!platform) {
      return res.redirect('/partner/login?error=invalid');
    }

    const isValid = await platform.checkPassword(password);
    if (!isValid) {
      return res.redirect('/partner/login?error=invalid');
    }

    // Update last login
    platform.lastLoginAt = new Date();
    platform.addLog('login', { ip: req.ip });
    await platform.save();

    // Generate JWT
    const token = jwt.sign(
      { platformId: platform._id, code: platform.code },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('partnerToken', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.redirect('/partner/dashboard');
  } catch (error) {
    console.error('Partner login error:', error);
    res.redirect('/partner/login?error=server');
  }
});

// Выход
router.get('/logout', (req, res) => {
  res.clearCookie('partnerToken');
  res.redirect('/partner/login');
});

// Дашборд партнера
router.get('/dashboard', authenticatePartner, async (req, res) => {
  try {
    const platform = req.platform;

    // Update stats
    await platform.updateStats();

    // Get recent deals
    const recentDeals = await Deal.find({ platformId: platform._id })
      .sort({ createdAt: -1 })
      .limit(20);

    // Get users count
    const usersCount = await User.countDocuments({ platformId: platform._id });

    // Get deals by status
    const dealsByStatus = await Deal.aggregate([
      { $match: { platformId: platform._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Get daily stats for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyStats = await Deal.aggregate([
      {
        $match: {
          platformId: platform._id,
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          deals: { $sum: 1 },
          volume: { $sum: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Referral link
    const referralLink = platform.getReferralLink(BOT_USERNAME);

    // Get current TRX price
    const trxRate = await priceService.getTrxPrice();

    res.send(getDashboardPage(platform, recentDeals, usersCount, dealsByStatus, dailyStats, referralLink, trxRate));
  } catch (error) {
    console.error('Partner dashboard error:', error);
    res.status(500).send('Internal server error');
  }
});

// API: Get stats
router.get('/api/stats', authenticatePartner, async (req, res) => {
  try {
    const platform = req.platform;
    await platform.updateStats();

    res.json({
      success: true,
      stats: platform.stats,
      referralLink: platform.getReferralLink(BOT_USERNAME)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get deals
router.get('/api/deals', authenticatePartner, async (req, res) => {
  try {
    const platform = req.platform;
    const { status, page = 1, limit = 20 } = req.query;

    const query = { platformId: platform._id };
    if (status) query.status = status;

    const deals = await Deal.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Deal.countDocuments(query);

    res.json({
      success: true,
      deals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get users
router.get('/api/users', authenticatePartner, async (req, res) => {
  try {
    const platform = req.platform;
    const { page = 1, limit = 20 } = req.query;

    const users = await User.find({ platformId: platform._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments({ platformId: platform._id });

    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get activity log
router.get('/api/logs', authenticatePartner, async (req, res) => {
  try {
    const platform = req.platform;
    const logs = platform.activityLog.slice(-100).reverse();

    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ HTML Templates ============

function getLoginPage(error) {
  const errorMsg = error === 'invalid' ? 'Неверный логин или пароль' :
                   error === 'server' ? 'Ошибка сервера' : '';

  return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Партнерский кабинет - KeyShield</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
  <style>
    :root {
      --primary-color: #6366f1;
      --primary-dark: #4f46e5;
      --bg-dark: #0f172a;
      --bg-card: #1e293b;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
    }
    body {
      background: linear-gradient(135deg, var(--bg-dark) 0%, #1a1a2e 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .login-card {
      background: var(--bg-card);
      border-radius: 20px;
      padding: 40px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .login-logo {
      text-align: center;
      margin-bottom: 30px;
    }
    .login-logo i {
      font-size: 50px;
      color: var(--primary-color);
      margin-bottom: 15px;
    }
    .login-logo h1 {
      color: var(--text-primary);
      font-size: 24px;
      font-weight: 700;
    }
    .login-logo p {
      color: var(--text-secondary);
      font-size: 14px;
    }
    .form-control {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: var(--text-primary);
      padding: 12px 16px;
      border-radius: 10px;
    }
    .form-control:focus {
      background: rgba(255, 255, 255, 0.08);
      border-color: var(--primary-color);
      color: var(--text-primary);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
    }
    .form-control::placeholder {
      color: var(--text-secondary);
    }
    .form-label {
      color: var(--text-secondary);
      font-size: 14px;
      margin-bottom: 8px;
    }
    .btn-login {
      background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
      border: none;
      padding: 12px 24px;
      border-radius: 10px;
      font-weight: 600;
      width: 100%;
      color: white;
      transition: all 0.3s;
    }
    .btn-login:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(99, 102, 241, 0.3);
    }
    .alert-danger {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #ef4444;
      border-radius: 10px;
    }

    /* Responsive layout for partner login */
    @media (max-width: 480px) {
      body {
        padding: 12px;
      }

      .login-card {
        padding: 24px 18px;
        max-width: 360px;
        border-radius: 16px;
      }

      .login-logo {
        margin-bottom: 20px;
      }

      .login-logo i {
        font-size: 40px;
      }

      .login-logo h1 {
        font-size: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="login-logo">
      <i class="fas fa-handshake"></i>
      <h1>KeyShield Partner</h1>
      <p>Партнерский кабинет</p>
    </div>

    ${errorMsg ? `<div class="alert alert-danger mb-4"><i class="fas fa-exclamation-circle me-2"></i>${errorMsg}</div>` : ''}

    <form method="POST" action="/partner/login">
      <div class="mb-3">
        <label class="form-label">Логин</label>
        <input type="text" class="form-control" name="login" placeholder="Введите логин" required>
      </div>
      <div class="mb-4">
        <label class="form-label">Пароль</label>
        <input type="password" class="form-control" name="password" placeholder="Введите пароль" required>
      </div>
      <button type="submit" class="btn btn-login">
        <i class="fas fa-sign-in-alt me-2"></i>Войти
      </button>
    </form>
  </div>
</body>
</html>
  `;
}

function getDashboardPage(platform, recentDeals, usersCount, dealsByStatus, dailyStats, referralLink, trxRate = 0.28) {
  const stats = platform.stats;

  // Format status counts
  const statusMap = {};
  dealsByStatus.forEach(s => statusMap[s._id] = s.count);

  const formatDate = (date) => new Date(date).toLocaleString('ru-RU');
  const formatMoney = (num) => num?.toFixed(2) || '0.00';

  // Status labels
  const statusLabels = {
    'created': { text: 'Создана', class: 'secondary' },
    'waiting_for_seller_wallet': { text: 'Ожидание кошелька', class: 'warning' },
    'waiting_for_buyer_wallet': { text: 'Ожидание кошелька', class: 'warning' },
    'waiting_for_deposit': { text: 'Ожидание депозита', class: 'info' },
    'locked': { text: 'Средства заблокированы', class: 'primary' },
    'in_progress': { text: 'В работе', class: 'primary' },
    'completed': { text: 'Завершена', class: 'success' },
    'dispute': { text: 'Спор', class: 'danger' },
    'resolved': { text: 'Спор решён', class: 'warning' },
    'cancelled': { text: 'Отменена', class: 'secondary' }
  };

  return `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Партнерский кабинет - ${platform.name}</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --primary-color: #6366f1;
      --primary-dark: #4f46e5;
      --bg-dark: #0f172a;
      --bg-card: #1e293b;
      --bg-card-hover: #334155;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --info: #3b82f6;
    }
    body {
      background: var(--bg-dark);
      color: var(--text-primary);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
    }
    .navbar {
      background: var(--bg-card) !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding: 15px 0;
    }
    .navbar-brand {
      color: var(--text-primary) !important;
      font-weight: 700;
      font-size: 20px;
    }
    .navbar-brand i {
      color: var(--primary-color);
    }
    .nav-link {
      color: var(--text-secondary) !important;
    }
    .nav-link:hover {
      color: var(--text-primary) !important;
    }
    .stat-card {
      background: var(--bg-card);
      border-radius: 16px;
      padding: 24px;
      border: 1px solid rgba(255, 255, 255, 0.05);
      transition: all 0.3s;
    }
    .stat-card:hover {
      transform: translateY(-4px);
      border-color: var(--primary-color);
      box-shadow: 0 10px 30px rgba(99, 102, 241, 0.2);
    }
    .stat-icon {
      width: 50px;
      height: 50px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
    }
    .stat-icon.primary { background: rgba(99, 102, 241, 0.2); color: var(--primary-color); }
    .stat-icon.success { background: rgba(16, 185, 129, 0.2); color: var(--success); }
    .stat-icon.warning { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
    .stat-icon.danger { background: rgba(239, 68, 68, 0.2); color: var(--danger); }
    .stat-icon.info { background: rgba(59, 130, 246, 0.2); color: var(--info); }
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--text-primary);
      margin: 10px 0 5px;
    }
    .stat-label {
      color: var(--text-secondary);
      font-size: 14px;
    }
    .card {
      background: var(--bg-card);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 16px;
    }
    .card-header {
      background: transparent;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      padding: 20px 24px;
      color: var(--text-primary);
      font-weight: 600;
    }
    .card-body {
      padding: 24px;
    }
    .table {
      color: var(--text-primary);
      margin: 0;
    }
    .table th {
      border-color: rgba(255, 255, 255, 0.05);
      color: var(--text-secondary);
      font-weight: 500;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .table td {
      border-color: rgba(255, 255, 255, 0.05);
      vertical-align: middle;
      padding: 16px 12px;
    }
    .table tbody tr:hover {
      background: var(--bg-card-hover);
    }
    .badge {
      padding: 6px 12px;
      border-radius: 6px;
      font-weight: 500;
      font-size: 12px;
    }
    .referral-box {
      background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .referral-box h5 {
      color: white;
      margin-bottom: 15px;
    }
    .referral-link {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 10px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .referral-link input {
      background: transparent;
      border: none;
      color: white;
      flex: 1;
      font-size: 14px;
    }
    .referral-link input:focus {
      outline: none;
    }
    .btn-copy {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn-copy:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    .profit-card {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-radius: 16px;
      padding: 24px;
      color: white;
    }
    .profit-card h6 {
      opacity: 0.8;
      margin-bottom: 5px;
    }
    .profit-card .value {
      font-size: 32px;
      font-weight: 700;
    }
    .commission-card {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      border-radius: 16px;
      padding: 24px;
      color: white;
    }
    .tab-content {
      margin-top: 20px;
    }
    .nav-tabs {
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .nav-tabs .nav-link {
      border: none;
      color: var(--text-secondary);
      padding: 12px 20px;
      border-radius: 8px 8px 0 0;
    }
    .nav-tabs .nav-link.active {
      background: var(--bg-card);
      color: var(--primary-color);
      border-bottom: 2px solid var(--primary-color);
    }
    .channel-badge {
      background: rgba(99, 102, 241, 0.2);
      color: var(--primary-color);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 13px;
    }
          /* Responsive layout for partner dashboard */
    @media (max-width: 992px) {
      .navbar .container {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }

      .navbar .d-flex {
        width: 100%;
        justify-content: space-between;
        flex-wrap: wrap;
      }
    }

    @media (max-width: 768px) {
      .container {
        padding-left: 16px;
        padding-right: 16px;
      }

      .container.py-4 {
        padding-top: 16px !important;
        padding-bottom: 24px !important;
      }

      .referral-box {
        padding: 16px;
      }

      .referral-link {
        flex-direction: column;
        align-items: stretch;
      }

      .referral-link input {
        font-size: 13px;
      }

      .btn-copy {
        width: 100%;
        justify-content: center;
      }

      .stat-card {
        padding: 16px;
        margin-bottom: 8px;
      }

      .profit-card,
      .commission-card {
        padding: 18px;
      }

      .tab-content {
        margin-top: 16px;
      }

      .table-responsive {
        max-height: 60vh;
        overflow-y: auto;
      }
    }

    @media (max-width: 576px) {
      .navbar-brand {
        font-size: 18px;
      }

      .referral-box h5 {
        font-size: 16px;
      }

      .stat-card .stat-value {
        font-size: 24px;
      }
    }

  </style>
</head>
<body>
  <nav class="navbar navbar-expand-lg">
    <div class="container">
      <a class="navbar-brand" href="/partner/dashboard">
        <i class="fas fa-handshake me-2"></i>KeyShield Partner
      </a>
      <div class="d-flex align-items-center gap-3">
        <span class="channel-badge">
          <i class="fab fa-telegram me-1"></i>${platform.telegramChannel}
        </span>
        <span class="text-secondary">${platform.name}</span>
        <a href="/partner/logout" class="btn btn-outline-danger btn-sm">
          <i class="fas fa-sign-out-alt"></i>
        </a>
      </div>
    </div>
  </nav>

  <div class="container py-4">
    <!-- Referral Link -->
    <div class="referral-box">
      <h5><i class="fas fa-link me-2"></i>Ваша реферальная ссылка</h5>
      <div class="referral-link">
        <input type="text" id="refLink" value="${referralLink}" readonly>
        <button class="btn-copy" onclick="copyLink()">
          <i class="fas fa-copy me-1"></i>Копировать
        </button>
      </div>
      <small class="d-block mt-2" style="opacity: 0.7;">
        Все пользователи, перешедшие по этой ссылке, будут привязаны к вашей платформе навсегда
      </small>
    </div>

    <!-- Main Stats -->
    <div class="row g-4 mb-4">
      <div class="col-md-3">
        <div class="stat-card">
          <div class="stat-icon primary">
            <i class="fas fa-users"></i>
          </div>
          <div class="stat-value">${stats.totalUsers}</div>
          <div class="stat-label">Пользователей</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-card">
          <div class="stat-icon info">
            <i class="fas fa-handshake"></i>
          </div>
          <div class="stat-value">${stats.totalDeals}</div>
          <div class="stat-label">Всего сделок</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-card">
          <div class="stat-icon success">
            <i class="fas fa-check-circle"></i>
          </div>
          <div class="stat-value">${stats.completedDeals}</div>
          <div class="stat-label">Завершенных</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="stat-card">
          <div class="stat-icon warning">
            <i class="fas fa-spinner"></i>
          </div>
          <div class="stat-value">${stats.activeDeals}</div>
          <div class="stat-label">Активных</div>
        </div>
      </div>
    </div>

    <!-- Financial Stats -->
    <div class="row g-4 mb-4">
      <div class="col-md-4">
        <div class="stat-card">
          <div class="d-flex justify-content-between align-items-start mb-3">
            <div class="stat-icon info">
              <i class="fas fa-chart-line"></i>
            </div>
            <span class="badge bg-info">Объем</span>
          </div>
          <div class="stat-value">${formatMoney(stats.totalVolume)} USDT</div>
          <div class="stat-label">Общий объем сделок</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="stat-card">
          <div class="d-flex justify-content-between align-items-start mb-3">
            <div class="stat-icon success">
              <i class="fas fa-coins"></i>
            </div>
            <span class="badge bg-success">Комиссия</span>
          </div>
          <div class="stat-value">${formatMoney(stats.totalCommission)} USDT</div>
          <div class="stat-label">Всего комиссий</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="stat-card">
          <div class="d-flex justify-content-between align-items-start mb-3">
            <div class="stat-icon danger">
              <i class="fas fa-gas-pump"></i>
            </div>
            <span class="badge bg-danger">Расходы</span>
          </div>
          <div class="stat-value">${formatMoney(stats.totalTrxSpent)} TRX</div>
          <div class="stat-label">≈ ${formatMoney(stats.totalTrxSpentUsdt)} USDT на активацию</div>
          <div class="stat-label" style="font-size: 10px; color: #64748b; margin-top: 5px;">Курс: 1 TRX = ${trxRate.toFixed(4)} USDT</div>
        </div>
      </div>
    </div>

    <!-- Profit Cards -->
    <div class="row g-4 mb-4">
      <div class="col-md-6">
        <div class="profit-card">
          <h6><i class="fas fa-chart-pie me-2"></i>Чистая прибыль сервиса</h6>
          <div class="value">${formatMoney(stats.netProfit)} USDT</div>
          <small>Комиссия - Расходы на активацию</small>
        </div>
      </div>
      <div class="col-md-6">
        <div class="commission-card">
          <h6><i class="fas fa-hand-holding-usd me-2"></i>Ваш заработок (${platform.commissionPercent}%)</h6>
          <div class="value">${formatMoney(stats.platformEarnings)} USDT</div>
          <small>${platform.commissionPercent}% от чистой прибыли</small>
        </div>
      </div>
    </div>

    <!-- Deals by Status -->
    <div class="row g-4 mb-4">
      <div class="col-md-6">
        <div class="card">
          <div class="card-header">
            <i class="fas fa-chart-pie me-2"></i>Статусы сделок
          </div>
          <div class="card-body">
            <div class="row g-3">
              <div class="col-6">
                <div class="d-flex align-items-center gap-2">
                  <span class="badge bg-success">${statusMap['completed'] || 0}</span>
                  <span class="text-secondary">Завершены</span>
                </div>
              </div>
              <div class="col-6">
                <div class="d-flex align-items-center gap-2">
                  <span class="badge bg-primary">${statusMap['in_progress'] || 0}</span>
                  <span class="text-secondary">В работе</span>
                </div>
              </div>
              <div class="col-6">
                <div class="d-flex align-items-center gap-2">
                  <span class="badge bg-info">${statusMap['waiting_for_deposit'] || 0}</span>
                  <span class="text-secondary">Ожидают депозит</span>
                </div>
              </div>
              <div class="col-6">
                <div class="d-flex align-items-center gap-2">
                  <span class="badge bg-danger">${statusMap['dispute'] || 0}</span>
                  <span class="text-secondary">Споры</span>
                </div>
              </div>
              <div class="col-6">
                <div class="d-flex align-items-center gap-2">
                  <span class="badge bg-secondary">${statusMap['cancelled'] || 0}</span>
                  <span class="text-secondary">Отменены</span>
                </div>
              </div>
              <div class="col-6">
                <div class="d-flex align-items-center gap-2">
                  <span class="badge bg-warning">${statusMap['resolved'] || 0}</span>
                  <span class="text-secondary">Споры решены</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="card">
          <div class="card-header">
            <i class="fas fa-chart-bar me-2"></i>Статистика за 30 дней
          </div>
          <div class="card-body">
            <canvas id="dailyChart" height="150"></canvas>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Deals -->
    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center">
        <span><i class="fas fa-list me-2"></i>Последние сделки</span>
        <span class="badge bg-primary">${recentDeals.length}</span>
      </div>
      <div class="card-body p-0">
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Название</th>
                <th>Сумма</th>
                <th>Комиссия</th>
                <th>Статус</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              ${recentDeals.length === 0 ? `
                <tr>
                  <td colspan="6" class="text-center text-secondary py-4">
                    <i class="fas fa-inbox fa-2x mb-2 d-block"></i>
                    Пока нет сделок
                  </td>
                </tr>
              ` : recentDeals.map(deal => `
                <tr>
                  <td><code>${deal.dealId}</code></td>
                  <td>${deal.productName?.substring(0, 30)}${deal.productName?.length > 30 ? '...' : ''}</td>
                  <td><strong>${deal.amount} ${deal.asset}</strong></td>
                  <td>${deal.commission} ${deal.asset}</td>
                  <td>
                    <span class="badge bg-${statusLabels[deal.status]?.class || 'secondary'}">
                      ${statusLabels[deal.status]?.text || deal.status}
                    </span>
                  </td>
                  <td class="text-secondary">${formatDate(deal.createdAt)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Copy referral link
    function copyLink() {
      const input = document.getElementById('refLink');
      input.select();
      document.execCommand('copy');

      const btn = event.target.closest('.btn-copy');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-check me-1"></i>Скопировано!';
      setTimeout(() => {
        btn.innerHTML = originalText;
      }, 2000);
    }

    // Daily chart
    const dailyData = ${JSON.stringify(dailyStats)};
    const ctx = document.getElementById('dailyChart').getContext('2d');

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: dailyData.map(d => d._id.split('-').slice(1).join('.')),
        datasets: [{
          label: 'Сделки',
          data: dailyData.map(d => d.deals),
          backgroundColor: 'rgba(99, 102, 241, 0.5)',
          borderColor: 'rgb(99, 102, 241)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8' }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', maxRotation: 45 }
          }
        }
      }
    });

    // Auto-refresh stats every 60 seconds
    setInterval(async () => {
      try {
        const response = await fetch('/partner/api/stats');
        const data = await response.json();
        if (data.success) {
          // Update stats if needed
          console.log('Stats refreshed');
        }
      } catch (e) {
        console.error('Failed to refresh stats');
      }
    }, 60000);
  </script>
</body>
</html>
  `;
}

module.exports = router;
