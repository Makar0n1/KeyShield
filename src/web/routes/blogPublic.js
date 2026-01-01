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
    const { page = 1, limit = 6, sort = 'newest', category, tag, q } = req.query;

    // If search query provided, use search method with prioritization
    if (q && q.length >= 3) {
      const query = q.substring(0, 100);
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);

      // Get all search results (sorted by priority)
      const allResults = await BlogPost.search(query, 100);

      // Paginate results
      const total = allResults.length;
      const totalPages = Math.ceil(total / limitNum);
      const skip = (pageNum - 1) * limitNum;
      const posts = allResults.slice(skip, skip + limitNum);

      return res.json({
        success: true,
        posts,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages
      });
    }

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
      // Голосование + инкремент за 2 запроса вместо 5
      const result = await BlogVote.vote('post', id, voteType, visitorId, ipAddress);
      const votes = await BlogVote.updatePostVotesIncrement(id, result.delta);

      res.json({
        success: true,
        likes: votes.likes,
        dislikes: votes.dislikes
      });
    } else {
      // Голосование + инкремент за 2 запроса
      const result = await BlogVote.vote('comment', id, voteType, visitorId, ipAddress);
      const votes = await BlogVote.updateCommentVotesIncrement(id, result.delta);

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

// --- Interlinking data ---

// GET /api/blog/interlinking/:postId - get smart interlinking suggestions
// Returns 2 posts optimized for SEO: mix of popular + new/unpopular
router.get('/interlinking/:postId', async (req, res) => {
  try {
    const { postId } = req.params;

    // Get current post to understand its stats
    const currentPost = await BlogPost.findById(postId)
      .select('views likes publishedAt')
      .lean();

    if (!currentPost) {
      return res.json({ success: true, posts: [] });
    }

    // Get all other published posts with stats
    const allPosts = await BlogPost.getForInterlinking(postId);

    if (allPosts.length === 0) {
      return res.json({ success: true, posts: [] });
    }

    if (allPosts.length === 1) {
      return res.json({ success: true, posts: allPosts });
    }

    // Calculate engagement score for each post
    const postsWithScore = allPosts.map(post => {
      const views = post.views || 0;
      const likes = post.likes || 0;
      // Score = views + likes*10 (likes are more valuable)
      const engagementScore = views + (likes * 10);
      const publishedAt = new Date(post.publishedAt);
      const ageInDays = (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60 * 24);

      return {
        ...post,
        engagementScore,
        ageInDays,
        isNew: ageInDays <= 14, // Published in last 2 weeks
        isOld: ageInDays > 30,  // Older than 1 month
      };
    });

    // Sort by engagement score
    const sortedByEngagement = [...postsWithScore].sort((a, b) => b.engagementScore - a.engagementScore);

    // Determine current post type
    const currentViews = currentPost.views || 0;
    const currentLikes = currentPost.likes || 0;
    const currentScore = currentViews + (currentLikes * 10);
    const currentAge = (Date.now() - new Date(currentPost.publishedAt).getTime()) / (1000 * 60 * 60 * 24);

    // Calculate median score for comparison
    const scores = postsWithScore.map(p => p.engagementScore);
    const medianScore = scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)];

    const isPopularPost = currentScore > medianScore;
    const isNewPost = currentAge <= 14;
    const isNewestPost = currentAge <= 7 || postsWithScore.every(p => p.ageInDays >= currentAge);

    let selectedPosts = [];

    if (isNewestPost || isNewPost) {
      // NEW POST STRATEGY: Link to popular old posts to gain authority
      // Pick 1 most popular + 1 moderately popular (for diversity)
      const popularPosts = sortedByEngagement.filter(p => p.isOld || p.engagementScore > medianScore);
      if (popularPosts.length >= 2) {
        selectedPosts = [popularPosts[0], popularPosts[Math.floor(popularPosts.length / 2)]];
      } else if (popularPosts.length === 1) {
        selectedPosts = [popularPosts[0]];
        // Add any other post
        const other = sortedByEngagement.find(p => p._id.toString() !== popularPosts[0]._id.toString());
        if (other) selectedPosts.push(other);
      } else {
        selectedPosts = sortedByEngagement.slice(0, 2);
      }
    } else if (isPopularPost) {
      // POPULAR POST STRATEGY: Link to new posts + unpopular to boost them
      const newPosts = postsWithScore.filter(p => p.isNew);
      const unpopularPosts = sortedByEngagement.slice(-Math.ceil(sortedByEngagement.length / 3)); // Bottom third

      // Prefer newest post first
      if (newPosts.length > 0) {
        selectedPosts.push(newPosts[0]); // Most recent new post
      }

      // Add unpopular post (but not too unpopular - pick middle of bottom third)
      const unpopularNotNew = unpopularPosts.filter(p => !p.isNew);
      if (unpopularNotNew.length > 0 && selectedPosts.length < 2) {
        selectedPosts.push(unpopularNotNew[Math.floor(unpopularNotNew.length / 2)]);
      }

      // Fill remaining slots
      if (selectedPosts.length < 2) {
        const remaining = sortedByEngagement.filter(
          p => !selectedPosts.some(s => s._id.toString() === p._id.toString())
        );
        selectedPosts.push(...remaining.slice(0, 2 - selectedPosts.length));
      }
    } else {
      // AVERAGE POST STRATEGY: Mix of popular + new
      // 1 popular post for authority
      selectedPosts.push(sortedByEngagement[0]);

      // 1 new or random different post
      const newPosts = postsWithScore.filter(p => p.isNew && p._id.toString() !== sortedByEngagement[0]._id.toString());
      if (newPosts.length > 0) {
        selectedPosts.push(newPosts[0]);
      } else {
        // Pick a random post from middle of the pack
        const middleIdx = Math.floor(sortedByEngagement.length / 2);
        const middlePost = sortedByEngagement[middleIdx];
        if (middlePost._id.toString() !== selectedPosts[0]._id.toString()) {
          selectedPosts.push(middlePost);
        } else if (sortedByEngagement[middleIdx + 1]) {
          selectedPosts.push(sortedByEngagement[middleIdx + 1]);
        }
      }
    }

    // Clean up response - only return needed fields
    const result = selectedPosts.slice(0, 2).map(p => ({
      _id: p._id,
      title: p.title,
      slug: p.slug,
    }));

    res.json({ success: true, posts: result });
  } catch (error) {
    console.error('Error fetching interlinking data:', error);
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
