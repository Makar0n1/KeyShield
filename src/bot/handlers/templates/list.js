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
const { t } = require('../../../locales');

/**
 * Show templates list
 */
async function showTemplatesList(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();

  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  // Clear any active session
  await clearTemplateSession(telegramId);

  const templates = await DealTemplate.getUserTemplates(telegramId);
  const canCreate = await DealTemplate.canCreateTemplate(telegramId);

  if (templates.length === 0) {
    const text = t(lang, 'templates.empty');
    const keyboard = templatesEmptyKeyboard(lang);
    await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
    return;
  }

  let text = t(lang, 'templates.title_count', { count: templates.length }) + '\n\n';

  templates.forEach((tpl, i) => {
    const roleIcon = tpl.creatorRole === 'buyer' ? '💵' : '🛠';
    const roleText = tpl.creatorRole === 'buyer' ? t(lang, 'role.buyer') : t(lang, 'role.seller');
    text += t(lang, 'templates.list_item', {
      index: i + 1,
      roleIcon,
      name: tpl.name,
      productName: tpl.productName,
      amount: tpl.amount,
      asset: tpl.asset,
      roleText
    }) + '\n\n';
  });

  text += t(lang, 'templates.select_hint');

  const keyboard = templatesListKeyboard(templates, canCreate, lang);
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
}

/**
 * Show template details
 */
async function showTemplateDetails(ctx, templateIdOverride = null) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();

  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  // Get templateId from callback or override
  let templateId = templateIdOverride;
  if (!templateId && ctx.callbackQuery) {
    templateId = ctx.callbackQuery.data.split(':')[2];
  }

  const template = await DealTemplate.findOne({ _id: templateId, telegramId });

  if (!template) {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery(t(lang, 'templates.not_found'), { show_alert: true });
    }
    return showTemplatesList(ctx);
  }

  const roleText = template.creatorRole === 'buyer' ? t(lang, 'role.buyer') : t(lang, 'role.seller');
  const roleIcon = template.creatorRole === 'buyer' ? '💵' : '🛠';
  const commission = Deal.calculateCommission(template.amount);
  const deadlineTextVal = t(lang, 'templates.deadline_format', { hours: template.deadlineHours });
  const commissionText = t(lang, 'templates.commission_format', { type: template.commissionType, commission, asset: template.asset });

  const descriptionPreview = template.description.length > 200
    ? template.description.substring(0, 200) + '...'
    : template.description;

  const text = t(lang, 'templates.detail', {
    name: template.name,
    roleIcon,
    roleText,
    productName: template.productName,
    description: descriptionPreview,
    amount: template.amount,
    asset: template.asset,
    commissionText,
    deadlineText: deadlineTextVal,
    usageCount: template.usageCount
  });

  const keyboard = templateDetailsKeyboard(templateId, lang);
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
}

module.exports = {
  showTemplatesList,
  showTemplateDetails
};
