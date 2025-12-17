/**
 * Token Bucket Rate Limiter
 *
 * Used for TronGrid API rate limiting (max ~10 req/sec on free tier)
 * Prevents API blocks under high load.
 */

class RateLimiter {
  constructor(options = {}) {
    // Requests per second
    this.maxReqPerSec = options.maxReqPerSec || 8;

    // Token bucket state
    this.tokens = this.maxReqPerSec;
    this.lastRefill = Date.now();

    // Stats
    this.stats = {
      totalRequests: 0,
      totalWaits: 0,
      totalWaitTimeMs: 0
    };
  }

  /**
   * Wait for a token (rate limit)
   * Returns immediately if tokens available, otherwise waits
   */
  async waitForToken() {
    const now = Date.now();

    // Refill tokens based on time passed
    const timePassed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxReqPerSec, this.tokens + timePassed * this.maxReqPerSec);
    this.lastRefill = now;

    // If no tokens, wait
    if (this.tokens < 1) {
      const waitTime = Math.ceil((1 - this.tokens) * 1000 / this.maxReqPerSec);
      this.stats.totalWaits++;
      this.stats.totalWaitTimeMs += waitTime;

      await new Promise(r => setTimeout(r, waitTime));

      // Refill after wait
      const afterWait = Date.now();
      const waited = (afterWait - this.lastRefill) / 1000;
      this.tokens = Math.min(this.maxReqPerSec, this.tokens + waited * this.maxReqPerSec);
      this.lastRefill = afterWait;
    }

    // Consume token
    this.tokens--;
    this.stats.totalRequests++;
  }

  /**
   * Try to get a token without waiting
   * Returns true if token acquired, false if rate limited
   */
  tryAcquire() {
    const now = Date.now();

    // Refill tokens
    const timePassed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxReqPerSec, this.tokens + timePassed * this.maxReqPerSec);
    this.lastRefill = now;

    if (this.tokens >= 1) {
      this.tokens--;
      this.stats.totalRequests++;
      return true;
    }

    return false;
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      ...this.stats,
      currentTokens: this.tokens,
      avgWaitTimeMs: this.stats.totalWaits > 0
        ? this.stats.totalWaitTimeMs / this.stats.totalWaits
        : 0
    };
  }
}

module.exports = RateLimiter;
