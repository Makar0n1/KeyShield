/**
 * Message Manager v2 - DELETE + SEND pattern
 *
 * CORE PRINCIPLE: Only 2 messages in chat at any time:
 * 1. User's /start command
 * 2. Bot's main message (deleted and re-sent on every navigation)
 *
 * NO IN-MEMORY CACHE - all state is read from MongoDB.
 * This eliminates sync issues between bot and web server processes.
 *
 * RATE LIMITING: Uses TelegramQueue for high-load scenarios (1000+ users)
 */

const User = require('../../models/User');
const telegramQueue = require('../../utils/TelegramQueue');
const activityLogger = require('../../services/activityLogger');

class MessageManager {
  constructor() {
    // No more in-memory Maps! Everything comes from DB.
    // Rate limiting is handled by TelegramQueue
    this.useQueue = true; // Enable queue for production
  }

  // ============================================
  // DATABASE OPERATIONS
  // ============================================

  /**
   * Load user state from database
   * @returns {Object|null} User data with navigation state
   */
  async loadUserState(userId) {
    try {
      const user = await User.findOne({ telegramId: userId })
        .select('mainMessageId navigationStack currentScreen currentScreenData lastActivity')
        .lean();
      return user;
    } catch (error) {
      console.error(`[loadUserState] Error for user ${userId}:`, error.message);
      return null;
    }
  }

  /**
   * Save user state to database
   */
  async saveUserState(userId, updates) {
    try {
      await User.updateOne(
        { telegramId: userId },
        {
          $set: {
            ...updates,
            lastActivity: new Date()
          }
        }
      );
    } catch (error) {
      console.error(`[saveUserState] Error for user ${userId}:`, error.message);
    }
  }

  // ============================================
  // CORE: DELETE + SEND PATTERN
  // ============================================

  /**
   * Delete old message and send new one (triggers push notification!)
   * This is the MAIN method for all screen transitions.
   * Uses TelegramQueue for rate limiting under high load.
   */
  async sendNewMessage(ctx, userId, text, keyboard) {
    const user = await this.loadUserState(userId);
    const oldMessageId = user?.mainMessageId;

    // 1. Delete old message (silent) - via queue for rate limiting
    if (oldMessageId) {
      try {
        if (this.useQueue) {
          await telegramQueue.deleteMessage(ctx.telegram, userId, oldMessageId);
        } else {
          await ctx.telegram.deleteMessage(userId, oldMessageId);
        }
      } catch (e) {
        // Message already deleted or bot blocked - not critical
      }
    }

    // 2. Send new message (this triggers PUSH notification!)
    const extra = {
      parse_mode: 'Markdown',
      ...(keyboard ? { reply_markup: this.normalizeKeyboard(keyboard) } : {})
    };

    try {
      let newMsg;
      if (this.useQueue) {
        newMsg = await telegramQueue.sendMessage(ctx.telegram, userId, text, extra);
      } else {
        newMsg = await ctx.telegram.sendMessage(userId, text, extra);
      }

      if (!newMsg) {
        // User blocked bot or deleted - handled by queue
        await this.saveUserState(userId, { mainMessageId: null });
        return null;
      }

      // 3. Update mainMessageId in DB
      await this.saveUserState(userId, { mainMessageId: newMsg.message_id });

      return newMsg.message_id;
    } catch (error) {
      console.error(`[sendNewMessage] Error for user ${userId}:`, error.message);

      // If bot blocked or chat not found, mark user as blocked and clear mainMessageId
      if (
        error.description?.includes('bot was blocked') ||
        error.description?.includes('chat not found') ||
        error.description?.includes('user is deactivated')
      ) {
        await activityLogger.logBotBlocked(userId);
      }

      return null;
    }
  }

  /**
   * Edit message in place (silent, no push notification)
   * Used ONLY for updating current screen content (e.g., error messages, file count)
   * Uses TelegramQueue for rate limiting under high load.
   */
  async editMessage(ctx, userId, text, keyboard) {
    const user = await this.loadUserState(userId);
    const messageId = user?.mainMessageId;

    if (!messageId) {
      // No message to edit - send new one
      return await this.sendNewMessage(ctx, userId, text, keyboard);
    }

    const extra = {
      parse_mode: 'Markdown',
      ...(keyboard ? { reply_markup: this.normalizeKeyboard(keyboard) } : {})
    };

    try {
      if (this.useQueue) {
        await telegramQueue.editMessageText(ctx.telegram, userId, messageId, text, extra);
      } else {
        await ctx.telegram.editMessageText(userId, messageId, null, text, extra);
      }
      return messageId;
    } catch (error) {
      if (error.description?.includes('message is not modified')) {
        return messageId; // Same content, no need to update
      }

      // Message deleted or too old - send new one
      console.log(`[editMessage] Cannot edit, sending new: ${error.message}`);
      return await this.sendNewMessage(ctx, userId, text, keyboard);
    }
  }

  // ============================================
  // NAVIGATION WITH STACK
  // ============================================

  /**
   * Navigate to a new screen (push current to stack, show new)
   * Uses DELETE + SEND for push notification effect.
   */
  async navigateToScreen(ctx, userId, screenName, text, keyboard) {
    const user = await this.loadUserState(userId);

    // Build new navigation stack
    const currentStack = user?.navigationStack || [];
    const currentScreen = user?.currentScreen;
    const currentScreenData = user?.currentScreenData;

    // If we have current screen data, push it to stack
    if (currentScreen && currentScreenData?.text) {
      currentStack.push({
        screen: currentScreen,
        text: currentScreenData.text,
        keyboard: currentScreenData.keyboard
      });
    }

    // Save new state BEFORE sending message
    await this.saveUserState(userId, {
      navigationStack: currentStack,
      currentScreen: screenName,
      currentScreenData: { text, keyboard: this.normalizeKeyboard(keyboard) }
    });

    // Send new message (delete + send)
    return await this.sendNewMessage(ctx, userId, text, keyboard);
  }

  /**
   * Go back to previous screen (pop from stack, show previous)
   * Uses DELETE + SEND for push notification effect.
   * @returns {string|null} Previous screen name or null if at root
   */
  async goBack(ctx, userId) {
    const user = await this.loadUserState(userId);
    const stack = user?.navigationStack || [];

    if (stack.length === 0) {
      return null; // No previous screen
    }

    // Pop last screen from stack
    const previousScreen = stack.pop();

    // Save updated state
    await this.saveUserState(userId, {
      navigationStack: stack,
      currentScreen: previousScreen.screen,
      currentScreenData: {
        text: previousScreen.text,
        keyboard: previousScreen.keyboard
      }
    });

    // Send previous screen content
    await this.sendNewMessage(ctx, userId, previousScreen.text, previousScreen.keyboard);

    return previousScreen.screen;
  }

  /**
   * Update current screen content WITHOUT pushing to stack
   * Uses DELETE + SEND for reliability.
   * Use this for: error messages, validation errors, file count updates.
   */
  async updateScreen(ctx, userId, screenName, text, keyboard) {
    // Update screen data in DB
    await this.saveUserState(userId, {
      currentScreen: screenName,
      currentScreenData: { text, keyboard: this.normalizeKeyboard(keyboard) }
    });

    // Send new message (delete + send for reliability)
    return await this.sendNewMessage(ctx, userId, text, keyboard);
  }

  /**
   * Show final screen (clear stack, no "Back" possible)
   * Uses DELETE + SEND for push notification effect.
   */
  async showFinalScreen(ctx, userId, screenName, text, keyboard) {
    // Clear stack and set new screen
    await this.saveUserState(userId, {
      navigationStack: [],
      currentScreen: screenName,
      currentScreenData: { text, keyboard: this.normalizeKeyboard(keyboard) }
    });

    // Send new message
    return await this.sendNewMessage(ctx, userId, text, keyboard);
  }

  /**
   * Show notification to user (push current screen to stack, show notification)
   * Uses DELETE + SEND for push notification effect.
   */
  async showNotification(ctx, userId, text, keyboard) {
    const user = await this.loadUserState(userId);

    // Build new navigation stack
    const currentStack = user?.navigationStack || [];
    const currentScreen = user?.currentScreen;
    const currentScreenData = user?.currentScreenData;

    // If we have current screen data, push it to stack
    if (currentScreen && currentScreenData?.text) {
      currentStack.push({
        screen: currentScreen,
        text: currentScreenData.text,
        keyboard: currentScreenData.keyboard
      });
    }

    // Save new state with notification as current
    await this.saveUserState(userId, {
      navigationStack: currentStack,
      currentScreen: 'notification',
      currentScreenData: { text, keyboard: this.normalizeKeyboard(keyboard) }
    });

    // Send notification (delete + send for push effect)
    return await this.sendNewMessage(ctx, userId, text, keyboard);
  }

  // ============================================
  // RESET / CLEAR OPERATIONS
  // ============================================

  /**
   * Reset navigation to main menu (clear stack)
   */
  async resetNavigation(userId) {
    await this.saveUserState(userId, {
      navigationStack: [],
      currentScreen: 'main_menu',
      currentScreenData: null
    });
  }

  /**
   * Clear navigation stack but keep current screen
   */
  async clearStack(userId) {
    await this.saveUserState(userId, {
      navigationStack: []
    });
  }

  /**
   * Set current screen data (for initial screen after /start)
   */
  async setCurrentScreenData(userId, screenName, text, keyboard) {
    await this.saveUserState(userId, {
      currentScreen: screenName,
      currentScreenData: { text, keyboard: this.normalizeKeyboard(keyboard) }
    });
  }

  // ============================================
  // MESSAGE MANAGEMENT
  // ============================================

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
   * Delete bot's main message
   */
  async deleteMainMessage(ctx, userId) {
    const user = await this.loadUserState(userId);
    const messageId = user?.mainMessageId;

    if (messageId) {
      try {
        await ctx.telegram.deleteMessage(userId, messageId);
      } catch (error) {
        // Ignore - message might already be deleted
      }

      await this.saveUserState(userId, { mainMessageId: null });
    }
  }

  /**
   * Set main message ID (when sending externally, e.g., from /start)
   */
  async setMainMessage(userId, messageId) {
    await this.saveUserState(userId, { mainMessageId: messageId });
  }

  /**
   * Get main message ID
   */
  async getMainMessage(userId) {
    const user = await this.loadUserState(userId);
    return user?.mainMessageId || null;
  }

  /**
   * Get current screen name
   */
  async getCurrentScreen(userId) {
    const user = await this.loadUserState(userId);
    return user?.currentScreen || null;
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Normalize keyboard to Telegram format
   * Handles both Markup.inlineKeyboard() result and raw { inline_keyboard: [...] }
   */
  normalizeKeyboard(keyboard) {
    if (!keyboard) return null;

    // Already in correct format
    if (keyboard.inline_keyboard) {
      return keyboard;
    }

    // Wrapped in reply_markup
    if (keyboard.reply_markup?.inline_keyboard) {
      return keyboard.reply_markup;
    }

    // Return as-is if we can't normalize
    return keyboard;
  }

  // ============================================
  // LEGACY COMPATIBILITY
  // ============================================

  /**
   * @deprecated Use updateScreen instead
   */
  async editMainMessage(ctx, userId, text, keyboard) {
    return await this.updateScreen(ctx, userId, null, text, keyboard);
  }

  /**
   * @deprecated Use sendNewMessage or navigateToScreen instead
   */
  async sendOrEdit(ctx, userId, text, extra = {}) {
    return await this.editMessage(ctx, userId, text, extra);
  }

  /**
   * Restore previous screen from stack (for blog_notification_back)
   * @deprecated Use goBack instead
   */
  async restoreFromStack(ctx, userId) {
    return await this.goBack(ctx, userId);
  }
}

// Export singleton
module.exports = new MessageManager();
