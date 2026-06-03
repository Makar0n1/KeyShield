/**
 * Broadcast Service - sends marketing broadcasts to all active bot users
 *
 * Features:
 * - Batch processing to avoid Telegram rate limits
 * - Image + text support (photo with caption)
 * - Skip users in critical flows (deal creation, completion, payout)
 * - Full state persistence to MongoDB
 */

const User = require('../models/User');
const Broadcast = require('../models/Broadcast');
const BroadcastRecipient = require('../models/BroadcastRecipient');

class BroadcastService {
  constructor() {
    this.bot = null;
    this.BATCH_SIZE = 25;        // Send 25 messages per batch
    this.BATCH_DELAY = 1000;     // 1 second delay between batches
  }

  /**
   * Set bot instance (called from bot/index.js)
   */
  setBotInstance(bot) {
    this.bot = bot;
    console.log('✅ Broadcast service initialized with bot instance');
  }

  /**
   * Escape Markdown special characters
   */
  escapeMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/`/g, '\\`');
  }

  /**
   * Sleep helper for batch delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Best-effort sweep of stale bot-sent messages above the freshly sent one.
   *
   * Why: legacy users who interacted with the bot before mainMessageId was
   * tracked (or who hit /start multiple times across deploys) have orphan
   * old menus / notifications stacked in their chat. They're not in any DB
   * field — we can only find them by trying to delete ID-by-ID.
   *
   * Telegram allows the bot to delete its OWN messages in a private chat
   * with no time limit. User-sent messages (incl. /start) CANNOT be
   * deleted by the bot in a private chat — they survive the sweep
   * automatically, which is exactly the desired "/start + 1 bot screen"
   * end state.
   *
   * Errors are silently swallowed: "message not found" / "not bot-deletable"
   * are expected for IDs that were user-sent or never existed. Done in
   * parallel per user (Promise.allSettled) for speed; outer batch already
   * limits to BATCH_SIZE concurrent users.
   */
  /**
   * Upsert a delivery record for (broadcast, user). Idempotent — safe to
   * call on retries; the unique compound index guarantees one row per pair.
   *
   * Used by sendToUser on every outcome path (sent/failed/skipped). On a
   * re-send, the new outcome overwrites the previous one — so a user who
   * failed once and succeeds on the second push ends up with status='sent'.
   */
  async recordRecipient(broadcastId, telegramId, status, error = null) {
    try {
      await BroadcastRecipient.updateOne(
        { broadcastId, telegramId },
        { $set: { status, sentAt: new Date(), error } },
        { upsert: true }
      );
    } catch (err) {
      // Don't let a recording failure (e.g., Mongo blip) break the send loop
      console.warn(`[broadcast] recordRecipient failed for ${telegramId}:`, err.message);
    }
  }

  async cleanupOldMessages(userId, newMsgId, depth = 20) {
    if (!newMsgId || newMsgId <= 1) return;
    const ids = [];
    for (let i = 1; i <= depth; i++) {
      const id = newMsgId - i;
      if (id > 0) ids.push(id);
    }
    await Promise.allSettled(
      ids.map(id => this.bot.telegram.deleteMessage(userId, id).catch(() => {}))
    );
  }

  /**
   * Screens to skip - users in middle of critical flows
   */
  shouldSkipUser(user) {
    const screen = user.currentScreen || '';

    // Skip users creating a deal
    if (screen.startsWith('create_deal')) return true;

    // Skip users in dispute flow
    if (screen.startsWith('dispute')) return true;

    // Skip users entering wallet
    if (screen.includes('wallet')) return true;

    // Skip users in payout process
    if (screen.includes('payout')) return true;

    // Skip users in work submission
    if (screen.includes('submit_work')) return true;

    // Skip users in work acceptance
    if (screen.includes('accept_work')) return true;

    // Skip users in confirmation screens
    if (screen.includes('confirm')) return true;

    return false;
  }

  /**
   * Get keyboard for broadcast notification
   */
  getKeyboard(broadcastId) {
    return {
      inline_keyboard: [[
        { text: '✖️ Закрыть', callback_data: `broadcast_close_${broadcastId}` }
      ]]
    };
  }

  /**
   * Send broadcast to all active users
   * @param {string} broadcastId - Broadcast MongoDB ID
   * @returns {Object} - { sent, failed, skipped }
   */
  async sendBroadcast(broadcastId) {
    if (!this.bot) {
      throw new Error('Bot instance not set');
    }

    // Get the broadcast
    const broadcast = await Broadcast.findById(broadcastId);
    if (!broadcast) {
      throw new Error('Broadcast not found');
    }

    // The /send route is responsible for state validation and has already
    // flipped status to 'sending' before invoking us. The only state we
    // can't proceed with is one already truly finalized AND somehow not
    // marked 'sending' — defensively allow only 'draft' or 'sending' here.
    if (broadcast.status !== 'draft' && broadcast.status !== 'sending') {
      throw new Error(`Cannot send broadcast with status '${broadcast.status}'`);
    }

    // Mark as sending (idempotent — route may have done this already)
    broadcast.status = 'sending';
    broadcast.sentAt = new Date();
    await broadcast.save();

    const keyboard = this.getKeyboard(broadcastId);

    let users;

    // Test mode - send only to specific user
    if (broadcast.isTest && broadcast.testUserId) {
      const testUser = await User.findOne({
        telegramId: broadcast.testUserId,
        mainMessageId: { $exists: true, $ne: null }
      }).lean();

      if (!testUser) {
        broadcast.status = 'failed';
        broadcast.completedAt = new Date();
        broadcast.stats.totalUsers = 0;
        broadcast.stats.failed = 1;
        await broadcast.save();
        throw new Error(`Test user ${broadcast.testUserId} not found or has no active session`);
      }

      users = [testUser];
      console.log(`🧪 TEST MODE: Sending broadcast "${broadcast.title}" to user ${broadcast.testUserId}`);
    } else {
      // Normal mode — every eligible user with an active session.
      // Filters:
      //   - not blacklisted
      //   - has mainMessageId (= bot is reachable, hasn't been blocked)
      //   - language matches target (if not 'all')
      //   - NOT already successfully delivered for this broadcast
      //     (this makes re-sends idempotent: pressing Send again on a
      //      completed broadcast only targets users who didn't get it
      //      yet, or whose previous attempt failed/skipped)
      const recipientQuery = {
        blacklisted: { $ne: true },
        mainMessageId: { $exists: true, $ne: null }
      };
      if (broadcast.targetLanguage && broadcast.targetLanguage !== 'all') {
        recipientQuery.languageCode = broadcast.targetLanguage;
      }

      const alreadyDelivered = await BroadcastRecipient.distinct('telegramId', {
        broadcastId: broadcast._id,
        status: 'sent'
      });
      if (alreadyDelivered.length > 0) {
        recipientQuery.telegramId = { $nin: alreadyDelivered };
      }

      users = await User.find(recipientQuery).lean();

      const langLabel = broadcast.targetLanguage && broadcast.targetLanguage !== 'all'
        ? ` [lang=${broadcast.targetLanguage}]`
        : ' [all langs]';
      const dedupeLabel = alreadyDelivered.length > 0
        ? ` (re-send, skipping ${alreadyDelivered.length} already-delivered)`
        : '';
      console.log(`📤 Sending broadcast "${broadcast.title}"${langLabel}${dedupeLabel} to ${users.length} users`);
    }

    // For test sends nothing else to dedupe — leave stats as-is below.
    // For normal sends, the stats are derived from BroadcastRecipient so
    // they stay correct across re-sends (cumulative across runs).

    // Run-local counters (just for logging this particular run)
    let runSent = 0;
    let runFailed = 0;
    let runSkipped = 0;

    for (let i = 0; i < users.length; i += this.BATCH_SIZE) {
      const batch = users.slice(i, i + this.BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(user => this.sendToUser(user, broadcast, keyboard))
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value === 'sent') runSent++;
          else if (result.value === 'skipped') runSkipped++;
          else runFailed++;
        } else {
          runFailed++;
        }
      }

      // Refresh cumulative stats from the recipient collection every 100 sends.
      // Skipped in test mode (no BroadcastRecipient written for the test user).
      if (!broadcast.isTest && (i + this.BATCH_SIZE) % 100 === 0) {
        await this._refreshStats(broadcast);
      }

      if (i + this.BATCH_SIZE < users.length) {
        await this.sleep(this.BATCH_DELAY);
      }
    }

    // Final stats: derive from recipient collection for cumulative accuracy
    broadcast.status = 'completed';
    broadcast.completedAt = new Date();
    if (broadcast.isTest) {
      broadcast.stats.totalUsers = 1;
      broadcast.stats.sent = runSent;
      broadcast.stats.failed = runFailed;
      broadcast.stats.skipped = runSkipped;
    } else {
      await this._refreshStats(broadcast);
    }
    await broadcast.save();

    console.log(`📤 Broadcast completed (this run): sent=${runSent}, failed=${runFailed}, skipped=${runSkipped}`);
    if (!broadcast.isTest) {
      console.log(`   Cumulative: sent=${broadcast.stats.sent}, failed=${broadcast.stats.failed}, skipped=${broadcast.stats.skipped}, totalUsers=${broadcast.stats.totalUsers}`);
    }

    return {
      sent: runSent,
      failed: runFailed,
      skipped: runSkipped,
      cumulative: { ...broadcast.stats }
    };
  }

  /**
   * Recompute cumulative stats by counting BroadcastRecipient rows.
   * Used both periodically during a long send and at the very end so
   * the numbers reflect every successful run for this broadcast.
   */
  async _refreshStats(broadcast) {
    const [sent, failed, skipped] = await Promise.all([
      BroadcastRecipient.countDocuments({ broadcastId: broadcast._id, status: 'sent' }),
      BroadcastRecipient.countDocuments({ broadcastId: broadcast._id, status: 'failed' }),
      BroadcastRecipient.countDocuments({ broadcastId: broadcast._id, status: 'skipped' })
    ]);
    broadcast.stats.sent = sent;
    broadcast.stats.failed = failed;
    broadcast.stats.skipped = skipped;
    broadcast.stats.totalUsers = sent + failed + skipped;
    await broadcast.save();
  }

  /**
   * Send broadcast to a single user
   * Uses delete + send photo with caption
   */
  async sendToUser(user, broadcast, keyboard) {
    try {
      const userId = user.telegramId;

      // Skip users in critical flows
      if (this.shouldSkipUser(user)) {
        await this.recordRecipient(broadcast._id, user.telegramId, 'skipped', `in flow: ${user.currentScreen}`);
        return 'skipped';
      }

      // Check if user is already on ANY broadcast/notification screen
      // Both broadcast_ and blog_notification_ are "overlay" notifications
      // that should replace each other without accumulating in the stack
      const isAlreadyBroadcast = user.currentScreen?.startsWith('broadcast_');
      const isAlreadyBlogNotification = user.currentScreen?.startsWith('blog_notification');
      const isOverlayScreen = isAlreadyBroadcast || isAlreadyBlogNotification;

      // If NOT already on overlay screen, save current screen to stack
      if (!isOverlayScreen && user.currentScreenData?.text) {
        const newStack = [...(user.navigationStack || [])];
        newStack.push({
          screen: user.currentScreen || 'main_menu',
          text: user.currentScreenData.text,
          keyboard: user.currentScreenData.keyboard
        });

        await User.updateOne(
          { telegramId: userId },
          { $set: { navigationStack: newStack } }
        );
      }

      // 1. DELETE old message (silent)
      try {
        await this.bot.telegram.deleteMessage(userId, user.mainMessageId);
      } catch (e) {
        // Message already deleted - not critical
      }

      // 2. SEND new photo message with caption (this triggers PUSH notification!)
      // - Title is escaped because we wrap it in *...* for bold; raw `*` in
      //   the admin-typed title would break that wrapping.
      // - Body is sent AS-IS so admin-typed *bold*, _italic_, `code`,
      //   [link](url) and \n line breaks all render natively.
      const caption = `📣 *${this.escapeMarkdown(broadcast.title)}*\n\n${broadcast.text}`;

      let newMsg;
      try {
        newMsg = await this.bot.telegram.sendPhoto(userId, broadcast.imageUrl, {
          caption,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } catch (err) {
        // Telegram returns 400 "can't parse entities" when admin's markdown
        // is malformed (stray `*`, mismatched `[`, etc.). Don't lose the
        // broadcast — fall back to plain text so the user still gets it.
        const desc = err?.response?.description || err?.description || '';
        const isParseError = err?.response?.error_code === 400 &&
          /can't parse|parse entities|reserved|character/i.test(desc);
        if (!isParseError) throw err;

        console.warn(`[broadcast] Markdown parse failed for ${userId}, retrying plain. (${desc})`);
        const plainCaption = `📣 ${broadcast.title}\n\n${broadcast.text}`;
        newMsg = await this.bot.telegram.sendPhoto(userId, broadcast.imageUrl, {
          caption: plainCaption,
          reply_markup: keyboard
        });
      }

      // 3. Update mainMessageId and state in DB
      await User.updateOne(
        { telegramId: userId },
        {
          $set: {
            mainMessageId: newMsg.message_id,
            currentScreen: `broadcast_${broadcast._id}`,
            currentScreenData: {
              text: caption,
              keyboard,
              isPhoto: true,
              photoUrl: broadcast.imageUrl
            },
            lastActivity: new Date()
          }
        }
      );

      // 4. Best-effort: wipe stale bot-sent messages above the new one so the
      //    chat ends up as "/start (user) + 1 bot screen" — the two-message
      //    rule from CLAUDE.md. Legacy users with untracked old menus get
      //    cleaned up here. Run AFTER the DB update so even if cleanup is
      //    slow / errors, the broadcast is already counted as sent.
      this.cleanupOldMessages(userId, newMsg.message_id, 20).catch(() => {});

      await this.recordRecipient(broadcast._id, user.telegramId, 'sent');
      return 'sent';
    } catch (error) {
      console.error(`Failed to send broadcast to user ${user.telegramId}:`, error.message);

      // If bot is blocked or chat not found, mark user
      if (
        error.description?.includes('bot was blocked') ||
        error.description?.includes('chat not found') ||
        error.description?.includes('user is deactivated')
      ) {
        await User.updateOne(
          { telegramId: user.telegramId },
          {
            $set: {
              mainMessageId: null,
              botBlocked: true,
              botBlockedAt: new Date()
            }
          }
        );
      }

      await this.recordRecipient(broadcast._id, user.telegramId, 'failed', error.message);
      return 'failed';
    }
  }
}

// Export singleton
module.exports = new BroadcastService();
