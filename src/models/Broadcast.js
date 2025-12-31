const mongoose = require('mongoose');

/**
 * Broadcast - маркетинговые рассылки пользователям бота
 */
const broadcastSchema = new mongoose.Schema({
  // Тестовый режим - отправка только одному пользователю
  isTest: {
    type: Boolean,
    default: false
  },
  testUserId: {
    type: String,
    default: null
  },

  // Контент
  title: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 1000,
    trim: true
  },
  imageUrl: {
    type: String,
    required: true
  },

  // Статус
  status: {
    type: String,
    enum: ['draft', 'sending', 'completed', 'failed'],
    default: 'draft',
    index: true
  },

  // Аналитика
  stats: {
    totalUsers: { type: Number, default: 0 },
    sent: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 }
  },

  // Когда отправлена
  sentAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },

  // Кто создал
  createdBy: {
    type: String,
    default: 'admin'
  }
}, {
  timestamps: true
});

// Индексы
broadcastSchema.index({ status: 1, createdAt: -1 });
broadcastSchema.index({ createdAt: -1 });

const Broadcast = mongoose.model('Broadcast', broadcastSchema);

module.exports = Broadcast;
