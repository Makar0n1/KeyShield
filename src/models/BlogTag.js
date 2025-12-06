const mongoose = require('mongoose');

/**
 * BlogTag - теги блога
 * URL: /tag/:slug
 */
const blogTagSchema = new mongoose.Schema({
  // Основные поля
  name: {
    type: String,
    required: true,
    maxlength: 50,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 50
  },
  description: {
    type: String,
    default: '',
    maxlength: 50000 // Rich text статья
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
    default: '',
    maxlength: 70
  },
  seoDescription: {
    type: String,
    default: '',
    maxlength: 160
  },
  canonical: {
    type: String,
    default: ''
  },

  // Денормализованный счётчик постов
  postsCount: {
    type: Number,
    default: 0
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Индексы
blogTagSchema.index({ slug: 1 }, { unique: true });
blogTagSchema.index({ postsCount: -1 }); // Для сортировки по популярности
blogTagSchema.index({ name: 1 });

// Автогенерация SEO полей если не указаны
blogTagSchema.pre('save', function(next) {
  if (!this.seoTitle) {
    this.seoTitle = `${this.name} - Блог KeyShield`;
  }
  if (!this.seoDescription) {
    this.seoDescription = `Статьи с тегом "${this.name}" на блоге KeyShield.`;
  }
  if (!this.canonical) {
    this.canonical = `https://keyshield.me/tag/${this.slug}`;
  }
  next();
});

// Метод обновления счётчика постов
blogTagSchema.methods.updatePostsCount = async function() {
  const BlogPost = mongoose.model('BlogPost');
  this.postsCount = await BlogPost.countDocuments({
    tags: this._id,
    status: 'published'
  });
  await this.save();
};

// Статический метод для получения популярных тегов
blogTagSchema.statics.getPopular = async function(limit = 20) {
  return this.find({ postsCount: { $gt: 0 } })
    .sort({ postsCount: -1 })
    .limit(limit)
    .lean();
};

// Статический метод для получения всех тегов
blogTagSchema.statics.getAll = async function() {
  return this.find().sort({ name: 1 }).lean();
};

const BlogTag = mongoose.model('BlogTag', blogTagSchema);

module.exports = BlogTag;
