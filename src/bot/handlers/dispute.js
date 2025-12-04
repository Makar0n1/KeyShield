const disputeService = require('../../services/disputeService');
const dealService = require('../../services/dealService');
const { backToMainMenu } = require('../keyboards/main');

// Store temporary dispute data
const disputeSessions = new Map();

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
      return ctx.reply('❌ Сделка не найдена.');
    }

    if (!deal.isParticipant(telegramId)) {
      return ctx.reply('❌ Вы не являетесь участником этой сделки.');
    }

    // Check if dispute already exists
    const existingDispute = await disputeService.getDisputeByDealId(dealId);
    if (existingDispute) {
      return ctx.editMessageText(
        '⚠️ *Спор уже открыт*\n\n' +
        'По этой сделке уже есть активный спор. Арбитр рассмотрит его в ближайшее время.',
        {
          parse_mode: 'Markdown',
          ...backToMainMenu()
        }
      );
    }

    // Initialize dispute session
    disputeSessions.set(telegramId, {
      dealId,
      step: 'reason'
    });

    await ctx.editMessageText(
      '⚠️ *Открытие спора*\n\n' +
      `Сделка: \`${dealId}\`\n\n` +
      'Опишите суть проблемы:\n' +
      '• Что пошло не так?\n' +
      '• Какие условия не выполнены?\n' +
      '• Ваши ожидания?\n\n' +
      '📎 После отправки текста вы сможете прикрепить фото/видео/файлы.\n\n' +
      'Отправьте описание проблемы или /cancel для отмены.',
      { parse_mode: 'Markdown' }
    );
  } catch (error) {
    console.error('Error starting dispute:', error);
    ctx.reply('❌ Произошла ошибка.');
  }
};

/**
 * Handle dispute text input
 */
const handleDisputeInput = async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const session = disputeSessions.get(telegramId);

    if (!session) {
      return;
    }

    if (ctx.message.text === '/cancel') {
      disputeSessions.delete(telegramId);
      return ctx.reply('❌ Открытие спора отменено.', backToMainMenu());
    }

    if (session.step === 'reason') {
      const text = ctx.message.text.trim();

      if (text.length < 20) {
        return ctx.reply('❌ Описание слишком короткое. Минимум 20 символов. Попробуйте ещё раз.');
      }

      session.reasonText = text;
      session.media = [];
      session.step = 'media';
      disputeSessions.set(telegramId, session);

      await ctx.reply(
        '📎 *Прикрепите доказательства*\n\n' +
        'Можете отправить:\n' +
        '• Скриншоты\n' +
        '• Видео\n' +
        '• Документы\n' +
        '• Голосовые сообщения\n\n' +
        'Отправьте файлы или напишите /done когда закончите.',
        { parse_mode: 'Markdown' }
      );
    } else if (session.step === 'media' && ctx.message.text === '/done') {
      await finalizeDispute(ctx, session);
    }
  } catch (error) {
    console.error('Error handling dispute input:', error);
    ctx.reply('❌ Произошла ошибка.');
  }
};

/**
 * Handle media attachments for dispute
 */
const handleDisputeMedia = async (ctx) => {
  try {
    const telegramId = ctx.from.id;
    const session = disputeSessions.get(telegramId);

    if (!session || session.step !== 'media') {
      return;
    }

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
      // Store file_id (in production, download and upload to S3)
      session.media.push({
        fileId,
        type: fileType
      });

      disputeSessions.set(telegramId, session);

      await ctx.reply(
        `✅ Файл ${session.media.length} добавлен.\n\n` +
        'Можете отправить ещё или напишите /done для завершения.'
      );
    }
  } catch (error) {
    console.error('Error handling dispute media:', error);
  }
};

/**
 * Finalize and create dispute
 */
const finalizeDispute = async (ctx, session) => {
  try {
    const telegramId = ctx.from.id;

    await ctx.reply('⏳ Создаём спор...');

    // Create dispute
    const dispute = await disputeService.openDispute(
      session.dealId,
      telegramId,
      session.reasonText,
      session.media.map(m => m.fileId) // In production, these would be S3 URLs
    );

    // Clean up session
    disputeSessions.delete(telegramId);

    const deal = await dealService.getDealById(session.dealId);

    await ctx.reply(
      '✅ *Спор открыт*\n\n' +
      `ID сделки: \`${session.dealId}\`\n\n` +
      'Арбитр получил уведомление и рассмотрит вашу жалобу в ближайшее время.\n\n' +
      'Вы получите уведомление о решении.',
      {
        parse_mode: 'Markdown',
        ...backToMainMenu()
      }
    );

    // Notify the other party
    const otherPartyId = deal.buyerId === telegramId ? deal.sellerId : deal.buyerId;
    await ctx.telegram.sendMessage(
      otherPartyId,
      `⚠️ *Открыт спор*\n\n` +
      `По сделке \`${session.dealId}\` открыт спор.\n\n` +
      `Арбитр рассмотрит жалобу и вынесет решение.`,
      { parse_mode: 'Markdown' }
    );

    // TODO: Notify admin/arbiter via admin panel or special channel
    console.log(`⚠️ New dispute opened for deal ${session.dealId} by user ${telegramId}`);
  } catch (error) {
    console.error('Error finalizing dispute:', error);
    disputeSessions.delete(ctx.from.id);
    ctx.reply(`❌ Ошибка при создании спора: ${error.message}`);
  }
};

module.exports = {
  startDispute,
  handleDisputeInput,
  handleDisputeMedia
};
