const mongoose = require('mongoose');

/**
 * BlogView - уникальные просмотры постов
 * Предотвращает накрутку просмотров от одного посетителя
 */
const blogViewSchema = new mongoose.Schema({
  // ID поста
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlogPost',
    required: true
  },

  // Идентификатор посетителя (fingerprint: IP + User-Agent + Accept-Language)
  visitorId: {
    type: String,
    required: true
  },

  // IP адрес (для аналитики)
  ipAddress: {
    type: String,
    default: ''
  },

  // User-Agent (для аналитики)
  userAgent: {
    type: String,
    default: ''
  },

  // Referer (откуда пришёл)
  referer: {
    type: String,
    default: ''
  },

  // Timestamp
  viewedAt: {
    type: Date,
    default: Date.now
  }
});

// Уникальный индекс: один просмотр на пост от одного посетителя
blogViewSchema.index(
  { postId: 1, visitorId: 1 },
  { unique: true }
);

// Индекс для подсчёта просмотров
blogViewSchema.index({ postId: 1 });

// Индекс по времени (для аналитики)
blogViewSchema.index({ viewedAt: -1 });

/**
 * Статический метод: записать просмотр (если ещё не было)
 * Возвращает true если просмотр засчитан, false если уже был
 */
blogViewSchema.statics.trackView = async function(postId, visitorId, ipAddress = '', userAgent = '', referer = '') {
  try {
    await this.create({
      postId,
      visitorId,
      ipAddress,
      userAgent,
      referer
    });

    // Обновляем счётчик просмотров в посте
    await this.updatePostViews(postId);

    return true;
  } catch (err) {
    // Duplicate key error - просмотр уже был
    if (err.code === 11000) {
      return false;
    }
    throw err;
  }
};

/**
 * Статический метод: обновить счётчик просмотров поста
 */
blogViewSchema.statics.updatePostViews = async function(postId) {
  const BlogPost = mongoose.model('BlogPost');

  const viewsCount = await this.countDocuments({ postId });

  await BlogPost.findByIdAndUpdate(postId, {
    views: viewsCount
  });

  return viewsCount;
};

/**
 * Статический метод: получить количество просмотров поста
 */
blogViewSchema.statics.getViewsCount = async function(postId) {
  return await this.countDocuments({ postId });
};

/**
 * Статический метод: проверить, просматривал ли посетитель пост
 */
blogViewSchema.statics.hasViewed = async function(postId, visitorId) {
  const view = await this.findOne({ postId, visitorId });
  return !!view;
};

/**
 * Статический метод: получить статистику просмотров за период
 */
blogViewSchema.statics.getViewsStats = async function(postId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await this.aggregate([
    {
      $match: {
        postId: mongoose.Types.ObjectId(postId),
        viewedAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$viewedAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  return stats;
};

const BlogView = mongoose.model('BlogView', blogViewSchema);

module.exports = BlogView;
