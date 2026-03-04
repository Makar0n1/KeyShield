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
const { t } = require('../../../locales');

/**
 * Start editing a field
 */
async function startEditField(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  const parts = ctx.callbackQuery.data.split(':');
  const templateId = parts[2];
  const field = parts[3];

  const template = await DealTemplate.findOne({ _id: templateId, telegramId });
  if (!template) {
    await ctx.answerCbQuery(t(lang, 'templates.not_found'), { show_alert: true });
    return;
  }

  await setTemplateSession(telegramId, {
    action: `edit_${field}`,
    templateId,
    originalValue: template[field]
  });

  if (field === 'deadline') {
    const text = t(lang, 'templates.edit_deadline_prompt', {
      name: template.name,
      currentDeadline: t(lang, 'templates.deadline_format', { hours: template.deadlineHours })
    });

    await messageManager.sendNewMessage(ctx, telegramId, text, templateDeadlineEditKeyboard(templateId, lang));
    return;
  }

  const prompts = {
    name: t(lang, 'templates.edit_name_prompt', { name: template.name }),
    amount: t(lang, 'templates.edit_amount_prompt', { name: template.name, amount: template.amount, asset: template.asset }),
    description: t(lang, 'templates.edit_description_prompt', { name: template.name })
  };

  await messageManager.sendNewMessage(ctx, telegramId, prompts[field], templateEditCancelKeyboard(templateId, lang));
}

/**
 * Handle edit text input
 */
async function handleEditInput(ctx) {
  const telegramId = ctx.from.id;
  const text = ctx.message.text.trim();
  const lang = ctx.state?.lang || 'ru';

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
        error = t(lang, 'templates.edit_name_error');
      }
      break;
    case 'amount':
      value = parseFloat(text.replace(',', '.'));
      if (isNaN(value) || value < 50) {
        error = t(lang, 'templates.edit_amount_error');
      }
      break;
    case 'description':
      if (text.length < 20 || text.length > 5000) {
        error = t(lang, 'templates.edit_description_error');
      }
      break;
  }

  if (error) {
    const errorText = `${error}\n\n${t(lang, 'templates.edit_error_retry')}`;
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateEditCancelKeyboard(session.templateId, lang));
    return true;
  }

  // Update template
  await DealTemplate.findByIdAndUpdate(session.templateId, {
    $set: { [field]: value }
  });

  const templateId = session.templateId;
  await clearTemplateSession(telegramId);

  const fieldLabel = t(lang, `templates.field_label_${field}`);
  const successText = t(lang, 'templates.field_changed', { fieldLabel });
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
  const lang = ctx.state?.lang || 'ru';

  const session = await getTemplateSession(telegramId);
  if (!session || session.action !== 'edit_deadline') return;

  const hours = parseInt(ctx.callbackQuery.data.split(':')[1]);

  await DealTemplate.findByIdAndUpdate(session.templateId, {
    $set: { deadlineHours: hours }
  });

  const templateId = session.templateId;
  await clearTemplateSession(telegramId);

  await messageManager.sendNewMessage(ctx, telegramId, t(lang, 'templates.deadline_changed'), { inline_keyboard: [] });

  setTimeout(async () => {
    try {
      await showTemplateDetails(ctx, templateId);
    } catch (e) {
      console.error('Error showing template details after deadline edit:', e);
    }
  }, 1500);
}

module.exports = {
  startEditField,
  handleEditInput,
  handleEditDeadline
};
