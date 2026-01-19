/**
 * Invite Expiry Monitor
 *
 * Monitors deals with status 'pending_counterparty' and cancels them
 * when the invite link expires (24 hours by default).
 *
 * Also notifies the creator that their invite link has expired.
 */

const Deal = require('../models/Deal');
const User = require('../models/User');
const ServiceStatus = require('../models/ServiceStatus');
const messageManager = require('../bot/utils/messageManager');
const { mainMenuButton } = require('../bot/keyboards/main');

const SERVICE_NAME = 'InviteExpiryMonitor';

class InviteExpiryMonitor {
  constructor() {
    this.isRunning = false;
    this.isChecking = false;
    this.interval = null;
    this.botInstance = null;

    // Check every 5 minutes
    this.CHECK_INTERVAL = 5 * 60 * 1000;

    // Batch settings
    this.BATCH_SIZE = 10;
    this.BATCH_DELAY = 500; // 500ms between batches
  }

  /**
   * Set bot instance for sending notifications
   */
  setBotInstance(bot) {
    this.botInstance = bot;
  }

  /**
   * Start monitoring
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️ Invite expiry monitor already running');
      return;
    }

    console.log('✅ Starting invite expiry monitor...');
    this.isRunning = true;

    try {
      await ServiceStatus.markStarted(SERVICE_NAME);
    } catch (e) {
      console.error('Failed to update service status:', e.message);
    }

    // Run immediately
    this.checkExpiredInvites();

    // Then run on interval
    this.interval = setInterval(() => {
      this.checkExpiredInvites();
    }, this.CHECK_INTERVAL);
  }

  /**
   * Stop monitoring
   */
  async stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;

    try {
      await ServiceStatus.markStopped(SERVICE_NAME);
    } catch (e) {
      console.error('Failed to update service status:', e.message);
    }

    console.log('⛔ Invite expiry monitor stopped');
  }

  /**
   * Check for expired invite links
   */
  async checkExpiredInvites() {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      const now = new Date();

      // Find deals with expired invites
      const expiredDeals = await Deal.find({
        status: 'pending_counterparty',
        inviteExpiresAt: { $lt: now }
      }).lean();

      if (expiredDeals.length === 0) {
        return;
      }

      console.log(`🔗 Found ${expiredDeals.length} expired invite(s) to cancel...`);

      let cancelledCount = 0;

      // Process in batches
      for (let i = 0; i < expiredDeals.length; i += this.BATCH_SIZE) {
        const batch = expiredDeals.slice(i, i + this.BATCH_SIZE);

        for (const deal of batch) {
          const success = await this.processExpiredInvite(deal);
          if (success) cancelledCount++;
        }

        // Delay between batches
        if (i + this.BATCH_SIZE < expiredDeals.length) {
          await this.sleep(this.BATCH_DELAY);
        }
      }

      if (cancelledCount > 0) {
        console.log(`🔗 Cancelled ${cancelledCount} expired invite(s)`);
      }

      // Update heartbeat
      try {
        await ServiceStatus.heartbeat(SERVICE_NAME, {
          lastCheck: new Date(),
          expiredFound: expiredDeals.length,
          cancelled: cancelledCount
        });
      } catch (e) { /* ignore */ }

    } catch (error) {
      console.error('❌ Error in invite expiry check:', error);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Process a single expired invite
   */
  async processExpiredInvite(deal) {
    try {
      // Double-check status
      const currentDeal = await Deal.findById(deal._id);
      if (!currentDeal || currentDeal.status !== 'pending_counterparty') {
        return false;
      }

      // Cancel the deal
      await Deal.findByIdAndUpdate(deal._id, {
        $set: {
          status: 'cancelled',
          inviteToken: null
        }
      });

      // Notify creator
      if (this.botInstance) {
        await this.notifyCreator(deal);
      }

      console.log(`🔗 Invite expired and cancelled: ${deal.dealId}`);
      return true;
    } catch (error) {
      console.error(`Error processing expired invite ${deal.dealId}:`, error.message);
      return false;
    }
  }

  /**
   * Notify creator that their invite link has expired
   */
  async notifyCreator(deal) {
    try {
      // Determine creator ID
      const creatorId = deal.creatorRole === 'buyer' ? deal.buyerId : deal.sellerId;

      if (!creatorId || creatorId === 0) {
        return;
      }

      const ctx = { telegram: this.botInstance.telegram };

      const text = `⏰ *Ссылка истекла*

🆔 Сделка: \`${deal.dealId}\`
📦 ${this.escapeMarkdown(deal.productName)}

Срок действия ссылки-приглашения истёк (24 часа).
Контрагент не принял приглашение.

Вы можете создать новую сделку со ссылкой в любое время.`;

      const keyboard = mainMenuButton();

      await messageManager.showNotification(ctx, creatorId, text, keyboard);
    } catch (error) {
      console.error(`Error notifying creator about expired invite:`, error.message);
    }
  }

  /**
   * Escape markdown special characters
   */
  escapeMarkdown(text) {
    if (!text) return '';
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton
module.exports = new InviteExpiryMonitor();
