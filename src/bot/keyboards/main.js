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
    [
      Markup.button.callback('📋 Мои сделки', 'my_deals'),
      Markup.button.callback('👤 Мои данные', 'my_data')
    ],
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
 * Username required keyboard (when user has no username)
 */
const usernameRequiredKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Ник установлен', 'username_set')],
    [Markup.button.callback('🏠 Главное меню', 'main_menu')]
  ]);
};

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
 * No "Back" button - wallet already verified, can only create or cancel
 */
const dealConfirmationKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅ Создать сделку', 'confirm:create_deal')],
    [Markup.button.callback('❌ Отменить', 'cancel_create_deal')]
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
const myDealsKeyboard = (deals = [], currentPage = 1, totalPages = 1) => {
  const buttons = [];

  // Add buttons for each deal on current page
  deals.forEach(deal => {
    const statusIcon = getStatusIcon(deal.status);
    buttons.push([
      Markup.button.callback(`${statusIcon} ${deal.dealId}`, `view_deal:${deal.dealId}`)
    ]);
  });

  // Pagination buttons (if more than 1 page)
  if (totalPages > 1) {
    const paginationRow = [];

    // Previous page button
    if (currentPage > 1) {
      paginationRow.push(Markup.button.callback('◀️', `deals_page:${currentPage - 1}`));
    }

    // Page numbers (show max 2 pages at a time)
    const pageButtons = [];
    const maxVisiblePages = 2;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

    // Adjust startPage if we're near the end
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      if (i === currentPage) {
        pageButtons.push(Markup.button.callback(`• ${i} •`, `deals_page:${i}`));
      } else {
        pageButtons.push(Markup.button.callback(`${i}`, `deals_page:${i}`));
      }
    }

    paginationRow.push(...pageButtons);

    // Next page button
    if (currentPage < totalPages) {
      paginationRow.push(Markup.button.callback('▶️', `deals_page:${currentPage + 1}`));
    }

    buttons.push(paginationRow);
  }

  // Back button (returns to main menu)
  buttons.push([Markup.button.callback('⬅️ Назад', 'main_menu')]);

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

  // Waiting for wallet - show "Enter Wallet" button
  if (userRole === 'seller' && dealStatus === 'waiting_for_seller_wallet') {
    buttons.push([
      Markup.button.callback('💳 Указать кошелёк', `enter_wallet:${dealId}`)
    ]);
    buttons.push([
      Markup.button.callback('❌ Отклонить сделку', `decline_deal:${dealId}`)
    ]);
  }

  if (userRole === 'buyer' && dealStatus === 'waiting_for_buyer_wallet') {
    buttons.push([
      Markup.button.callback('💳 Указать кошелёк', `enter_wallet:${dealId}`)
    ]);
    buttons.push([
      Markup.button.callback('❌ Отклонить сделку', `decline_deal:${dealId}`)
    ]);
  }

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
    buttons.push([
      Markup.button.callback('❌ Отменить сделку', `cancel_deal:${dealId}`)
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
 * Wallet verification error keyboard (for buyer)
 * Shows when wallet verification fails (insufficient funds, not found, etc.)
 */
const walletVerificationErrorKeyboard = (dealId) => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💳 Указать другой кошелёк', `retry_wallet:${dealId}`)],
    [Markup.button.callback('❌ Отменить сделку', `cancel_deal:${dealId}`)]
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
// MY DATA (user profile section)
// ============================================

/**
 * My Data main menu keyboard
 */
const myDataMenuKeyboard = (hasEmail, walletsCount) => {
  const buttons = [];

  // Email section
  if (hasEmail) {
    buttons.push([Markup.button.callback('📧 Изменить email', 'mydata:change_email')]);
  } else {
    buttons.push([Markup.button.callback('📧 Добавить email', 'mydata:add_email')]);
  }

  // Wallets section
  buttons.push([Markup.button.callback(`💳 Мои кошельки (${walletsCount}/5)`, 'mydata:wallets')]);

  // Back button
  buttons.push([Markup.button.callback('⬅️ Назад', 'main_menu')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Wallets list keyboard (delete is on wallet details screen)
 */
const walletsListKeyboard = (wallets) => {
  const buttons = [];

  // List each wallet
  wallets.forEach((wallet, index) => {
    const displayName = wallet.name || `Кошелёк ${index + 1}`;
    const shortAddr = wallet.address.slice(0, 6) + '...' + wallet.address.slice(-4);
    buttons.push([
      Markup.button.callback(`💳 ${displayName}: ${shortAddr}`, `wallet:view:${index}`)
    ]);
  });

  // Add wallet button (if under limit)
  if (wallets.length < 5) {
    buttons.push([Markup.button.callback('➕ Добавить кошелёк', 'mydata:add_wallet')]);
  }

  // Back button
  buttons.push([Markup.button.callback('⬅️ Назад', 'my_data')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Empty wallets keyboard
 */
const walletsEmptyKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('➕ Добавить кошелёк', 'mydata:add_wallet')],
    [Markup.button.callback('⬅️ Назад', 'my_data')]
  ]);
};

/**
 * Wallet selection keyboard for deal creation/acceptance
 */
const walletSelectionKeyboard = (wallets, showNewOption = true) => {
  const buttons = [];

  // List saved wallets
  wallets.forEach((wallet, index) => {
    const displayName = wallet.name || `Кошелёк ${index + 1}`;
    const shortAddr = wallet.address.slice(0, 6) + '...' + wallet.address.slice(-4);
    buttons.push([
      Markup.button.callback(`💳 ${displayName}: ${shortAddr}`, `select_wallet:${index}`)
    ]);
  });

  // Option to enter new address
  if (showNewOption) {
    buttons.push([Markup.button.callback('✏️ Ввести другой адрес', 'enter_new_wallet')]);
  }

  // Back button
  buttons.push([Markup.button.callback('⬅️ Назад', 'back')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Save wallet prompt keyboard (after validation)
 */
const saveWalletPromptKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Да', 'save_wallet:yes'),
      Markup.button.callback('❌ Нет', 'save_wallet:no')
    ]
  ]);
};

/**
 * Wallet name input keyboard (for myData section)
 */
const walletNameInputKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⬅️ Назад', 'mydata_wallet_name:back'),
      Markup.button.callback('➡️ Пропустить', 'mydata_wallet_name:skip')
    ]
  ]);
};

/**
 * Wallet name input keyboard (for deal creation flow)
 */
const walletNameInputDealKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⬅️ Назад', 'deal_wallet_name:back'),
      Markup.button.callback('➡️ Пропустить', 'deal_wallet_name:skip')
    ]
  ]);
};

/**
 * Confirm wallet deletion keyboard
 */
const confirmDeleteWalletKeyboard = (walletIndex) => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Удалить', `wallet:confirm_delete:${walletIndex}`),
      Markup.button.callback('❌ Отмена', 'mydata:wallets')
    ]
  ]);
};

/**
 * Email input keyboard (back only)
 */
const emailInputKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⬅️ Назад', 'my_data')]
  ]);
};

/**
 * Confirm email delete keyboard
 */
const confirmDeleteEmailKeyboard = () => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Удалить', 'email:confirm_delete'),
      Markup.button.callback('❌ Отмена', 'my_data')
    ]
  ]);
};

/**
 * Email actions keyboard (change/delete)
 */
const emailActionsKeyboard = () => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✏️ Изменить', 'mydata:change_email_input')],
    [Markup.button.callback('🗑️ Удалить', 'mydata:delete_email')],
    [Markup.button.callback('⬅️ Назад', 'my_data')]
  ]);
};

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
  usernameRequiredKeyboard,
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

  // My data
  myDataMenuKeyboard,
  walletsListKeyboard,
  walletsEmptyKeyboard,
  walletSelectionKeyboard,
  saveWalletPromptKeyboard,
  walletNameInputKeyboard,
  walletNameInputDealKeyboard,
  confirmDeleteWalletKeyboard,
  emailInputKeyboard,
  confirmDeleteEmailKeyboard,
  emailActionsKeyboard,

  // Notifications
  newDealNotificationKeyboard,
  depositWarningKeyboard,
  walletVerificationErrorKeyboard,
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
