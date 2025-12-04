/**
 * Message Manager - implements single-message navigation system
 * Core concept: Always maximum 2 messages in chat (user command + bot's dynamic message)
 *
 * Memory management: Automatic cleanup of inactive users to prevent memory leaks
 */

class MessageManager {
  constructor() {
    // Track main message ID for each user (userId -> messageId)
    this.mainMessages = new Map();

    // Track navigation stack for each user (userId -> [screens])
    this.navigationStack = new Map();

    // Track current screen for each user (userId -> screenName)
    this.currentScreen = new Map();

    // Store temporary message IDs that should be deleted
    this.tempMessages = new Map(); // userId -> [messageIds]

    // Pinned messages for deals (kept for backwards compatibility)
    this.pinnedMessages = new Map(); // userId -> messageId

    // Track last activity time for each user (userId -> timestamp)
    this.lastActivity = new Map();

    // Memory management settings
    this.MAX_ENTRIES = 5000; // Maximum users to track before forced cleanup
    this.CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes
    this.INACTIVE_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours

    // Start periodic cleanup
    this.startCleanupInterval();
  }

  /**
   * Start periodic cleanup of inactive users
   */
  startCleanupInterval() {
    setInterval(() => this.cleanup(), this.CLEANUP_INTERVAL);
    console.log('🧹 MessageManager cleanup interval started (every 30 min)');
  }

  /**
   * Record user activity (call this on every user interaction)
   * @param {number} userId
   */
  recordActivity(userId) {
    this.lastActivity.set(userId, Date.now());
  }

  /**
   * Cleanup inactive users and enforce max entries limit
   */
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    // Remove users inactive for more than threshold
    for (const [userId, lastActive] of this.lastActivity) {
      if (now - lastActive > this.INACTIVE_THRESHOLD) {
        this.clearUser(userId);
        cleanedCount++;
      }
    }

    // If still over limit, remove oldest entries
    if (this.mainMessages.size > this.MAX_ENTRIES) {
      const entries = [...this.lastActivity.entries()]
        .sort((a, b) => a[1] - b[1]); // Sort by oldest first

      const toRemove = entries.slice(0, this.mainMessages.size - this.MAX_ENTRIES);
      for (const [userId] of toRemove) {
        this.clearUser(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 MessageManager cleanup: removed ${cleanedCount} inactive users, ${this.mainMessages.size} active sessions`);
    }
  }

  /**
   * Clear all data for a specific user
   * @param {number} userId
   */
  clearUser(userId) {
    this.mainMessages.delete(userId);
    this.navigationStack.delete(userId);
    this.currentScreen.delete(userId);
    this.tempMessages.delete(userId);
    this.pinnedMessages.delete(userId);
    this.lastActivity.delete(userId);
  }

  /**
   * Get current memory usage stats
   * @returns {Object}
   */
  getStats() {
    return {
      mainMessages: this.mainMessages.size,
      navigationStack: this.navigationStack.size,
      currentScreen: this.currentScreen.size,
      tempMessages: this.tempMessages.size,
      pinnedMessages: this.pinnedMessages.size,
      lastActivity: this.lastActivity.size
    };
  }

  /**
   * Send or edit main message
   * If main message exists, edit it; otherwise send new one
   * @param {Object} ctx - Telegraf context
   * @param {number} userId - User's Telegram ID
   * @param {string} text - Message text
   * @param {Object} extra - Extra options (keyboards, parse_mode, etc.)
   * @returns {number} messageId
   */
  async sendOrEdit(ctx, userId, text, extra = {}) {
    // Track user activity for memory management
    this.recordActivity(userId);

    const messageId = this.mainMessages.get(userId);

    try {
      if (messageId) {
        // Try to edit existing message
        try {
          await ctx.telegram.editMessageText(
            userId,
            messageId,
            undefined,
            text,
            {
              parse_mode: 'Markdown',
              ...extra
            }
          );
          return messageId;
        } catch (error) {
          // If edit fails (message deleted, too old, etc.), send new one
          console.log(`Could not edit message ${messageId}, sending new one`);
          const newMsg = await ctx.telegram.sendMessage(userId, text, {
            parse_mode: 'Markdown',
            ...extra
          });
          this.mainMessages.set(userId, newMsg.message_id);
          return newMsg.message_id;
        }
      } else {
        // Send new message
        const newMsg = await ctx.telegram.sendMessage(userId, text, {
          parse_mode: 'Markdown',
          ...extra
        });
        this.mainMessages.set(userId, newMsg.message_id);
        return newMsg.message_id;
      }
    } catch (error) {
      console.error('Error in sendOrEdit:', error);
      return null;
    }
  }

  /**
   * Set main message ID (when message is sent externally)
   * @param {number} userId
   * @param {number} messageId
   */
  setMainMessage(userId, messageId) {
    this.mainMessages.set(userId, messageId);
  }

  /**
   * Get main message ID for user
   * @param {number} userId
   * @returns {number|null}
   */
  getMainMessage(userId) {
    return this.mainMessages.get(userId) || null;
  }

  /**
   * Delete main message and clear tracking
   * @param {Object} ctx
   * @param {number} userId
   */
  async clearMainMessage(ctx, userId) {
    const messageId = this.mainMessages.get(userId);
    if (messageId) {
      try {
        await ctx.telegram.deleteMessage(userId, messageId);
      } catch (error) {
        // Ignore errors
      }
      this.mainMessages.delete(userId);
    }
  }

  /**
   * Navigate to screen (track navigation for back button)
   * @param {number} userId
   * @param {string} screenName
   */
  navigateTo(userId, screenName) {
    // Track user activity
    this.recordActivity(userId);

    // Get current screen
    const current = this.currentScreen.get(userId);

    // If navigating to same screen, don't add to stack
    if (current === screenName) {
      return;
    }

    // Add current screen to navigation stack
    if (current) {
      let stack = this.navigationStack.get(userId) || [];
      stack.push(current);
      this.navigationStack.set(userId, stack);
    }

    // Set new current screen
    this.currentScreen.set(userId, screenName);
  }

  /**
   * Go back in navigation
   * @param {number} userId
   * @returns {string|null} Previous screen name or null if at start
   */
  goBack(userId) {
    const stack = this.navigationStack.get(userId) || [];

    if (stack.length === 0) {
      return null;
    }

    // Pop last screen from stack
    const previousScreen = stack.pop();
    this.navigationStack.set(userId, stack);

    // Set as current screen
    this.currentScreen.set(userId, previousScreen);

    return previousScreen;
  }

  /**
   * Get current screen
   * @param {number} userId
   * @returns {string|null}
   */
  getCurrentScreen(userId) {
    return this.currentScreen.get(userId) || null;
  }

  /**
   * Reset navigation to main menu
   * @param {number} userId
   */
  resetNavigation(userId) {
    this.navigationStack.delete(userId);
    this.currentScreen.set(userId, 'main_menu');
  }

  /**
   * Delete user's command message if they're already on that screen
   * @param {Object} ctx
   * @param {string} targetScreen
   */
  async deleteCommandIfOnScreen(ctx, targetScreen) {
    const userId = ctx.from.id;
    const currentScreen = this.getCurrentScreen(userId);

    if (currentScreen === targetScreen && ctx.message) {
      try {
        await ctx.deleteMessage();
      } catch (error) {
        // Ignore errors
      }
    }
  }

  /**
   * Track a temporary message that should be deleted later
   * @param {number} userId
   * @param {number} messageId
   */
  addTempMessage(userId, messageId) {
    if (!this.tempMessages.has(userId)) {
      this.tempMessages.set(userId, []);
    }
    this.tempMessages.get(userId).push(messageId);
  }

  /**
   * Delete all temporary messages for a user
   * @param {Object} ctx - Telegraf context
   * @param {number} userId
   */
  async clearTempMessages(ctx, userId) {
    const messages = this.tempMessages.get(userId);
    if (!messages || messages.length === 0) return;

    for (const messageId of messages) {
      try {
        await ctx.telegram.deleteMessage(userId, messageId);
      } catch (error) {
        // Ignore errors (message might be already deleted)
        console.log(`Could not delete message ${messageId}: ${error.message}`);
      }
    }

    this.tempMessages.delete(userId);
  }

  /**
   * Send a temporary message that will be auto-deleted
   * @param {Object} ctx
   * @param {number} userId
   * @param {string} text
   * @param {Object} extra
   */
  async sendTempMessage(ctx, userId, text, extra = {}) {
    try {
      const message = await ctx.telegram.sendMessage(userId, text, extra);
      this.addTempMessage(userId, message.message_id);
      return message;
    } catch (error) {
      console.error('Error sending temp message:', error);
      return null;
    }
  }

  /**
   * Delete a single message safely
   * @param {Object} ctx
   * @param {number} chatId
   * @param {number} messageId
   */
  async deleteMessage(ctx, chatId, messageId) {
    try {
      await ctx.telegram.deleteMessage(chatId, messageId);
    } catch (error) {
      // Ignore
    }
  }

  /**
   * Pin a message for active deal (kept for backwards compatibility)
   * @param {Object} ctx
   * @param {number} userId
   * @param {string} text
   * @returns {number} messageId
   */
  async pinDealMessage(ctx, userId, text) {
    try {
      // Unpin previous message if exists
      const previousPinned = this.pinnedMessages.get(userId);
      if (previousPinned) {
        try {
          await ctx.telegram.unpinChatMessage(userId, previousPinned);
          await ctx.telegram.deleteMessage(userId, previousPinned);
        } catch (error) {
          // Ignore
        }
      }

      // Send and pin new message
      const message = await ctx.telegram.sendMessage(userId, text, {
        parse_mode: 'Markdown',
        disable_notification: true
      });

      await ctx.telegram.pinChatMessage(userId, message.message_id, {
        disable_notification: true
      });

      this.pinnedMessages.set(userId, message.message_id);
      return message.message_id;
    } catch (error) {
      console.error('Error pinning message:', error);
      return null;
    }
  }

  /**
   * Unpin and delete deal message
   * @param {Object} ctx
   * @param {number} userId
   */
  async unpinDealMessage(ctx, userId) {
    const pinnedMessageId = this.pinnedMessages.get(userId);
    if (!pinnedMessageId) return;

    try {
      await ctx.telegram.unpinChatMessage(userId, pinnedMessageId);
      await ctx.telegram.deleteMessage(userId, pinnedMessageId);
      this.pinnedMessages.delete(userId);
    } catch (error) {
      console.error('Error unpinning message:', error);
    }
  }
}

// Export singleton
module.exports = new MessageManager();
