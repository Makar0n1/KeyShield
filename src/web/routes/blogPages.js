const express = require('express');
const router = express.Router();

// Models
const BlogSettings = require('../../models/BlogSettings');
const BlogCategory = require('../../models/BlogCategory');
const BlogTag = require('../../models/BlogTag');
const BlogPost = require('../../models/BlogPost');
const BlogComment = require('../../models/BlogComment');

// Helper functions for rendering
const escapeHtml = (str) => {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
};

const stripHtml = (html) => {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').trim();
};

// Generate sidebar HTML
async function getSidebarData() {
  const [categories, tags, recentPosts] = await Promise.all([
    BlogCategory.getWithPostsCount(),
    BlogTag.getPopular(15),
    BlogPost.getRecent(5)
  ]);
  return { categories, tags, recentPosts };
}

function renderSidebar(data, currentPath = '') {
  const { categories, tags, recentPosts } = data;

  return `
    <aside class="blog-sidebar">
      <!-- Search -->
      <div class="sidebar-widget">
        <h3 class="widget-title">🔍 Поиск</h3>
        <form action="/blog" method="get" class="search-form">
          <input type="text" name="q" placeholder="Поиск статей..." class="search-input">
          <button type="submit" class="search-btn">🔎</button>
        </form>
      </div>

      <!-- Categories -->
      <div class="sidebar-widget">
        <h3 class="widget-title">📁 Категории</h3>
        <ul class="category-list">
          ${categories.map(cat => `
            <li class="${currentPath === '/blog/category/' + cat.slug ? 'active' : ''}">
              <a href="/blog/category/${cat.slug}">${escapeHtml(cat.name)}</a>
              <span class="count">${cat.postsCount}</span>
            </li>
          `).join('')}
        </ul>
      </div>

      <!-- Recent Posts -->
      <div class="sidebar-widget">
        <h3 class="widget-title">📝 Последние статьи</h3>
        <ul class="recent-posts">
          ${recentPosts.map(post => `
            <li>
              <a href="/blog/${post.slug}">${escapeHtml(post.title)}</a>
              <span class="date">${formatDate(post.publishedAt)}</span>
            </li>
          `).join('')}
        </ul>
      </div>

      <!-- Tags -->
      ${tags.length > 0 ? `
        <div class="sidebar-widget">
          <h3 class="widget-title">🏷️ Теги</h3>
          <div class="tag-cloud">
            ${tags.map(tag => `
              <a href="/tag/${tag.slug}" class="tag-link">${escapeHtml(tag.name)}</a>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </aside>
  `;
}

// Generate post card HTML
function renderPostCard(post) {
  return `
    <article class="post-card">
      <a href="/blog/${post.slug}" class="post-card-link">
        ${post.coverImage ? `
          <div class="post-card-image">
            <img src="${post.coverImage}" alt="${escapeHtml(post.coverImageAlt || post.title)}" loading="lazy">
          </div>
        ` : ''}
        <div class="post-card-content">
          <div class="post-card-meta">
            ${post.category ? `<span class="post-category">${escapeHtml(post.category.name)}</span>` : ''}
            <span class="post-date">${formatDate(post.publishedAt)}</span>
          </div>
          <h2 class="post-card-title">${escapeHtml(post.title)}</h2>
          ${post.summary ? `<p class="post-card-summary">${escapeHtml(post.summary)}</p>` : ''}
          <div class="post-card-footer">
            <span class="post-stats">👍 ${post.likes || 0}</span>
            <span class="post-stats">💬 ${post.commentsCount || 0}</span>
          </div>
        </div>
      </a>
    </article>
  `;
}

// Generate pagination HTML
function renderPagination(currentPage, totalPages, baseUrl) {
  if (totalPages <= 1) return '';

  let html = '<div class="pagination">';

  if (currentPage > 1) {
    html += `<a href="${baseUrl}?page=${currentPage - 1}" class="page-btn">← Назад</a>`;
  }

  for (let i = 1; i <= totalPages; i++) {
    if (i === currentPage) {
      html += `<span class="page-btn active">${i}</span>`;
    } else if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `<a href="${baseUrl}?page=${i}" class="page-btn">${i}</a>`;
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += `<span class="page-ellipsis">...</span>`;
    }
  }

  if (currentPage < totalPages) {
    html += `<a href="${baseUrl}?page=${currentPage + 1}" class="page-btn">Вперёд →</a>`;
  }

  html += '</div>';
  return html;
}

// Generate Schema.org JSON-LD
function generateBlogSchema(settings) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    'name': settings.title,
    'description': stripHtml(settings.description),
    'url': settings.canonical || 'https://keyshield.me/blog'
  };
}

function generateArticleSchema(post, comments = []) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': post.title,
    'description': post.seoDescription || post.summary,
    'image': post.coverImage || '',
    'datePublished': post.publishedAt,
    'dateModified': post.updatedAt,
    'author': {
      '@type': 'Organization',
      'name': 'KeyShield'
    },
    'publisher': {
      '@type': 'Organization',
      'name': 'KeyShield',
      'logo': {
        '@type': 'ImageObject',
        'url': 'https://keyshield.me/images/logo.png'
      }
    },
    'mainEntityOfPage': {
      '@type': 'WebPage',
      '@id': post.canonical || `https://keyshield.me/blog/${post.slug}`
    }
  };

  // Add comments if any
  if (comments.length > 0) {
    schema.comment = comments.map(c => ({
      '@type': 'Comment',
      'author': { '@type': 'Person', 'name': c.authorName },
      'dateCreated': c.createdAt,
      'text': c.content
    }));
  }

  return schema;
}

function generateFAQSchema(faq) {
  if (!faq || faq.length === 0) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': faq.map(item => ({
      '@type': 'Question',
      'name': item.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': item.answer
      }
    }))
  };
}

function generateBreadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    'itemListElement': items.map((item, index) => ({
      '@type': 'ListItem',
      'position': index + 1,
      'name': item.name,
      'item': item.url
    }))
  };
}

// Page layout
function renderPage({ title, description, canonical, ogImage, schemas, breadcrumbs, heroTitle, heroImage, heroDescription, content, sidebar }) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonical}">
  ${ogImage ? `<meta property="og:image" content="${ogImage}">` : ''}
  <link rel="icon" type="image/png" href="/images/logo.png">
  <link rel="stylesheet" href="/css/style.css?v=11">
  <link rel="stylesheet" href="/css/blog.css?v=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  ${schemas.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n  ')}
</head>
<body>
  <!-- Header -->
  <header class="header">
    <div class="container">
      <nav class="nav">
        <div class="logo">
          <a href="/" class="logo">
            <span class="logo-icon">🔐</span>
            <span class="logo-text">KeyShield</span>
          </a>
        </div>
        <ul class="nav-menu">
          <li><a href="/">Главная</a></li>
          <li><a href="/blog" class="active">Блог</a></li>
          <li><a href="/terms">Документы</a></li>
        </ul>
        <a href="https://t.me/keyshield_bot" class="btn btn-primary">Открыть бота</a>
      </nav>
      <div class="mobile-menu-wrapper">
        <button class="mobile-menu-toggle" onclick="toggleMobileMenu()">
          <span class="arrow">▼</span> Меню
        </button>
        <nav class="mobile-nav" id="mobileNav">
          <ul>
            <li><a href="/">Главная</a></li>
            <li><a href="/blog" class="active">Блог</a></li>
            <li><a href="/terms">Документы</a></li>
          </ul>
        </nav>
      </div>
    </div>
  </header>

  <!-- Hero -->
  <section class="blog-hero" ${heroImage ? `style="background-image: url('${heroImage}')"` : ''}>
    <div class="blog-hero-overlay"></div>
    <div class="container">
      <h1 class="blog-hero-title">${escapeHtml(heroTitle)}</h1>
      ${breadcrumbs ? `
        <nav class="breadcrumbs">
          ${breadcrumbs.map((b, i) => i === breadcrumbs.length - 1
            ? `<span>${escapeHtml(b.name)}</span>`
            : `<a href="${b.url}">${escapeHtml(b.name)}</a> / `
          ).join('')}
        </nav>
      ` : ''}
      ${heroDescription ? `<div class="blog-hero-description">${heroDescription}</div>` : ''}
    </div>
  </section>

  <!-- Content -->
  <main class="blog-main">
    <div class="container">
      <div class="blog-layout">
        <div class="blog-content">
          ${content}
        </div>
        ${sidebar}
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="footer">
    <div class="container">
      <div class="footer-content">
        <div class="footer-section">
          <h4>KeyShield</h4>
          <p>Безопасный multisig эскроу на TRON</p>
        </div>
        <div class="footer-section">
          <h4>Документы</h4>
          <ul>
            <li><a href="/terms">Условия использования</a></li>
            <li><a href="/privacy">Политика конфиденциальности</a></li>
            <li><a href="/offer">Публичная оферта</a></li>
          </ul>
        </div>
        <div class="footer-section">
          <h4>Блог</h4>
          <ul>
            <li><a href="/blog">Все статьи</a></li>
          </ul>
        </div>
        <div class="footer-section">
          <h4>Поддержка</h4>
          <ul>
            <li><a href="https://t.me/mamlyga">Telegram: @mamlyga</a></li>
            <li><a href="mailto:amroids@tutamail.com">Email: amroids@tutamail.com</a></li>
          </ul>
        </div>
      </div>
      <div class="footer-bottom">
        <p>&copy; ${new Date().getFullYear()} KeyShield. Все права защищены.</p>
        <p class="footer-disclaimer">KeyShield не является финансовой организацией и не предоставляет финансовые услуги. Мы предоставляем технологическую платформу для безопасного обмена криптовалютой между сторонами.</p>
      </div>
    </div>
  </footer>

  <script src="/js/main.js"></script>
  <script>
    // Visitor ID for voting
    function getVisitorId() {
      let id = localStorage.getItem('visitorId');
      if (!id) {
        id = 'v_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
        localStorage.setItem('visitorId', id);
      }
      return id;
    }

    // Vote on post/comment
    async function vote(type, id, voteType) {
      try {
        const endpoint = type === 'post'
          ? '/api/blog/posts/' + id + '/vote'
          : '/api/blog/comments/' + id + '/vote';

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voteType, visitorId: getVisitorId() })
        });
        const data = await res.json();
        if (data.success) {
          // Update UI
          const likesEl = document.getElementById(type + '-likes-' + id);
          const dislikesEl = document.getElementById(type + '-dislikes-' + id);
          if (likesEl) likesEl.textContent = data.votes.likes;
          if (dislikesEl) dislikesEl.textContent = data.votes.dislikes;
        }
      } catch (err) {
        console.error('Vote error:', err);
      }
    }

    // Submit comment
    async function submitComment(e, slug) {
      e.preventDefault();
      const form = e.target;
      const name = form.querySelector('[name="authorName"]').value;
      const email = form.querySelector('[name="authorEmail"]').value;
      const content = form.querySelector('[name="content"]').value;
      const honeypot = form.querySelector('[name="website"]').value;

      try {
        const res = await fetch('/api/blog/posts/' + slug + '/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authorName: name, authorEmail: email, content, honeypot })
        });
        const data = await res.json();
        if (data.success) {
          alert('Комментарий отправлен на модерацию!');
          form.reset();
        } else {
          alert(data.error || 'Ошибка');
        }
      } catch (err) {
        alert('Ошибка соединения');
      }
    }
  </script>
</body>
</html>`;
}

// ==========================================
// ROUTES
// ==========================================

// GET /blog - Main blog page
router.get('/', async (req, res) => {
  try {
    const { page = 1, sort = 'newest', q } = req.query;
    const settings = await BlogSettings.getSettings();
    const sidebarData = await getSidebarData();

    let posts, total, totalPages;

    if (q) {
      // Search
      posts = await BlogPost.search(q, 20);
      total = posts.length;
      totalPages = 1;
    } else {
      const result = await BlogPost.getPublished({
        page: parseInt(page),
        limit: 6,
        sort
      });
      posts = result.posts;
      total = result.total;
      totalPages = result.totalPages;
    }

    // Filters HTML
    const filtersHtml = `
      <div class="blog-filters">
        <a href="/blog?sort=newest" class="filter-btn ${sort === 'newest' ? 'active' : ''}">Новые</a>
        <a href="/blog?sort=popular" class="filter-btn ${sort === 'popular' ? 'active' : ''}">Популярные</a>
        <a href="/blog?sort=oldest" class="filter-btn ${sort === 'oldest' ? 'active' : ''}">Старые</a>
      </div>
    `;

    // Posts grid
    const postsHtml = posts.length > 0
      ? `<div class="posts-grid">${posts.map(renderPostCard).join('')}</div>`
      : `<div class="empty-state">Статьи не найдены</div>`;

    const content = `
      ${q ? `<div class="search-results-info">Результаты поиска: "${escapeHtml(q)}" (${total})</div>` : filtersHtml}
      ${postsHtml}
      ${!q ? renderPagination(parseInt(page), totalPages, '/blog') : ''}
    `;

    const breadcrumbs = [
      { name: 'Главная', url: '/' },
      { name: 'Блог', url: '/blog' }
    ];

    const schemas = [
      generateBlogSchema(settings),
      generateBreadcrumbSchema(breadcrumbs.map(b => ({ ...b, url: b.url.startsWith('http') ? b.url : `https://keyshield.me${b.url}` })))
    ];

    res.send(renderPage({
      title: settings.seoTitle || 'Блог KeyShield',
      description: settings.seoDescription || 'Полезные статьи о криптовалютах и безопасных сделках',
      canonical: settings.canonical || 'https://keyshield.me/blog',
      ogImage: settings.coverImage,
      schemas,
      breadcrumbs,
      heroTitle: settings.title || 'Блог',
      heroImage: settings.coverImage,
      heroDescription: settings.description,
      content,
      sidebar: renderSidebar(sidebarData, '/blog')
    }));
  } catch (error) {
    console.error('Error rendering blog page:', error);
    res.status(500).send('Internal server error');
  }
});

// GET /blog/category/:slug - Category page
router.get('/category/:slug', async (req, res) => {
  try {
    const { page = 1, sort = 'newest' } = req.query;
    const category = await BlogCategory.findOne({ slug: req.params.slug }).lean();

    if (!category) {
      return res.status(404).send('Категория не найдена');
    }

    const result = await BlogPost.getPublished({
      page: parseInt(page),
      limit: 6,
      sort,
      category: category._id
    });

    const sidebarData = await getSidebarData();

    const breadcrumbs = [
      { name: 'Главная', url: '/' },
      { name: 'Блог', url: '/blog' },
      { name: category.name, url: `/blog/category/${category.slug}` }
    ];

    const filtersHtml = `
      <div class="blog-filters">
        <a href="/blog/category/${category.slug}?sort=newest" class="filter-btn ${sort === 'newest' ? 'active' : ''}">Новые</a>
        <a href="/blog/category/${category.slug}?sort=popular" class="filter-btn ${sort === 'popular' ? 'active' : ''}">Популярные</a>
        <a href="/blog/category/${category.slug}?sort=oldest" class="filter-btn ${sort === 'oldest' ? 'active' : ''}">Старые</a>
      </div>
    `;

    const postsHtml = result.posts.length > 0
      ? `<div class="posts-grid">${result.posts.map(renderPostCard).join('')}</div>`
      : `<div class="empty-state">В этой категории пока нет статей</div>`;

    const content = `
      ${category.description ? `<div class="category-description">${category.description}</div>` : ''}
      ${filtersHtml}
      ${postsHtml}
      ${renderPagination(parseInt(page), result.totalPages, `/blog/category/${category.slug}`)}
    `;

    const schemas = [
      generateBreadcrumbSchema(breadcrumbs),
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': category.name,
        'description': category.seoDescription || stripHtml(category.description),
        'url': category.canonical || `https://keyshield.me/blog/category/${category.slug}`
      }
    ];

    res.send(renderPage({
      title: category.seoTitle || `${category.name} - Блог KeyShield`,
      description: category.seoDescription || `Статьи в категории ${category.name}`,
      canonical: category.canonical || `https://keyshield.me/blog/category/${category.slug}`,
      ogImage: category.coverImage,
      schemas,
      breadcrumbs,
      heroTitle: category.name,
      heroImage: category.coverImage,
      heroDescription: null,
      content,
      sidebar: renderSidebar(sidebarData, `/blog/category/${category.slug}`)
    }));
  } catch (error) {
    console.error('Error rendering category page:', error);
    res.status(500).send('Internal server error');
  }
});

// GET /blog/:slug - Post page
router.get('/:slug', async (req, res) => {
  try {
    // Check if it's not a special route
    if (req.params.slug === 'category') {
      return res.status(404).send('Not found');
    }

    const post = await BlogPost.getBySlug(req.params.slug);

    if (!post) {
      return res.status(404).send('Статья не найдена');
    }

    // Increment views
    BlogPost.findByIdAndUpdate(post._id, { $inc: { views: 1 } }).exec();

    const [comments, sidebarData] = await Promise.all([
      BlogComment.getByPost(post._id),
      getSidebarData()
    ]);

    const breadcrumbs = [
      { name: 'Главная', url: '/' },
      { name: 'Блог', url: '/blog' },
      { name: post.category?.name || 'Категория', url: `/blog/category/${post.category?.slug}` },
      { name: post.title, url: `/blog/${post.slug}` }
    ];

    // Article content
    const articleHtml = `
      <article class="post-article">
        <div class="post-meta">
          ${post.category ? `<a href="/blog/category/${post.category.slug}" class="post-category-link">${escapeHtml(post.category.name)}</a>` : ''}
          <span class="post-date">${formatDate(post.publishedAt)}</span>
          <span class="post-views">👁 ${post.views || 0} просмотров</span>
        </div>

        <div class="post-content">
          ${post.content}
        </div>

        ${post.tags && post.tags.length > 0 ? `
          <div class="post-tags">
            ${post.tags.map(tag => `
              <a href="/tag/${tag.slug}" class="post-tag">#${escapeHtml(tag.name)}</a>
            `).join('')}
          </div>
        ` : ''}

        <!-- Voting -->
        <div class="post-voting">
          <button onclick="vote('post', '${post.slug}', 'like')" class="vote-btn vote-like">
            👍 <span id="post-likes-${post.slug}">${post.likes || 0}</span>
          </button>
          <button onclick="vote('post', '${post.slug}', 'dislike')" class="vote-btn vote-dislike">
            👎 <span id="post-dislikes-${post.slug}">${post.dislikes || 0}</span>
          </button>
        </div>

        ${post.faq && post.faq.length > 0 ? `
          <div class="post-faq">
            <h2>Часто задаваемые вопросы</h2>
            ${post.faq.map(item => `
              <div class="faq-item">
                <h3 class="faq-question">${escapeHtml(item.question)}</h3>
                <div class="faq-answer">${item.answer}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </article>

      <!-- Comments -->
      <section class="comments-section">
        <h2>Комментарии (${comments.length})</h2>

        ${comments.length > 0 ? `
          <div class="comments-list">
            ${comments.map(c => `
              <div class="comment">
                <div class="comment-header">
                  <span class="comment-author">${escapeHtml(c.authorName)}</span>
                  <span class="comment-date">${formatDate(c.createdAt)}</span>
                </div>
                <div class="comment-content">${escapeHtml(c.content)}</div>
                <div class="comment-voting">
                  <button onclick="vote('comment', '${c._id}', 'like')" class="vote-btn-sm">
                    👍 <span id="comment-likes-${c._id}">${c.likes || 0}</span>
                  </button>
                  <button onclick="vote('comment', '${c._id}', 'dislike')" class="vote-btn-sm">
                    👎 <span id="comment-dislikes-${c._id}">${c.dislikes || 0}</span>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : '<p class="no-comments">Пока нет комментариев. Будьте первым!</p>'}

        <!-- Comment Form -->
        <div class="comment-form-wrapper">
          <h3>Оставить комментарий</h3>
          <form onsubmit="submitComment(event, '${post.slug}')" class="comment-form">
            <div class="form-row">
              <div class="form-group">
                <label>Имя *</label>
                <input type="text" name="authorName" required minlength="2" maxlength="50">
              </div>
              <div class="form-group">
                <label>Email (необязательно)</label>
                <input type="email" name="authorEmail" maxlength="100">
              </div>
            </div>
            <div class="form-group" style="display: none;">
              <input type="text" name="website" tabindex="-1" autocomplete="off">
            </div>
            <div class="form-group">
              <label>Комментарий *</label>
              <textarea name="content" required minlength="10" maxlength="2000" rows="4"></textarea>
            </div>
            <button type="submit" class="btn btn-primary">Отправить</button>
          </form>
        </div>
      </section>
    `;

    const schemas = [
      generateBreadcrumbSchema(breadcrumbs),
      generateArticleSchema(post, comments)
    ];

    if (post.faq && post.faq.length > 0) {
      schemas.push(generateFAQSchema(post.faq));
    }

    res.send(renderPage({
      title: post.seoTitle || post.title,
      description: post.seoDescription || post.summary || stripHtml(post.content).substring(0, 160),
      canonical: post.canonical || `https://keyshield.me/blog/${post.slug}`,
      ogImage: post.coverImage,
      schemas,
      breadcrumbs,
      heroTitle: post.title,
      heroImage: post.coverImage,
      heroDescription: null,
      content: articleHtml,
      sidebar: renderSidebar(sidebarData, `/blog/${post.slug}`)
    }));
  } catch (error) {
    console.error('Error rendering post page:', error);
    res.status(500).send('Internal server error');
  }
});

module.exports = router;
