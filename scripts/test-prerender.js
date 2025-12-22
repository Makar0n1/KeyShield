/**
 * Test Prerender Service
 *
 * Usage: node scripts/test-prerender.js [URL]
 * Example: node scripts/test-prerender.js https://keyshield.me
 */

const https = require('https');
const http = require('http');

const BASE_URL = process.argv[2] || 'http://localhost:3001';

const USER_AGENTS = {
  'Chrome (normal user)': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Googlebot': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Bingbot': 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  'Yandexbot': 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
  'Facebookbot': 'facebookexternalhit/1.1',
  'Twitterbot': 'Twitterbot/1.0',
  'OAI-SearchBot': 'OAI-SearchBot/1.0',
  'PerplexityBot': 'PerplexityBot/1.0',
};

const PATHS = ['/', '/blog', '/terms'];

async function fetchPage(url, userAgent) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    const options = {
      headers: {
        'User-Agent': userAgent,
      },
      timeout: 30000,
    };

    const req = client.get(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body,
          prerendered: res.headers['x-prerendered'] === 'true',
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function hasContent(html) {
  // Check if HTML has actual rendered content (not just empty root)
  const contentIndicators = [
    'Безопасный',
    'KeyShield',
    'Multisig',
    'escrow',
    '<h1',
    '<article',
  ];

  return contentIndicators.some(indicator => html.includes(indicator));
}

async function runTests() {
  console.log('🧪 Prerender Test Suite');
  console.log('========================');
  console.log(`Base URL: ${BASE_URL}\n`);

  let passed = 0;
  let failed = 0;

  for (const path of PATHS) {
    const url = `${BASE_URL}${path}`;
    console.log(`\n📄 Testing: ${path}`);
    console.log('─'.repeat(50));

    for (const [name, ua] of Object.entries(USER_AGENTS)) {
      const isBot = !name.includes('normal');

      try {
        const result = await fetchPage(url, ua);
        const hasRenderedContent = hasContent(result.body);

        // For bots: should be prerendered with content
        // For normal users: should NOT be prerendered
        const expectedPrerender = isBot;
        const testPassed = isBot
          ? (result.prerendered && hasRenderedContent)
          : !result.prerendered;

        const status = testPassed ? '✅' : '❌';
        const prerenderStatus = result.prerendered ? '🤖 Prerendered' : '📱 SPA';
        const contentStatus = hasRenderedContent ? 'Has content' : 'Empty/minimal';

        console.log(`  ${status} ${name.padEnd(25)} | ${prerenderStatus.padEnd(15)} | ${contentStatus}`);

        if (testPassed) passed++;
        else failed++;

      } catch (error) {
        console.log(`  ❌ ${name.padEnd(25)} | Error: ${error.message}`);
        failed++;
      }
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`📊 Results: ${passed} passed, ${failed} failed`);

  if (failed === 0) {
    console.log('🎉 All tests passed! Prerendering is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Check the results above.');
  }
}

// Also test cache stats endpoint if admin token is available
async function testCacheStats() {
  console.log('\n\n📦 Cache Stats (requires running server with requests):');
  console.log('─'.repeat(50));
  console.log('To check cache stats, call:');
  console.log(`  curl -H "Authorization: Bearer YOUR_TOKEN" ${BASE_URL}/api/admin/prerender/stats`);
}

runTests()
  .then(testCacheStats)
  .catch(console.error);
