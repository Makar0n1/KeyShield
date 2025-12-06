const mongoose = require('mongoose');

/**
 * BlogPost - статьи блога
 * URL: /blog/:slug
 */
const blogPostSchema = new mongoose.Schema({
  // Основные поля
  title: {
    type: String,
    required: true,
    maxlength: 200,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 200
  },
  summary: {
    type: String,
    default: '',
    maxlength: 500 // Краткое описание для карточек
  },
  content: {
    type: String,
    default: '',
    maxlength: 500000 // Rich text, полный текст статьи
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

  // Связи
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlogCategory',
    required: true,
    index: true
  },
  tags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BlogTag'
  }],

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

  // Статус публикации
  status: {
    type: String,
    enum: ['draft', 'published'],
    default: 'draft',
    index: true
  },

  // Дата публикации (можно редактировать вручную)
  publishedAt: {
    type: Date,
    default: null,
    index: true
  },

  // Статистика
  views: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  },
  dislikes: {
    type: Number,
    default: 0
  },
  commentsCount: {
    type: Number,
    default: 0
  },

  // FAQ блоки для Schema.org FAQPage
  faq: [{
    question: {
      type: String,
      maxlength: 500
    },
    answer: {
      type: String,
      maxlength: 5000
    }
  }],

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
blogPostSchema.index({ slug: 1 }, { unique: true });
blogPostSchema.index({ status: 1, publishedAt: -1 }); // Для списка постов
blogPostSchema.index({ category: 1, status: 1, publishedAt: -1 }); // Для постов категории
blogPostSchema.index({ tags: 1, status: 1, publishedAt: -1 }); // Для постов тега
blogPostSchema.index({ status: 1, views: -1 }); // Для популярных
blogPostSchema.index({ title: 'text', summary: 'text' }); // Для поиска

// Автогенерация SEO полей если не указаны
blogPostSchema.pre('save', function(next) {
  // SEO title
  if (!this.seoTitle) {
    this.seoTitle = this.title.substring(0, 70);
  }
  // SEO description
  if (!this.seoDescription) {
    this.seoDescription = this.summary.substring(0, 160) || this.title;
  }
  // Canonical
  if (!this.canonical) {
    this.canonical = `https://keyshield.me/blog/${this.slug}`;
  }
  // Установить дату публикации при первой публикации
  if (this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  next();
});

// После сохранения обновляем счётчики категории и тегов
blogPostSchema.post('save', async function(doc) {
  try {
    // Обновить счётчик категории
    if (doc.category) {
      const BlogCategory = mongoose.model('BlogCategory');
      const category = await BlogCategory.findById(doc.category);
      if (category) {
        await category.updatePostsCount();
      }
    }
    // Обновить счётчики тегов
    if (doc.tags && doc.tags.length > 0) {
      const BlogTag = mongoose.model('BlogTag');
      for (const tagId of doc.tags) {
        const tag = await BlogTag.findById(tagId);
        if (tag) {
          await tag.updatePostsCount();
        }
      }
    }
  } catch (error) {
    console.error('Error updating posts count:', error);
  }
});

// Метод увеличения просмотров
blogPostSchema.methods.incrementViews = async function() {
  this.views += 1;
  await this.save();
};

// Метод обновления счётчика комментариев
blogPostSchema.methods.updateCommentsCount = async function() {
  const BlogComment = mongoose.model('BlogComment');
  this.commentsCount = await BlogComment.countDocuments({
    postId: this._id,
    status: 'approved'
  });
  await this.save();
};

// Статический метод: получить опубликованные посты с пагинацией
blogPostSchema.statics.getPublished = async function(options = {}) {
  const {
    page = 1,
    limit = 6,
    sort = 'newest', // newest, popular, oldest
    category = null,
    tag = null
  } = options;

  const query = { status: 'published' };

  if (category) {
    query.category = category;
  }
  if (tag) {
    query.tags = tag;
  }

  let sortOption = { publishedAt: -1 }; // newest by default
  if (sort === 'popular') {
    sortOption = { views: -1, publishedAt: -1 };
  } else if (sort === 'oldest') {
    sortOption = { publishedAt: 1 };
  }

  const skip = (page - 1) * limit;

  const [posts, total] = await Promise.all([
    this.find(query)
      .populate('category', 'name slug')
      .populate('tags', 'name slug')
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query)
  ]);

  return {
    posts,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
};

// Статический метод: поиск по заголовку и описанию
blogPostSchema.statics.search = async function(query, limit = 10) {
  // Экранирование спецсимволов regex
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  return this.find({
    status: 'published',
    $or: [
      { title: { $regex: escapedQuery, $options: 'i' } },
      { summary: { $regex: escapedQuery, $options: 'i' } }
    ]
  })
    .populate('category', 'name slug')
    .sort({ publishedAt: -1 })
    .limit(limit)
    .lean();
};

// Статический метод: получить последние посты
blogPostSchema.statics.getRecent = async function(limit = 5) {
  return this.find({ status: 'published' })
    .select('title slug publishedAt coverImage')
    .sort({ publishedAt: -1 })
    .limit(limit)
    .lean();
};

// Статический метод: получить пост по slug
blogPostSchema.statics.getBySlug = async function(slug) {
  return this.findOne({ slug, status: 'published' })
    .populate('category', 'name slug')
    .populate('tags', 'name slug')
    .lean();
};

const BlogPost = mongoose.model('BlogPost', blogPostSchema);

module.exports = BlogPost;
