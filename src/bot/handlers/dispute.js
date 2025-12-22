const disputeService = require('../../services/disputeService');
const dealService = require('../../services/dealService');
const Session = require('../../models/Session');
const {
  mainMenuButton,
  backButton,
  disputeMediaKeyboard,
  disputeOpenedKeyboard
} = require('../keyboards/main');
const messageManager = require('../utils/messageManager');
const adminAlertService = require('../../services/adminAlertService');

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
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const deal = await dealService.getDealById(dealId);

    if (!deal) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Сделка не найдена.', keyboard);
      return;
    }

    if (!deal.isParticipant(telegramId)) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Вы не являетесь участником этой сделки.', keyboard);
      return;
    }

    // Check if dispute already exists
    const existingDispute = await disputeService.getDisputeByDealId(dealId);
    if (existingDispute) {
      const text = `⚠️ *Спор уже открыт*

По этой сделке уже есть активный спор.
Арбитр рассмотрит его в ближайшее время.`;

      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'dispute_exists', text, keyboard);
      return;
    }

    // Initialize dispute session
    await setDisputeSession(telegramId, {
      dealId,
      step: 'reason',
      media: []
    });

    const text = `⚠️ *Открытие спора*

🆔 Сделка: \`${dealId}\`
📦 ${deal.productName}

Опишите суть проблемы:
• Что пошло не так?
• Какие условия не выполнены?
• Ваши ожидания?
Принимается только текстовое описание.
Скриншоты и файлы прикрепляются на следующем шаге.

📎 После отправки текста вы сможете прикрепить доказательства.

_Минимум 20 символов_`;

    const keyboard = backButton();
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
        const errorText = `❌ *Описание слишком короткое*

Минимум 20 символов. Пожалуйста, опишите проблему подробнее.

Текущая длина: ${text.length} символов`;

        const keyboard = backButton();
        await messageManager.updateScreen(ctx, telegramId, 'dispute_reason_error', errorText, keyboard);
        return true;
      }

      // Save reason and move to media step
      session.reasonText = text;
      session.step = 'media';
      await setDisputeSession(telegramId, session);

      const mediaText = `📎 *Прикрепите доказательства*

🆔 Сделка: \`${session.dealId}\`

Отправьте файлы для подтверждения:
• Скриншоты переписки
• Фото/видео товара
• Документы
• Голосовые сообщения
Пожалуйста, прикрепляйте файлы по одному. Если у вас несколько файлов, отправьте их по очереди (по одному).

_Добавлено файлов: ${session.media.length}_

Нажмите *"Отправить спор"* когда закончите.`;

      const keyboard = disputeMediaKeyboard(session.dealId);
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

          const errorText = `❌ *Сначала опишите проблему*

${caption ? `Описание слишком короткое (${caption.length} символов).` : 'Отправьте текстовое описание проблемы (минимум 20 символов), затем прикрепите доказательства.'}

Или отправьте группу фото с подписью — описанием проблемы (минимум 20 символов).`;

          const keyboard = backButton();
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

          const errorText = `❌ *Сначала опишите проблему*

${caption ? `Описание слишком короткое (${caption.length} символов).` : 'Отправьте текстовое описание проблемы (минимум 20 символов), затем прикрепите доказательства.'}

Или отправьте фото/документ с подписью — описанием проблемы (минимум 20 символов).`;

          const keyboard = backButton();
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

    // Get file_id and convert to URL
    let fileId;
    let fileType;
    let fileUrl;

    if (ctx.message.photo) {
      fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      fileType = 'photo';
    } else if (ctx.message.video) {
      fileId = ctx.message.video.file_id;
      fileType = 'video';
    } else if (ctx.message.document) {
      fileId = ctx.message.document.file_id;
      fileType = 'document';
    } else if (ctx.message.voice) {
      fileId = ctx.message.voice.file_id;
      fileType = 'voice';
    }

    if (fileId) {
      // Get permanent file URL from Telegram
      try {
        const fileLink = await ctx.telegram.getFileLink(fileId);
        fileUrl = fileLink.href || fileLink.toString();
        console.log(`📎 Got file URL for dispute: ${fileUrl}`);
      } catch (err) {
        console.error('Error getting file link:', err.message);
        fileUrl = fileId; // Fallback to file_id if URL fails
      }

      // Store file info with URL
      session.media.push({
        fileId,
        fileUrl,
        type: fileType
      });

      await setDisputeSession(telegramId, session);

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

            const mediaText = `📎 *Прикрепите доказательства*

🆔 Сделка: \`${latestSession.dealId}\`

Отправьте файлы для подтверждения:
• Скриншоты переписки
• Фото/видео товара
• Документы
• Голосовые сообщения
Пожалуйста, прикрепляйте файлы по одному. Если у вас несколько файлов, отправьте их по очереди (по одному).


✅ *Добавлено файлов: ${latestSession.media.length}*

Нажмите *"Отправить спор"* когда закончите.`;

            const keyboard = disputeMediaKeyboard(latestSession.dealId);
            await messageManager.updateScreen(ctx, telegramId, 'dispute_media_group', mediaText, keyboard);
          } catch (err) {
            console.error('Error updating screen for media group:', err.message);
          }
        }, 500);

        processedMediaGroups.set(mediaGroupId, groupState);
        return true;
      }

      // Single file - update screen immediately
      const mediaText = `📎 *Прикрепите доказательства*

🆔 Сделка: \`${session.dealId}\`

Отправьте файлы для подтверждения:
• Скриншоты переписки
• Фото/видео товара
• Документы
• Голосовые сообщения
Пожалуйста, прикрепляйте файлы по одному. Если у вас несколько файлов, отправьте их по очереди (по одному).


✅ *Добавлено файлов: ${session.media.length}*

Нажмите *"Отправить спор"* когда закончите.`;

      const keyboard = disputeMediaKeyboard(session.dealId);
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
    await ctx.answerCbQuery();

    const dealId = ctx.callbackQuery.data.split(':')[1];
    const telegramId = ctx.from.id;

    const session = await getDisputeSession(telegramId);

    if (!session || session.dealId !== dealId) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Сессия спора не найдена. Начните заново.', keyboard);
      return;
    }

    if (!session.reasonText) {
      const keyboard = mainMenuButton();
      await messageManager.showFinalScreen(ctx, telegramId, 'error', '❌ Описание проблемы отсутствует. Начните заново.', keyboard);
      await deleteDisputeSession(telegramId);
      return;
    }

    // Show loading (silent edit - user stays on same screen)
    await messageManager.updateScreen(ctx, telegramId, 'dispute_loading', '⏳ *Создаём спор...*', {});

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
    const successText = `✅ *Спор открыт*

🆔 Сделка: \`${session.dealId}\`
📦 ${deal.productName}

📎 Прикреплено файлов: ${session.media.length}

Арбитр получил уведомление и рассмотрит вашу жалобу в ближайшее время.

Вы получите уведомление о решении.`;

    const successKeyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, telegramId, 'dispute_opened', successText, successKeyboard);

    // Notify the other party
    const otherPartyId = deal.buyerId === telegramId ? deal.sellerId : deal.buyerId;
    const role = deal.buyerId === telegramId ? 'Покупатель' : 'Продавец';

    const otherText = `⚠️ *Открыт спор*

🆔 Сделка: \`${session.dealId}\`
📦 ${deal.productName}

${role} открыл спор по данной сделке.
Арбитр рассмотрит жалобу и вынесет решение.

Вы можете предоставить свои доказательства, обратившись в поддержку.`;

    const otherKeyboard = disputeOpenedKeyboard(session.dealId);
    await messageManager.showNotification(ctx, otherPartyId, otherText, otherKeyboard);

    // Alert admin about new dispute
    await adminAlertService.alertDisputeOpened(deal, telegramId, session.reasonText);

    console.log(`⚠️ New dispute opened for deal ${session.dealId} by user ${telegramId}`);
  } catch (error) {
    console.error('Error finalizing dispute:', error);
    await deleteDisputeSession(ctx.from.id);

    const keyboard = mainMenuButton();
    await messageManager.showFinalScreen(ctx, ctx.from.id, 'error', `❌ Ошибка при создании спора: ${error.message}`, keyboard);
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
