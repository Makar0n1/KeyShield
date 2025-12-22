/**
 * Prerender Service for SEO
 *
 * Renders SPA pages to static HTML for search engine bots.
 * Uses Puppeteer to render pages and caches the results.
 */

import puppeteer from 'puppeteer';
import { LRUCache } from 'lru-cache';

// Cache rendered pages (max 100 pages, 1 hour TTL)
const cache = new LRUCache({
  max: 100,
  ttl: 1000 * 60 * 60, // 1 hour
});

// Bot User-Agents to detect
const BOT_AGENTS = [
  'googlebot',
  'bingbot',
  'yandexbot',
  'duckduckbot',
  'slurp',
  'baiduspider',
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'telegrambot',
  'applebot',
  'pinterest',
  'semrushbot',
  'ahrefsbot',
  'mj12bot',
  'petalbot',
  'dotbot',
  // AI search bots (we WANT them to see our content)
  'oai-searchbot',
  'perplexitybot',
  'chatgpt',
];

// Paths that should NOT be prerendered (admin, partner, etc.)
const EXCLUDED_PATHS = [
  '/admin',
  '/partner',
  '/api/',
];

let browser = null;

/**
 * Check if request is from a bot
 */
export function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_AGENTS.some(bot => ua.includes(bot));
}

/**
 * Check if path should be prerendered
 */
export function shouldPrerender(path) {
  return !EXCLUDED_PATHS.some(excluded => path.startsWith(excluded));
}

/**
 * Get or launch browser instance
 */
async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    console.log('🚀 Launching Puppeteer browser for prerendering...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--single-process',
      ],
    });
  }
  return browser;
}

/**
 * Render a page and return HTML
 */
export async function renderPage(url, baseUrl) {
  const fullUrl = `${baseUrl}${url}`;

  // Check cache first
  const cached = cache.get(url);
  if (cached) {
    console.log(`📦 Cache hit: ${url}`);
    return cached;
  }

  console.log(`🔄 Prerendering: ${url}`);
  const startTime = Date.now();

  try {
    const browserInstance = await getBrowser();
    const page = await browserInstance.newPage();

    // Set a realistic viewport
    await page.setViewport({ width: 1280, height: 800 });

    // Set user agent to avoid being detected as headless
    await page.setUserAgent('Mozilla/5.0 (compatible; KeyShieldPrerender/1.0)');

    // Block unnecessary resources for faster rendering
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      // Block images, fonts, media for faster rendering
      if (['image', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate to page
    await page.goto(fullUrl, {
      waitUntil: 'networkidle0',
      timeout: 15000,
    });

    // Wait for React to render (wait for content to appear)
    await page.waitForSelector('#root > *', { timeout: 10000 });

    // Additional wait for dynamic content
    await new Promise(r => setTimeout(r, 1000));

    // Get the rendered HTML
    const html = await page.content();

    await page.close();

    const renderTime = Date.now() - startTime;
    console.log(`✅ Prerendered ${url} in ${renderTime}ms`);

    // Cache the result
    cache.set(url, html);

    return html;
  } catch (error) {
    console.error(`❌ Prerender error for ${url}:`, error.message);
    throw error;
  }
}

/**
 * Express middleware for prerendering
 */
export function prerenderMiddleware(baseUrl) {
  return async (req, res, next) => {
    // Only handle GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check if it's a bot
    const userAgent = req.headers['user-agent'] || '';
    if (!isBot(userAgent)) {
      return next();
    }

    // Check if path should be prerendered
    if (!shouldPrerender(req.path)) {
      return next();
    }

    // Skip API routes and static files
    if (req.path.startsWith('/api/') ||
        req.path.includes('.') ||
        req.path.startsWith('/uploads/')) {
      return next();
    }

    try {
      const html = await renderPage(req.path, baseUrl);

      // Add header to indicate this was prerendered
      res.set('X-Prerendered', 'true');
      res.set('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      console.error('Prerender middleware error:', error.message);
      // Fall back to normal SPA rendering
      next();
    }
  };
}

/**
 * Clear cache for a specific URL or all
 */
export function clearCache(url = null) {
  if (url) {
    cache.delete(url);
    console.log(`🗑️ Cache cleared for: ${url}`);
  } else {
    cache.clear();
    console.log('🗑️ All prerender cache cleared');
  }
}

/**
 * Get cache stats
 */
export function getCacheStats() {
  return {
    size: cache.size,
    max: cache.max,
  };
}

/**
 * Shutdown browser
 */
export async function shutdown() {
  if (browser) {
    await browser.close();
    browser = null;
    console.log('🛑 Puppeteer browser closed');
  }
}

// Handle process termination
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
