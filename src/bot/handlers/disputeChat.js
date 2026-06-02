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
 *
 * NOTE: The user's own message is intentionally KEPT in their chat — they
 * see their own messages naturally (like in any chat). The relay only sends
 * the labeled version to the OTHER side and the admin panel. On resolve,
 * the originator's message_id (stored in DB) is wiped along with everything else.
 */
async function handleDisputeChatText(ctx) {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';
  const session = await getDisputeChatSession(telegramId);
  if (!session) return false;

  const raw = ctx.message?.text?.trim() || '';
  const originatorMessageId = ctx.message?.message_id;

  // Ignore slash-commands inside the chat (don't pollute the conversation either)
  if (raw.startsWith('/')) {
    try { await ctx.deleteMessage(); } catch (_) {}
    return true;
  }

  if (!raw) {
    try { await ctx.deleteMessage(); } catch (_) {}
    return true;
  }

  if (raw.length > MAX_TEXT_LENGTH) {
    // Too long — reject and remove (don't pollute the chat with the bad attempt)
    try { await ctx.deleteMessage(); } catch (_) {}
    await _notifyTransient(ctx, telegramId,
      `⚠️ ${t(lang, 'disputeChat.message_too_long')}`);
    return true;
  }

  try {
    await disputeChatService.postMessage({
      chatId: session.chatId,
      from: session.role,
      text: raw,
      originatorMessageId
    });
  } catch (err) {
    console.error('[disputeChat] postMessage(text) failed:', err.message);
  }
  return true;
}

/**
 * Handle a media message (photo/video/document/voice) from a party in chat mode.
 * Validates the file through fileSecurityService before relaying.
 *
 * NOTE: User's own file message is KEPT visible in their chat on success.
 * Only deleted if the file fails validation (security) or download fails
 * (don't leave a stuck attachment in the chat). On resolve, all message_ids
 * are wiped — including the user's own file.
 */
async function handleDisputeChatMedia(ctx) {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';
  const session = await getDisputeChatSession(telegramId);
  if (!session) return false;

  const originatorMessageId = ctx.message?.message_id;

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
    try { await ctx.deleteMessage(); } catch (_) {}
    await _notifyTransient(ctx, telegramId,
      `⚠️ ${t(lang, 'disputeChat.upload_failed')}`);
    return true;
  }

  // Reuse existing security validation
  const validation = await fileSecurityService.validateFile(fileBuffer, fileType, fileName);
  if (!validation.valid) {
    console.warn(`[disputeChat] File rejected: ${validation.error}`);
    // Remove the rejected file from the chat (don't leave malware visible)
    try { await ctx.deleteMessage(); } catch (_) {}

    // Alert admin — same threat surface as initial dispute evidence
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
      },
      originatorMessageId
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
