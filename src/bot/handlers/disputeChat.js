/**
 * Dispute Chat handlers — bot-side ingress for messages from buyer/seller
 * during an active arbitration chat.
 *
 * Routing entry points (from src/bot/index.js):
 *   - handleDisputeChatText(ctx)  — text messages while `dispute_chat` session active
 *   - handleDisputeChatMedia(ctx) — photo/video/document/voice while session active
 *
 * Both delete the user's incoming message immediately (to keep the
 * anonymized relay clean) and hand off to disputeChatService.postMessage.
 */

const axios = require('axios');

const Session = require('../../models/Session');
const disputeChatService = require('../../services/disputeChatService');
const fileSecurityService = require('../../services/fileSecurityService');
const adminAlertService = require('../../services/adminAlertService');
const { t } = require('../../locales');

const MAX_TEXT_LENGTH = 2000;

async function getDisputeChatSession(telegramId) {
  return Session.getSession(telegramId, 'dispute_chat');
}

async function hasDisputeChatSession(telegramId) {
  return !!(await getDisputeChatSession(telegramId));
}

/**
 * Handle a text message from a party in dispute chat mode.
 */
async function handleDisputeChatText(ctx) {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';
  const session = await getDisputeChatSession(telegramId);
  if (!session) return false;

  const raw = ctx.message?.text?.trim() || '';

  // Always delete user's own message — relay handles the visible representation.
  try { await ctx.deleteMessage(); } catch (_) { /* may be too old */ }

  // Ignore slash-commands inside the chat (let other handlers/no-op handle them)
  if (raw.startsWith('/')) return true;

  if (!raw) return true;

  if (raw.length > MAX_TEXT_LENGTH) {
    // Bounce a transient warning straight to the user (not via mainMessage).
    try {
      const warn = await ctx.telegram.sendMessage(
        telegramId,
        `⚠️ ${t(lang, 'disputeChat.message_too_long')}`
      );
      setTimeout(() => {
        ctx.telegram.deleteMessage(telegramId, warn.message_id).catch(() => {});
      }, 3000);
    } catch (_) { /* ignore */ }
    return true;
  }

  try {
    await disputeChatService.postMessage({
      chatId: session.chatId,
      from: session.role,
      text: raw
    });
  } catch (err) {
    console.error('[disputeChat] postMessage(text) failed:', err.message);
  }
  return true;
}

/**
 * Handle a media message (photo/video/document/voice) from a party in chat mode.
 * Validates the file through fileSecurityService before relaying.
 */
async function handleDisputeChatMedia(ctx) {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';
  const session = await getDisputeChatSession(telegramId);
  if (!session) return false;

  // Extract file info
  let fileId, fileType, fileName, mimeType;
  if (ctx.message.photo) {
    fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    fileType = 'photo';
    fileName = `photo_${Date.now()}.jpg`;
    mimeType = 'image/jpeg';
  } else if (ctx.message.video) {
    fileId = ctx.message.video.file_id;
    fileType = 'video';
    fileName = ctx.message.video.file_name || `video_${Date.now()}.mp4`;
    mimeType = ctx.message.video.mime_type || 'video/mp4';
  } else if (ctx.message.document) {
    fileId = ctx.message.document.file_id;
    fileType = 'document';
    fileName = ctx.message.document.file_name || `document_${Date.now()}`;
    mimeType = ctx.message.document.mime_type || 'application/octet-stream';
  } else if (ctx.message.voice) {
    fileId = ctx.message.voice.file_id;
    fileType = 'voice';
    fileName = `voice_${Date.now()}.ogg`;
    mimeType = 'audio/ogg';
  } else {
    try { await ctx.deleteMessage(); } catch (_) {}
    return true;
  }

  const caption = ctx.message.caption?.trim() || '';

  // Delete the user's original — we're about to relay a sanitized version.
  try { await ctx.deleteMessage(); } catch (_) {}

  let fileBuffer;
  try {
    const fileUrl = await ctx.telegram.getFileLink(fileId);
    const resp = await axios.get(fileUrl.href || fileUrl.toString(), {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    fileBuffer = Buffer.from(resp.data);
  } catch (err) {
    console.error('[disputeChat] File download failed:', err.message);
    await _notifyTransient(ctx, telegramId,
      `⚠️ ${t(lang, 'disputeChat.upload_failed')}`);
    return true;
  }

  // Reuse existing security validation
  const validation = await fileSecurityService.validateFile(fileBuffer, fileType, fileName);
  if (!validation.valid) {
    console.warn(`[disputeChat] File rejected: ${validation.error}`);

    // Alert admin — this is the same threat surface as initial dispute evidence
    try {
      await adminAlertService.alertSecurityThreat(
        'MALICIOUS_FILE_UPLOAD',
        ctx.from.username || 'unknown',
        telegramId,
        `Dispute chat file: ${fileName} — ${validation.error}`
      );
    } catch (_) { /* alerting must not break the user flow */ }

    await _notifyTransient(ctx, telegramId,
      t(lang, 'disputeChat.file_rejected', { reason: validation.error }));
    return true;
  }

  try {
    await disputeChatService.postMessage({
      chatId: session.chatId,
      from: session.role,
      text: caption,
      file: {
        type: fileType,
        telegramFileId: fileId,
        safeFileName: fileName,
        hash: validation.metadata?.hash,
        size: validation.metadata?.size,
        mimeType
      }
    });
  } catch (err) {
    console.error('[disputeChat] postMessage(file) failed:', err.message);
  }
  return true;
}

/**
 * Send a short-lived warning straight to the user's chat, auto-delete after 4 s.
 * Used for validation feedback — does not touch the main message stack.
 */
async function _notifyTransient(ctx, telegramId, text) {
  try {
    const m = await ctx.telegram.sendMessage(telegramId, text, { parse_mode: 'Markdown' });
    setTimeout(() => {
      ctx.telegram.deleteMessage(telegramId, m.message_id).catch(() => {});
    }, 4000);
  } catch (_) { /* ignore */ }
}

module.exports = {
  handleDisputeChatText,
  handleDisputeChatMedia,
  hasDisputeChatSession,
  getDisputeChatSession
};
