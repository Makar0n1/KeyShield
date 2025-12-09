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
    disputeSessions.set(telegramId, {
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
        await messageManager.editMainMessage(ctx, telegramId, errorText, keyboard);
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

_Добавлено файлов: ${session.media.length}_

Нажмите *"Отправить спор"* когда закончите.`;

      const keyboard = disputeMediaKeyboard(session.dealId);
      await messageManager.editMainMessage(ctx, telegramId, mediaText, keyboard);
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

/**
 * Handle media attachments for dispute
 */
const handleDisputeMedia = async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const session = await getDisputeSession(telegramId);

    if (!session || session.step !== 'media') {
      return false;
    }

    // Delete user message (media)
    await messageManager.deleteUserMessage(ctx);

    // Get file_id based on message type
    let fileId;
    let fileType;

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
      // Store file_id
      session.media.push({
        fileId,
        type: fileType
      });

      await setDisputeSession(telegramId, session);

      // Update screen with new count
      const mediaText = `📎 *Прикрепите доказательства*

🆔 Сделка: \`${session.dealId}\`

Отправьте файлы для подтверждения:
• Скриншоты переписки
• Фото/видео товара
• Документы
• Голосовые сообщения

✅ *Добавлено файлов: ${session.media.length}*

Нажмите *"Отправить спор"* когда закончите.`;

      const keyboard = disputeMediaKeyboard(session.dealId);
      await messageManager.editMainMessage(ctx, telegramId, mediaText, keyboard);
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

    // Show loading
    await messageManager.editMainMessage(ctx, telegramId, '⏳ *Создаём спор...*', {});

    // Create dispute
    const dispute = await disputeService.openDispute(
      session.dealId,
      telegramId,
      session.reasonText,
      session.media.map(m => m.fileId)
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

    console.log(`⚠️ New dispute opened for deal ${session.dealId} by user ${telegramId}`);
  } catch (error) {
    console.error('Error finalizing dispute:', error);
    disputeSessions.delete(ctx.from.id);

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
