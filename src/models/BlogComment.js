const mongoose = require('mongoose');

/**
 * BlogComment - комментарии к постам
 */
const blogCommentSchema = new mongoose.Schema({
  // Связь с постом
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlogPost',
    required: true,
    index: true
  },

  // Автор (без регистрации)
  authorName: {
    type: String,
    required: true,
    minlength: 2,
    maxlength: 50,
    trim: true
  },
  authorEmail: {
    type: String,
    default: '',
    maxlength: 100,
    trim: true,
    lowercase: true
  },

  // Контент комментария
  content: {
    type: String,
    required: true,
    minlength: 10,
    maxlength: 2000,
    trim: true
  },

  // Лайки/дизлайки
  likes: {
    type: Number,
    default: 0
  },
  dislikes: {
    type: Number,
    default: 0
  },

  // Модерация
  status: {
    type: String,
    enum: ['pending', 'approved', 'hidden'],
    default: 'pending',
    index: true
  },

  // Антиспам данные
  ipAddress: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: '',
    maxlength: 500
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Индексы
blogCommentSchema.index({ postId: 1, status: 1, createdAt: -1 }); // Для списка комментариев поста
blogCommentSchema.index({ status: 1, createdAt: -1 }); // Для модерации
blogCommentSchema.index({ ipAddress: 1, createdAt: -1 }); // Для rate limiting

// После сохранения/удаления обновляем счётчик комментариев поста
blogCommentSchema.post('save', async function(doc) {
  try {
    const BlogPost = mongoose.model('BlogPost');
    const post = await BlogPost.findById(doc.postId);
    if (post) {
      await post.updateCommentsCount();
    }
  } catch (error) {
    console.error('Error updating comments count:', error);
  }
});

blogCommentSchema.post('remove', async function(doc) {
  try {
    const BlogPost = mongoose.model('BlogPost');
    const post = await BlogPost.findById(doc.postId);
    if (post) {
      await post.updateCommentsCount();
    }
  } catch (error) {
    console.error('Error updating comments count:', error);
  }
});

// Статический метод: получить комментарии поста
blogCommentSchema.statics.getByPost = async function(postId, includeAll = false) {
  const query = { postId };
  if (!includeAll) {
    query.status = 'approved';
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .lean();
};

// Статический метод: проверка rate limit (max 5 комментариев в минуту с IP)
blogCommentSchema.statics.checkRateLimit = async function(ipAddress) {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const count = await this.countDocuments({
    ipAddress,
    createdAt: { $gte: oneMinuteAgo }
  });
  return count < 5;
};

// Статический метод: получить комментарии для модерации
blogCommentSchema.statics.getPending = async function() {
  return this.find({ status: 'pending' })
    .populate('postId', 'title slug')
    .sort({ createdAt: -1 })
    .lean();
};

// Статический метод: получить все комментарии (для админки)
blogCommentSchema.statics.getAll = async function(options = {}) {
  const { page = 1, limit = 20, status = null } = options;

  const query = {};
  if (status) {
    query.status = status;
  }

  const skip = (page - 1) * limit;

  const [comments, total] = await Promise.all([
    this.find(query)
      .populate('postId', 'title slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    comments,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
};

const BlogComment = mongoose.model('BlogComment', blogCommentSchema);

module.exports = BlogComment;
