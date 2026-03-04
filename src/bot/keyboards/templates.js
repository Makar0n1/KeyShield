/**
 * Template Keyboards
 *
 * Inline keyboards for deal templates feature.
 */

const { Markup } = require('telegraf');
const { t } = require('../../locales');

/**
 * Templates list keyboard
 */
const templatesListKeyboard = (templates, canCreate, lang = 'ru') => {
  const buttons = [];

  // Template buttons
  templates.forEach((tpl) => {
    const roleIcon = tpl.creatorRole === 'buyer' ? '💵' : '🛠';
    buttons.push([
      Markup.button.callback(
        `${roleIcon} ${tpl.name} — ${tpl.amount} ${tpl.asset}`,
        `template:view:${tpl._id}`
      )
    ]);
  });

  // Create new template (if under limit)
  if (canCreate) {
    buttons.push([Markup.button.callback(t(lang, 'btn.create_template'), 'template:create')]);
  }

  // Back button
  buttons.push([Markup.button.callback(t(lang, 'btn.back'), 'main_menu')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Empty templates keyboard
 */
const templatesEmptyKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.create_template'), 'template:create')],
    [Markup.button.callback(t(lang, 'btn.back'), 'main_menu')]
  ]);
};

/**
 * Template details keyboard
 */
const templateDetailsKeyboard = (templateId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.use_template'), `template:use:${templateId}`)],
    [
      Markup.button.callback(t(lang, 'btn.edit_name'), `template:edit:${templateId}:name`),
      Markup.button.callback(t(lang, 'btn.amount'), `template:edit:${templateId}:amount`)
    ],
    [
      Markup.button.callback(t(lang, 'btn.description'), `template:edit:${templateId}:description`),
      Markup.button.callback(t(lang, 'btn.deadline_btn'), `template:edit:${templateId}:deadline`)
    ],
    [Markup.button.callback(t(lang, 'btn.delete_template'), `template:delete:${templateId}`)],
    [Markup.button.callback(t(lang, 'btn.to_templates'), 'templates')]
  ]);
};

/**
 * Delete confirmation keyboard
 */
const templateDeleteConfirmKeyboard = (templateId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t(lang, 'btn.yes_delete_template'), `template:confirm_delete:${templateId}`),
      Markup.button.callback(t(lang, 'btn.cancel'), `template:view:${templateId}`)
    ]
  ]);
};

/**
 * Template creation: role selection
 */
const templateRoleKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.i_am_buyer'), 'template_role:buyer')],
    [Markup.button.callback(t(lang, 'btn.i_am_seller'), 'template_role:seller')],
    [Markup.button.callback(t(lang, 'btn.cancel'), 'templates')]
  ]);
};

/**
 * Template creation: commission type
 */
const templateCommissionKeyboard = (amount, commission, asset, lang = 'ru') => {
  const buyerTotal = amount + commission;
  const sellerReceives = amount - commission;
  const splitEach = (commission / 2).toFixed(2);

  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'commission.buyer_pays', { commission: buyerTotal, asset }), 'template_commission:buyer')],
    [Markup.button.callback(t(lang, 'commission.seller_pays', { amount: sellerReceives, asset }), 'template_commission:seller')],
    [Markup.button.callback(t(lang, 'commission.split', { half: splitEach, asset }), 'template_commission:split')],
    [Markup.button.callback(t(lang, 'btn.back'), 'template_back')]
  ]);
};

/**
 * Template creation: deadline
 */
const templateDeadlineKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t(lang, 'btn.hours_24'), 'template_deadline:24'),
      Markup.button.callback(t(lang, 'btn.hours_48'), 'template_deadline:48')
    ],
    [
      Markup.button.callback(t(lang, 'btn.days_3'), 'template_deadline:72'),
      Markup.button.callback(t(lang, 'btn.days_7'), 'template_deadline:168')
    ],
    [Markup.button.callback(t(lang, 'btn.days_14'), 'template_deadline:336')],
    [Markup.button.callback(t(lang, 'btn.back'), 'template_back')]
  ]);
};

/**
 * Template usage: counterparty method selection (username or invite link)
 */
const templateCounterpartyMethodKeyboard = (templateId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.enter_username'), `template_method:username:${templateId}`)],
    [Markup.button.callback(t(lang, 'btn.create_link'), `template_method:invite:${templateId}`)],
    [Markup.button.callback(t(lang, 'btn.cancel'), `template:view:${templateId}`)]
  ]);
};

/**
 * Template usage: counterparty input cancel
 */
const templateUseKeyboard = (templateId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.cancel'), `template:view:${templateId}`)]
  ]);
};

/**
 * Cancel/back keyboard for text input
 */
const templateInputKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.cancel'), 'templates')]
  ]);
};

/**
 * Save deal as template keyboard (after successful deal)
 */
const saveAsTemplateKeyboard = (dealId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.save_template'), `template:save_from_deal:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.deal_details'), `view_deal:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.main_menu'), 'main_menu')]
  ]);
};

/**
 * Edit cancel keyboard (returns to template details)
 */
const templateEditCancelKeyboard = (templateId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.cancel'), `template:view:${templateId}`)]
  ]);
};

/**
 * Deadline edit keyboard (same as create but with cancel to details)
 */
const templateDeadlineEditKeyboard = (templateId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t(lang, 'btn.hours_24'), 'template_deadline:24'),
      Markup.button.callback(t(lang, 'btn.hours_48'), 'template_deadline:48')
    ],
    [
      Markup.button.callback(t(lang, 'btn.days_3'), 'template_deadline:72'),
      Markup.button.callback(t(lang, 'btn.days_7'), 'template_deadline:168')
    ],
    [Markup.button.callback(t(lang, 'btn.days_14'), 'template_deadline:336')],
    [Markup.button.callback(t(lang, 'btn.cancel'), `template:view:${templateId}`)]
  ]);
};

module.exports = {
  templatesListKeyboard,
  templatesEmptyKeyboard,
  templateDetailsKeyboard,
  templateDeleteConfirmKeyboard,
  templateRoleKeyboard,
  templateCommissionKeyboard,
  templateDeadlineKeyboard,
  templateCounterpartyMethodKeyboard,
  templateUseKeyboard,
  templateInputKeyboard,
  saveAsTemplateKeyboard,
  templateEditCancelKeyboard,
  templateDeadlineEditKeyboard
};
