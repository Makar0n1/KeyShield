const { Markup } = require('telegraf');

/**
 * Persistent custom keyboard (always visible)
 */
const persistentKeyboard = () => {
  return Markup.keyboard([
    ['🏠 Главное меню', '📋 Мои сделки'],
    ['📝 Создать сделку', 'ℹ️ Помощь']
  ]).resize();
};

/**
 * Remove keyboard
 */
const removeKeyboard = () => {
  return Markup.removeKeyboard();
};

/**
 * Main menu keyboard
 */
const mainMenuKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📝 Создать сделку', 'create_deal')],
    [Markup.button.callback('📋 Мои сделки', 'my_deals')],
    [Markup.button.callback('ℹ️ Помощь', 'help')]
  ]);
};

/**
 * Help menu keyboard
 */
const helpMenuKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('ℹ️ Как это работает', 'how_it_works')],
    [Markup.button.callback('💰 Правила и комиссии', 'rules')],
    [Markup.button.callback('🆘 Поддержка', 'support')],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
};

/**
 * Deal action keyboard (for buyer/seller in active deals)
 */
const dealActionKeyboard = (dealId, userRole, dealStatus) => {
  const buttons = [];

  if (userRole === 'seller' && dealStatus === 'locked') {
    buttons.push([
      Markup.button.callback('✅ Работа выполнена', `submit_work:${dealId}`)
    ]);
  }

  if (userRole === 'buyer' && dealStatus === 'in_progress') {
    buttons.push([
      Markup.button.callback('✅ Принять работу', `accept_work:${dealId}`),
      Markup.button.callback('❌ Открыть спор', `open_dispute:${dealId}`)
    ]);
  }

  if ((dealStatus === 'locked' || dealStatus === 'in_progress') && !buttons.length) {
    buttons.push([
      Markup.button.callback('⚠️ Открыть спор', `open_dispute:${dealId}`)
    ]);
  }

  buttons.push([
    Markup.button.callback('⬅️ Назад', 'my_deals'),
    Markup.button.callback('🏠 Главное меню', 'main_menu')
  ]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Commission type selection keyboard
 */
const commissionTypeKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('Покупатель платит', 'commission:buyer')],
    [Markup.button.callback('Продавец платит', 'commission:seller')],
    [Markup.button.callback('50/50', 'commission:split')],
    [Markup.button.callback('❌ Отмена', 'cancel_create_deal')]
  ]);
};

/**
 * Asset selection keyboard
 */
const assetSelectionKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💵 USDT (TRC-20)', 'asset:USDT')],
    [Markup.button.callback('❌ Отмена', 'cancel_create_deal')]
  ]);
};

/**
 * Deadline selection keyboard
 */
const deadlineKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('24 часа', 'deadline:24'),
      Markup.button.callback('48 часов', 'deadline:48')
    ],
    [
      Markup.button.callback('3 дня', 'deadline:72'),
      Markup.button.callback('7 дней', 'deadline:168')
    ],
    [Markup.button.callback('14 дней', 'deadline:336')],
    [Markup.button.callback('❌ Отмена', 'cancel_create_deal')]
  ]);
};

/**
 * Confirmation keyboard
 */
const confirmationKeyboard = (action) => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Подтвердить', `confirm:${action}`),
      Markup.button.callback('❌ Отменить', `cancel:${action}`)
    ]
  ]);
};

/**
 * Back to main menu button
 */
const backToMainMenu = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
};

/**
 * Cancel deal creation button
 */
const cancelDealButton = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Отменить создание', 'cancel_create_deal')]
  ]);
};

/**
 * Cancel deal button (for active deals)
 */
const cancelActiveDealButton = (dealId) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('❌ Отменить сделку', `cancel_active_deal:${dealId}`)],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
};

/**
 * Deposit confirmation keyboard with warning
 */
const depositConfirmationKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Понятно, продолжить', 'confirm_deposit_warning')],
    [Markup.button.callback('❌ Отменить сделку', 'cancel_deal')]
  ]);
};

module.exports = {
  persistentKeyboard,
  removeKeyboard,
  mainMenuKeyboard,
  helpMenuKeyboard,
  dealActionKeyboard,
  commissionTypeKeyboard,
  assetSelectionKeyboard,
  deadlineKeyboard,
  confirmationKeyboard,
  depositConfirmationKeyboard,
  backToMainMenu,
  cancelDealButton,
  cancelActiveDealButton
};
