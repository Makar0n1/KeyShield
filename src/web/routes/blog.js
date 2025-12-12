const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Models
const BlogSettings = require('../../models/BlogSettings');
const BlogCategory = require('../../models/BlogCategory');
const BlogTag = require('../../models/BlogTag');
const BlogPost = require('../../models/BlogPost');
const BlogComment = require('../../models/BlogComment');
const BlogVote = require('../../models/BlogVote');
const BlogMedia = require('../../models/BlogMedia');

// Utils
const { slugify, generateUniqueSlug } = require('../../utils/slugify');

// Upload directory - points to client/public/uploads/blog
const UPLOAD_DIR = path.join(__dirname, '../../../client/public/uploads/blog');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `blog-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// ==========================================
// ADMIN ROUTES (require adminAuth middleware)
// ==========================================

// --- Blog Settings ---

// GET /api/admin/blog/settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await BlogSettings.getSettings();
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error fetching blog settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/blog/settings
router.put('/settings', async (req, res) => {
  try {
    const settings = await BlogSettings.updateSettings(req.body);
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error updating blog settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Categories ---

// GET /api/admin/blog/categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await BlogCategory.find().sort({ sortOrder: 1, name: 1 }).lean();
    res.json({ success: true, categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/blog/categories
router.post('/categories', async (req, res) => {
  try {
    const { name, description, coverImage, coverImageAlt, seoTitle, seoDescription, sortOrder } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Generate unique slug
    const baseSlug = slugify(name);
    const slug = await generateUniqueSlug(baseSlug, async (s) => {
      return await BlogCategory.exists({ slug: s });
    });

    const category = new BlogCategory({
      name,
      slug,
      description: description || '',
      coverImage: coverImage || '',
      coverImageAlt: coverImageAlt || '',
      seoTitle: seoTitle || '',
      seoDescription: seoDescription || '',
      sortOrder: sortOrder || 0
    });

    await category.save();
    res.json({ success: true, category });
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/blog/categories/:id
router.put('/categories/:id', async (req, res) => {
  try {
    const category = await BlogCategory.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const { name, slug, description, coverImage, coverImageAlt, seoTitle, seoDescription, sortOrder } = req.body;

    if (name) category.name = name;
    if (slug && slug !== category.slug) {
      // Check if new slug is unique
      const existing = await BlogCategory.findOne({ slug, _id: { $ne: category._id } });
      if (existing) {
        return res.status(400).json({ error: 'Slug already exists' });
      }
      category.slug = slug;
    }
    if (description !== undefined) category.description = description;
    if (coverImage !== undefined) category.coverImage = coverImage;
    if (coverImageAlt !== undefined) category.coverImageAlt = coverImageAlt;
    if (seoTitle !== undefined) category.seoTitle = seoTitle;
    if (seoDescription !== undefined) category.seoDescription = seoDescription;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;

    await category.save();
    res.json({ success: true, category });
  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/blog/categories/:id
router.delete('/categories/:id', async (req, res) => {
  try {
    // Check if category has posts
    const postsCount = await BlogPost.countDocuments({ category: req.params.id });
    if (postsCount > 0) {
      return res.status(400).json({
        error: `Cannot delete category with ${postsCount} posts. Move or delete posts first.`
      });
    }

    await BlogCategory.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Tags ---

// GET /api/admin/blog/tags
router.get('/tags', async (req, res) => {
  try {
    const tags = await BlogTag.find().sort({ name: 1 }).lean();
    res.json({ success: true, tags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/blog/tags
router.post('/tags', async (req, res) => {
  try {
    const { name, description, coverImage, coverImageAlt, seoTitle, seoDescription } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Generate unique slug
    const baseSlug = slugify(name);
    const slug = await generateUniqueSlug(baseSlug, async (s) => {
      return await BlogTag.exists({ slug: s });
    });

    const tag = new BlogTag({
      name,
      slug,
      description: description || '',
      coverImage: coverImage || '',
      coverImageAlt: coverImageAlt || '',
      seoTitle: seoTitle || '',
      seoDescription: seoDescription || ''
    });

    await tag.save();
    res.json({ success: true, tag });
  } catch (error) {
    console.error('Error creating tag:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/blog/tags/:id
router.put('/tags/:id', async (req, res) => {
  try {
    const tag = await BlogTag.findById(req.params.id);
    if (!tag) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    const { name, slug, description, coverImage, coverImageAlt, seoTitle, seoDescription } = req.body;

    if (name) tag.name = name;
    if (slug && slug !== tag.slug) {
      const existing = await BlogTag.findOne({ slug, _id: { $ne: tag._id } });
      if (existing) {
        return res.status(400).json({ error: 'Slug already exists' });
      }
      tag.slug = slug;
    }
    if (description !== undefined) tag.description = description;
    if (coverImage !== undefined) tag.coverImage = coverImage;
    if (coverImageAlt !== undefined) tag.coverImageAlt = coverImageAlt;
    if (seoTitle !== undefined) tag.seoTitle = seoTitle;
    if (seoDescription !== undefined) tag.seoDescription = seoDescription;

    await tag.save();
    res.json({ success: true, tag });
  } catch (error) {
    console.error('Error updating tag:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/blog/tags/:id
router.delete('/tags/:id', async (req, res) => {
  try {
    // Remove tag from all posts
    await BlogPost.updateMany(
      { tags: req.params.id },
      { $pull: { tags: req.params.id } }
    );

    await BlogTag.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Posts ---

// GET /api/admin/blog/posts
router.get('/posts', async (req, res) => {
  try {
    const { status, category, search, limit = 50, skip = 0 } = req.query;

    let query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { title: new RegExp(search, 'i') },
        { summary: new RegExp(search, 'i') }
      ];
    }

    const [posts, total] = await Promise.all([
      BlogPost.find(query)
        .populate('category', 'name slug')
        .populate('tags', 'name slug')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(parseInt(skip))
        .lean(),
      BlogPost.countDocuments(query)
    ]);

    res.json({ success: true, posts, total });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/blog/posts/:id
router.get('/posts/:id', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id)
      .populate('category', 'name slug')
      .populate('tags', 'name slug')
      .lean();

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ success: true, post });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/blog/posts
router.post('/posts', async (req, res) => {
  try {
    const {
      title, summary, content, coverImage, coverImageAlt,
      category, tags, seoTitle, seoDescription, status, publishedAt, faq
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!category) {
      return res.status(400).json({ error: 'Category is required' });
    }

    // Check category exists
    const categoryExists = await BlogCategory.exists({ _id: category });
    if (!categoryExists) {
      return res.status(400).json({ error: 'Category not found' });
    }

    // Generate unique slug
    const baseSlug = slugify(title);
    const slug = await generateUniqueSlug(baseSlug, async (s) => {
      return await BlogPost.exists({ slug: s });
    });

    const post = new BlogPost({
      title,
      slug,
      summary: summary || '',
      content: content || '',
      coverImage: coverImage || '',
      coverImageAlt: coverImageAlt || '',
      category,
      tags: tags || [],
      seoTitle: seoTitle || '',
      seoDescription: seoDescription || '',
      status: status || 'draft',
      publishedAt: publishedAt ? new Date(publishedAt) : null,
      faq: faq || []
    });

    await post.save();

    // Populate for response
    await post.populate('category', 'name slug');
    await post.populate('tags', 'name slug');

    res.json({ success: true, post });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/blog/posts/:id
router.put('/posts/:id', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const {
      title, slug, summary, content, coverImage, coverImageAlt,
      category, tags, seoTitle, seoDescription, status, publishedAt, faq
    } = req.body;

    if (title) post.title = title;
    if (slug && slug !== post.slug) {
      const existing = await BlogPost.findOne({ slug, _id: { $ne: post._id } });
      if (existing) {
        return res.status(400).json({ error: 'Slug already exists' });
      }
      post.slug = slug;
    }
    if (summary !== undefined) post.summary = summary;
    if (content !== undefined) post.content = content;
    if (coverImage !== undefined) post.coverImage = coverImage;
    if (coverImageAlt !== undefined) post.coverImageAlt = coverImageAlt;
    if (category) {
      const categoryExists = await BlogCategory.exists({ _id: category });
      if (!categoryExists) {
        return res.status(400).json({ error: 'Category not found' });
      }
      post.category = category;
    }
    if (tags !== undefined) post.tags = tags;
    if (seoTitle !== undefined) post.seoTitle = seoTitle;
    if (seoDescription !== undefined) post.seoDescription = seoDescription;
    if (status !== undefined) post.status = status;
    if (publishedAt !== undefined) post.publishedAt = publishedAt ? new Date(publishedAt) : null;
    if (faq !== undefined) post.faq = faq;

    await post.save();

    // Populate for response
    await post.populate('category', 'name slug');
    await post.populate('tags', 'name slug');

    res.json({ success: true, post });
  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/blog/posts/:id
router.delete('/posts/:id', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Delete associated comments and votes
    await BlogComment.deleteMany({ postId: post._id });
    await BlogVote.deleteMany({ targetType: 'post', targetId: post._id });

    await post.deleteOne();

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/admin/blog/posts/:id/notify - Send blog notification to all users
router.post('/posts/:id/notify', async (req, res) => {
  try {
    const post = await BlogPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.status !== 'published') {
      return res.status(400).json({ error: 'Only published posts can be notified' });
    }

    const blogNotificationService = require('../../services/blogNotificationService');
    const result = await blogNotificationService.sendBlogNotification(post._id);

    res.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped
    });
  } catch (error) {
    console.error('Error sending blog notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Comments ---

// GET /api/admin/blog/comments
router.get('/comments', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await BlogComment.getAll({
      status: status || null,
      page: parseInt(page),
      limit: parseInt(limit)
    });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/admin/blog/comments/pending - count pending comments
router.get('/comments/pending', async (req, res) => {
  try {
    const count = await BlogComment.countDocuments({ status: 'pending' });
    res.json({ success: true, count });
  } catch (error) {
    console.error('Error fetching pending comments:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/blog/comments/:id - approve/hide comment
router.put('/comments/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'hidden', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const comment = await BlogComment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('postId', 'title slug');

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Update post comments count (findByIdAndUpdate doesn't trigger save hook)
    if (comment.postId) {
      const post = await BlogPost.findById(comment.postId._id || comment.postId);
      if (post) {
        await post.updateCommentsCount();
      }
    }

    res.json({ success: true, comment });
  } catch (error) {
    console.error('Error updating comment:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/blog/comments/:id
router.delete('/comments/:id', async (req, res) => {
  try {
    const comment = await BlogComment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const postId = comment.postId;

    // Delete associated votes
    await BlogVote.deleteMany({ targetType: 'comment', targetId: comment._id });

    await comment.deleteOne();

    // Update post comments count
    if (postId) {
      const post = await BlogPost.findById(postId);
      if (post) {
        await post.updateCommentsCount();
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Media Upload ---

// Helper: get image dimensions
async function getImageDimensions(filepath) {
  try {
    // Use probe-image-size if available, fallback to basic detection
    const buffer = fs.readFileSync(filepath);

    // PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50) {
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return { width, height };
    }

    // JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xFF) break;
        const marker = buffer[offset + 1];
        if (marker === 0xC0 || marker === 0xC2) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        const len = buffer.readUInt16BE(offset + 2);
        offset += 2 + len;
      }
    }

    // GIF
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      const width = buffer.readUInt16LE(6);
      const height = buffer.readUInt16LE(8);
      return { width, height };
    }

    // WebP
    if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') {
      // VP8
      if (buffer.slice(12, 16).toString() === 'VP8 ') {
        const width = buffer.readUInt16LE(26) & 0x3FFF;
        const height = buffer.readUInt16LE(28) & 0x3FFF;
        return { width, height };
      }
      // VP8L
      if (buffer.slice(12, 16).toString() === 'VP8L') {
        const bits = buffer.readUInt32LE(21);
        const width = (bits & 0x3FFF) + 1;
        const height = ((bits >> 14) & 0x3FFF) + 1;
        return { width, height };
      }
    }

    return { width: 0, height: 0 };
  } catch (err) {
    console.error('Error reading image dimensions:', err);
    return { width: 0, height: 0 };
  }
}

// POST /api/admin/blog/upload
router.post('/upload', (req, res) => {
  // Ensure upload directory exists
  if (!fs.existsSync(UPLOAD_DIR)) {
    try {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    } catch (mkdirErr) {
      console.error('Failed to create upload directory:', mkdirErr);
      return res.status(500).json({ error: 'Failed to create upload directory' });
    }
  }

  upload.single('image')(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Max 5MB allowed.' });
      }
      return res.status(400).json({ error: err.message || 'Upload failed' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const url = `/uploads/blog/${req.file.filename}`;
    const filepath = path.join(UPLOAD_DIR, req.file.filename);

    // Get image dimensions
    const { width, height } = await getImageDimensions(filepath);

    // Save to database
    try {
      const media = new BlogMedia({
        filename: req.file.filename,
        originalName: req.file.originalname,
        url,
        mimeType: req.file.mimetype,
        size: req.file.size,
        width,
        height,
        alt: req.body.alt || ''
      });
      await media.save();

      res.json({
        success: true,
        url,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        width,
        height,
        _id: media._id
      });
    } catch (dbErr) {
      console.error('Error saving media to DB:', dbErr);
      // Still return success since file was uploaded
      res.json({
        success: true,
        url,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        width,
        height
      });
    }
  });
});

// GET /api/admin/blog/media
router.get('/media', async (req, res) => {
  try {
    const { page = 1, limit = 100, search, folder } = req.query;

    // First try to get from DB
    let dbFiles = await BlogMedia.find()
      .sort({ createdAt: -1 })
      .lean();

    // If DB is empty, sync from filesystem
    if (dbFiles.length === 0 && fs.existsSync(UPLOAD_DIR)) {
      const fsFiles = fs.readdirSync(UPLOAD_DIR)
        .filter(file => /\.(jpg|jpeg|png|gif|webp)$/i.test(file));

      // Migrate filesystem files to DB
      for (const filename of fsFiles) {
        const filepath = path.join(UPLOAD_DIR, filename);
        const stats = fs.statSync(filepath);
        const { width, height } = await getImageDimensions(filepath);

        // Determine mime type from extension
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp'
        };

        try {
          await BlogMedia.create({
            filename,
            originalName: filename,
            url: `/uploads/blog/${filename}`,
            mimeType: mimeTypes[ext] || 'image/jpeg',
            size: stats.size,
            width,
            height,
            createdAt: stats.birthtime
          });
        } catch (e) {
          // Skip duplicates
          if (e.code !== 11000) console.error('Migration error:', e);
        }
      }

      // Re-fetch from DB
      dbFiles = await BlogMedia.find()
        .sort({ createdAt: -1 })
        .lean();
    }

    // Apply search filter
    let files = dbFiles;
    if (search) {
      const searchLower = search.toLowerCase();
      files = files.filter(f =>
        f.filename.toLowerCase().includes(searchLower) ||
        (f.originalName && f.originalName.toLowerCase().includes(searchLower)) ||
        (f.alt && f.alt.toLowerCase().includes(searchLower))
      );
    }

    if (folder) {
      files = files.filter(f => f.folder === folder);
    }

    res.json({
      success: true,
      files,
      total: files.length
    });
  } catch (error) {
    console.error('Error listing media:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/admin/blog/media/:id - update media metadata (alt, title)
router.put('/media/:id', async (req, res) => {
  try {
    const { alt, title, folder } = req.body;
    const update = {};
    if (alt !== undefined) update.alt = alt;
    if (title !== undefined) update.title = title;
    if (folder !== undefined) update.folder = folder;

    const media = await BlogMedia.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true }
    );

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    res.json({ success: true, media });
  } catch (error) {
    console.error('Error updating media:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/admin/blog/media/:filename
router.delete('/media/:filename', async (req, res) => {
  try {
    const filepath = path.join(UPLOAD_DIR, req.params.filename);

    // Security check: ensure file is in upload dir
    const resolvedPath = path.resolve(filepath);
    const resolvedDir = path.resolve(UPLOAD_DIR);
    if (!resolvedPath.startsWith(resolvedDir)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    // Delete from filesystem
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
    }

    // Delete from database
    await BlogMedia.deleteOne({ filename: req.params.filename });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting media:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Statistics ---

// GET /api/admin/blog/stats
router.get('/stats', async (req, res) => {
  try {
    const [
      postsCount,
      publishedCount,
      draftsCount,
      categoriesCount,
      tagsCount,
      commentsCount,
      pendingCommentsCount,
      totalViews
    ] = await Promise.all([
      BlogPost.countDocuments(),
      BlogPost.countDocuments({ status: 'published' }),
      BlogPost.countDocuments({ status: 'draft' }),
      BlogCategory.countDocuments(),
      BlogTag.countDocuments(),
      BlogComment.countDocuments(),
      BlogComment.countDocuments({ status: 'pending' }),
      BlogPost.aggregate([
        { $group: { _id: null, total: { $sum: '$views' } } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        posts: postsCount,
        published: publishedCount,
        drafts: draftsCount,
        categories: categoriesCount,
        tags: tagsCount,
        comments: commentsCount,
        pendingComments: pendingCommentsCount,
        totalViews: totalViews[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Error fetching blog stats:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
