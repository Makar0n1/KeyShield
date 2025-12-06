const express = require('express');
const router = express.Router();

// Models
const BlogSettings = require('../../models/BlogSettings');
const BlogCategory = require('../../models/BlogCategory');
const BlogTag = require('../../models/BlogTag');
const BlogPost = require('../../models/BlogPost');
const BlogComment = require('../../models/BlogComment');
const BlogVote = require('../../models/BlogVote');

// Rate limiting for comments (simple in-memory)
const commentRateLimits = new Map();

function checkCommentRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxComments = 5;

  if (!commentRateLimits.has(ip)) {
    commentRateLimits.set(ip, []);
  }

  const timestamps = commentRateLimits.get(ip).filter(t => now - t < windowMs);
  commentRateLimits.set(ip, timestamps);

  if (timestamps.length >= maxComments) {
    return false;
  }

  timestamps.push(now);
  return true;
}

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  const windowMs = 60 * 1000;
  for (const [ip, timestamps] of commentRateLimits.entries()) {
    const filtered = timestamps.filter(t => now - t < windowMs);
    if (filtered.length === 0) {
      commentRateLimits.delete(ip);
    } else {
      commentRateLimits.set(ip, filtered);
    }
  }
}, 5 * 60 * 1000);

// ==========================================
// PUBLIC API ROUTES (no auth required)
// ==========================================

// --- Posts ---

// GET /api/blog/posts - list published posts with pagination
router.get('/posts', async (req, res) => {
  try {
    const { page = 1, limit = 6, sort = 'newest', category, tag } = req.query;

    const result = await BlogPost.getPublished({
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      category: category || null,
      tag: tag || null
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/blog/posts/:slug - get single post by slug
router.get('/posts/:slug', async (req, res) => {
  try {
    const post = await BlogPost.getBySlug(req.params.slug);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Increment views (async, don't wait)
    BlogPost.findByIdAndUpdate(post._id, { $inc: { views: 1 } }).exec();

    res.json({ success: true, post });
  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/blog/vote - universal vote endpoint for posts and comments
router.post('/vote', async (req, res) => {
  try {
    const { type, id, voteType, visitorId: clientVisitorId } = req.body;

    if (!type || !['post', 'comment'].includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }
    if (!id) {
      return res.status(400).json({ error: 'ID required' });
    }
    if (!voteType || !['like', 'dislike'].includes(voteType)) {
      return res.status(400).json({ error: 'Invalid vote type' });
    }
    if (!clientVisitorId) {
      return res.status(400).json({ error: 'Visitor ID required' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress || '';
    // Use client fingerprint as visitorId for uniqueness
    const visitorId = clientVisitorId;

    if (type === 'post') {
      const post = await BlogPost.findById(id);
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      await BlogVote.vote('post', post._id, voteType, visitorId, ipAddress);
      const votes = await BlogVote.updatePostVotes(post._id);

      res.json({
        success: true,
        likes: votes.likes,
        dislikes: votes.dislikes
      });
    } else {
      const comment = await BlogComment.findById(id);
      if (!comment) {
        return res.status(404).json({ error: 'Comment not found' });
      }

      await BlogVote.vote('comment', comment._id, voteType, visitorId, ipAddress);
      const votes = await BlogVote.updateCommentVotes(comment._id);

      res.json({
        success: true,
        likes: votes.likes,
        dislikes: votes.dislikes
      });
    }
  } catch (error) {
    console.error('Error voting:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/blog/share - track share clicks
router.post('/share', async (req, res) => {
  try {
    const { postId } = req.body;

    if (!postId) {
      return res.status(400).json({ error: 'Post ID required' });
    }

    const post = await BlogPost.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    await BlogPost.findByIdAndUpdate(postId, { $inc: { shares: 1 } });

    res.json({ success: true, shares: (post.shares || 0) + 1 });
  } catch (error) {
    console.error('Error tracking share:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/blog/posts/:slug/vote - like/dislike post
router.post('/posts/:slug/vote', async (req, res) => {
  try {
    const { voteType, visitorId } = req.body;

    if (!voteType || !['like', 'dislike'].includes(voteType)) {
      return res.status(400).json({ error: 'Invalid vote type' });
    }
    if (!visitorId) {
      return res.status(400).json({ error: 'Visitor ID required' });
    }

    const post = await BlogPost.findOne({ slug: req.params.slug, status: 'published' });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress || '';
    const result = await BlogVote.vote('post', post._id, voteType, visitorId, ipAddress);

    // Update post vote counts
    const votes = await BlogVote.updatePostVotes(post._id);

    res.json({ success: true, action: result.action, votes });
  } catch (error) {
    console.error('Error voting on post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/blog/posts/:slug/comments - get post comments
router.get('/posts/:slug/comments', async (req, res) => {
  try {
    const post = await BlogPost.findOne({ slug: req.params.slug, status: 'published' });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const comments = await BlogComment.getByPost(post._id);
    res.json({ success: true, comments });
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/blog/posts/:slug/comments - add comment
router.post('/posts/:slug/comments', async (req, res) => {
  try {
    const { authorName, authorEmail, content, honeypot } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress || '';

    // Honeypot check (bot trap)
    if (honeypot) {
      return res.status(200).json({ success: true, message: 'Comment submitted for moderation' });
    }

    // Rate limiting
    if (!checkCommentRateLimit(ipAddress)) {
      return res.status(429).json({ error: 'Too many comments. Please wait a minute.' });
    }

    // Validation
    if (!authorName || authorName.length < 2 || authorName.length > 50) {
      return res.status(400).json({ error: 'Name must be 2-50 characters' });
    }
    if (!content || content.length < 10 || content.length > 2000) {
      return res.status(400).json({ error: 'Comment must be 10-2000 characters' });
    }

    // Link spam check (max 2 links)
    const linkCount = (content.match(/https?:\/\//gi) || []).length;
    if (linkCount > 2) {
      return res.status(400).json({ error: 'Too many links in comment' });
    }

    // Find post
    const post = await BlogPost.findOne({ slug: req.params.slug, status: 'published' });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Sanitize content (basic XSS prevention)
    const sanitizedContent = content
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');

    const sanitizedName = authorName
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Create comment
    const comment = new BlogComment({
      postId: post._id,
      authorName: sanitizedName,
      authorEmail: authorEmail || '',
      content: sanitizedContent,
      ipAddress,
      userAgent: req.headers['user-agent'] || '',
      status: 'pending' // All comments require moderation
    });

    await comment.save();

    res.json({
      success: true,
      message: 'Comment submitted for moderation',
      comment: {
        _id: comment._id,
        authorName: comment.authorName,
        content: comment.content,
        createdAt: comment.createdAt,
        status: comment.status
      }
    });
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/blog/comments/:id/vote - like/dislike comment
router.post('/comments/:id/vote', async (req, res) => {
  try {
    const { voteType, visitorId } = req.body;

    if (!voteType || !['like', 'dislike'].includes(voteType)) {
      return res.status(400).json({ error: 'Invalid vote type' });
    }
    if (!visitorId) {
      return res.status(400).json({ error: 'Visitor ID required' });
    }

    const comment = await BlogComment.findOne({ _id: req.params.id, status: 'approved' });
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress || '';
    const result = await BlogVote.vote('comment', comment._id, voteType, visitorId, ipAddress);

    // Update comment vote counts
    const votes = await BlogVote.updateCommentVotes(comment._id);

    res.json({ success: true, action: result.action, votes });
  } catch (error) {
    console.error('Error voting on comment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Categories ---

// GET /api/blog/categories - list all categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await BlogCategory.getWithPostsCount();
    res.json({ success: true, categories });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/blog/categories/:slug - get category with posts
router.get('/categories/:slug', async (req, res) => {
  try {
    const { page = 1, limit = 6, sort = 'newest' } = req.query;

    const category = await BlogCategory.findOne({ slug: req.params.slug }).lean();
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const result = await BlogPost.getPublished({
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      category: category._id
    });

    res.json({ success: true, category, ...result });
  } catch (error) {
    console.error('Error fetching category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Tags ---

// GET /api/blog/tags - list all tags
router.get('/tags', async (req, res) => {
  try {
    const tags = await BlogTag.getAll();
    res.json({ success: true, tags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/blog/tags/popular - get popular tags
router.get('/tags/popular', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const tags = await BlogTag.getPopular(parseInt(limit));
    res.json({ success: true, tags });
  } catch (error) {
    console.error('Error fetching popular tags:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/blog/tags/:slug - get tag with posts
router.get('/tags/:slug', async (req, res) => {
  try {
    const { page = 1, limit = 6, sort = 'newest' } = req.query;

    const tag = await BlogTag.findOne({ slug: req.params.slug }).lean();
    if (!tag) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    const result = await BlogPost.getPublished({
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      tag: tag._id
    });

    res.json({ success: true, tag, ...result });
  } catch (error) {
    console.error('Error fetching tag:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Search ---

// GET /api/blog/search - search posts
router.get('/search', async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return res.json({ success: true, posts: [] });
    }

    // Limit query length for security
    const query = q.substring(0, 100);

    const posts = await BlogPost.search(query, parseInt(limit));
    res.json({ success: true, posts });
  } catch (error) {
    console.error('Error searching posts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Sidebar data ---

// GET /api/blog/sidebar - get all sidebar data in one request
router.get('/sidebar', async (req, res) => {
  try {
    const [categories, tags, recentPosts] = await Promise.all([
      BlogCategory.getWithPostsCount(),
      BlogTag.getPopular(15),
      BlogPost.getRecent(5)
    ]);

    res.json({
      success: true,
      categories,
      tags,
      recentPosts
    });
  } catch (error) {
    console.error('Error fetching sidebar data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- Settings (for SSR pages) ---

// GET /api/blog/settings - get blog settings (public)
router.get('/settings', async (req, res) => {
  try {
    const settings = await BlogSettings.getSettings();
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error fetching blog settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
