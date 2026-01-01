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
  seoKeywords: {
    type: String,
    default: '',
    maxlength: 500
  },
  canonical: {
    type: String,
    default: ''
  },

  // Interlinking toggle
  enableInterlinking: {
    type: Boolean,
    default: true
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
  shares: {
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

  // Notification tracking
  notificationSentAt: {
    type: Date,
    default: null
  },
  notificationSentCount: {
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
  // Canonical - auto-update when slug changes or empty
  const WEB_DOMAIN = process.env.WEB_DOMAIN || 'keyshield.me';
  const SITE_URL = WEB_DOMAIN.includes('localhost') ? `http://${WEB_DOMAIN}` : `https://${WEB_DOMAIN}`;
  const expectedCanonical = `${SITE_URL}/blog/${this.slug}`;

  // Update canonical if: empty, or slug changed (detected by old canonical not matching new slug)
  if (!this.canonical || (this.canonical.includes('/blog/') && !this.canonical.endsWith(`/blog/${this.slug}`))) {
    this.canonical = expectedCanonical;
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

  // Category can be ObjectId or slug string
  if (category) {
    if (mongoose.Types.ObjectId.isValid(category)) {
      query.category = category;
    } else {
      // It's a slug - find category first
      const BlogCategory = mongoose.model('BlogCategory');
      const cat = await BlogCategory.findOne({ slug: category });
      if (cat) {
        query.category = cat._id;
      } else {
        // Category not found - return empty
        return { posts: [], total: 0, page, limit, totalPages: 0 };
      }
    }
  }

  // Tag can be ObjectId or slug string
  if (tag) {
    if (mongoose.Types.ObjectId.isValid(tag)) {
      query.tags = tag;
    } else {
      // It's a slug - find tag first
      const BlogTag = mongoose.model('BlogTag');
      const t = await BlogTag.findOne({ slug: tag });
      if (t) {
        query.tags = t._id;
      } else {
        return { posts: [], total: 0, page, limit, totalPages: 0 };
      }
    }
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

// Статический метод: поиск по заголовку, описанию и контенту с приоритизацией
blogPostSchema.statics.search = async function(query, limit = 10) {
  // Экранирование спецсимволов regex
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedQuery, 'i');

  // Находим все совпадения
  const posts = await this.find({
    status: 'published',
    $or: [
      { title: { $regex: regex } },
      { summary: { $regex: regex } },
      { content: { $regex: regex } }
    ]
  })
    .populate('category', 'name slug')
    .select('title slug summary content coverImage coverImageAlt category publishedAt createdAt views likes commentsCount readTime')
    .lean();

  // Приоритизация с учетом позиции слова
  // title: 1000000 - позиция (чем раньше, тем выше)
  // summary: 10000 - позиция
  // content: 100 - позиция
  const scored = posts.map(post => {
    let score = 0;
    let matchSource = 'content'; // где найдено совпадение для отображения

    const titleLower = (post.title || '').toLowerCase();
    const summaryLower = (post.summary || '').toLowerCase();
    const contentLower = (post.content || '').toLowerCase();
    const queryLower = query.toLowerCase();

    const titlePos = titleLower.indexOf(queryLower);
    const summaryPos = summaryLower.indexOf(queryLower);
    const contentPos = contentLower.indexOf(queryLower);

    if (titlePos !== -1) {
      score = 1000000 - titlePos; // title - самый приоритетный
      matchSource = 'title';
    } else if (summaryPos !== -1) {
      score = 10000 - summaryPos; // summary - второй
      matchSource = 'summary';
    } else if (contentPos !== -1) {
      score = 100 - Math.min(contentPos / 100, 99); // content - третий
      matchSource = 'content';
    }

    return { ...post, _searchScore: score, _matchSource: matchSource };
  });

  // Сортировка по score (desc)
  scored.sort((a, b) => b._searchScore - a._searchScore);

  return scored.slice(0, limit);
};

// Статический метод: получить последние посты
blogPostSchema.statics.getRecent = async function(limit = 5) {
  return this.find({ status: 'published' })
    .select('_id title slug publishedAt coverImage')
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
