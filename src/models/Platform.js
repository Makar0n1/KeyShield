const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const platformSchema = new mongoose.Schema({
  // Уникальный код платформы для реферальной ссылки
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },

  // Название платформы
  name: {
    type: String,
    required: true,
    trim: true
  },

  // Телеграм канал платформы
  telegramChannel: {
    type: String,
    required: true,
    trim: true
  },

  // Логин для доступа к кабинету
  login: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  // Хэш пароля
  passwordHash: {
    type: String,
    required: true
  },

  // Процент комиссии платформы от чистой прибыли
  commissionPercent: {
    type: Number,
    default: 10
  },

  // Статус платформы
  isActive: {
    type: Boolean,
    default: true
  },

  // Статистика
  stats: {
    totalUsers: { type: Number, default: 0 },
    totalDeals: { type: Number, default: 0 },
    completedDeals: { type: Number, default: 0 },
    cancelledDeals: { type: Number, default: 0 },
    disputedDeals: { type: Number, default: 0 },
    activeDeals: { type: Number, default: 0 },

    // Финансы (в USDT)
    totalVolume: { type: Number, default: 0 },        // Общий объём сделок
    totalCommission: { type: Number, default: 0 },    // Сколько комиссии получено
    totalTrxSpent: { type: Number, default: 0 },      // Потрачено TRX на активацию
    totalTrxSpentUsdt: { type: Number, default: 0 },  // То же в USDT
    netProfit: { type: Number, default: 0 },          // Чистая прибыль
    platformEarnings: { type: Number, default: 0 }    // Заработок платформы (10% от прибыли)
  },

  // Логи активности
  activityLog: [{
    action: String,
    details: mongoose.Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now }
  }],

  createdAt: {
    type: Date,
    default: Date.now
  },

  lastLoginAt: Date
});

// Генерация уникального кода платформы
platformSchema.statics.generateCode = function() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
};

// Хэширование пароля перед сохранением
platformSchema.pre('save', async function(next) {
  if (this.isModified('passwordHash') && !this.passwordHash.startsWith('$2')) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 10);
  }
  next();
});

// Проверка пароля
platformSchema.methods.checkPassword = async function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

// Добавление лога активности
platformSchema.methods.addLog = function(action, details = {}) {
  this.activityLog.push({ action, details });
  // Храним только последние 1000 записей
  if (this.activityLog.length > 1000) {
    this.activityLog = this.activityLog.slice(-1000);
  }
};

// Получение реферальной ссылки
platformSchema.methods.getReferralLink = function(botUsername) {
  return `https://t.me/${botUsername}?start=ref_${this.code}`;
};

// Обновление статистики
platformSchema.methods.updateStats = async function() {
  const User = mongoose.model('User');
  const Deal = mongoose.model('Deal');

  // Подсчёт пользователей
  this.stats.totalUsers = await User.countDocuments({ platformId: this._id });

  // Подсчёт сделок
  const dealStats = await Deal.aggregate([
    { $match: { platformId: this._id } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        volume: { $sum: '$amount' },
        commission: { $sum: '$commission' }
      }
    }
  ]);

  this.stats.totalDeals = 0;
  this.stats.completedDeals = 0;
  this.stats.cancelledDeals = 0;
  this.stats.disputedDeals = 0;
  this.stats.activeDeals = 0;
  this.stats.totalVolume = 0;
  this.stats.totalCommission = 0;

  for (const stat of dealStats) {
    this.stats.totalDeals += stat.count;
    this.stats.totalVolume += stat.volume || 0;

    switch (stat._id) {
      case 'completed':
        this.stats.completedDeals = stat.count;
        // Partner commission from completed deals
        this.stats.totalCommission += stat.commission || 0;
        break;
      case 'resolved':
        // Partner commission from resolved deals too
        this.stats.totalCommission += stat.commission || 0;
        break;
      // NOTE: 'expired' deals do NOT count for partner commission!
      case 'cancelled':
        this.stats.cancelledDeals = stat.count;
        break;
      case 'disputed':
        this.stats.disputedDeals = stat.count;
        break;
      default:
        if (['pending', 'waiting_deposit', 'funded', 'in_progress'].includes(stat._id)) {
          this.stats.activeDeals += stat.count;
        }
    }
  }

  // Расчёт расходов на TRX (подсчитываем сделки где был создан кошелёк)
  const trxDeals = await Deal.countDocuments({
    platformId: this._id,
    'escrowWallet.address': { $exists: true }
  });

  const TRX_ACTIVATION_COST = 1.1; // TRX за активацию
  this.stats.totalTrxSpent = trxDeals * TRX_ACTIVATION_COST;

  // Конвертация TRX в USDT (примерный курс, в реальности нужно брать с биржи)
  const TRX_TO_USDT = 0.12; // ~$0.12 за 1 TRX
  this.stats.totalTrxSpentUsdt = this.stats.totalTrxSpent * TRX_TO_USDT;

  // Чистая прибыль
  this.stats.netProfit = this.stats.totalCommission - this.stats.totalTrxSpentUsdt;

  // Заработок платформы (10% от чистой прибыли)
  this.stats.platformEarnings = Math.max(0, this.stats.netProfit * (this.commissionPercent / 100));

  await this.save();
};

const Platform = mongoose.model('Platform', platformSchema);

module.exports = Platform;
