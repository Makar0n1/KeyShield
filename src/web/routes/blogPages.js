const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// Environment configuration
const WEB_DOMAIN = process.env.WEB_DOMAIN || 'localhost:3001';
const SITE_URL = WEB_DOMAIN.includes('localhost') ? `http://${WEB_DOMAIN}` : `https://${WEB_DOMAIN}`;
const INDEXATION = process.env.INDEXATION === 'yes';
const ROBOTS_META = INDEXATION ? 'index, follow' : 'noindex, nofollow';

// Normalize canonical URL - replace hardcoded domain with current SITE_URL
const normalizeCanonical = (url, fallback) => {
  if (!url) return fallback;
  // Replace any hardcoded keyshield.me domain with current SITE_URL
  return url.replace(/https?:\/\/(www\.)?keyshield\.me/g, SITE_URL);
};

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

// CTA block variations for bot promotion
const CTA_BLOCKS = [
  {
    icon: '🔐',
    title: 'Безопасные сделки с KeyShield',
    text: 'Совершайте криптовалютные сделки без риска. Ваши средства под защитой multisig-технологии.'
  },
  {
    icon: '🛡️',
    title: 'Защитите свою сделку',
    text: 'Не рискуйте деньгами при P2P-обменах. KeyShield гарантирует безопасность каждой транзакции.'
  },
  {
    icon: '⚡',
    title: 'Начните торговать безопасно',
    text: 'Escrow-сервис для криптовалюты. Быстро, надёжно, с арбитражем споров.'
  },
  {
    icon: '💎',
    title: 'Доверьте сделку профессионалам',
    text: 'KeyShield — ваш надёжный посредник в мире криптовалют. Комиссия от 15 USDT.'
  }
];

// Generate random CTA block HTML
const generateCTABlock = () => {
  const cta = CTA_BLOCKS[Math.floor(Math.random() * CTA_BLOCKS.length)];
  return `
    <div class="cta-block">
      <div class="cta-block-content">
        <div class="cta-block-icon">${cta.icon}</div>
        <div class="cta-block-title">${cta.title}</div>
        <p class="cta-block-text">${cta.text}</p>
        <a href="https://t.me/keyshield_bot" class="cta-block-btn" target="_blank">
          🚀 Открыть бота
        </a>
      </div>
    </div>
  `;
};

// Insert interlinks and CTA between paragraphs
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

  // Random position for CTA block (around middle, but not same as interlinks)
  const ctaPosition = Math.floor(paragraphs.length / 2);

  let result = [];
  let linkIndex = 0;
  let ctaInserted = false;

  paragraphs.forEach((p, i) => {
    result.push(p);
    if (i < paragraphs.length - 1) {
      result.push('</p>');
    }

    // Insert interlinks at 1/3 and 2/3 positions
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

    // Insert CTA block once around the middle
    if (i === ctaPosition && !ctaInserted && !positions.includes(i)) {
      result.push(generateCTABlock());
      ctaInserted = true;
    }
  });

  // If CTA wasn't inserted (position conflict), add it after all interlinks
  if (!ctaInserted && paragraphs.length >= 6) {
    const insertAt = Math.floor(result.length * 0.6);
    result.splice(insertAt, 0, generateCTABlock());
  }

  return result.join('');
};

// Process content: render galleries and wrap tall images
const processContent = (content) => {
  if (!content) return '';

  // Gallery parser - matches [GALLERY]{"images":[...],...}[/GALLERY] text markers
  // This format survives Quill editor transformations
  content = content.replace(
    /\[GALLERY\](.*?)\[\/GALLERY\]/gi,
    (match, jsonData) => {
      try {
        // Decode HTML entities that Quill might have added
        const decodedJson = jsonData
          .replace(/&quot;/g, '"')
          .replace(/&#34;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/<[^>]*>/g, ''); // Remove any HTML tags Quill added

        const data = JSON.parse(decodedJson);
        const images = data.images || [];

        if (!images || images.length === 0) {
          return '';
        }

        const autoplay = data.autoplay === true || data.autoplay === 'true';
        const speed = data.speed || '3000';
        const align = data.align || 'center';

        const slides = images.map((url, i) =>
          `<div class="gallery-slide" data-index="${i}">
            <div class="slide-bg" style="background-image:url('${url}')"></div>
            <img class="slide-main" src="${url}" alt="Slide ${i + 1}" loading="lazy">
          </div>`
        ).join('');

        const dots = images.map((_, i) =>
          `<span class="gallery-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`
        ).join('');

        const galleryClass = autoplay ? 'blog-gallery' : 'blog-gallery manual-gallery';

        return `
          <div class="${galleryClass} align-${align}" data-autoplay="${autoplay}" data-speed="${speed}">
            <div class="gallery-track">${slides}</div>
            <div class="gallery-counter">1 / ${images.length}</div>
            <button class="gallery-nav prev">&lt;</button>
            <button class="gallery-nav next">&gt;</button>
            <div class="gallery-dots">${dots}</div>
          </div>
        `;
      } catch (e) {
        console.error('Error parsing gallery:', e, 'Data:', jsonData);
        return '';
      }
    }
  );

  return content;
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
    'url': settings.canonical || `${SITE_URL}/blog`
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
        'url': `${SITE_URL}/images/logo.png`
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
    html{scrollbar-gutter:stable}
    body{font-family:'Inter',system-ui,-apple-system,sans-serif;background:#0a0a0f;color:#e0e0e0;line-height:1.6}
    body.lightbox-open{overflow:hidden;touch-action:none}
    .header{background:rgba(10,10,15,.95);border-bottom:1px solid rgba(255,255,255,.1);position:sticky;top:0;z-index:1000;backdrop-filter:blur(10px)}
    .container{max-width:1200px;margin:0 auto;padding:0 20px}
    .nav{display:flex;align-items:center;justify-content:space-between}
    .logo{display:flex;align-items:center;text-decoration:none;color:#fff;font-size:1.25rem;font-weight:700}
    .header-cta{display:inline-block}
    /* Burger */
    .burger{display:none;flex-direction:column;justify-content:space-between;align-items:center;width:32px;height:12px;background:transparent;border:none;cursor:pointer;padding:0;z-index:20;position:relative}
    .burger-line{display:block;width:24px;height:2px;background:#e0e0e0;border-radius:2px;transition:all .3s ease;position:absolute;left:4px}
    .burger-line:nth-child(1){top:0}
    .burger-line:nth-child(2){top:5px}
    .burger-line:nth-child(3){top:10px}
    .burger.open .burger-line:nth-child(1){top:5px;transform:rotate(45deg)}
    .burger.open .burger-line:nth-child(2){opacity:0}
    .burger.open .burger-line:nth-child(3){top:5px;transform:rotate(-45deg)}
    /* Sidebar Overlay */
    .sidebar-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.5);z-index:5;opacity:0;visibility:hidden;transition:all .3s ease}
    .sidebar-overlay.open{opacity:1;visibility:visible}
    /* Sidebar */
    .sidebar{position:fixed;top:0;right:0;width:280px;height:100vh;background:#1e293b;z-index:10;transform:translateX(100%);transition:transform .3s ease;padding:80px 0 30px;border-left:1px solid rgba(255,255,255,.1)}
    .sidebar.open{transform:translateX(0)}
    .sidebar-nav{display:flex;flex-direction:column}
    .sidebar-nav a{display:block;padding:16px 24px;color:#e0e0e0;text-decoration:none;font-size:16px;font-weight:500;border-bottom:1px solid rgba(255,255,255,.1);transition:all .2s}
    .sidebar-nav a:hover{color:#6366f1;background:rgba(99,102,241,.1)}
    .blog-hero{position:relative;padding:80px 0;background-size:cover;background-position:center;min-height:300px}
    .blog-hero-overlay{position:absolute;inset:0;background:linear-gradient(135deg,rgba(10,10,15,.9),rgba(26,26,46,.8))}
    .blog-hero .container{position:relative;z-index:1}
    .blog-hero-title{font-size:2.5rem;font-weight:800;margin-bottom:15px;color:#fff}
    @media(max-width:768px){.nav-menu,.header-cta{display:none}.burger{display:flex}.blog-hero-title{font-size:1.75rem}}
    /* Tall image cropping */
    .post-content img{max-height:600px;width:auto;max-width:100%;object-fit:contain;cursor:pointer;border-radius:8px;transition:transform .3s ease}
    .post-content img:hover{transform:scale(1.015)}
    .post-cover-image img{cursor:pointer}
    /* Lightbox */
    .lightbox-overlay{position:fixed;inset:0;background:rgba(0,0,0,0);z-index:9999;display:none;transition:background .3s ease}
    .lightbox-overlay.active{display:block}
    .lightbox-overlay.visible{background:rgba(0,0,0,.95)}
    .lightbox-close{position:absolute;top:20px;right:20px;width:40px;height:40px;background:rgba(255,255,255,.15);border:none;border-radius:50%;color:#fff;font-size:24px;cursor:pointer;z-index:10001;display:flex;align-items:center;justify-content:center;transition:background .2s,opacity .2s;opacity:0}
    .lightbox-overlay.visible .lightbox-close{opacity:1}
    @media(max-width:768px){.lightbox-close{display:none}}
    .lightbox-close:hover{background:rgba(255,255,255,.3)}
    /* Single image mode */
    .lightbox-img-container{position:fixed;touch-action:none;will-change:transform;z-index:10000;overflow:hidden;border-radius:8px}
    .lightbox-img-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(25px) brightness(0.5);transform:scale(1.2);opacity:0;transition:opacity .3s}
    .lightbox-img-container.vertical .lightbox-img-bg{opacity:1}
    .lightbox-img{position:relative;z-index:1;width:100%;height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;display:block}
    /* Gallery track mode */
    .lightbox-gallery-wrapper{position:fixed;inset:0;z-index:10000;overflow:hidden;display:none}
    .lightbox-overlay.gallery-mode .lightbox-gallery-wrapper{display:block}
    .lightbox-overlay.gallery-mode .lightbox-img-container{display:none}
    .lightbox-gallery-track{display:flex;height:100%;will-change:transform;touch-action:pan-y}
    .lightbox-slide{min-width:100vw;height:100%;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}
    .lightbox-slide img{max-width:100%;max-height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;border-radius:8px}
    @media(max-width:768px){.lightbox-slide{padding:0}.lightbox-slide img{border-radius:0}}
    .lightbox-toast{position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:rgba(60,60,60,.9);color:#fff;padding:12px 24px;border-radius:25px;font-size:14px;opacity:0;transition:opacity .4s;pointer-events:none;backdrop-filter:blur(10px);z-index:10002;white-space:nowrap}
    .lightbox-toast.show{opacity:1}
    /* Lightbox gallery navigation */
    .lightbox-gallery-nav{position:fixed;bottom:40px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:20px;z-index:10002;opacity:0;transition:opacity .3s}
    .lightbox-overlay.visible .lightbox-gallery-nav{opacity:1}
    .lb-nav{width:44px;height:44px;background:rgba(255,255,255,.15);border:none;border-radius:50%;color:#fff;font-size:20px;cursor:pointer;transition:all .2s;backdrop-filter:blur(10px)}
    .lb-nav:hover{background:rgba(255,255,255,.3);transform:scale(1.1)}
    .lb-counter{color:#fff;font-size:14px;font-weight:500;text-shadow:0 2px 4px rgba(0,0,0,.5)}
    @media(max-width:768px){.lb-nav{width:40px;height:40px;font-size:18px}}
    /* Vertical images in post - Instagram style with blur background */
    .vertical-image-wrapper{position:relative;height:400px;border-radius:8px;margin:20px 0;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#111}
    .vertical-image-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(20px) brightness(0.6);transform:scale(1.1);z-index:0}
    .vertical-image-wrapper img{position:relative;z-index:1;max-height:100%;max-width:100%;width:auto;height:auto;object-fit:contain;cursor:pointer;border-radius:0;transition:transform .3s ease}
    .vertical-image-wrapper img:hover{transform:scale(1.02)}
    @media(max-width:768px){.vertical-image-wrapper{height:300px}}
    /* Gallery slideshow */
    .blog-gallery{position:relative;overflow:hidden;border-radius:12px;margin:25px 0;background:#111}
    .blog-gallery.align-left{margin-right:auto;max-width:80%}
    .blog-gallery.align-right{margin-left:auto;max-width:80%}
    .blog-gallery.align-center{margin-left:auto;margin-right:auto}
    .blog-image{margin:20px 0}
    .blog-image.align-center{text-align:center}
    .blog-image.align-left{text-align:left}
    .blog-image.align-right{text-align:right}
    .blog-image img{max-width:100%;height:auto;border-radius:8px;cursor:pointer}
    .gallery-track{display:flex;transition:transform .5s ease}
    .gallery-slide{min-width:100%;position:relative;height:400px;overflow:hidden;display:flex;align-items:center;justify-content:center}
    .slide-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(20px) brightness(0.6);transform:scale(1.1);opacity:0;transition:opacity .3s ease}
    .gallery-slide.vertical .slide-bg{opacity:1}
    .slide-main{position:relative;z-index:1;max-width:100%;max-height:100%;object-fit:contain;display:block;cursor:pointer;transition:transform .3s ease}
    .gallery-slide:not(.vertical) .slide-main{width:100%;height:100%;max-width:none;max-height:none;object-fit:cover}
    .gallery-slide.vertical .slide-main{height:100%;width:auto}
    @media(max-width:768px){.gallery-slide{height:280px}}
    .gallery-dots{position:absolute;bottom:15px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:10}
    .gallery-dot{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.4);cursor:pointer;transition:background .2s}
    .gallery-dot.active{background:#fff}
    .gallery-counter{position:absolute;top:15px;right:15px;background:rgba(0,0,0,.6);color:#fff;padding:5px 12px;border-radius:15px;font-size:12px;z-index:10}
    .gallery-nav{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.5);color:#fff;border:none;width:40px;height:40px;border-radius:50%;cursor:pointer;font-size:18px;z-index:10;opacity:0;transition:opacity .2s}
    .blog-gallery:hover .gallery-nav{opacity:1}
    .gallery-nav.prev{left:15px}
    .gallery-nav.next{right:15px}
    .manual-gallery .gallery-nav{opacity:.7}
    .manual-gallery:hover .gallery-nav{opacity:1}
    @media(max-width:768px){.gallery-nav{display:none}}
  </style>

  <!-- Load full CSS asynchronously -->
  <link rel="preload" href="/css/style.css?v=31" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <link rel="preload" href="/css/blog.css?v=31" as="style" onload="this.onload=null;this.rel='stylesheet'">
  <noscript>
    <link rel="stylesheet" href="/css/style.css?v=31">
    <link rel="stylesheet" href="/css/blog.css?v=31">
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
        <a href="/" class="logo">
          <span class="logo-icon">🔐</span>
          <span class="logo-text">KeyShield</span>
        </a>
        <ul class="nav-menu">
          <li><a href="/">Главная</a></li>
          <li><a href="/blog" class="active">Блог</a></li>
          <li><a href="/terms">Документы</a></li>
        </ul>
        <a href="https://t.me/keyshield_bot" class="btn btn-primary header-cta">Открыть бота</a>
        <button class="burger" id="burger" onclick="toggleMobileMenu()">
          <span class="burger-line"></span>
          <span class="burger-line"></span>
          <span class="burger-line"></span>
        </button>
      </nav>
    </div>
  </header>

  <!-- Mobile Sidebar -->
  <div class="sidebar-overlay" id="sidebarOverlay" onclick="closeSidebar()"></div>
  <div class="sidebar" id="sidebar">
    <nav class="sidebar-nav">
      <a href="/" onclick="closeSidebar()">Главная</a>
      <a href="/blog">Блог</a>
      <a href="/terms">Документы</a>
    </nav>
  </div>

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
  <!-- Lightbox -->
  <div class="lightbox-overlay" id="lightbox">
    <button class="lightbox-close" onclick="closeLightbox()">&times;</button>
    <!-- Single image mode -->
    <div class="lightbox-img-container" id="lightboxContainer">
      <div class="lightbox-img-bg" id="lightboxImgBg"></div>
      <img class="lightbox-img" id="lightboxImg" src="" alt="">
    </div>
    <!-- Gallery track mode -->
    <div class="lightbox-gallery-wrapper" id="lightboxGalleryWrapper">
      <div class="lightbox-gallery-track" id="lightboxGalleryTrack"></div>
    </div>
    <!-- Gallery navigation -->
    <div class="lightbox-gallery-nav" id="lightboxGalleryNav" style="display:none">
      <button class="lb-nav lb-prev">&lt;</button>
      <span class="lb-counter"></span>
      <button class="lb-nav lb-next">&gt;</button>
    </div>
  </div>
  <div class="lightbox-toast" id="lightboxToast">Свайпните вверх или вниз для закрытия</div>

  <script src="/js/main.js?v=4"></script>
  <script>
    // Mobile menu toggle
    function toggleMobileMenu() {
      document.getElementById('burger').classList.toggle('open');
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebarOverlay').classList.toggle('open');
    }

    function closeSidebar() {
      document.getElementById('burger').classList.remove('open');
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebarOverlay').classList.remove('open');
    }

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

    // Lightbox for images - smooth iOS-like animation with gallery track
    (function() {
      const lightbox = document.getElementById('lightbox');
      const lightboxImg = document.getElementById('lightboxImg');
      const lightboxImgBg = document.getElementById('lightboxImgBg');
      const lightboxContainer = document.getElementById('lightboxContainer');
      const lightboxToast = document.getElementById('lightboxToast');
      const galleryWrapper = document.getElementById('lightboxGalleryWrapper');
      const galleryTrack = document.getElementById('lightboxGalleryTrack');
      const galleryNav = document.getElementById('lightboxGalleryNav');

      let sourceImg = null;
      let sourceRect = null;
      let targetRect = null;
      let toastShown = false;
      const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const CLOSE_THRESHOLD = 0.15;

      // Gallery mode state
      let galleryImages = [];
      let galleryIndex = 0;
      let isGalleryMode = false;

      // Touch state for gallery track
      let touchStartX = 0;
      let touchCurrentX = 0;
      let touchStartY = 0;
      let touchCurrentY = 0;
      let isDragging = false;
      let isVerticalSwipe = false;
      let swipeDirectionLocked = false;

      // Calculate target position (centered) for single image
      function getTargetRect(imgWidth, imgHeight) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const padding = isMobile ? 0 : 40;
        const maxW = vw - padding * 2;
        const maxH = vh - padding * 2;
        const scale = Math.min(maxW / imgWidth, maxH / imgHeight, 1);
        const w = imgWidth * scale;
        const h = imgHeight * scale;
        return {
          left: (vw - w) / 2,
          top: (vh - h) / 2,
          width: w,
          height: h
        };
      }

      // Open lightbox for single image
      function openLightbox(img) {
        isGalleryMode = false;
        galleryImages = [];
        galleryIndex = 0;
        sourceImg = img;
        sourceRect = img.getBoundingClientRect();
        sourceImg.style.visibility = 'hidden';
        lightbox.classList.remove('gallery-mode');
        galleryNav.style.display = 'none';
        showSingleImage(img.src, img.alt || '');
      }
      window.openLightbox = openLightbox;

      // Open lightbox for gallery with track navigation
      function openGalleryLightbox(images, startIndex = 0) {
        isGalleryMode = true;
        galleryImages = images;
        galleryIndex = startIndex;
        sourceImg = null;
        sourceRect = null;
        lightbox.classList.add('gallery-mode');
        showGalleryTrack(startIndex);
      }
      window.openGalleryLightbox = openGalleryLightbox;

      // Show single image in lightbox (original behavior)
      function showSingleImage(src, alt) {
        lightboxImg.src = src;
        lightboxImg.alt = alt;
        lightboxImgBg.style.backgroundImage = 'url(' + src + ')';
        lightbox.classList.add('active');
        document.body.classList.add('lightbox-open');
        lightboxContainer.classList.remove('vertical');

        if (sourceRect) {
          lightboxContainer.style.transition = 'none';
          lightboxContainer.style.left = sourceRect.left + 'px';
          lightboxContainer.style.top = sourceRect.top + 'px';
          lightboxContainer.style.width = sourceRect.width + 'px';
          lightboxContainer.style.height = sourceRect.height + 'px';
        } else {
          lightboxContainer.style.transition = 'none';
          lightboxContainer.style.opacity = '0';
          lightboxContainer.style.transform = 'scale(0.9)';
        }

        const onLoad = () => {
          const naturalW = lightboxImg.naturalWidth || 800;
          const naturalH = lightboxImg.naturalHeight || 600;

          // Check if vertical image (height > width)
          if (naturalH > naturalW) {
            lightboxContainer.classList.add('vertical');
          }

          targetRect = getTargetRect(naturalW, naturalH);

          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              lightbox.classList.add('visible');
              lightboxContainer.style.transition = 'all 0.35s cubic-bezier(0.2, 0, 0.2, 1)';
              lightboxContainer.style.left = targetRect.left + 'px';
              lightboxContainer.style.top = targetRect.top + 'px';
              lightboxContainer.style.width = targetRect.width + 'px';
              lightboxContainer.style.height = targetRect.height + 'px';
              lightboxContainer.style.opacity = '1';
              lightboxContainer.style.transform = 'scale(1)';
            });
          });
        };

        if (lightboxImg.complete) onLoad();
        else lightboxImg.onload = onLoad;

        if (isMobile && !toastShown) {
          setTimeout(() => {
            lightboxToast.textContent = 'Свайпните вверх/вниз для закрытия';
            lightboxToast.classList.add('show');
            setTimeout(() => lightboxToast.classList.remove('show'), 2500);
          }, 400);
          toastShown = true;
        }
      }

      // Show gallery track with all images
      function showGalleryTrack(startIndex) {
        // Build slides HTML
        galleryTrack.innerHTML = galleryImages.map((url, i) =>
          '<div class="lightbox-slide"><img src="' + url + '" alt="Image ' + (i + 1) + '"></div>'
        ).join('');

        // Position at start index
        galleryTrack.style.transition = 'none';
        galleryTrack.style.transform = 'translateX(-' + (startIndex * 100) + 'vw)';

        lightbox.classList.add('active');
        document.body.classList.add('lightbox-open');

        // Show navigation
        galleryNav.style.display = galleryImages.length > 1 ? 'flex' : 'none';
        updateGalleryCounter();

        // Fade in
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            lightbox.classList.add('visible');
          });
        });

        if (isMobile && !toastShown) {
          setTimeout(() => {
            lightboxToast.textContent = 'Свайпните для навигации';
            lightboxToast.classList.add('show');
            setTimeout(() => lightboxToast.classList.remove('show'), 2500);
          }, 400);
          toastShown = true;
        }
      }

      // Update counter display
      function updateGalleryCounter() {
        const counter = galleryNav.querySelector('.lb-counter');
        if (counter) counter.textContent = (galleryIndex + 1) + ' / ' + galleryImages.length;
      }

      // Go to specific slide
      function goToSlide(index, animate = true) {
        const total = galleryImages.length;
        galleryIndex = Math.max(0, Math.min(index, total - 1));
        if (animate) {
          galleryTrack.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        } else {
          galleryTrack.style.transition = 'none';
        }
        galleryTrack.style.transform = 'translateX(-' + (galleryIndex * 100) + 'vw)';
        updateGalleryCounter();
      }

      function nextSlide() {
        if (galleryIndex < galleryImages.length - 1) goToSlide(galleryIndex + 1);
      }

      function prevSlide() {
        if (galleryIndex > 0) goToSlide(galleryIndex - 1);
      }

      // Close lightbox
      function closeLightbox(animate = true) {
        lightboxToast.classList.remove('show');

        if (!isGalleryMode && animate && sourceImg && sourceRect) {
          const currentSourceRect = sourceImg.getBoundingClientRect();
          lightbox.classList.remove('visible');
          lightboxContainer.style.transition = 'all 0.3s cubic-bezier(0.2, 0, 0.2, 1)';
          lightboxContainer.style.left = currentSourceRect.left + 'px';
          lightboxContainer.style.top = currentSourceRect.top + 'px';
          lightboxContainer.style.width = currentSourceRect.width + 'px';
          lightboxContainer.style.height = currentSourceRect.height + 'px';
          setTimeout(cleanup, 300);
        } else {
          lightbox.classList.remove('visible');
          if (isGalleryMode) {
            galleryTrack.style.transition = 'opacity 0.2s ease-out';
            galleryTrack.style.opacity = '0';
          } else {
            lightboxContainer.style.transition = 'all 0.2s ease-out';
            lightboxContainer.style.opacity = '0';
            lightboxContainer.style.transform = 'scale(0.9)';
          }
          setTimeout(cleanup, 200);
        }
      }
      window.closeLightbox = closeLightbox;

      function cleanup() {
        lightbox.classList.remove('active', 'gallery-mode');
        document.body.classList.remove('lightbox-open');
        if (sourceImg) sourceImg.style.visibility = '';
        sourceImg = null;
        sourceRect = null;
        lightboxContainer.style = '';
        lightboxContainer.classList.remove('vertical');
        lightboxImgBg.style.backgroundImage = '';
        galleryTrack.innerHTML = '';
        galleryTrack.style = '';
        galleryNav.style.display = 'none';
        lightbox.style.background = '';
        isGalleryMode = false;
        galleryImages = [];
        galleryIndex = 0;
      }

      // Click handlers
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox || e.target === galleryWrapper) closeLightbox();
      });

      // Navigation button handlers
      galleryNav.querySelector('.lb-prev').addEventListener('click', (e) => { e.stopPropagation(); prevSlide(); });
      galleryNav.querySelector('.lb-next').addEventListener('click', (e) => { e.stopPropagation(); nextSlide(); });

      // Keyboard navigation
      document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        if (e.key === 'Escape') closeLightbox();
        if (isGalleryMode) {
          if (e.key === 'ArrowRight') nextSlide();
          if (e.key === 'ArrowLeft') prevSlide();
        }
      });

      // Touch handlers for gallery track - like Instagram
      galleryWrapper.addEventListener('touchstart', (e) => {
        isDragging = true;
        isVerticalSwipe = false;
        swipeDirectionLocked = false;
        touchStartX = e.touches[0].clientX;
        touchCurrentX = touchStartX;
        touchStartY = e.touches[0].clientY;
        touchCurrentY = touchStartY;
        galleryTrack.style.transition = 'none';
      }, { passive: true });

      galleryWrapper.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        touchCurrentX = e.touches[0].clientX;
        touchCurrentY = e.touches[0].clientY;
        const deltaX = touchCurrentX - touchStartX;
        const deltaY = touchCurrentY - touchStartY;

        // Lock direction on first significant movement
        if (!swipeDirectionLocked && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
          swipeDirectionLocked = true;
          isVerticalSwipe = Math.abs(deltaY) > Math.abs(deltaX);
        }

        if (isVerticalSwipe) {
          // Vertical swipe - prepare to close
          const progress = Math.min(Math.abs(deltaY) / 200, 1);
          galleryTrack.style.transform = 'translateX(-' + (galleryIndex * 100) + 'vw) translateY(' + deltaY + 'px) scale(' + (1 - progress * 0.1) + ')';
          lightbox.style.background = 'rgba(0,0,0,' + Math.max(0, 0.95 - progress * 0.7) + ')';
        } else {
          // Horizontal swipe - move track with finger
          const screenWidth = window.innerWidth;
          const baseOffset = -galleryIndex * screenWidth;
          let dragOffset = deltaX;

          // Add resistance at edges
          if ((galleryIndex === 0 && deltaX > 0) || (galleryIndex === galleryImages.length - 1 && deltaX < 0)) {
            dragOffset = deltaX * 0.3;
          }

          const totalOffset = baseOffset + dragOffset;
          galleryTrack.style.transform = 'translateX(' + totalOffset + 'px)';
        }
      }, { passive: true });

      galleryWrapper.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        const deltaX = touchCurrentX - touchStartX;
        const deltaY = touchCurrentY - touchStartY;
        const screenWidth = window.innerWidth;
        const threshold = screenWidth * 0.2;

        if (isVerticalSwipe) {
          // Handle vertical swipe to close
          const progress = Math.abs(deltaY) / 200;
          if (progress >= CLOSE_THRESHOLD) {
            closeLightbox(false);
          } else {
            // Snap back
            galleryTrack.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            galleryTrack.style.transform = 'translateX(-' + (galleryIndex * 100) + 'vw)';
            lightbox.style.background = '';
          }
        } else {
          // Handle horizontal swipe
          galleryTrack.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

          if (Math.abs(deltaX) > threshold) {
            if (deltaX < 0 && galleryIndex < galleryImages.length - 1) {
              goToSlide(galleryIndex + 1);
            } else if (deltaX > 0 && galleryIndex > 0) {
              goToSlide(galleryIndex - 1);
            } else {
              goToSlide(galleryIndex); // Snap back at edges
            }
          } else {
            goToSlide(galleryIndex); // Snap back
          }
        }

        swipeDirectionLocked = false;
        isVerticalSwipe = false;
      });

      // Touch handlers for single image (vertical swipe to close)
      lightboxContainer.addEventListener('touchstart', (e) => {
        if (isGalleryMode) return;
        isDragging = true;
        touchStartY = e.touches[0].clientY;
        touchCurrentY = touchStartY;
        lightboxContainer.style.transition = 'none';
      }, { passive: true });

      lightboxContainer.addEventListener('touchmove', (e) => {
        if (isGalleryMode || !isDragging || !targetRect) return;
        touchCurrentY = e.touches[0].clientY;
        const deltaY = touchCurrentY - touchStartY;
        const progress = Math.min(Math.abs(deltaY) / 200, 1);
        lightboxContainer.style.top = (targetRect.top + deltaY) + 'px';
        lightbox.style.background = 'rgba(0,0,0,' + Math.max(0, 0.95 - progress * 0.7) + ')';
        lightboxContainer.style.transform = 'scale(' + (1 - progress * 0.1) + ')';
      }, { passive: true });

      lightboxContainer.addEventListener('touchend', () => {
        if (isGalleryMode || !isDragging) return;
        isDragging = false;
        const deltaY = touchCurrentY - touchStartY;
        const progress = Math.abs(deltaY) / 200;

        if (progress >= CLOSE_THRESHOLD) {
          closeLightbox(!!sourceImg);
        } else {
          lightboxContainer.style.transition = 'all 0.25s cubic-bezier(0.2, 0, 0.2, 1)';
          lightboxContainer.style.top = targetRect.top + 'px';
          lightboxContainer.style.transform = 'scale(1)';
          lightbox.style.background = '';
        }
      });

      // Make non-gallery images clickable
      document.addEventListener('DOMContentLoaded', () => {
        const selectors = '.post-content img:not(.slide-main):not(.slide-bg), .post-cover-image img';
        document.querySelectorAll(selectors).forEach(img => {
          img.addEventListener('click', (e) => {
            e.preventDefault();
            openLightbox(img);
          });
        });
      });
    })();

    // Vertical images - auto-detect and wrap with blur background (Instagram style)
    document.addEventListener('DOMContentLoaded', () => {
      const VERTICAL_RATIO = 1.0; // height > width = vertical

      // Auto-detect vertical images in post-content and wrap them
      document.querySelectorAll('.post-content img:not(.slide-main):not(.slide-bg):not(.vertical-image-wrapper img)').forEach(img => {
        const checkAndWrap = () => {
          // Already wrapped? Skip
          if (img.closest('.vertical-image-wrapper')) return;

          if (img.naturalHeight > img.naturalWidth * VERTICAL_RATIO) {
            // Create wrapper with blur background
            const wrapper = document.createElement('div');
            wrapper.className = 'vertical-image-wrapper';

            const bg = document.createElement('div');
            bg.className = 'vertical-image-bg';
            bg.style.backgroundImage = 'url("' + img.src + '")';

            // Wrap the image
            img.parentNode.insertBefore(wrapper, img);
            wrapper.appendChild(bg);
            wrapper.appendChild(img);

            // Image click opens lightbox
            img.addEventListener('click', (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (typeof openLightbox === 'function') openLightbox(img);
            });
          }
        };

        if (img.complete && img.naturalHeight > 0) {
          checkAndWrap();
        } else {
          img.addEventListener('load', checkAndWrap);
        }
      });
    });

    // Gallery slideshow
    (function() {
      const isMobile = window.innerWidth <= 768;

      document.querySelectorAll('.blog-gallery').forEach(gallery => {
        const track = gallery.querySelector('.gallery-track');
        const slides = gallery.querySelectorAll('.gallery-slide');
        const dots = gallery.querySelectorAll('.gallery-dot');
        const counter = gallery.querySelector('.gallery-counter');
        const prevBtn = gallery.querySelector('.gallery-nav.prev');
        const nextBtn = gallery.querySelector('.gallery-nav.next');

        if (!track || slides.length === 0) return;

        let currentIndex = 0;
        const total = slides.length;
        const speed = parseInt(gallery.dataset.speed) || 3000;
        const autoplay = gallery.dataset.autoplay !== 'false';
        let autoplayInterval = null;
        let hintShown = false;

        // Collect image URLs for lightbox navigation
        const galleryImages = [];
        slides.forEach((slide, i) => {
          const img = slide.querySelector('.slide-main');
          if (img) galleryImages.push(img.src);
        });

        // Detect vertical images and add class
        slides.forEach(slide => {
          const img = slide.querySelector('.slide-main');
          if (!img) return;

          const checkOrientation = () => {
            if (img.naturalHeight > img.naturalWidth) {
              slide.classList.add('vertical');
            }
          };

          if (img.complete) {
            checkOrientation();
          } else {
            img.addEventListener('load', checkOrientation);
          }

          // Click opens lightbox with gallery navigation
          img.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof openGalleryLightbox === 'function') {
              openGalleryLightbox(galleryImages, parseInt(slide.dataset.index) || 0);
            } else if (typeof openLightbox === 'function') {
              openLightbox(img);
            }
          });
        });

        function goToSlide(index) {
          currentIndex = (index + total) % total;
          track.style.transform = 'translateX(-' + (currentIndex * 100) + '%)';

          // Update dots
          dots.forEach((dot, i) => {
            dot.classList.toggle('active', i === currentIndex);
          });

          // Update counter
          if (counter) {
            counter.textContent = (currentIndex + 1) + ' / ' + total;
          }
        }

        function nextSlide() {
          goToSlide(currentIndex + 1);
        }

        function prevSlide() {
          goToSlide(currentIndex - 1);
        }

        // Click handlers
        if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); prevSlide(); stopAutoplay(); });
        if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); nextSlide(); stopAutoplay(); });

        dots.forEach((dot, i) => {
          dot.addEventListener('click', (e) => { e.stopPropagation(); goToSlide(i); stopAutoplay(); });
        });

        // Touch swipe support with drag effect
        let touchStartX = 0;
        let touchCurrentX = 0;
        let isDragging = false;
        const galleryWidth = gallery.offsetWidth;

        gallery.addEventListener('touchstart', (e) => {
          isDragging = true;
          touchStartX = e.touches[0].clientX;
          touchCurrentX = touchStartX;
          track.style.transition = 'none'; // Disable transition during drag
        }, { passive: true });

        gallery.addEventListener('touchmove', (e) => {
          if (!isDragging) return;
          touchCurrentX = e.touches[0].clientX;
          const deltaX = touchCurrentX - touchStartX;
          const baseOffset = -currentIndex * 100;
          const dragPercent = (deltaX / galleryWidth) * 100;
          // Apply drag with resistance at edges
          let finalOffset = baseOffset + dragPercent;
          if ((currentIndex === 0 && deltaX > 0) || (currentIndex === total - 1 && deltaX < 0)) {
            finalOffset = baseOffset + dragPercent * 0.3; // Resistance at edges
          }
          track.style.transform = 'translateX(' + finalOffset + '%)';
        }, { passive: true });

        gallery.addEventListener('touchend', () => {
          if (!isDragging) return;
          isDragging = false;
          const deltaX = touchCurrentX - touchStartX;
          const threshold = galleryWidth * 0.2; // 20% of gallery width

          track.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';

          if (Math.abs(deltaX) > threshold) {
            if (deltaX < 0 && currentIndex < total - 1) {
              nextSlide();
            } else if (deltaX > 0 && currentIndex > 0) {
              prevSlide();
            } else {
              goToSlide(currentIndex); // Snap back
            }
            stopAutoplay();
          } else {
            goToSlide(currentIndex); // Snap back
          }
        }, { passive: true });

        // Autoplay functions
        function startAutoplay() {
          if (!autoplay) return;
          if (autoplayInterval) clearInterval(autoplayInterval);
          autoplayInterval = setInterval(nextSlide, speed);
        }

        function stopAutoplay() {
          if (autoplayInterval) clearInterval(autoplayInterval);
          autoplayInterval = null;
        }

        // Pause on hover (desktop) - only for autoplay galleries
        if (autoplay) {
          gallery.addEventListener('mouseenter', () => {
            if (autoplayInterval) clearInterval(autoplayInterval);
          });

          gallery.addEventListener('mouseleave', () => {
            startAutoplay();
          });
        }

        // Manual gallery: show hint animation on mobile
        function showHintAnimation() {
          if (hintShown || total <= 1) return;
          hintShown = true;

          // Peek 20% to show next image exists
          track.style.transition = 'transform 0.3s ease';
          track.style.transform = 'translateX(-20%)';

          setTimeout(() => {
            track.style.transform = 'translateX(0)';
            setTimeout(() => {
              track.style.transition = 'transform 0.5s ease';
            }, 300);
          }, 500);
        }

        // Initialize
        goToSlide(0);

        if (autoplay) {
          startAutoplay();
        } else {
          // Manual gallery - show hint on mobile when gallery comes into view
          if (isMobile && total > 1) {
            const observer = new IntersectionObserver((entries) => {
              entries.forEach(entry => {
                if (entry.isIntersecting && !hintShown) {
                  setTimeout(showHintAnimation, 500);
                  observer.disconnect();
                }
              });
            }, { threshold: 0.5 });
            observer.observe(gallery);
          }
        }
      });
    })();

    // FAQ accordion - collapsible items
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.faq-question').forEach(question => {
        question.addEventListener('click', () => {
          const item = question.closest('.faq-item');
          if (item) {
            item.classList.toggle('open');
          }
        });
      });
    });
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
      canonical: normalizeCanonical(settings.canonical, `${SITE_URL}/blog`),
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

    // Process galleries and special content
    processedContent = processContent(processedContent);

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

        <!-- Mobile Read Also (shows on tablet/mobile after FAQ) -->
        ${relatedPosts && relatedPosts.length > 0 ? `
          <div class="mobile-read-also">
            <h3 class="mobile-read-also-title">📚 Читайте также</h3>
            <div class="mobile-read-also-list">
              ${relatedPosts.slice(0, 4).map(p => `
                <a href="/blog/${p.slug}" class="mobile-read-also-item">
                  ${p.coverImage ? `
                    <div class="mobile-read-also-thumb">
                      <img src="${p.coverImage}" alt="${escapeHtml(p.title)}" loading="lazy">
                    </div>
                  ` : `
                    <div class="mobile-read-also-thumb mobile-read-also-thumb-empty">
                      <span>📄</span>
                    </div>
                  `}
                  <div class="mobile-read-also-info">
                    <span class="mobile-read-also-item-title">${escapeHtml(p.title)}</span>
                    <span class="mobile-read-also-date">${formatDate(p.publishedAt)}</span>
                  </div>
                </a>
              `).join('')}
            </div>
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
      canonical: normalizeCanonical(post.canonical, `${SITE_URL}/blog/${post.slug}`),
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
