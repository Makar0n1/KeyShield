/**
 * Dispute Chat Service
 *
 * Business logic for the anonymized arbitration chat between buyer, seller,
 * and arbiter (the latter via the admin panel).
 *
 * Lifecycle:
 *   1. startChat(disputeId, arbiterId)  — admin escalates → sessions opened on both sides
 *   2. postMessage({chatId, from, ...}) — any party sends a message → fan-out + DB + event
 *   3. resolveChat(chatId, decision)    — admin closes → wipe Telegram + delegate to disputeService
 *
 * Telegram delivery is "save first, send after": if relay fails (user blocked
 * the bot), the DB record stays and the admin UI shows a "not delivered" flag.
 */

const axios = require('axios');

const DisputeChat = require('../models/DisputeChat');
const Dispute = require('../models/Dispute');
const Deal = require('../models/Deal');
const Session = require('../models/Session');
const User = require('../models/User');
const eventBus = require('./eventBus');
const disputeService = require('./disputeService');
const { t } = require('../locales');

const SESSION_TTL_HOURS = 168; // 7 days — generous window, TTL index auto-cleans

class DisputeChatService {
  constructor() {
    this.bot = null;
    // When set, postMessage will additionally POST events to this HTTP endpoint
    // so the admin web process (which owns the SSE listeners) sees them even
    // though it lives in a separate Node process. Only the bot process needs
    // to enable this — the web process emits on its local eventBus directly.
    this.bridgeUrl = null;
    this.bridgeSecret = null;
  }

  setBotInstance(bot) {
    this.bot = bot;
    console.log('✅ Dispute chat service initialized with bot instance');
  }

  /**
   * Enable HTTP bridge to the admin web process.
   * Called only from src/bot/index.js (the bot process).
   */
  enableHttpBridge(url, secret) {
    this.bridgeUrl = url;
    this.bridgeSecret = secret;
    console.log(`✅ Dispute chat HTTP bridge enabled → ${url}`);
  }

  async _bridgeEmit(event, payload) {
    if (!this.bridgeUrl) return; // not in bot process — nothing to forward
    try {
      await axios.post(this.bridgeUrl, { event, payload }, {
        headers: { 'x-internal-secret': this.bridgeSecret || '' },
        timeout: 3000
      });
    } catch (err) {
      // Bridge failure must NOT break the chat flow — log and move on.
      console.warn('[disputeChat bridge] forward failed:', err.message);
    }
  }

  // ============================================
  // START
  // ============================================

  /**
   * Open a chat for an existing dispute. Idempotent: if an active chat
   * already exists for this dispute, returns it instead of creating a new one.
   */
  async startChat(disputeId, arbiterId) {
    if (!this.bot) throw new Error('Bot instance not set in dispute chat service');

    const dispute = await Dispute.findById(disputeId).populate('dealId');
    if (!dispute) throw new Error(`Dispute ${disputeId} not found`);
    if (dispute.status === 'resolved') {
      throw new Error('Cannot open chat for a resolved dispute');
    }

    const deal = dispute.dealId;
    if (!deal) throw new Error('Deal not found for dispute');

    // Idempotency: reuse existing active chat
    const existing = await DisputeChat.findOne({ disputeId, status: 'active' });
    if (existing) return existing;

    const chat = await DisputeChat.create({
      disputeId,
      dealId: deal._id,
      buyerTelegramId: deal.buyerId,
      sellerTelegramId: deal.sellerId,
      arbiterId
    });

    // Mark dispute as under active review (existing enum value)
    if (dispute.status === 'open') {
      dispute.status = 'in_review';
      await dispute.save();
    }

    // Open chat-mode sessions on both sides
    await Promise.all([
      Session.setSession(deal.buyerId, 'dispute_chat',
        { chatId: chat._id.toString(), role: 'buyer' }, SESSION_TTL_HOURS),
      Session.setSession(deal.sellerId, 'dispute_chat',
        { chatId: chat._id.toString(), role: 'seller' }, SESSION_TTL_HOURS)
    ]);

    // Intro message to both sides (uses bot.telegram.sendMessage directly,
    // NOT messageManager — we don't want to touch mainMessageId so we can
    // restore it cleanly on resolve)
    await this._sendIntro(deal.buyerId, 'buyer');
    await this._sendIntro(deal.sellerId, 'seller');

    const startedPayload = { chatId: chat._id.toString() };
    eventBus.emit('chat.started', startedPayload);
    await this._bridgeEmit('chat.started', startedPayload);
    return chat;
  }

  async _sendIntro(telegramId, role) {
    const lang = await this._getUserLang(telegramId);
    const roleLabel = role === 'buyer'
      ? t(lang, 'disputeChat.role_you_buyer')
      : t(lang, 'disputeChat.role_you_seller');
    const text = t(lang, 'disputeChat.intro', { role: roleLabel });
    try {
      await this.bot.telegram.sendMessage(telegramId, text, { parse_mode: 'Markdown' });
    } catch (err) {
      this._markBlockedIfNeeded(telegramId, err);
      console.error(`[DisputeChat] Intro failed for ${telegramId}:`, err.message);
    }
  }

  // ============================================
  // POST MESSAGE
  // ============================================

  /**
   * Atomically append a message and fan it out.
   *
   * @param {Object} opts
   * @param {string} opts.chatId   — DisputeChat _id
   * @param {'buyer'|'seller'|'arbiter'} opts.from
   * @param {string} [opts.text]
   * @param {Object} [opts.file]   — { type, telegramFileId, safeFileName, hash, size, mimeType }
   * @returns {Object} the persisted message (with assigned seq)
   */
  async postMessage({ chatId, from, text = '', file = null }) {
    if (!this.bot) throw new Error('Bot instance not set in dispute chat service');
    if (!text && !file) throw new Error('Empty message: need text or file');

    const chat = await DisputeChat.findOne({ _id: chatId, status: 'active' });
    if (!chat) throw new Error(`Active dispute chat ${chatId} not found`);

    // Atomic seq assignment + push
    const updated = await DisputeChat.findOneAndUpdate(
      { _id: chatId, status: 'active' },
      [
        {
          $set: {
            messages: {
              $concatArrays: [
                '$messages',
                [{
                  seq: '$nextSeq',
                  from,
                  fromTelegramId: from === 'buyer' ? chat.buyerTelegramId
                                : from === 'seller' ? chat.sellerTelegramId
                                : null,
                  text,
                  file: file ? {
                    type: file.type,
                    telegramFileId: file.telegramFileId || null,
                    safeFileName: file.safeFileName || null,
                    hash: file.hash || null,
                    size: file.size || null,
                    mimeType: file.mimeType || null
                  } : { type: null },
                  telegramMessageIds: { buyer: null, seller: null },
                  delivery: { buyer: 'skipped', seller: 'skipped' },
                  createdAt: new Date()
                }]
              ]
            },
            nextSeq: { $add: ['$nextSeq', 1] }
          }
        }
      ],
      { new: true }
    );

    const message = updated.messages[updated.messages.length - 1];
    const seq = message.seq;

    // Fan-out: relay to the parties that should receive it
    const targets = []; // [{ telegramId, role: 'buyer'|'seller' }]
    if (from !== 'buyer') targets.push({ telegramId: chat.buyerTelegramId, role: 'buyer' });
    if (from !== 'seller') targets.push({ telegramId: chat.sellerTelegramId, role: 'seller' });

    for (const tgt of targets) {
      const sendResult = await this._relayToParty(tgt.telegramId, tgt.role, from, text, file);
      // Persist message_id + delivery status for this side
      await DisputeChat.updateOne(
        { _id: chatId, 'messages.seq': seq },
        {
          $set: {
            [`messages.$.telegramMessageIds.${tgt.role}`]: sendResult.messageId,
            [`messages.$.delivery.${tgt.role}`]: sendResult.delivered ? 'delivered' : 'failed'
          }
        }
      );
    }

    // Re-fetch the final message state for the event payload
    const fresh = await DisputeChat.findById(chatId, { messages: { $slice: -1 } }).lean();
    const finalMessage = fresh?.messages?.[0] || message;

    const msgPayload = { chatId: chatId.toString(), message: finalMessage };
    eventBus.emit('chat.message', msgPayload);
    await this._bridgeEmit('chat.message', msgPayload);

    return finalMessage;
  }

  /**
   * Send a message to one party, labeled with the sender's role.
   * Returns { messageId, delivered }.
   */
  async _relayToParty(telegramId, recipientRole, fromRole, text, file) {
    const lang = await this._getUserLang(telegramId);
    const label = fromRole === 'buyer' ? t(lang, 'disputeChat.label_buyer')
                : fromRole === 'seller' ? t(lang, 'disputeChat.label_seller')
                : t(lang, 'disputeChat.label_arbiter');

    try {
      let sent;
      if (file && file.type && file.telegramFileId) {
        const caption = text ? `*${label}:*\n${text}` : `*${label}*`;
        const opts = { caption, parse_mode: 'Markdown' };
        switch (file.type) {
          case 'photo':
            sent = await this.bot.telegram.sendPhoto(telegramId, file.telegramFileId, opts);
            break;
          case 'video':
            sent = await this.bot.telegram.sendVideo(telegramId, file.telegramFileId, opts);
            break;
          case 'voice':
            sent = await this.bot.telegram.sendVoice(telegramId, file.telegramFileId, opts);
            break;
          case 'document':
          default:
            sent = await this.bot.telegram.sendDocument(telegramId, file.telegramFileId, opts);
            break;
        }
      } else {
        const body = `*${label}:*\n${this._escapeMd(text)}`;
        sent = await this.bot.telegram.sendMessage(telegramId, body, { parse_mode: 'Markdown' });
      }
      return { messageId: sent.message_id, delivered: true };
    } catch (err) {
      this._markBlockedIfNeeded(telegramId, err);
      console.error(`[DisputeChat] Relay to ${telegramId} (${recipientRole}) failed:`, err.message);
      return { messageId: null, delivered: false };
    }
  }

  // ============================================
  // RESOLVE
  // ============================================

  /**
   * Close the chat, wipe bot messages from both parties' Telegram chats,
   * then delegate to disputeService.resolveDispute for the actual deal
   * finalization (notifications, payout key validation, ban check, stats).
   *
   * Steps:
   *   1. Send a "closing" notice to both sides (short pause so they see it)
   *   2. Delete every chat-mode message from both sides' chats (best-effort)
   *   3. Clear sessions
   *   4. Mark DisputeChat closed
   *   5. Emit 'chat.closed' for SSE subscribers
   *   6. Call disputeService.resolveDispute(dealId, decision, arbiterId)
   */
  async resolveChat(chatId, decision, arbiterId) {
    if (!this.bot) throw new Error('Bot instance not set in dispute chat service');
    if (!['refund_buyer', 'release_seller'].includes(decision)) {
      throw new Error(`Invalid decision: ${decision}`);
    }

    const chat = await DisputeChat.findById(chatId);
    if (!chat) throw new Error(`Dispute chat ${chatId} not found`);
    if (chat.status === 'closed') throw new Error('Chat already closed');

    // 1. Closing notice on both sides — kept long enough to read, then wiped too
    const closingMsgIds = { buyer: null, seller: null };
    await Promise.all(
      [['buyer', chat.buyerTelegramId], ['seller', chat.sellerTelegramId]].map(async ([role, tgId]) => {
        try {
          const lang = await this._getUserLang(tgId);
          const sent = await this.bot.telegram.sendMessage(
            tgId, t(lang, 'disputeChat.chat_closing'), { parse_mode: 'Markdown' });
          closingMsgIds[role] = sent.message_id;
        } catch (err) {
          this._markBlockedIfNeeded(tgId, err);
        }
      })
    );
    await new Promise(r => setTimeout(r, 1500));

    // 2. Wipe all chat messages from both sides (best-effort)
    for (const msg of chat.messages) {
      const buyerMsgId = msg.telegramMessageIds?.buyer;
      const sellerMsgId = msg.telegramMessageIds?.seller;
      const tasks = [];
      if (buyerMsgId) tasks.push(this._safeDelete(chat.buyerTelegramId, buyerMsgId));
      if (sellerMsgId) tasks.push(this._safeDelete(chat.sellerTelegramId, sellerMsgId));
      await Promise.all(tasks);
    }
    // Also wipe the closing notice
    if (closingMsgIds.buyer) await this._safeDelete(chat.buyerTelegramId, closingMsgIds.buyer);
    if (closingMsgIds.seller) await this._safeDelete(chat.sellerTelegramId, closingMsgIds.seller);

    // 3. Clear sessions so the bot text/media routers stop relaying
    await Promise.all([
      Session.deleteSession(chat.buyerTelegramId, 'dispute_chat'),
      Session.deleteSession(chat.sellerTelegramId, 'dispute_chat')
    ]);

    // 4. Mark chat as closed in DB
    chat.status = 'closed';
    chat.resolution = decision;
    chat.closedAt = new Date();
    await chat.save();

    // 5. Notify SSE subscribers — admin panel navigates away
    const closedPayload = { chatId: chat._id.toString(), resolution: decision };
    eventBus.emit('chat.closed', closedPayload);
    await this._bridgeEmit('chat.closed', closedPayload);

    // 6. Delegate to existing resolution pipeline (notifications + key validation)
    const deal = await Deal.findById(chat.dealId).select('dealId');
    if (!deal) throw new Error('Deal vanished during resolve');

    const result = await disputeService.resolveDispute(deal.dealId, decision, arbiterId);
    return { chatId: chat._id.toString(), resolution: decision, result };
  }

  async _safeDelete(chatTelegramId, messageId) {
    try {
      await this.bot.telegram.deleteMessage(chatTelegramId, messageId);
    } catch (err) {
      // Common: message_to_delete_not_found (user deleted it manually),
      // message_can't_be_deleted (too old / not bot-sent). Both ignorable.
      if (err?.response?.error_code === 403) {
        this._markBlockedIfNeeded(chatTelegramId, err);
      }
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  async _getUserLang(telegramId) {
    const user = await User.findOne({ telegramId }).select('languageCode').lean();
    return user?.languageCode || 'ru';
  }

  _markBlockedIfNeeded(telegramId, err) {
    if (err?.response?.error_code === 403) {
      User.updateOne(
        { telegramId },
        { $set: { botBlocked: true, botBlockedAt: new Date() } }
      ).catch(() => { /* best-effort */ });
    }
  }

  // Minimal Markdown V1 escape — leaves *bold* working but neutralizes
  // the rest of MarkdownV1 special chars so user-typed text can't break parsing.
  _escapeMd(s) {
    if (!s) return '';
    return String(s).replace(/([_`\[\]])/g, '\\$1');
  }
}

module.exports = new DisputeChatService();
