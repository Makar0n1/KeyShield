/**
 * Template Edit Handlers
 */

const DealTemplate = require('../../../models/DealTemplate');
const Deal = require('../../../models/Deal');
const messageManager = require('../../utils/messageManager');
const {
  templateEditCancelKeyboard,
  templateDeadlineEditKeyboard
} = require('../../keyboards/templates');
const { getTemplateSession, setTemplateSession, clearTemplateSession } = require('./session');
const { showTemplateDetails } = require('./list');

/**
 * Start editing a field
 */
async function startEditField(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;

  const parts = ctx.callbackQuery.data.split(':');
  const templateId = parts[2];
  const field = parts[3];

  const template = await DealTemplate.findOne({ _id: templateId, telegramId });
  if (!template) {
    await ctx.answerCbQuery('❌ Шаблон не найден', { show_alert: true });
    return;
  }

  await setTemplateSession(telegramId, {
    action: `edit_${field}`,
    templateId,
    originalValue: template[field]
  });

  const fieldLabels = {
    name: 'Название',
    amount: 'Сумма',
    description: 'Описание',
    deadline: 'Срок'
  };

  if (field === 'deadline') {
    const text = `⏰ *Изменить срок*

📑 Шаблон: *${template.name}*
Текущий срок: *${formatDeadlineHours(template.deadlineHours)}*

Выберите новый срок выполнения:`;

    await messageManager.sendNewMessage(ctx, telegramId, text, templateDeadlineEditKeyboard(templateId));
    return;
  }

  const prompts = {
    name: `✏️ *Изменить название*

📑 Шаблон: *${template.name}*

Введите новое название:
_(от 2 до 50 символов)_`,
    amount: `💰 *Изменить сумму*

📑 Шаблон: *${template.name}*
Текущая сумма: *${template.amount} ${template.asset}*

Введите новую сумму:
_(минимум 50 USDT)_`,
    description: `📝 *Изменить описание*

📑 Шаблон: *${template.name}*

Введите новое описание:
_(от 20 до 5000 символов)_`
  };

  await messageManager.sendNewMessage(ctx, telegramId, prompts[field], templateEditCancelKeyboard(templateId));
}

/**
 * Handle edit text input
 */
async function handleEditInput(ctx) {
  const telegramId = ctx.from.id;
  const text = ctx.message.text.trim();

  await messageManager.deleteUserMessage(ctx);

  const session = await getTemplateSession(telegramId);
  if (!session || !session.action?.startsWith('edit_')) return false;

  const field = session.action.replace('edit_', '');

  // Skip deadline - handled via buttons
  if (field === 'deadline') return false;

  // Validate based on field
  let value = text;
  let error = null;

  switch (field) {
    case 'name':
      if (text.length < 2 || text.length > 50) {
        error = 'Название должно быть от 2 до 50 символов.';
      }
      break;
    case 'amount':
      value = parseFloat(text.replace(',', '.'));
      if (isNaN(value) || value < 50) {
        error = 'Минимальная сумма: 50 USDT.';
      }
      break;
    case 'description':
      if (text.length < 20 || text.length > 5000) {
        error = 'Описание должно быть от 20 до 5000 символов.';
      }
      break;
  }

  if (error) {
    const errorText = `❌ ${error}

Попробуйте ещё раз:`;
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateEditCancelKeyboard(session.templateId));
    return true;
  }

  // Update template
  await DealTemplate.findByIdAndUpdate(session.templateId, {
    $set: { [field]: value }
  });

  const templateId = session.templateId;
  await clearTemplateSession(telegramId);

  const fieldLabels = {
    name: 'Название',
    amount: 'Сумма',
    description: 'Описание'
  };

  const successText = `✅ *${fieldLabels[field]} изменено!*`;
  await messageManager.sendNewMessage(ctx, telegramId, successText, { inline_keyboard: [] });

  // Return to template details after 1.5 seconds
  setTimeout(async () => {
    try {
      await showTemplateDetails(ctx, templateId);
    } catch (e) {
      console.error('Error showing template details after edit:', e);
    }
  }, 1500);

  return true;
}

/**
 * Handle deadline edit (button selection)
 */
async function handleEditDeadline(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;

  const session = await getTemplateSession(telegramId);
  if (!session || session.action !== 'edit_deadline') return;

  const hours = parseInt(ctx.callbackQuery.data.split(':')[1]);

  await DealTemplate.findByIdAndUpdate(session.templateId, {
    $set: { deadlineHours: hours }
  });

  const templateId = session.templateId;
  await clearTemplateSession(telegramId);

  await messageManager.sendNewMessage(ctx, telegramId, '✅ *Срок изменён!*', { inline_keyboard: [] });

  setTimeout(async () => {
    try {
      await showTemplateDetails(ctx, templateId);
    } catch (e) {
      console.error('Error showing template details after deadline edit:', e);
    }
  }, 1500);
}

/**
 * Format deadline hours to readable text
 */
function formatDeadlineHours(hours) {
  if (hours === 24) return '24 часа';
  if (hours === 48) return '48 часов';
  if (hours < 24) return `${hours} часов`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 день';
  if (days < 5) return `${days} дня`;
  return `${days} дней`;
}

module.exports = {
  startEditField,
  handleEditInput,
  handleEditDeadline
};
