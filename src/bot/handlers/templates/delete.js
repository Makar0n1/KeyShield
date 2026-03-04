/**
 * Template Delete Handlers
 */

const DealTemplate = require('../../../models/DealTemplate');
const messageManager = require('../../utils/messageManager');
const { templateDeleteConfirmKeyboard } = require('../../keyboards/templates');
const { clearTemplateSession } = require('./session');
const { showTemplatesList } = require('./list');
const { t } = require('../../../locales');

/**
 * Show delete confirmation
 */
async function showDeleteConfirmation(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  const templateId = ctx.callbackQuery.data.split(':')[2];

  const template = await DealTemplate.findOne({ _id: templateId, telegramId });
  if (!template) {
    await ctx.answerCbQuery(t(lang, 'templates.not_found'), { show_alert: true });
    return showTemplatesList(ctx);
  }

  const text = t(lang, 'templates.confirm_delete', {
    name: template.name,
    productName: template.productName,
    amount: template.amount,
    asset: template.asset,
    usageCount: template.usageCount
  });

  const keyboard = templateDeleteConfirmKeyboard(templateId, lang);
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
}

/**
 * Confirm deletion
 */
async function confirmDelete(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  const templateId = ctx.callbackQuery.data.split(':')[2];

  const template = await DealTemplate.findOneAndDelete({ _id: templateId, telegramId });

  if (!template) {
    await ctx.answerCbQuery(t(lang, 'templates.not_found'), { show_alert: true });
    return showTemplatesList(ctx);
  }

  await clearTemplateSession(telegramId);

  const text = t(lang, 'templates.deleted', { name: template.name });
  await messageManager.sendNewMessage(ctx, telegramId, text, { inline_keyboard: [] });

  // Return to templates list after 1.5 seconds
  setTimeout(async () => {
    try {
      await showTemplatesList(ctx);
    } catch (e) {
      console.error('Error showing templates list after delete:', e);
    }
  }, 1500);
}

module.exports = {
  showDeleteConfirmation,
  confirmDelete
};
