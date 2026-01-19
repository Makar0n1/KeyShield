/**
 * Template Keyboards
 *
 * Inline keyboards for deal templates feature.
 */

const { Markup } = require('telegraf');

/**
 * Templates list keyboard
 */
const templatesListKeyboard = (templates, canCreate) => {
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
    buttons.push([Markup.button.callback('➕ Создать шаблон', 'template:create')]);
  }

  // Back button
  buttons.push([Markup.button.callback('⬅️ Назад', 'main_menu')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Empty templates keyboard
 */
const templatesEmptyKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Создать шаблон', 'template:create')],
    [Markup.button.callback('⬅️ Назад', 'main_menu')]
  ]);
};

/**
 * Template details keyboard
 */
const templateDetailsKeyboard = (templateId) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🚀 Использовать', `template:use:${templateId}`)],
    [
      Markup.button.callback('✏️ Название', `template:edit:${templateId}:name`),
      Markup.button.callback('💰 Сумма', `template:edit:${templateId}:amount`)
    ],
    [
      Markup.button.callback('📝 Описание', `template:edit:${templateId}:description`),
      Markup.button.callback('⏰ Срок', `template:edit:${templateId}:deadline`)
    ],
    [Markup.button.callback('🗑️ Удалить', `template:delete:${templateId}`)],
    [Markup.button.callback('⬅️ К шаблонам', 'templates')]
  ]);
};

/**
 * Delete confirmation keyboard
 */
const templateDeleteConfirmKeyboard = (templateId) => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Да, удалить', `template:confirm_delete:${templateId}`),
      Markup.button.callback('❌ Отмена', `template:view:${templateId}`)
    ]
  ]);
};

/**
 * Template creation: role selection
 */
const templateRoleKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💵 Я покупатель', 'template_role:buyer')],
    [Markup.button.callback('🛠 Я продавец', 'template_role:seller')],
    [Markup.button.callback('❌ Отмена', 'templates')]
  ]);
};

/**
 * Template creation: commission type
 */
const templateCommissionKeyboard = (amount, commission, asset) => {
  const buyerTotal = amount + commission;
  const sellerReceives = amount - commission;
  const splitEach = (commission / 2).toFixed(2);

  return Markup.inlineKeyboard([
    [Markup.button.callback(`💵 Покупатель (${buyerTotal} ${asset})`, 'template_commission:buyer')],
    [Markup.button.callback(`🛠 Продавец (получит ${sellerReceives} ${asset})`, 'template_commission:seller')],
    [Markup.button.callback(`⚖️ 50/50 (по ${splitEach} ${asset})`, 'template_commission:split')],
    [Markup.button.callback('⬅️ Назад', 'template_back')]
  ]);
};

/**
 * Template creation: deadline
 */
const templateDeadlineKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('24ч', 'template_deadline:24'),
      Markup.button.callback('48ч', 'template_deadline:48')
    ],
    [
      Markup.button.callback('3 дня', 'template_deadline:72'),
      Markup.button.callback('7 дней', 'template_deadline:168')
    ],
    [Markup.button.callback('14 дней', 'template_deadline:336')],
    [Markup.button.callback('⬅️ Назад', 'template_back')]
  ]);
};

/**
 * Template usage: counterparty method selection (username or invite link)
 */
const templateCounterpartyMethodKeyboard = (templateId) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('👤 Ввести @username', `template_method:username:${templateId}`)],
    [Markup.button.callback('🔗 Создать ссылку', `template_method:invite:${templateId}`)],
    [Markup.button.callback('❌ Отмена', `template:view:${templateId}`)]
  ]);
};

/**
 * Template usage: counterparty input cancel
 */
const templateUseKeyboard = (templateId) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Отмена', `template:view:${templateId}`)]
  ]);
};

/**
 * Cancel/back keyboard for text input
 */
const templateInputKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Отмена', 'templates')]
  ]);
};

/**
 * Save deal as template keyboard (after successful deal)
 */
const saveAsTemplateKeyboard = (dealId) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💾 Сохранить как шаблон', `template:save_from_deal:${dealId}`)],
    [Markup.button.callback('📋 Детали сделки', `view_deal:${dealId}`)],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
};

/**
 * Edit cancel keyboard (returns to template details)
 */
const templateEditCancelKeyboard = (templateId) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Отмена', `template:view:${templateId}`)]
  ]);
};

/**
 * Deadline edit keyboard (same as create but with cancel to details)
 */
const templateDeadlineEditKeyboard = (templateId) => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('24ч', 'template_deadline:24'),
      Markup.button.callback('48ч', 'template_deadline:48')
    ],
    [
      Markup.button.callback('3 дня', 'template_deadline:72'),
      Markup.button.callback('7 дней', 'template_deadline:168')
    ],
    [Markup.button.callback('14 дней', 'template_deadline:336')],
    [Markup.button.callback('❌ Отмена', `template:view:${templateId}`)]
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
