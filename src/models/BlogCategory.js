const mongoose = require('mongoose');

/**
 * BlogCategory - категории блога
 * URL: /blog/category/:slug
 */
const blogCategorySchema = new mongoose.Schema({
  // Основные поля
  name: {
    type: String,
    required: true,
    maxlength: 100,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 100
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

  // Денормализованный счётчик постов (для производительности)
  postsCount: {
    type: Number,
    default: 0
  },

  // Порядок сортировки (для ручной сортировки)
  sortOrder: {
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
blogCategorySchema.index({ slug: 1 }, { unique: true });
blogCategorySchema.index({ sortOrder: 1, name: 1 });

// Автогенерация SEO полей если не указаны
blogCategorySchema.pre('save', function(next) {
  if (!this.seoTitle) {
    this.seoTitle = `${this.name} - Блог KeyShield`;
  }
  if (!this.seoDescription) {
    this.seoDescription = `Статьи в категории "${this.name}" на блоге KeyShield.`;
  }
  if (!this.canonical) {
    this.canonical = `https://keyshield.me/blog/category/${this.slug}`;
  }
  next();
});

// Метод обновления счётчика постов
blogCategorySchema.methods.updatePostsCount = async function() {
  const BlogPost = mongoose.model('BlogPost');
  this.postsCount = await BlogPost.countDocuments({
    category: this._id,
    status: 'published'
  });
  await this.save();
};

// Статический метод для получения категорий с кол-вом постов
blogCategorySchema.statics.getWithPostsCount = async function() {
  return this.find().sort({ sortOrder: 1, name: 1 }).lean();
};

const BlogCategory = mongoose.model('BlogCategory', blogCategorySchema);

module.exports = BlogCategory;
