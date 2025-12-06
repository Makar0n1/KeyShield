const mongoose = require('mongoose');

/**
 * BlogSettings - настройки главной страницы блога /blog
 * Singleton документ (всегда один)
 */
const blogSettingsSchema = new mongoose.Schema({
  // Основные поля
  title: {
    type: String,
    default: 'Блог KeyShield',
    maxlength: 200
  },
  description: {
    type: String,
    default: '',
    maxlength: 10000 // Rich text
  },

  // Hero секция
  coverImage: {
    type: String,
    default: ''
  },
  coverImageAlt: {
    type: String,
    default: '',
    maxlength: 200
  },

  // SEO
  seoTitle: {
    type: String,
    default: 'Блог KeyShield - Статьи о криптовалюте и безопасных сделках',
    maxlength: 70
  },
  seoDescription: {
    type: String,
    default: 'Полезные статьи о криптовалютах, безопасных сделках, escrow и блокчейне TRON.',
    maxlength: 160
  },
  canonical: {
    type: String,
    default: 'https://keyshield.me/blog'
  },

  // Timestamps
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Всегда обновляем updatedAt
blogSettingsSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Статический метод для получения настроек (singleton)
blogSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

// Статический метод для обновления настроек
blogSettingsSchema.statics.updateSettings = async function(data) {
  let settings = await this.findOne();
  if (!settings) {
    settings = new this(data);
  } else {
    Object.assign(settings, data);
  }
  await settings.save();
  return settings;
};

const BlogSettings = mongoose.model('BlogSettings', blogSettingsSchema);

module.exports = BlogSettings;
