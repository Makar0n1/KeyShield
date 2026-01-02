/**
 * Template List & View Handlers
 */

const DealTemplate = require('../../../models/DealTemplate');
const Deal = require('../../../models/Deal');
const messageManager = require('../../utils/messageManager');
const {
  templatesListKeyboard,
  templatesEmptyKeyboard,
  templateDetailsKeyboard
} = require('../../keyboards/templates');
const { clearTemplateSession } = require('./session');

/**
 * Show templates list
 */
async function showTemplatesList(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();

  const telegramId = ctx.from.id;

  // Clear any active session
  await clearTemplateSession(telegramId);

  const templates = await DealTemplate.getUserTemplates(telegramId);
  const canCreate = await DealTemplate.canCreateTemplate(telegramId);

  if (templates.length === 0) {
    const text = `📑 *Мои шаблоны*

_У вас пока нет сохранённых шаблонов._

Шаблоны позволяют создавать сделки в 2 клика!

💡 *Как создать шаблон:*
• Нажмите «Создать шаблон» ниже
• Или сохраните успешную сделку как шаблон`;

    const keyboard = templatesEmptyKeyboard();
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    return;
  }

  let text = `📑 *Мои шаблоны* (${templates.length}/5)\n\n`;

  templates.forEach((tpl, i) => {
    const roleIcon = tpl.creatorRole === 'buyer' ? '💵' : '🛠';
    const roleText = tpl.creatorRole === 'buyer' ? 'Покупатель' : 'Продавец';
    text += `${i + 1}. ${roleIcon} *${tpl.name}*\n`;
    text += `   ${tpl.productName}\n`;
    text += `   ${tpl.amount} ${tpl.asset} • ${roleText}\n\n`;
  });

  text += `_Выберите шаблон для использования:_`;

  const keyboard = templatesListKeyboard(templates, canCreate);
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
}

/**
 * Show template details
 */
async function showTemplateDetails(ctx, templateIdOverride = null) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();

  const telegramId = ctx.from.id;

  // Get templateId from callback or override
  let templateId = templateIdOverride;
  if (!templateId && ctx.callbackQuery) {
    templateId = ctx.callbackQuery.data.split(':')[2];
  }

  // Debug: check what templateId is
  console.log('showTemplateDetails called with:', { templateIdOverride, templateId, callbackData: ctx.callbackQuery?.data });

  const template = await DealTemplate.findOne({ _id: templateId, telegramId });

  if (!template) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('❌ Шаблон не найден', { show_alert: true });
    }
    return showTemplatesList(ctx);
  }

  const roleText = template.creatorRole === 'buyer' ? 'Покупатель' : 'Продавец';
  const roleIcon = template.creatorRole === 'buyer' ? '💵' : '🛠';
  const commission = Deal.calculateCommission(template.amount);
  const deadlineText = formatDeadline(template.deadlineHours);
  const commissionText = formatCommission(template.commissionType, commission, template.asset);

  const descriptionPreview = template.description.length > 200
    ? template.description.substring(0, 200) + '...'
    : template.description;

  const text = `📑 *${template.name}*

${roleIcon} *Роль:* ${roleText}
📦 *Товар/услуга:* ${template.productName}

📝 *Описание:*
${descriptionPreview}

💰 *Сумма:* ${template.amount} ${template.asset}
💸 *Комиссия:* ${commissionText}
⏰ *Срок:* ${deadlineText}

📊 *Использовано:* ${template.usageCount} раз`;

  const keyboard = templateDetailsKeyboard(templateId);
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
}

/**
 * Format deadline hours to readable text
 */
function formatDeadline(hours) {
  if (hours === 24) return '24 часа';
  if (hours === 48) return '48 часов';
  if (hours < 24) return `${hours} часов`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 день';
  if (days < 5) return `${days} дня`;
  return `${days} дней`;
}

/**
 * Format commission type to readable text
 */
function formatCommission(type, commission, asset) {
  if (type === 'buyer') return `Платит покупатель (${commission} ${asset})`;
  if (type === 'seller') return `Платит продавец (${commission} ${asset})`;
  return `50/50 (по ${(commission / 2).toFixed(2)} ${asset})`;
}

module.exports = {
  showTemplatesList,
  showTemplateDetails,
  formatDeadline,
  formatCommission
};
