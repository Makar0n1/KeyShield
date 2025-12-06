const express = require('express');
const router = express.Router();

// Models
const BlogCategory = require('../../models/BlogCategory');
const BlogPost = require('../../models/BlogPost');
const BlogTag = require('../../models/BlogTag');

// Helper functions
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

// Auto-generate excerpt from content (150 chars)
const generateExcerpt = (content, summary, maxLength = 150) => {
  if (summary && summary.trim()) {
    return summary.length > maxLength ? summary.substring(0, maxLength) + '...' : summary;
  }
  const text = stripHtml(content);
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

// Sidebar data
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
      <div class="sidebar-widget">
        <h3 class="widget-title">🔍 Поиск</h3>
        <form action="/blog" method="get" class="search-form">
          <input type="text" name="q" placeholder="Поиск статей..." class="search-input">
          <button type="submit" class="search-btn">🔎</button>
        </form>
      </div>
      <div class="sidebar-widget">
        <h3 class="widget-title">📁 Категории</h3>
        <ul class="category-list">
          ${categories.map(cat => `
            <li class="${currentPath === '/category/' + cat.slug ? 'active' : ''}">
              <a href="/category/${cat.slug}">${escapeHtml(cat.name)}</a>
              <span class="count">${cat.postsCount}</span>
            </li>
          `).join('')}
        </ul>
      </div>
      <div class="sidebar-widget">
        <h3 class="widget-title">📝 Последние статьи</h3>
        <ul class="recent-posts-list">
          ${recentPosts.map(post => `
            <li class="recent-post-item">
              <a href="/blog/${post.slug}" class="recent-post-link">
                ${post.coverImage ? `
                  <div class="recent-post-thumb">
                    <img src="${post.coverImage}" alt="${escapeHtml(post.title)}" loading="lazy">
                  </div>
                ` : `
                  <div class="recent-post-thumb recent-post-thumb-empty">
                    <span>📄</span>
                  </div>
                `}
                <div class="recent-post-info">
                  <span class="recent-post-title">${escapeHtml(post.title)}</span>
                  <span class="recent-post-date">${formatDate(post.publishedAt)}</span>
                </div>
              </a>
            </li>
          `).join('')}
        </ul>
      </div>
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

function renderPostCard(post) {
  const excerpt = generateExcerpt(post.content, post.summary, 150);

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
          <p class="post-card-summary">${escapeHtml(excerpt)}</p>
          <div class="post-card-footer">
            <span class="post-stats">👁 ${post.views || 0}</span>
            <span class="post-stats">👍 ${post.likes || 0}</span>
            <span class="post-stats">💬 ${post.commentsCount || 0}</span>
          </div>
        </div>
      </a>
    </article>
  `;
}

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

// Collapsible category description with gradient fade
function renderCategoryDescription(description) {
  if (!description) return '';

  const text = description;
  const needsCollapse = text.length > 200;

  if (!needsCollapse) {
    return `<div class="category-description" style="background: var(--dark-light); border-radius: 12px; padding: 20px; margin-bottom: 30px; border: 1px solid var(--border); color: var(--text); line-height: 1.7;">${text}</div>`;
  }

  return `
    <div class="category-description-wrapper" id="categoryDescWrapper">
      <div class="category-description-preview">${text}</div>
      <button class="description-toggle-btn" onclick="toggleDescription('categoryDescWrapper')">
        <span class="toggle-text">Читать полностью</span>
        <span class="toggle-icon">▼</span>
      </button>
    </div>
  `;
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
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  ${ogImage ? `<meta property="og:image" content="${ogImage}">` : ''}
  <link rel="icon" type="image/png" href="/images/logo.png">
  <link rel="stylesheet" href="/css/style.css?v=12">
  <link rel="stylesheet" href="/css/blog.css?v=7">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  ${schemas.map(s => `<script type="application/ld+json">${JSON.stringify(s)}</script>`).join('\n  ')}
</head>
<body>
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
  <script src="/js/main.js?v=3"></script>
</body>
</html>`;
}

// GET /category/:slug - Category page
router.get('/:slug', async (req, res) => {
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
      { name: category.name, url: `/category/${category.slug}` }
    ];

    const filtersHtml = `
      <div class="blog-filters">
        <a href="/category/${category.slug}?sort=newest" class="filter-btn ${sort === 'newest' ? 'active' : ''}">Новые</a>
        <a href="/category/${category.slug}?sort=popular" class="filter-btn ${sort === 'popular' ? 'active' : ''}">Популярные</a>
        <a href="/category/${category.slug}?sort=oldest" class="filter-btn ${sort === 'oldest' ? 'active' : ''}">Старые</a>
      </div>
    `;

    const postsHtml = result.posts.length > 0
      ? `<div class="posts-grid">${result.posts.map(renderPostCard).join('')}</div>`
      : `<div class="empty-state">Статьи в этой категории не найдены</div>`;

    const content = `
      ${renderCategoryDescription(category.description)}
      ${filtersHtml}
      ${postsHtml}
      ${renderPagination(parseInt(page), result.totalPages, `/category/${category.slug}`)}
    `;

    const schemas = [
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        'itemListElement': breadcrumbs.map((item, index) => ({
          '@type': 'ListItem',
          'position': index + 1,
          'name': item.name,
          'item': item.url.startsWith('http') ? item.url : `https://keyshield.me${item.url}`
        }))
      },
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': category.name,
        'description': category.seoDescription || `Статьи в категории ${category.name}`,
        'url': category.canonical || `https://keyshield.me/category/${category.slug}`
      }
    ];

    res.send(renderPage({
      title: category.seoTitle || `${category.name} - Блог KeyShield`,
      description: category.seoDescription || `Статьи в категории ${category.name}`,
      canonical: category.canonical || `https://keyshield.me/category/${category.slug}`,
      ogImage: category.coverImage,
      schemas,
      breadcrumbs,
      heroTitle: category.name,
      heroImage: category.coverImage,
      heroDescription: null,
      content,
      sidebar: renderSidebar(sidebarData, `/category/${category.slug}`)
    }));
  } catch (error) {
    console.error('Error rendering category page:', error);
    res.status(500).send('Internal server error');
  }
});

module.exports = router;
