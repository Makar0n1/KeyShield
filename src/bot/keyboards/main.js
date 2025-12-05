const { Markup } = require('telegraf');

// ============================================
// MAIN MENU
// ============================================

/**
 * Main menu keyboard (no Back button - this is root)
 */
const mainMenuKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📝 Создать сделку', 'create_deal')],
    [Markup.button.callback('📋 Мои сделки', 'my_deals')],
    [Markup.button.callback('ℹ️ Помощь', 'help')]
  ]);
};

// ============================================
// NAVIGATION BUTTONS
// ============================================

/**
 * Back button only
 */
const backButton = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Назад', 'back')]
  ]);
};

/**
 * Back to main menu only (for final screens)
 */
const mainMenuButton = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
};

/**
 * Both Back and Main Menu buttons
 */
const backAndMainMenu = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⬅️ Назад', 'back'),
      Markup.button.callback('🏠 Главное меню', 'main_menu')
    ]
  ]);
};

// ============================================
// HELP MENU
// ============================================

/**
 * Help menu keyboard
 */
const helpMenuKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('ℹ️ Как это работает', 'how_it_works')],
    [Markup.button.callback('💰 Правила и комиссии', 'rules')],
    [Markup.button.callback('🆘 Поддержка', 'support')],
    [Markup.button.callback('⬅️ Назад', 'back')]
  ]);
};

/**
 * Help section keyboard (back to help + main menu)
 */
const helpSectionKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⬅️ Назад', 'back'),
      Markup.button.callback('🏠 Главное меню', 'main_menu')
    ]
  ]);
};

// ============================================
// DEAL CREATION
// ============================================

/**
 * Role selection keyboard
 */
const roleSelectionKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💵 Я покупатель', 'role:buyer')],
    [Markup.button.callback('🛠 Я продавец', 'role:seller')],
    [Markup.button.callback('⬅️ Назад', 'back')]
  ]);
};

/**
 * Asset selection keyboard
 */
const assetSelectionKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💵 USDT (TRC-20)', 'asset:USDT')],
    [Markup.button.callback('⬅️ Назад', 'back')]
  ]);
};

/**
 * Commission type selection keyboard
 */
const commissionTypeKeyboard = (amount, asset) => {
  const Deal = require('../../models/Deal');
  const commission = Deal.calculateCommission(amount);

  return Markup.inlineKeyboard([
    [Markup.button.callback(`💵 Покупатель (депозит ${amount + commission} ${asset})`, 'commission:buyer')],
    [Markup.button.callback(`🛠 Продавец (получит ${amount - commission} ${asset})`, 'commission:seller')],
    [Markup.button.callback(`⚖️ 50/50 (по ${(commission / 2).toFixed(2)} ${asset})`, 'commission:split')],
    [Markup.button.callback('⬅️ Назад', 'back')]
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
    [Markup.button.callback('⬅️ Назад', 'back')]
  ]);
};

/**
 * Deal confirmation keyboard
 */
const dealConfirmationKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Создать сделку', 'confirm:create_deal')],
    [Markup.button.callback('⬅️ Назад', 'back')]
  ]);
};

/**
 * Deal created keyboard (view deal + main menu)
 */
const dealCreatedKeyboard = (dealId) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📋 Детали сделки', `view_deal:${dealId}`)],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
};

// ============================================
// MY DEALS
// ============================================

/**
 * My deals list keyboard (dynamic based on deals)
 */
const myDealsKeyboard = (deals = []) => {
  const buttons = [];

  // Add buttons for each deal (max 10)
  deals.slice(0, 10).forEach(deal => {
    const statusIcon = getStatusIcon(deal.status);
    buttons.push([
      Markup.button.callback(`${statusIcon} ${deal.dealId}`, `view_deal:${deal.dealId}`)
    ]);
  });

  // Back button
  buttons.push([Markup.button.callback('⬅️ Назад', 'back')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * My deals empty keyboard
 */
const myDealsEmptyKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📝 Создать сделку', 'create_deal')],
    [Markup.button.callback('⬅️ Назад', 'back')]
  ]);
};

/**
 * Deal details keyboard (dynamic based on role and status)
 */
const dealDetailsKeyboard = (dealId, userRole, dealStatus) => {
  const buttons = [];

  // Action buttons based on role and status
  if (userRole === 'seller' && dealStatus === 'locked') {
    buttons.push([
      Markup.button.callback('✅ Работа выполнена', `submit_work:${dealId}`)
    ]);
    buttons.push([
      Markup.button.callback('⚠️ Открыть спор', `open_dispute:${dealId}`)
    ]);
  }

  if (userRole === 'buyer' && dealStatus === 'in_progress') {
    buttons.push([
      Markup.button.callback('✅ Принять работу', `accept_work:${dealId}`)
    ]);
    buttons.push([
      Markup.button.callback('❌ Открыть спор', `open_dispute:${dealId}`)
    ]);
  }

  // General dispute button for locked deals
  if ((dealStatus === 'locked' || dealStatus === 'in_progress') && buttons.length === 0) {
    buttons.push([
      Markup.button.callback('⚠️ Открыть спор', `open_dispute:${dealId}`)
    ]);
  }

  // Show deposit address button for buyer waiting for deposit
  if (userRole === 'buyer' && dealStatus === 'waiting_for_deposit') {
    buttons.push([
      Markup.button.callback('💳 Показать адрес депозита', `show_deposit:${dealId}`)
    ]);
  }

  // Navigation
  buttons.push([
    Markup.button.callback('⬅️ Назад', 'back'),
    Markup.button.callback('🏠 Главное меню', 'main_menu')
  ]);

  return Markup.inlineKeyboard(buttons);
};

// ============================================
// NOTIFICATIONS & COUNTERPARTY ACTIONS
// ============================================

/**
 * New deal notification keyboard (for counterparty)
 */
const newDealNotificationKeyboard = (dealId) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💳 Указать кошелёк', `enter_wallet:${dealId}`)],
    [Markup.button.callback('❌ Отклонить', `decline_deal:${dealId}`)],
    [Markup.button.callback('⬅️ Назад', 'back')]
  ]);
};

/**
 * Deposit warning keyboard
 */
const depositWarningKeyboard = (dealId) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Понятно, продолжить', `confirm_deposit_warning:${dealId}`)],
    [Markup.button.callback('❌ Отменить сделку', `cancel_deal:${dealId}`)],
    [Markup.button.callback('⬅️ Назад', 'back')]
  ]);
};

/**
 * Deposit received notification keyboard
 */
const depositReceivedKeyboard = (dealId) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📋 Детали сделки', `view_deal:${dealId}`)],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')],
    [Markup.button.callback('⬅️ Назад', 'back')]
  ]);
};

/**
 * Work submitted notification keyboard (for buyer)
 */
const workSubmittedKeyboard = (dealId) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Принять работу', `accept_work:${dealId}`)],
    [Markup.button.callback('❌ Открыть спор', `open_dispute:${dealId}`)],
    [Markup.button.callback('📋 Детали сделки', `view_deal:${dealId}`)],
    [Markup.button.callback('⬅️ Назад', 'back')]
  ]);
};

/**
 * Deadline expired keyboard (depends on status)
 */
const deadlineExpiredKeyboard = (dealId, status, role) => {
  const buttons = [];

  if (role === 'seller' && status === 'locked') {
    buttons.push([Markup.button.callback('✅ Работа выполнена', `submit_work:${dealId}`)]);
  }

  if (role === 'buyer' && status === 'in_progress') {
    buttons.push([Markup.button.callback('✅ Принять работу', `accept_work:${dealId}`)]);
  }

  buttons.push([Markup.button.callback('❌ Открыть спор', `open_dispute:${dealId}`)]);
  buttons.push([Markup.button.callback('⬅️ Назад', 'back')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Final screen keyboard (completed/resolved deals)
 */
const finalScreenKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
};

// ============================================
// DISPUTE
// ============================================

/**
 * Dispute media upload keyboard
 */
const disputeMediaKeyboard = (dealId) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Отправить спор', `finalize_dispute:${dealId}`)],
    [Markup.button.callback('⬅️ Назад', 'back')]
  ]);
};

/**
 * Dispute opened notification keyboard
 */
const disputeOpenedKeyboard = (dealId) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📋 Детали сделки', `view_deal:${dealId}`)],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')],
    [Markup.button.callback('⬅️ Назад', 'back')]
  ]);
};

// ============================================
// HELPERS
// ============================================

/**
 * Get status icon for deal
 */
function getStatusIcon(status) {
  const icons = {
    'created': '🆕',
    'waiting_for_seller_wallet': '⏳',
    'waiting_for_buyer_wallet': '⏳',
    'waiting_for_deposit': '💳',
    'locked': '🔒',
    'in_progress': '⚡',
    'completed': '✅',
    'dispute': '⚠️',
    'resolved': '⚖️',
    'cancelled': '❌',
    'expired': '⌛'
  };
  return icons[status] || '📋';
}

// ============================================
// LEGACY EXPORTS (for backwards compatibility)
// ============================================

const persistentKeyboard = () => Markup.removeKeyboard();
const removeKeyboard = () => Markup.removeKeyboard();
const backToMainMenu = mainMenuButton;
const cancelDealButton = backButton;
const cancelActiveDealButton = (dealId) => dealCreatedKeyboard(dealId);
const confirmationKeyboard = (action) => dealConfirmationKeyboard();
const dealActionKeyboard = dealDetailsKeyboard;
const depositConfirmationKeyboard = () => depositWarningKeyboard('');

module.exports = {
  // Main
  mainMenuKeyboard,
  helpMenuKeyboard,
  helpSectionKeyboard,

  // Navigation
  backButton,
  mainMenuButton,
  backAndMainMenu,

  // Deal creation
  roleSelectionKeyboard,
  assetSelectionKeyboard,
  commissionTypeKeyboard,
  deadlineKeyboard,
  dealConfirmationKeyboard,
  dealCreatedKeyboard,

  // My deals
  myDealsKeyboard,
  myDealsEmptyKeyboard,
  dealDetailsKeyboard,

  // Notifications
  newDealNotificationKeyboard,
  depositWarningKeyboard,
  depositReceivedKeyboard,
  workSubmittedKeyboard,
  deadlineExpiredKeyboard,
  finalScreenKeyboard,

  // Dispute
  disputeMediaKeyboard,
  disputeOpenedKeyboard,

  // Helpers
  getStatusIcon,

  // Legacy
  persistentKeyboard,
  removeKeyboard,
  backToMainMenu,
  cancelDealButton,
  cancelActiveDealButton,
  confirmationKeyboard,
  dealActionKeyboard,
  depositConfirmationKeyboard
};
