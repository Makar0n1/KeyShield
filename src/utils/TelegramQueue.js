/**
 * Telegram Message Queue with Rate Limiting
 *
 * Telegram limits:
 * - 30 messages per second globally
 * - 1 message per second per chat (soft limit)
 * - 20 messages per minute to same group
 *
 * This queue ensures we never exceed these limits even under high load.
 */

class TelegramQueue {
  constructor(options = {}) {
    // Rate limiting settings
    this.maxPerSecond = options.maxPerSecond || 25; // Leave 5 msg/sec headroom
    this.minDelayMs = options.minDelayMs || 50;     // Min 50ms between messages

    // Queue state
    this.queue = [];
    this.processing = false;
    this.lastSendTime = 0;
    this.sendCount = 0;
    this.lastSecond = 0;

    // Per-user rate limiting (1 msg/sec soft limit)
    this.userLastSend = new Map();
    this.USER_MIN_DELAY = 100; // 100ms between messages to same user

    // Stats
    this.stats = {
      totalSent: 0,
      totalQueued: 0,
      totalFailed: 0,
      peakQueueSize: 0
    };

    // Cleanup old user timestamps every minute
    setInterval(() => this.cleanupUserTimestamps(), 60000);
  }

  /**
   * Enqueue a message to be sent
   * @param {Object} telegram - Telegraf telegram instance
   * @param {number} chatId - Chat/User ID
   * @param {string} text - Message text
   * @param {Object} options - Send options (parse_mode, reply_markup, etc.)
   * @returns {Promise<Object>} - Message result or error
   */
  async sendMessage(telegram, chatId, text, options = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        type: 'sendMessage',
        telegram,
        chatId,
        text,
        options,
        resolve,
        reject,
        addedAt: Date.now()
      });

      this.stats.totalQueued++;
      this.stats.peakQueueSize = Math.max(this.stats.peakQueueSize, this.queue.length);

      this.processQueue();
    });
  }

  /**
   * Enqueue message edit
   */
  async editMessageText(telegram, chatId, messageId, text, options = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        type: 'editMessageText',
        telegram,
        chatId,
        messageId,
        text,
        options,
        resolve,
        reject,
        addedAt: Date.now()
      });

      this.stats.totalQueued++;
      this.processQueue();
    });
  }

  /**
   * Enqueue message deletion
   */
  async deleteMessage(telegram, chatId, messageId) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        type: 'deleteMessage',
        telegram,
        chatId,
        messageId,
        resolve,
        reject,
        addedAt: Date.now()
      });

      this.stats.totalQueued++;
      this.processQueue();
    });
  }

  /**
   * Process queue with rate limiting
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();

      // Check global rate limit
      await this.waitForGlobalRateLimit();

      // Check per-user rate limit
      await this.waitForUserRateLimit(task.chatId);

      try {
        let result;

        switch (task.type) {
          case 'sendMessage':
            result = await task.telegram.sendMessage(task.chatId, task.text, task.options);
            break;
          case 'editMessageText':
            result = await task.telegram.editMessageText(
              task.chatId,
              task.messageId,
              null,
              task.text,
              task.options
            );
            break;
          case 'deleteMessage':
            result = await task.telegram.deleteMessage(task.chatId, task.messageId);
            break;
        }

        this.stats.totalSent++;
        this.userLastSend.set(task.chatId, Date.now());
        task.resolve(result);

      } catch (error) {
        this.stats.totalFailed++;

        // Handle rate limit error (429)
        if (error.response?.error_code === 429) {
          const retryAfter = error.response.parameters?.retry_after || 1;
          console.warn(`⚠️ TelegramQueue: Rate limited, waiting ${retryAfter}s`);

          // Put task back in front of queue
          this.queue.unshift(task);
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          continue;
        }

        // Handle "message not modified" silently
        if (error.description?.includes('message is not modified')) {
          task.resolve(null);
          continue;
        }

        // Handle blocked/deleted users silently
        if (
          error.description?.includes('bot was blocked') ||
          error.description?.includes('chat not found') ||
          error.description?.includes('user is deactivated')
        ) {
          console.log(`📵 User ${task.chatId} blocked bot or deleted`);
          task.resolve(null);
          continue;
        }

        task.reject(error);
      }
    }

    this.processing = false;
  }

  /**
   * Wait for global rate limit (30 msg/sec)
   */
  async waitForGlobalRateLimit() {
    const now = Date.now();
    const currentSecond = Math.floor(now / 1000);

    // Reset counter each second
    if (currentSecond !== this.lastSecond) {
      this.sendCount = 0;
      this.lastSecond = currentSecond;
    }

    // If at limit, wait until next second
    if (this.sendCount >= this.maxPerSecond) {
      const waitMs = 1000 - (now % 1000) + 10; // Wait until next second + 10ms buffer
      await new Promise(r => setTimeout(r, waitMs));
      this.sendCount = 0;
      this.lastSecond = Math.floor(Date.now() / 1000);
    }

    // Ensure minimum delay between any messages
    const timeSinceLastSend = now - this.lastSendTime;
    if (timeSinceLastSend < this.minDelayMs) {
      await new Promise(r => setTimeout(r, this.minDelayMs - timeSinceLastSend));
    }

    this.sendCount++;
    this.lastSendTime = Date.now();
  }

  /**
   * Wait for per-user rate limit
   */
  async waitForUserRateLimit(chatId) {
    const lastSend = this.userLastSend.get(chatId);
    if (lastSend) {
      const timeSince = Date.now() - lastSend;
      if (timeSince < this.USER_MIN_DELAY) {
        await new Promise(r => setTimeout(r, this.USER_MIN_DELAY - timeSince));
      }
    }
  }

  /**
   * Cleanup old user timestamps
   */
  cleanupUserTimestamps() {
    const now = Date.now();
    const maxAge = 60000; // 1 minute

    for (const [userId, timestamp] of this.userLastSend.entries()) {
      if (now - timestamp > maxAge) {
        this.userLastSend.delete(userId);
      }
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentQueueSize: this.queue.length,
      isProcessing: this.processing
    };
  }

  /**
   * Get queue size
   */
  get size() {
    return this.queue.length;
  }
}

// Export singleton instance
module.exports = new TelegramQueue();
