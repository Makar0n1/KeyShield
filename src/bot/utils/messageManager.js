/**
 * Message Manager - implements single-message navigation system
 *
 * CORE PRINCIPLE: Only 2 messages in chat at any time:
 * 1. User's /start command
 * 2. Bot's main editable message
 *
 * All user text inputs are deleted after processing.
 * All navigation happens via editMessageText.
 */

class MessageManager {
  constructor() {
    // Track main message ID for each user (userId -> messageId)
    this.mainMessages = new Map();

    // Navigation stack with full screen data for "Back" button
    // userId -> [{ screen, text, keyboard }]
    this.navigationStack = new Map();

    // Current screen name for each user (userId -> screenName)
    this.currentScreen = new Map();

    // Current screen data (text + keyboard) for notifications
    // userId -> { text, keyboard }
    this.currentScreenData = new Map();

    // Track last activity time for each user (userId -> timestamp)
    this.lastActivity = new Map();

    // Memory management settings
    this.MAX_ENTRIES = 5000;
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
   * Record user activity
   */
  recordActivity(userId) {
    this.lastActivity.set(userId, Date.now());
  }

  /**
   * Cleanup inactive users
   */
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [userId, lastActive] of this.lastActivity) {
      if (now - lastActive > this.INACTIVE_THRESHOLD) {
        this.clearUser(userId);
        cleanedCount++;
      }
    }

    if (this.mainMessages.size > this.MAX_ENTRIES) {
      const entries = [...this.lastActivity.entries()]
        .sort((a, b) => a[1] - b[1]);

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
   */
  clearUser(userId) {
    this.mainMessages.delete(userId);
    this.navigationStack.delete(userId);
    this.currentScreen.delete(userId);
    this.currentScreenData.delete(userId);
    this.lastActivity.delete(userId);
  }

  /**
   * Get memory stats
   */
  getStats() {
    return {
      mainMessages: this.mainMessages.size,
      navigationStack: this.navigationStack.size,
      currentScreen: this.currentScreen.size,
      lastActivity: this.lastActivity.size
    };
  }

  // ============================================
  // CORE MESSAGE OPERATIONS
  // ============================================

  /**
   * Edit the main message (or send new if doesn't exist)
   * This is the PRIMARY method for showing content
   */
  async editMainMessage(ctx, userId, text, keyboard = null) {
    this.recordActivity(userId);

    const messageId = this.mainMessages.get(userId);
    const extra = {
      parse_mode: 'Markdown',
      ...(keyboard ? { reply_markup: keyboard.reply_markup || keyboard } : {})
    };

    try {
      if (messageId) {
        // Try to edit existing message
        try {
          await ctx.telegram.editMessageText(userId, messageId, null, text, extra);
          return messageId;
        } catch (error) {
          // Message might be deleted or too old, send new one
          if (error.description?.includes('message is not modified')) {
            return messageId; // Same content, no need to update
          }
          console.log(`Could not edit message ${messageId}, sending new one`);
        }
      }

      // Send new message
      const newMsg = await ctx.telegram.sendMessage(userId, text, extra);
      this.mainMessages.set(userId, newMsg.message_id);
      return newMsg.message_id;
    } catch (error) {
      console.error('Error in editMainMessage:', error.message);
      return null;
    }
  }

  /**
   * Delete user's message (for text inputs)
   */
  async deleteUserMessage(ctx) {
    try {
      if (ctx.message?.message_id) {
        await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
      }
    } catch (error) {
      // Ignore - message might already be deleted or bot lacks permissions
    }
  }

  /**
   * Delete bot's main message (used on /start to reset)
   */
  async deleteMainMessage(ctx, userId) {
    const messageId = this.mainMessages.get(userId);
    if (messageId) {
      try {
        await ctx.telegram.deleteMessage(userId, messageId);
      } catch (error) {
        // Ignore
      }
      this.mainMessages.delete(userId);
    }
  }

  /**
   * Set main message ID (when sending externally)
   */
  setMainMessage(userId, messageId) {
    this.mainMessages.set(userId, messageId);
  }

  /**
   * Get main message ID
   */
  getMainMessage(userId) {
    return this.mainMessages.get(userId) || null;
  }

  // ============================================
  // NAVIGATION WITH FULL STATE
  // ============================================

  /**
   * Push current screen to stack and navigate to new screen
   * Saves full screen state for "Back" button
   */
  pushScreen(userId, screenName, text, keyboard) {
    this.recordActivity(userId);

    // Save current screen to stack (if exists)
    const currentData = this.currentScreenData.get(userId);
    const currentScreenName = this.currentScreen.get(userId);

    if (currentScreenName && currentData) {
      let stack = this.navigationStack.get(userId) || [];
      stack.push({
        screen: currentScreenName,
        text: currentData.text,
        keyboard: currentData.keyboard
      });
      this.navigationStack.set(userId, stack);
    }

    // Set new current screen
    this.currentScreen.set(userId, screenName);
    this.currentScreenData.set(userId, { text, keyboard });
  }

  /**
   * Go back to previous screen
   * Returns the previous screen data or null if at root
   */
  popScreen(userId) {
    const stack = this.navigationStack.get(userId) || [];

    if (stack.length === 0) {
      return null;
    }

    const previousScreen = stack.pop();
    this.navigationStack.set(userId, stack);

    // Set as current screen
    this.currentScreen.set(userId, previousScreen.screen);
    this.currentScreenData.set(userId, {
      text: previousScreen.text,
      keyboard: previousScreen.keyboard
    });

    return previousScreen;
  }

  /**
   * Navigate to screen and show it (combined push + edit)
   */
  async navigateToScreen(ctx, userId, screenName, text, keyboard) {
    this.pushScreen(userId, screenName, text, keyboard);
    return await this.editMainMessage(ctx, userId, text, keyboard);
  }

  /**
   * Go back to previous screen and show it
   */
  async goBack(ctx, userId) {
    const previousScreen = this.popScreen(userId);

    if (!previousScreen) {
      // No previous screen, go to main menu
      return null;
    }

    await this.editMainMessage(ctx, userId, previousScreen.text, previousScreen.keyboard);
    return previousScreen.screen;
  }

  /**
   * Get current screen name
   */
  getCurrentScreen(userId) {
    return this.currentScreen.get(userId) || null;
  }

  /**
   * Reset navigation to main menu (clear stack)
   */
  resetNavigation(userId) {
    this.navigationStack.delete(userId);
    this.currentScreen.set(userId, 'main_menu');
    this.currentScreenData.delete(userId);
  }

  /**
   * Clear stack but keep current screen
   */
  clearStack(userId) {
    this.navigationStack.delete(userId);
  }

  /**
   * Set current screen data without pushing to stack
   * Used for updating current screen content
   */
  setCurrentScreenData(userId, screenName, text, keyboard) {
    this.currentScreen.set(userId, screenName);
    this.currentScreenData.set(userId, { text, keyboard });
  }

  // ============================================
  // NOTIFICATION HANDLING
  // ============================================

  /**
   * Show notification by pushing current screen and displaying notification
   * Notification always has "Back" button to return to previous state
   */
  async showNotification(ctx, userId, text, keyboard) {
    this.recordActivity(userId);

    // Save current screen to stack
    const currentData = this.currentScreenData.get(userId);
    const currentScreenName = this.currentScreen.get(userId);

    if (currentScreenName && currentData) {
      let stack = this.navigationStack.get(userId) || [];
      stack.push({
        screen: currentScreenName,
        text: currentData.text,
        keyboard: currentData.keyboard
      });
      this.navigationStack.set(userId, stack);
    }

    // Set notification as current screen
    this.currentScreen.set(userId, 'notification');
    this.currentScreenData.set(userId, { text, keyboard });

    // Edit main message to show notification
    return await this.editMainMessage(ctx, userId, text, keyboard);
  }

  /**
   * Show final screen (clears stack, no "Back" possible)
   */
  async showFinalScreen(ctx, userId, screenName, text, keyboard) {
    this.recordActivity(userId);

    // Clear navigation stack
    this.navigationStack.delete(userId);

    // Set as current screen
    this.currentScreen.set(userId, screenName);
    this.currentScreenData.set(userId, { text, keyboard });

    return await this.editMainMessage(ctx, userId, text, keyboard);
  }

  // ============================================
  // LEGACY COMPATIBILITY (sendOrEdit)
  // ============================================

  /**
   * Legacy method - wraps editMainMessage
   * @deprecated Use editMainMessage or navigateToScreen instead
   */
  async sendOrEdit(ctx, userId, text, extra = {}) {
    return await this.editMainMessage(ctx, userId, text, extra);
  }

  /**
   * Legacy navigation method
   * @deprecated Use pushScreen instead
   */
  navigateTo(userId, screenName) {
    this.recordActivity(userId);

    const current = this.currentScreen.get(userId);
    if (current === screenName) return;

    if (current) {
      let stack = this.navigationStack.get(userId) || [];
      stack.push({ screen: current, text: null, keyboard: null });
      this.navigationStack.set(userId, stack);
    }

    this.currentScreen.set(userId, screenName);
  }
}

// Export singleton
module.exports = new MessageManager();
