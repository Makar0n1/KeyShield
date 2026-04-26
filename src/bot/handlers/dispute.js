const disputeService = require('../../services/disputeService');
const dealService = require('../../services/dealService');
const fileSecurityService = require('../../services/fileSecurityService');
const Session = require('../../models/Session');
const User = require('../../models/User');
const {
  mainMenuButton,
  backButton,
  disputeMediaKeyboard,
  disputeOpenedKeyboard
} = require('../keyboards/main');
const messageManager = require('../utils/messageManager');
const adminAlertService = require('../../services/adminAlertService');
const { t } = require('../../locales');

function escapeMarkdown(text) {
  if (!text) return '';
  return text.replace(/([_*`\[\]])/g, '\\$1');
}

// ============================================
// SESSION HELPERS (MongoDB persistence)
// ============================================

async function getDisputeSession(telegramId) {
  return await Session.getSession(telegramId, 'dispute');
}

async function setDisputeSession(telegramId, sessionData) {
  await Session.setSession(telegramId, 'dispute', sessionData, 2); // 2 hours TTL
}

async function deleteDisputeSession(telegramId) {
  await Session.deleteSession(telegramId, 'dispute');
}

async function hasDisputeSession(telegramId) {
  const session = await getDisputeSession(telegramId);
  return !!session;
}

// ============================================
// START DISPUTE
// ============================================

/**
 * Start dispute process
 */
const startDispute = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.deal_not_found'), keyboard);
      return;
    }

    if (!deal.isParticipant(telegramId)) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'common.not_participant'), keyboard);
      return;
    }

    // Check if dispute already exists
    const existingDispute = await disputeService.getDisputeByDealId(dealId);
    if (existingDispute) {
      const text = t(lang, 'dispute.already_exists');

      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'dispute_exists', text, keyboard);
      return;
    }

    // Initialize dispute session
    await setDisputeSession(telegramId, {
      dealId,
      step: 'reason',
      media: []
    });

    const text = t(lang, 'dispute.start', { dealId, productName: escapeMarkdown(deal.productName) });

    const keyboard = backButton(lang);
    await messageManager.navigateToScreen(ctx, telegramId, `dispute_${dealId}`, text, keyboard);
  } catch (error) {
    console.error('Error starting dispute:', error);
  }
};

// ============================================
// HANDLE DISPUTE TEXT INPUT
// ============================================

/**
 * Handle dispute text input
 */
const handleDisputeInput = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    const telegramId = ctx.from.id;
    const session = await getDisputeSession(telegramId);

    if (!session) {
      return false;
    }

    // Delete user message
    await messageManager.deleteUserMessage(ctx);

    if (session.step === 'reason') {
      const text = ctx.message.text.trim();

      if (text.length < 20) {
        const errorText = t(lang, 'dispute.reason_too_short', { length: text.length });

        const keyboard = backButton(lang);
        await messageManager.updateScreen(ctx, telegramId, 'dispute_reason_error', errorText, keyboard);
        return true;
      }

      // Save reason and move to media step
      session.reasonText = text;
      session.step = 'media';
      await setDisputeSession(telegramId, session);

      const mediaText = t(lang, 'dispute.media_upload', { dealId: session.dealId, mediaCount: session.media.length });

      const keyboard = disputeMediaKeyboard(session.dealId, lang);
      await messageManager.updateScreen(ctx, telegramId, 'dispute_media', mediaText, keyboard);
      return true;
    }

    return true;
  } catch (error) {
    console.error('Error handling dispute input:', error);
    return false;
  }
};

// ============================================
// HANDLE MEDIA ATTACHMENTS
// ============================================

// Track processed media groups to avoid duplicate error messages and debounce screen updates
const processedMediaGroups = new Map(); // media_group_id -> { reasonSet: boolean, count: number, timestamp: number, updateTimeout: NodeJS.Timeout }

// Clean old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of processedMediaGroups) {
    if (now - value.timestamp > 60000) { // 1 minute TTL
      if (value.updateTimeout) clearTimeout(value.updateTimeout);
      processedMediaGroups.delete(key);
    }
  }
}, 300000);

/**
 * Handle media attachments for dispute
 * Accepts media at both 'reason' step (with caption as reason) and 'media' step
 * Supports media groups (multiple photos sent at once)
 */
const handleDisputeMedia = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    const telegramId = ctx.from.id;
    const session = await getDisputeSession(telegramId);

    if (!session) {
      return false;
    }

    const mediaGroupId = ctx.message.media_group_id;

    // If still on reason step but user sent media, check for caption as reason text
    if (session.step === 'reason') {
      const caption = ctx.message.caption?.trim();

      // For media groups: first photo with caption sets the reason, others just add media
      if (mediaGroupId) {
        const groupState = processedMediaGroups.get(mediaGroupId);

        if (groupState?.reasonSet) {
          // Reason already set by first photo in group, just add this as media
          session.step = 'media';
        } else if (caption && caption.length >= 20) {
          // First photo with valid caption - set reason
          session.reasonText = caption;
          session.step = 'media';
          processedMediaGroups.set(mediaGroupId, { reasonSet: true, timestamp: Date.now() });
        } else if (!groupState) {
          // First photo without valid caption - show error once
          processedMediaGroups.set(mediaGroupId, { reasonSet: false, timestamp: Date.now() });

          await messageManager.deleteUserMessage(ctx);

          const errorText = `❌ *${t(lang, 'common.error')}*

${caption ? t(lang, 'dispute.media_without_reason_caption', { length: caption.length }) : t(lang, 'dispute.media_without_reason')}

${t(lang, 'dispute.media_group_hint')}`;

          const keyboard = backButton(lang);
          await messageManager.updateScreen(ctx, telegramId, 'dispute_reason_error', errorText, keyboard);
          return true;
        } else {
          // Subsequent photos in group without reason - just delete silently
          await messageManager.deleteUserMessage(ctx);
          return true;
        }
      } else {
        // Single photo (not in group)
        if (!caption || caption.length < 20) {
          await messageManager.deleteUserMessage(ctx);

          const errorText = `❌ *${t(lang, 'common.error')}*

${caption ? t(lang, 'dispute.media_without_reason_caption', { length: caption.length }) : t(lang, 'dispute.media_without_reason')}

${t(lang, 'dispute.media_single_hint')}`;

          const keyboard = backButton(lang);
          await messageManager.updateScreen(ctx, telegramId, 'dispute_reason_error', errorText, keyboard);
          return true;
        }

        // Single photo with valid caption - set reason
        session.reasonText = caption;
        session.step = 'media';
      }
    }

    // Delete user message (media)
    await messageManager.deleteUserMessage(ctx);

    // Get file_id, type, and name
    let fileId;
    let fileType;
    let fileName;
    let fileData;

    if (ctx.message.photo) {
      fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      fileType = 'photo';
      fileName = `photo_${Date.now()}.jpg`;
    } else if (ctx.message.video) {
      fileId = ctx.message.video.file_id;
      fileType = 'video';
      fileName = ctx.message.video.file_name || `video_${Date.now()}.mp4`;
    } else if (ctx.message.document) {
      fileId = ctx.message.document.file_id;
      fileType = 'document';
      fileName = ctx.message.document.file_name || `document_${Date.now()}.pdf`;
    } else if (ctx.message.voice) {
      fileId = ctx.message.voice.file_id;
      fileType = 'voice';
      fileName = `voice_${Date.now()}.ogg`;
    }

    if (fileId) {
      try {
        // Download file from Telegram servers
        const fileUrl = await ctx.telegram.getFileLink(fileId);
        const fileResponse = await require('axios').get(fileUrl.href || fileUrl.toString(), {
          responseType: 'arraybuffer'
        });
        fileData = fileResponse.data;

        // Validate file security
        const validation = await fileSecurityService.validateFile(
          Buffer.from(fileData),
          fileType,
          fileName
        );

        if (!validation.valid) {
          // File failed security validation
          const errorMsg = t(lang, 'dispute.file_rejected', { reason: validation.error });
          console.error(`🚫 [SECURITY] File rejected for dispute: ${validation.error}`);

          // Log security incident
          await adminAlertService.alertSecurityThreat(
            'MALICIOUS_FILE_UPLOAD',
            ctx.from.username || 'unknown',
            ctx.from.id,
            `File: ${fileName} - ${validation.error}`
          );

          // Notify user
          await messageManager.updateScreen(
            ctx,
            telegramId,
            'dispute_file_rejected',
            errorMsg,
            disputeMediaKeyboard(session.dealId, lang)
          );

          return false;
        }

        // File is valid - store in session
        const permanentFileUrl = fileUrl.href || fileUrl.toString();
        session.media.push({
          fileId,
          fileUrl: permanentFileUrl,
          type: fileType,
          metadata: validation.metadata,
          securityValidated: true
        });

        console.log(`✅ [SECURITY] File validated and added to dispute: ${fileName}`);
        await setDisputeSession(telegramId, session);
      } catch (err) {
        console.error('Error handling dispute media file:', err.message);
        return false;
      }

      // For media groups, debounce screen update to avoid spamming editMessageText
      if (mediaGroupId) {
        const groupState = processedMediaGroups.get(mediaGroupId) || { reasonSet: false, count: 0, timestamp: Date.now() };
        groupState.count = session.media.length;
        groupState.timestamp = Date.now();

        // Clear previous timeout if exists
        if (groupState.updateTimeout) {
          clearTimeout(groupState.updateTimeout);
        }

        // Schedule screen update after 500ms (when all photos in group are received)
        groupState.updateTimeout = setTimeout(async () => {
          try {
            // Re-fetch session to get latest media count
            const latestSession = await getDisputeSession(telegramId);
            if (!latestSession) return;

            const mediaText = t(lang, 'dispute.media_upload', { dealId: latestSession.dealId, mediaCount: latestSession.media.length });

            const keyboard = disputeMediaKeyboard(latestSession.dealId, lang);
            await messageManager.updateScreen(ctx, telegramId, 'dispute_media_group', mediaText, keyboard);
          } catch (err) {
            console.error('Error updating screen for media group:', err.message);
          }
        }, 500);

        processedMediaGroups.set(mediaGroupId, groupState);
        return true;
      }

      // Single file - update screen immediately
      const mediaText = t(lang, 'dispute.media_upload', { dealId: session.dealId, mediaCount: session.media.length });

      const keyboard = disputeMediaKeyboard(session.dealId, lang);
      await messageManager.updateScreen(ctx, telegramId, 'dispute_media', mediaText, keyboard);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error handling dispute media:', error);
    return false;
  }
};

// ============================================
// FINALIZE DISPUTE
// ============================================

/**
 * Handle finalize dispute button
 */
const finalizeDisputeHandler = async (ctx) => {
  try {
    const lang = ctx.state?.lang || 'ru';
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const session = await getDisputeSession(telegramId);

    if (!session || session.dealId !== dealId) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'dispute.session_not_found'), keyboard);
      return;
    }

    if (!session.reasonText) {
      const keyboard = mainMenuButton(lang);
      await messageManager.showFinalScreen(ctx, telegramId, 'error', t(lang, 'dispute.reason_missing'), keyboard);
      await deleteDisputeSession(telegramId);
      return;
    }

    // Show loading (silent edit - user stays on same screen)
    await messageManager.updateScreen(ctx, telegramId, 'dispute_loading', t(lang, 'common.creating_dispute'), {});

    // Create dispute - use fileUrl (falls back to fileId if URL failed)
    const dispute = await disputeService.openDispute(
      session.dealId,
      telegramId,
      session.reasonText,
      session.media.map(m => m.fileUrl || m.fileId)
    );

    // Clean up session
    await deleteDisputeSession(telegramId);

    const deal = await dealService.getDealById(session.dealId);

    // Show success to initiator (final screen)
    const successText = t(lang, 'dispute.opened', {
      dealId: session.dealId,
      productName: escapeMarkdown(deal.productName),
      mediaCount: session.media.length
    });

    const successKeyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, telegramId, 'dispute_opened', successText, successKeyboard);

    // Notify the other party
    const otherPartyId = deal.buyerId === telegramId ? deal.sellerId : deal.buyerId;

    // Load counterparty language
    const counterpartyUser = await User.findOne({ telegramId: otherPartyId }).select('languageCode').lean();
    const counterpartyLang = counterpartyUser?.languageCode || 'ru';

    const role = deal.buyerId === telegramId ? t(counterpartyLang, 'role.buyer') : t(counterpartyLang, 'role.seller');

    const otherText = t(counterpartyLang, 'dispute.notify_other', {
      dealId: session.dealId,
      productName: escapeMarkdown(deal.productName),
      role
    });

    const otherKeyboard = disputeOpenedKeyboard(session.dealId, counterpartyLang);
    await messageManager.showNotification(ctx, otherPartyId, otherText, otherKeyboard);

    // Alert admin about new dispute
    await adminAlertService.alertDisputeOpened(deal, telegramId, session.reasonText);

    console.log(`⚠️ New dispute opened for deal ${session.dealId} by user ${telegramId}`);
  } catch (error) {
    console.error('Error finalizing dispute:', error);
    await deleteDisputeSession(ctx.from.id);

    const lang = ctx.state?.lang || 'ru';
    const keyboard = mainMenuButton(lang);
    await messageManager.showFinalScreen(ctx, ctx.from.id, 'error', t(lang, 'dispute.error', { message: error.message }), keyboard);
  }
};

module.exports = {
  startDispute,
  handleDisputeInput,
  handleDisputeMedia,
  finalizeDisputeHandler,
  hasDisputeSession,
  clearDisputeSession: deleteDisputeSession
};
