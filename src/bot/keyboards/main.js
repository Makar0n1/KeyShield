const { Markup } = require('telegraf');
const { t } = require('../../locales');

// ============================================
// MAIN MENU
// ============================================

/**
 * Main menu keyboard (no Back button - this is root)
 */
const mainMenuKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.create_deal'), 'create_deal')],
    [
      Markup.button.callback(t(lang, 'btn.my_deals'), 'my_deals'),
      Markup.button.callback(t(lang, 'btn.templates'), 'templates')
    ],
    [
      Markup.button.callback(t(lang, 'btn.my_data'), 'my_data'),
      Markup.button.callback(t(lang, 'btn.referrals'), 'referrals')
    ],
    [Markup.button.callback(t(lang, 'btn.help'), 'help')]
  ]);
};

// ============================================
// NAVIGATION BUTTONS
// ============================================

/**
 * Back button only
 */
const backButton = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
  ]);
};

/**
 * Back to main menu only (for final screens)
 */
const mainMenuButton = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.main_menu'), 'main_menu')]
  ]);
};

/**
 * Both Back and Main Menu buttons
 */
const backAndMainMenu = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t(lang, 'btn.back'), 'back'),
      Markup.button.callback(t(lang, 'btn.main_menu'), 'main_menu')
    ]
  ]);
};

// ============================================
// HELP MENU
// ============================================

/**
 * Help menu keyboard
 */
const helpMenuKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.how_it_works'), 'how_it_works')],
    [Markup.button.callback(t(lang, 'btn.rules_fees'), 'rules')],
    [Markup.button.callback(t(lang, 'btn.support'), 'support')],
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
  ]);
};

/**
 * Help section keyboard (back to help + main menu)
 */
const helpSectionKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t(lang, 'btn.back'), 'back'),
      Markup.button.callback(t(lang, 'btn.main_menu'), 'main_menu')
    ]
  ]);
};

// ============================================
// DEAL CREATION
// ============================================

/**
 * Username required keyboard (when user has no username)
 */
const usernameRequiredKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.username_set'), 'username_set')],
    [Markup.button.callback(t(lang, 'btn.main_menu'), 'main_menu')]
  ]);
};

/**
 * Role selection keyboard
 */
const roleSelectionKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.i_am_buyer'), 'role:buyer')],
    [Markup.button.callback(t(lang, 'btn.i_am_seller'), 'role:seller')],
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
  ]);
};

/**
 * Counterparty method selection keyboard (username or invite link)
 */
const counterpartyMethodKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.enter_username'), 'counterparty_method:username')],
    [Markup.button.callback(t(lang, 'btn.create_link'), 'counterparty_method:invite')],
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
  ]);
};

/**
 * Invite deal created keyboard (copy link + details + main menu)
 */
const inviteDealCreatedKeyboard = (dealId, inviteToken, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.copy_link'), `copy_invite:${inviteToken}`)],
    [Markup.button.callback(t(lang, 'btn.deal_details'), `view_deal:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.cancel_deal'), `cancel_invite:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.main_menu'), 'main_menu')]
  ]);
};

/**
 * Invite deal accept/decline keyboard
 */
const inviteAcceptKeyboard = (dealId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.accept_deal'), `accept_invite:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.decline'), `decline_invite:${dealId}`)]
  ]);
};

/**
 * Asset selection keyboard
 */
const assetSelectionKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback('💵 USDT (TRC-20)', 'asset:USDT')],
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
  ]);
};

/**
 * Commission type selection keyboard
 */
const commissionTypeKeyboard = (amount, asset, lang = 'ru') => {
  const Deal = require('../../models/Deal');
  const commission = Deal.calculateCommission(amount);

  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'commission.buyer_pays', { commission: amount + commission, asset }), 'commission:buyer')],
    [Markup.button.callback(t(lang, 'commission.seller_pays', { amount: amount - commission, asset }), 'commission:seller')],
    [Markup.button.callback(t(lang, 'commission.split', { half: (commission / 2).toFixed(2), asset }), 'commission:split')],
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
  ]);
};

/**
 * Deadline selection keyboard
 */
const deadlineKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t(lang, 'btn.hours_24'), 'deadline:24'),
      Markup.button.callback(t(lang, 'btn.hours_48'), 'deadline:48')
    ],
    [
      Markup.button.callback(t(lang, 'btn.days_3'), 'deadline:72'),
      Markup.button.callback(t(lang, 'btn.days_7'), 'deadline:168')
    ],
    [Markup.button.callback(t(lang, 'btn.days_14'), 'deadline:336')],
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
  ]);
};

/**
 * Deal confirmation keyboard
 * No "Back" button - wallet already verified, can only create or cancel
 */
const dealConfirmationKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.create_deal_btn'), 'confirm:create_deal')],
    [Markup.button.callback(t(lang, 'btn.cancel'), 'cancel_create_deal')]
  ]);
};

/**
 * Deal created keyboard (view deal + main menu)
 */
const dealCreatedKeyboard = (dealId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.deal_details'), `view_deal:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.main_menu'), 'main_menu')]
  ]);
};

// ============================================
// MY DEALS
// ============================================

/**
 * My deals list keyboard (dynamic based on deals)
 */
const myDealsKeyboard = (deals = [], currentPage = 1, totalPages = 1, lang = 'ru') => {
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
  buttons.push([Markup.button.callback(t(lang, 'btn.back'), 'main_menu')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * My deals empty keyboard
 */
const myDealsEmptyKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.create_deal'), 'create_deal')],
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
  ]);
};

/**
 * Deal details keyboard (dynamic based on role and status)
 * @param {string} dealId - Deal ID
 * @param {string} userRole - 'buyer' or 'seller'
 * @param {string} dealStatus - Deal status
 * @param {Object} options - Additional options
 * @param {boolean} options.isCreator - Whether user is deal creator
 * @param {boolean} options.fromTemplate - Whether deal was created from template
 * @param {string} options.lang - Language code
 */
const dealDetailsKeyboard = (dealId, userRole, dealStatus, options = {}) => {
  const { isCreator = false, fromTemplate = false, lang = 'ru' } = options;
  const buttons = [];

  // Pending counterparty (invite link deal) - show cancel button for creator
  if (dealStatus === 'pending_counterparty') {
    buttons.push([
      Markup.button.callback(t(lang, 'btn.cancel_deal'), `cancel_invite:${dealId}`)
    ]);
  }

  // Waiting for wallet - show "Enter Wallet" button
  if (userRole === 'seller' && dealStatus === 'waiting_for_seller_wallet') {
    buttons.push([
      Markup.button.callback(t(lang, 'btn.provide_wallet'), `enter_wallet:${dealId}`)
    ]);
    buttons.push([
      Markup.button.callback(t(lang, 'btn.decline_deal'), `decline_deal:${dealId}`)
    ]);
  }

  if (userRole === 'buyer' && dealStatus === 'waiting_for_buyer_wallet') {
    buttons.push([
      Markup.button.callback(t(lang, 'btn.provide_wallet'), `enter_wallet:${dealId}`)
    ]);
    buttons.push([
      Markup.button.callback(t(lang, 'btn.decline_deal'), `decline_deal:${dealId}`)
    ]);
  }

  // Action buttons based on role and status
  if (userRole === 'seller' && dealStatus === 'locked') {
    buttons.push([
      Markup.button.callback(t(lang, 'btn.work_done'), `submit_work:${dealId}`)
    ]);
    buttons.push([
      Markup.button.callback(t(lang, 'btn.open_dispute'), `open_dispute:${dealId}`)
    ]);
  }

  if (userRole === 'buyer' && dealStatus === 'in_progress') {
    buttons.push([
      Markup.button.callback(t(lang, 'btn.accept_work'), `accept_work:${dealId}`)
    ]);
    buttons.push([
      Markup.button.callback(t(lang, 'btn.open_dispute_cross'), `open_dispute:${dealId}`)
    ]);
  }

  // General dispute button for locked deals
  if ((dealStatus === 'locked' || dealStatus === 'in_progress') && buttons.length === 0) {
    buttons.push([
      Markup.button.callback(t(lang, 'btn.open_dispute'), `open_dispute:${dealId}`)
    ]);
  }

  // Show deposit address button for buyer waiting for deposit
  if (userRole === 'buyer' && dealStatus === 'waiting_for_deposit') {
    buttons.push([
      Markup.button.callback(t(lang, 'btn.show_deposit'), `show_deposit:${dealId}`)
    ]);
    buttons.push([
      Markup.button.callback(t(lang, 'btn.cancel_deal'), `cancel_deal:${dealId}`)
    ]);
  }

  // Save as template button for completed deals
  // Only show for: creator + not from template
  if (dealStatus === 'completed' && isCreator && !fromTemplate) {
    buttons.push([
      Markup.button.callback(t(lang, 'btn.save_template'), `template:save_from_deal:${dealId}`)
    ]);
  }

  // Navigation
  buttons.push([
    Markup.button.callback(t(lang, 'btn.back'), 'back'),
    Markup.button.callback(t(lang, 'btn.main_menu'), 'main_menu')
  ]);

  return Markup.inlineKeyboard(buttons);
};

// ============================================
// NOTIFICATIONS & COUNTERPARTY ACTIONS
// ============================================

/**
 * New deal notification keyboard (for counterparty)
 */
const newDealNotificationKeyboard = (dealId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.provide_wallet'), `enter_wallet:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.decline'), `decline_deal:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
  ]);
};

/**
 * Deposit warning keyboard
 */
const depositWarningKeyboard = (dealId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.continue_understood'), `confirm_deposit_warning:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.cancel_deal'), `cancel_deal:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
  ]);
};

/**
 * Wallet verification error keyboard (for buyer)
 * Shows when wallet verification fails (insufficient funds, not found, etc.)
 */
const walletVerificationErrorKeyboard = (dealId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.change_wallet_other'), `retry_wallet:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.cancel_deal'), `cancel_deal:${dealId}`)]
  ]);
};

/**
 * Deposit received notification keyboard
 */
const depositReceivedKeyboard = (dealId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.deal_details'), `view_deal:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.main_menu'), 'main_menu')],
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
  ]);
};

/**
 * Work submitted notification keyboard (for buyer)
 */
const workSubmittedKeyboard = (dealId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.accept_work'), `accept_work:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.open_dispute_cross'), `open_dispute:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.deal_details'), `view_deal:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
  ]);
};

/**
 * Deadline expired keyboard (depends on status)
 */
const deadlineExpiredKeyboard = (dealId, status, role, lang = 'ru') => {
  const buttons = [];

  if (role === 'seller' && status === 'locked') {
    buttons.push([Markup.button.callback(t(lang, 'btn.work_done'), `submit_work:${dealId}`)]);
  }

  if (role === 'buyer' && status === 'in_progress') {
    buttons.push([Markup.button.callback(t(lang, 'btn.accept_work'), `accept_work:${dealId}`)]);
  }

  buttons.push([Markup.button.callback(t(lang, 'btn.open_dispute_cross'), `open_dispute:${dealId}`)]);
  buttons.push([Markup.button.callback(t(lang, 'btn.back'), 'back')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Final screen keyboard (completed/resolved deals)
 */
const finalScreenKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.main_menu'), 'main_menu')]
  ]);
};

// ============================================
// DISPUTE
// ============================================

/**
 * Dispute media upload keyboard
 */
const disputeMediaKeyboard = (dealId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.submit_dispute'), `finalize_dispute:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
  ]);
};

/**
 * Dispute opened notification keyboard
 */
const disputeOpenedKeyboard = (dealId, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.deal_details'), `view_deal:${dealId}`)],
    [Markup.button.callback(t(lang, 'btn.main_menu'), 'main_menu')],
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
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
    'pending_counterparty': '🔗',
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
const myDataMenuKeyboard = (hasEmail, walletsCount, lang = 'ru') => {
  const buttons = [];

  // Email section
  if (hasEmail) {
    buttons.push([Markup.button.callback(t(lang, 'btn.change_email'), 'mydata:change_email')]);
  } else {
    buttons.push([Markup.button.callback(t(lang, 'btn.add_email'), 'mydata:add_email')]);
  }

  // Wallets section
  buttons.push([Markup.button.callback(t(lang, 'btn.my_wallets', { count: walletsCount }), 'mydata:wallets')]);

  // Language
  buttons.push([Markup.button.callback(t(lang, 'btn.language'), 'mydata:language')]);

  // Back button
  buttons.push([Markup.button.callback(t(lang, 'btn.back'), 'main_menu')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Wallets list keyboard (delete is on wallet details screen)
 */
const walletsListKeyboard = (wallets, lang = 'ru') => {
  const buttons = [];

  // List each wallet
  wallets.forEach((wallet, index) => {
    const displayName = wallet.name || t(lang, 'wallet.default_name', { index: index + 1 });
    const shortAddr = wallet.address.slice(0, 6) + '...' + wallet.address.slice(-4);
    buttons.push([
      Markup.button.callback(`💳 ${displayName}: ${shortAddr}`, `wallet:view:${index}`)
    ]);
  });

  // Add wallet button (if under limit)
  if (wallets.length < 5) {
    buttons.push([Markup.button.callback(t(lang, 'btn.add_wallet'), 'mydata:add_wallet')]);
  }

  // Back button
  buttons.push([Markup.button.callback(t(lang, 'btn.back'), 'my_data')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Empty wallets keyboard
 */
const walletsEmptyKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.add_wallet'), 'mydata:add_wallet')],
    [Markup.button.callback(t(lang, 'btn.back'), 'my_data')]
  ]);
};

/**
 * Wallet selection keyboard for deal creation/acceptance
 */
const walletSelectionKeyboard = (wallets, showNewOption = true, lang = 'ru') => {
  const buttons = [];

  // List saved wallets
  wallets.forEach((wallet, index) => {
    const displayName = wallet.name || t(lang, 'wallet.default_name', { index: index + 1 });
    const shortAddr = wallet.address.slice(0, 6) + '...' + wallet.address.slice(-4);
    buttons.push([
      Markup.button.callback(`💳 ${displayName}: ${shortAddr}`, `select_wallet:${index}`)
    ]);
  });

  // Option to enter new address
  if (showNewOption) {
    buttons.push([Markup.button.callback(t(lang, 'btn.enter_new_wallet'), 'enter_new_wallet')]);
  }

  // Back button
  buttons.push([Markup.button.callback(t(lang, 'btn.back'), 'back')]);

  return Markup.inlineKeyboard(buttons);
};

/**
 * Save wallet prompt keyboard (after validation)
 */
const saveWalletPromptKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t(lang, 'btn.yes'), 'save_wallet:yes'),
      Markup.button.callback(t(lang, 'btn.no'), 'save_wallet:no')
    ]
  ]);
};

/**
 * Wallet name input keyboard (for myData section)
 */
const walletNameInputKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t(lang, 'btn.back'), 'mydata_wallet_name:back'),
      Markup.button.callback(t(lang, 'btn.skip_arrow'), 'mydata_wallet_name:skip')
    ]
  ]);
};

/**
 * Wallet name input keyboard (for deal creation flow)
 */
const walletNameInputDealKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t(lang, 'btn.back'), 'deal_wallet_name:back'),
      Markup.button.callback(t(lang, 'btn.skip_arrow'), 'deal_wallet_name:skip')
    ]
  ]);
};

/**
 * Text input with "Keep previous value" button (for deal creation back navigation)
 * @param {string} field - Field name (product_name, description, amount, counterparty_username, creator_wallet)
 * @param {string} displayValue - Value to display on button (truncated if needed)
 * @param {string} lang - Language code
 */
const keepPreviousValueKeyboard = (field, displayValue, lang = 'ru') => {
  // Truncate display value if too long (max 30 chars for button)
  const truncated = displayValue.length > 30
    ? displayValue.substring(0, 27) + '...'
    : displayValue;

  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.keep_value', { value: truncated }), `keep_value:${field}`)],
    [Markup.button.callback(t(lang, 'btn.back'), 'back')]
  ]);
};

/**
 * Confirm wallet deletion keyboard
 */
const confirmDeleteWalletKeyboard = (walletIndex, lang = 'ru') => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t(lang, 'btn.delete'), `wallet:confirm_delete:${walletIndex}`),
      Markup.button.callback(t(lang, 'btn.cancel'), 'mydata:wallets')
    ]
  ]);
};

/**
 * Email input keyboard (back only)
 */
const emailInputKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.back'), 'my_data')]
  ]);
};

/**
 * Confirm email delete keyboard
 */
const confirmDeleteEmailKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(t(lang, 'btn.delete'), 'email:confirm_delete'),
      Markup.button.callback(t(lang, 'btn.cancel'), 'my_data')
    ]
  ]);
};

/**
 * Email actions keyboard (change/delete)
 */
const emailActionsKeyboard = (lang = 'ru') => {
  return Markup.inlineKeyboard([
    [Markup.button.callback(t(lang, 'btn.edit'), 'mydata:change_email_input')],
    [Markup.button.callback(t(lang, 'btn.delete_btn'), 'mydata:delete_email')],
    [Markup.button.callback(t(lang, 'btn.back'), 'my_data')]
  ]);
};

// ============================================
// LEGACY EXPORTS (for backwards compatibility)
// ============================================

const persistentKeyboard = () => Markup.removeKeyboard();
const removeKeyboard = () => Markup.removeKeyboard();
const backToMainMenu = mainMenuButton;
const cancelDealButton = backButton;
const cancelActiveDealButton = (dealId, lang) => dealCreatedKeyboard(dealId, lang);
const confirmationKeyboard = (action, lang) => dealConfirmationKeyboard(lang);
const dealActionKeyboard = dealDetailsKeyboard;
const depositConfirmationKeyboard = (lang) => depositWarningKeyboard('', lang);

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
  counterpartyMethodKeyboard,
  inviteDealCreatedKeyboard,
  inviteAcceptKeyboard,
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
  keepPreviousValueKeyboard,
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
