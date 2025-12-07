const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Environment configuration
const WEB_DOMAIN = process.env.WEB_DOMAIN || 'localhost:3001';
const SITE_URL = WEB_DOMAIN.includes('localhost') ? `http://${WEB_DOMAIN}` : `https://${WEB_DOMAIN}`;
const INDEXATION = process.env.INDEXATION === 'yes';
const ROBOTS_META = INDEXATION ? 'index, follow' : 'noindex, nofollow';

// Models
const BlogSettings = require('../../models/BlogSettings');
const BlogCategory = require('../../models/BlogCategory');
const BlogTag = require('../../models/BlogTag');
const BlogPost = require('../../models/BlogPost');
const BlogComment = require('../../models/BlogComment');
const BlogView = require('../../models/BlogView');

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

// Generate visitor fingerprint from request
const getVisitorId = (req) => {
  const data = [
    req.ip,
    req.headers['user-agent'] || '',
    req.headers['accept-language'] || ''
  ].join('|');
  return crypto.createHash('md5').update(data).digest('hex');
};

// Auto-generate excerpt from content (150 chars)
const generateExcerpt = (content, summary, maxLength = 150) => {
  if (summary && summary.trim()) {
    return summary.length > maxLength ? summary.substring(0, maxLength) + '...' : summary;
  }
  const text = stripHtml(content);
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

// Format large numbers (1000 -> 1K, 1000000 -> 1M)
const formatNumber = (num) => {
  if (num === null || num === undefined) return '0';
  num = parseInt(num) || 0;
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
};

// Extract headings for Table of Contents (includes H1 from hero title)
const extractTOC = (content, heroTitle = null) => {
  const toc = [];

  // Add H1 from hero title as first item (uses special id)
  if (heroTitle) {
    toc.push({ level: 1, text: heroTitle, id: 'hero-title' });
  }

  // Extract H2-H4 from content with consistent IDs
  const headingRegex = /<h([2-4])[^>]*>(.*?)<\/h\1>/gi;
  let match;
  let index = 0;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = parseInt(match[1]);
    const text = stripHtml(match[2]);
    const id = `heading-${index}`;
    toc.push({ level, text, id });
    index++;
  }

  return toc;
};

// Add IDs to headings in content (must match extractTOC logic)
const addHeadingIds = (content) => {
  let index = 0;
  return content.replace(/<h([2-4])([^>]*)>(.*?)<\/h\1>/gi, (match, level, attrs, text) => {
    // Skip if already has an id
    if (attrs.includes('id="')) {
      index++; // Still increment to keep in sync
      return match;
    }
    const id = `heading-${index++}`;
    return `<h${level} id="${id}"${attrs}>${text}</h${level}>`;
  });
};

// Insert interlinks between paragraphs
const insertInterlinks = (content, relatedPosts, currentPostId) => {
  if (!relatedPosts || relatedPosts.length === 0) return content;

  // Filter out current post and get max 2 posts for interlinking
  const postsForLinks = relatedPosts
    .filter(p => p._id.toString() !== currentPostId?.toString())
    .slice(0, 2);

  if (postsForLinks.length === 0) return content;

  // Find paragraph positions
  const paragraphs = content.split('</p>');
  if (paragraphs.length < 4) return content;

  // Insert links after ~1/3 and ~2/3 of content
  const positions = [
    Math.floor(paragraphs.length / 3),
    Math.floor(paragraphs.length * 2 / 3)
  ];

  let result = [];
  let linkIndex = 0;

  paragraphs.forEach((p, i) => {
    result.push(p);
    if (i < paragraphs.length - 1) {
      result.push('</p>');
    }

    if (positions.includes(i) && linkIndex < postsForLinks.length) {
      const post = postsForLinks[linkIndex];
      const interlink = `
        <div class="interlink-box">
          <span class="interlink-label">Читайте также:</span>
          <a href="/blog/${post.slug}" class="interlink-title">${escapeHtml(post.title)}</a>
        </div>
      `;
      result.push(interlink);
      linkIndex++;
    }
  });

  return result.join('');
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
            <li class="${currentPath === '/category/' + cat.slug ? 'active' : ''}">
              <a href="/category/${cat.slug}">${escapeHtml(cat.name)}</a>
              <span class="count">${cat.postsCount}</span>
            </li>
          `).join('')}
        </ul>
      </div>

      <!-- Recent Posts with thumbnails -->
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
            <span class="post-stats">👁 ${formatNumber(post.views)}</span>
            <span class="post-stats">👍 ${formatNumber(post.likes)}</span>
            <span class="post-stats">💬 ${formatNumber(post.commentsCount)}</span>
          </div>
        </div>
      </a>
    </article>
  `;
}

// Generate related posts HTML
function renderRelatedPosts(posts) {
  if (!posts || posts.length === 0) return '';

  return `
    <section class="related-posts">
      <h2 class="related-posts-title">Похожие статьи</h2>
      <div class="related-posts-grid">
        ${posts.map(post => `
          <a href="/blog/${post.slug}" class="related-post-card">
            ${post.coverImage ? `
              <div class="related-post-image">
                <img src="${post.coverImage}" alt="${escapeHtml(post.title)}" loading="lazy">
              </div>
            ` : ''}
            <div class="related-post-content">
              <h3 class="related-post-title">${escapeHtml(post.title)}</h3>
              <span class="related-post-date">${formatDate(post.publishedAt)}</span>
            </div>
          </a>
        `).join('')}
      </div>
    </section>
  `;
}

// Generate Table of Contents HTML
function renderTOC(toc) {
  if (!toc || toc.length === 0) return '';

  return `
    <div class="toc-wrapper">
      <button class="toc-toggle" onclick="toggleTOC()">
        <span class="toc-toggle-icon">📑</span>
        <span class="toc-toggle-text">Содержание</span>
        <span class="toc-toggle-arrow">▼</span>
      </button>
      <nav class="toc-content" id="tocContent">
        <ul class="toc-list">
          ${toc.map(item => `
            <li class="toc-item toc-level-${item.level}">
              <a href="#${item.id}">${escapeHtml(item.text)}</a>
            </li>
          `).join('')}
        </ul>
      </nav>
    </div>
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
    'url': settings.canonical || '${SITE_URL}/blog'
  };
}

function generateArticleSchema(post, comments = [], toc = []) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': post.title,
    'description': post.seoDescription || post.summary || stripHtml(post.content).substring(0, 160),
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
        'url': '${SITE_URL}/images/logo.png'
      }
    },
    'mainEntityOfPage': {
      '@type': 'WebPage',
      '@id': post.canonical || `${SITE_URL}/blog/${post.slug}`
    },
    'interactionStatistic': [
      {
        '@type': 'InteractionCounter',
        'interactionType': 'https://schema.org/LikeAction',
        'userInteractionCount': post.likes || 0
      },
      {
        '@type': 'InteractionCounter',
        'interactionType': 'https://schema.org/ViewAction',
        'userInteractionCount': post.views || 0
      },
      {
        '@type': 'InteractionCounter',
        'interactionType': 'https://schema.org/CommentAction',
        'userInteractionCount': post.commentsCount || 0
      }
    ]
  };

  // Add aggregate rating if has likes
  if (post.likes > 0 || post.dislikes > 0) {
    const total = (post.likes || 0) + (post.dislikes || 0);
    const rating = total > 0 ? ((post.likes || 0) / total * 4 + 1).toFixed(1) : 5;
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      'ratingValue': rating,
      'bestRating': '5',
      'worstRating': '1',
      'ratingCount': total
    };
  }

  // Add TOC
  if (toc && toc.length > 0) {
    schema.hasPart = toc.map((item, i) => ({
      '@type': 'WebPageElement',
      'name': item.text,
      'url': `${SITE_URL}/blog/${post.slug}#${item.id}`,
      'position': i + 1
    }));
  }

  // Add comments
  if (comments.length > 0) {
    schema.comment = comments.map(c => ({
      '@type': 'Comment',
      'author': { '@type': 'Person', 'name': c.authorName },
      'dateCreated': c.createdAt,
      'text': c.content
    }));
    schema.commentCount = comments.length;
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
<html lang="ru-RU">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="${ROBOTS_META}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${canonical}">
  ${ogImage ? `<meta property="og:image" content="${ogImage}">` : ''}
  <link rel="icon" type="image/png" href="/images/logo.png">

  <!-- Preconnect hints for external resources -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="dns-prefetch" href="https://fonts.googleapis.com">
  <link rel="dns-prefetch" href="https://fonts.gstatic.com">

  <!-- Preload LCP hero image -->
  ${heroImage ? `<link rel="preload" as="image" href="${heroImage}" fetchpriority="high">` : ''}

  <!-- Critical CSS inline + async load full CSS -->
  <style>
    /* Critical CSS for above-the-fold */
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0a0a0f;color:#e0e0e0;line-height:1.6}
    .header{background:rgba(10,10,15,.95);border-bottom:1px solid rgba(255,255,255,.1);position:sticky;top:0;z-index:1000;backdrop-filter:blur(10px)}
    .container{max-width:1200px;margin:0 auto;padding:0 20px}
    .nav{display:flex;align-items:center;justify-content:space-between;padding:15px 0}
    .logo{display:flex;align-items:center;gap:10px;text-decoration:none;color:#fff;font-size:1.25rem;font-weight:700}
    .blog-hero{position:relative;padding:80px 0;background-size:cover;background-position:center;min-height:300px}
    .blog-hero-overlay{position:absolute;inset:0;background:linear-gradient(135deg,rgba(10,10,15,.9),rgba(26,26,46,.8))}
    .blog-hero .container{position:relative;z-index:1}
    .blog-hero-title{font-size:2.5rem;font-weight:800;margin-bottom:15px;color:#fff}
    @media(max-width:768px){.nav-menu,.btn-primary{display:none}.blog-hero-title{font-size:1.75rem}}
  </style>

  <!-- Load full CSS asynchronously -->
  <link rel="preload" href="/css/style.css?v=17" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <link rel="preload" href="/css/blog.css?v=17" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript>
    <link rel="stylesheet" href="/css/style.css?v=17">
    <link rel="stylesheet" href="/css/blog.css?v=17">
  </noscript>

  <!-- Fonts with display=swap for faster text rendering -->
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
      <h1 id="hero-title" class="blog-hero-title">${escapeHtml(heroTitle)}</h1>
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
  <script src="/js/main.js?v=4"></script>
  <script>
    // Generate unique visitor fingerprint
    function getVisitorId() {
      const cached = localStorage.getItem('visitorId');
      if (cached) return cached;

      // Collect browser data for fingerprint
      const data = [
        navigator.userAgent,
        navigator.language,
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || '',
        navigator.platform || ''
      ].join('|');

      // Simple hash function
      let hash = 0;
      for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const visitorId = 'v_' + Math.abs(hash).toString(36) + '_' + Date.now().toString(36);
      localStorage.setItem('visitorId', visitorId);
      return visitorId;
    }

    // TOC toggle
    function toggleTOC() {
      const wrapper = document.querySelector('.toc-wrapper');
      const arrow = document.querySelector('.toc-toggle-arrow');
      if (wrapper) {
        wrapper.classList.toggle('open');
        arrow.textContent = wrapper.classList.contains('open') ? '▲' : '▼';
      }
    }

    // Category description toggle
    function toggleCategoryDescription() {
      const desc = document.getElementById('categoryDescription');
      const btn = document.querySelector('.category-desc-toggle');
      if (desc.classList.contains('expanded')) {
        desc.classList.remove('expanded');
        btn.textContent = 'Читать далее';
      } else {
        desc.classList.add('expanded');
        btn.textContent = 'Свернуть';
      }
    }

    // Voting with optimistic UI
    const voteState = {}; // Track current vote state per target
    function vote(type, id, voteType) {
      const visitorId = getVisitorId();
      const key = type + '-' + id;
      const likesEl = document.getElementById(type + '-likes-' + id);
      const dislikesEl = document.getElementById(type + '-dislikes-' + id);
      if (!likesEl || !dislikesEl) return;

      const currentLikes = parseInt(likesEl.textContent) || 0;
      const currentDislikes = parseInt(dislikesEl.textContent) || 0;
      const currentVote = voteState[key]; // 'like', 'dislike', or undefined

      // Optimistic update
      let newLikes = currentLikes;
      let newDislikes = currentDislikes;

      if (currentVote === voteType) {
        // Toggle off
        if (voteType === 'like') newLikes--;
        else newDislikes--;
        voteState[key] = null;
      } else if (currentVote) {
        // Switch vote
        if (voteType === 'like') { newLikes++; newDislikes--; }
        else { newLikes--; newDislikes++; }
        voteState[key] = voteType;
      } else {
        // New vote
        if (voteType === 'like') newLikes++;
        else newDislikes++;
        voteState[key] = voteType;
      }

      // Instant UI update
      likesEl.textContent = Math.max(0, newLikes);
      dislikesEl.textContent = Math.max(0, newDislikes);

      // Fire and forget - send to server in background
      fetch('/api/blog/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id, voteType, visitorId })
      }).catch(err => console.error('Vote error:', err));
    }

    // Track share with optimistic UI
    function trackShare(postId, url) {
      // Instant UI update
      const counter = document.getElementById('post-shares-' + postId);
      if (counter) {
        counter.textContent = parseInt(counter.textContent || 0) + 1;
      }
      // Open immediately
      window.open(url, '_blank', 'noopener');
      // Fire and forget
      fetch('/api/blog/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId })
      }).catch(err => console.error('Share error:', err));
    }

    // Copy post link to clipboard with optimistic UI
    function copyPostLink(postId) {
      const url = window.location.href;
      navigator.clipboard.writeText(url).then(() => {
        const btn = document.querySelector('.share-copy');
        const originalTitle = btn.title;
        btn.title = 'Скопировано!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.title = originalTitle;
          btn.classList.remove('copied');
        }, 2000);
        // Instant UI update
        if (postId) {
          const counter = document.getElementById('post-shares-' + postId);
          if (counter) {
            counter.textContent = parseInt(counter.textContent || 0) + 1;
          }
          // Fire and forget
          fetch('/api/blog/share', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ postId })
          }).catch(() => {});
        }
      }).catch(err => console.error('Copy error:', err));
    }

    // Comment submission
    async function submitComment(event, postSlug) {
      event.preventDefault();
      const form = event.target;
      const formData = new FormData(form);

      // Honeypot check
      if (formData.get('website')) {
        return;
      }

      try {
        const res = await fetch('/api/blog/posts/' + postSlug + '/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authorName: formData.get('authorName'),
            authorEmail: formData.get('authorEmail'),
            content: formData.get('content')
          })
        });
        const data = await res.json();
        if (data.success) {
          alert('Комментарий отправлен на модерацию!');
          form.reset();
        } else {
          alert(data.error || 'Ошибка отправки комментария');
        }
      } catch (err) {
        alert('Ошибка соединения');
      }
    }
  </script>
</body>
</html>`;
}

// ===================== ROUTES =====================

// GET /blog - Main blog page
router.get('/', async (req, res) => {
  try {
    const { page = 1, sort = 'newest', q } = req.query;
    const settings = await BlogSettings.getSettings() || {};

    let result;
    let total = 0;

    if (q) {
      // Search
      const posts = await BlogPost.search(q, 20);
      result = { posts, total: posts.length, page: 1, totalPages: 1 };
      total = posts.length;
    } else {
      result = await BlogPost.getPublished({
        page: parseInt(page),
        limit: 6,
        sort
      });
      total = result.total;
    }

    const { posts, totalPages } = result;
    const sidebarData = await getSidebarData();

    const filtersHtml = `
      <div class="blog-filters">
        <a href="/blog?sort=newest" class="filter-btn ${sort === 'newest' ? 'active' : ''}">Новые</a>
        <a href="/blog?sort=popular" class="filter-btn ${sort === 'popular' ? 'active' : ''}">Популярные</a>
        <a href="/blog?sort=oldest" class="filter-btn ${sort === 'oldest' ? 'active' : ''}">Старые</a>
        <select class="filter-select" onchange="window.location.href=this.value">
          <option value="/blog?sort=newest" ${sort === 'newest' ? 'selected' : ''}>Новые</option>
          <option value="/blog?sort=popular" ${sort === 'popular' ? 'selected' : ''}>Популярные</option>
          <option value="/blog?sort=oldest" ${sort === 'oldest' ? 'selected' : ''}>Старые</option>
        </select>
      </div>
    `;

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
      generateBreadcrumbSchema(breadcrumbs.map(b => ({ ...b, url: b.url.startsWith('http') ? b.url : `${SITE_URL}${b.url}` })))
    ];

    res.send(renderPage({
      title: settings.seoTitle || 'Блог KeyShield',
      description: settings.seoDescription || 'Полезные статьи о криптовалютах и безопасных сделках',
      canonical: settings.canonical || '${SITE_URL}/blog',
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

    // Track unique views
    const visitorId = getVisitorId(req);
    try {
      const BlogView = require('../../models/BlogView');
      await BlogView.trackView(post._id, visitorId, req.ip);
    } catch (e) {
      // Fallback: just increment
      BlogPost.findByIdAndUpdate(post._id, { $inc: { views: 1 } }).exec();
    }

    // Get related posts (same category, popular first, then recent)
    const relatedPosts = await BlogPost.find({
      _id: { $ne: post._id },
      status: 'published',
      category: post.category?._id
    })
      .select('title slug coverImage publishedAt views likes')
      .sort({ likes: -1, views: -1, publishedAt: -1 })
      .limit(4)
      .lean();

    // Get posts for interlinking (oldest popular posts from same category + most popular overall)
    const interlinkPosts = await BlogPost.find({
      _id: { $ne: post._id },
      status: 'published'
    })
      .select('title slug')
      .sort({ publishedAt: 1, likes: -1 })
      .limit(5)
      .lean();

    const [comments, sidebarData] = await Promise.all([
      BlogComment.getByPost(post._id),
      getSidebarData()
    ]);

    const breadcrumbs = [
      { name: 'Главная', url: '/' },
      { name: 'Блог', url: '/blog' },
      { name: post.category?.name || 'Категория', url: `/category/${post.category?.slug}` },
      { name: post.title, url: `/blog/${post.slug}` }
    ];

    // Extract TOC and add heading IDs (include H1 from hero title)
    const toc = extractTOC(post.content, post.title);
    let processedContent = addHeadingIds(post.content);

    // Insert interlinks
    processedContent = insertInterlinks(processedContent, interlinkPosts, post._id);

    // Article content
    const articleHtml = `
      <article class="post-article">
        <div class="post-meta">
          ${post.category ? `<a href="/category/${post.category.slug}" class="post-category-link">${escapeHtml(post.category.name)}</a>` : ''}
          <span class="post-date">${formatDate(post.publishedAt)}</span>
          <span class="post-views">👁 ${formatNumber(post.views)}</span>
        </div>

        ${post.coverImage ? `
          <div class="post-cover-image">
            <img src="${post.coverImage}" alt="${escapeHtml(post.coverImageAlt || post.title)}">
          </div>
        ` : ''}

        ${renderTOC(toc)}

        <div class="post-content">
          ${processedContent}
        </div>

        ${post.tags && post.tags.length > 0 ? `
          <div class="post-tags">
            ${post.tags.map(tag => `
              <a href="/tag/${tag.slug}" class="post-tag">#${escapeHtml(tag.name)}</a>
            `).join('')}
          </div>
        ` : ''}

        <!-- Voting and Sharing -->
        <div class="post-actions">
          <div class="post-voting">
            <button onclick="vote('post', '${post._id}', 'like')" class="vote-btn vote-like">
              👍 <span id="post-likes-${post._id}">${formatNumber(post.likes)}</span>
            </button>
            <button onclick="vote('post', '${post._id}', 'dislike')" class="vote-btn vote-dislike">
              👎 <span id="post-dislikes-${post._id}">${formatNumber(post.dislikes)}</span>
            </button>
          </div>
          <div class="post-share">
            <span class="share-label">Поделиться (<span id="post-shares-${post._id}">${formatNumber(post.shares)}</span>):</span>
            <button onclick="trackShare('${post._id}', 'https://t.me/share/url?url=${encodeURIComponent(`${SITE_URL}/blog/${post.slug}`)}&text=${encodeURIComponent(post.title)}')" class="share-btn share-telegram" title="Поделиться в Telegram">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
            </button>
            <button onclick="trackShare('${post._id}', 'https://vk.com/share.php?url=${encodeURIComponent(`${SITE_URL}/blog/${post.slug}`)}&title=${encodeURIComponent(post.title)}')" class="share-btn share-vk" title="Поделиться ВКонтакте">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.864-.525-2.05-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-1.253.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4 8.57 4 8.146c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.678.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.204.17-.407.44-.407h2.744c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.254-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.763-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.05.17.49-.085.744-.576.744z"/></svg>
            </button>
            <button onclick="trackShare('${post._id}', 'https://twitter.com/intent/tweet?url=${encodeURIComponent(`${SITE_URL}/blog/${post.slug}`)}&text=${encodeURIComponent(post.title)}')" class="share-btn share-twitter" title="Поделиться в X (Twitter)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </button>
            <button onclick="copyPostLink('${post._id}')" class="share-btn share-copy" title="Копировать ссылку">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
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

      ${renderRelatedPosts(relatedPosts)}

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
      generateBreadcrumbSchema(breadcrumbs.map(b => ({ ...b, url: b.url.startsWith('http') ? b.url : `${SITE_URL}${b.url}` }))),
      generateArticleSchema(post, comments, toc)
    ];

    if (post.faq && post.faq.length > 0) {
      schemas.push(generateFAQSchema(post.faq));
    }

    res.send(renderPage({
      title: post.seoTitle || post.title,
      description: post.seoDescription || generateExcerpt(post.content, post.summary, 160),
      canonical: post.canonical || `${SITE_URL}/blog/${post.slug}`,
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
