/**
 * English locale
 * All strings from the bot, organized by module
 */

module.exports = {
  // ============================================
  // COMMON
  // ============================================
  common: {
    loading: '⏳ Loading...',
    creating_deal: '⏳ Creating deal...',
    creating_deal_multisig: '⏳ Creating deal and multisig wallet...',
    creating_dispute: '⏳ Creating dispute...',
    checking_wallet: '⏳ Checking your address...\n\nVerifying wallet on the TRON network.',
    checking_wallet_detailed: '⏳ *Checking your address...*\n\nPlease wait. We are verifying:\n• Address validity\n• Wallet balance\n\nThis may take a few seconds.',
    checking_address: '⏳ *Checking address...*\n\nVerifying wallet on the TRON network.',
    preparing: '⏳ *Preparing...*\n\nSelected wallet: `{address}`',
    checking_wallet_short: '⏳ *Checking wallet...*',
    error: '❌ Error',
    error_generic: '❌ *An error occurred*\n\nPlease try again or contact support.',
    deal_not_found: '❌ Deal not found.',
    deal_not_found_or_taken: 'Deal not found or already accepted',
    deal_not_found_or_completed: '❌ Deal not found or already completed.',
    deal_not_found_or_status: '❌ Deal not found or status has changed.',
    user_not_found: '❌ User not found.',
    not_participant: '❌ You are not a participant of this deal.',
    not_awaiting_wallet: '❌ The deal is not awaiting your wallet.',
    session_expired: '⚠️ Session expired. Returning to the main menu.',
    session_expired_restart: '❌ Session expired. Please start over.',
    session_expired_alert: '❌ Session expired',
    key_saved_alert: '✅ Key saved!',
    loading_high_load: '⏳ *Loading...*\n\nThe service is under high load, please stay with us and wait a moment.\n\nWe will process your request! 🙏',
    contact_support: 'Please contact support: @keyshield\\_support',
    obsolete_message: '⚠️ _This message is outdated. Please use the message below._',
    try_again: 'Please try again.',
    try_later: 'Please try later.',
    unknown_error: 'Unknown error',
    unknown_user: 'Unknown',
    new_user_rating: '⭐ New user',
    no_reviews: 'No reviews',
    not_specified: '_Not specified_',
    counterparty: 'Counterparty',
    user: 'User',
    deal_creation_cancelled: '❌ Deal creation cancelled.',
    accepting_deal: '⏳ Accepting deal and creating multisig wallet...',
  },

  // ============================================
  // BUTTON LABELS
  // ============================================
  btn: {
    back: '⬅️ Back',
    back_arrow: '↩️ Back',
    main_menu: '🏠 Main Menu',
    cancel: '❌ Cancel',
    cancel_deal: '❌ Cancel Deal',
    confirm: '✅ Confirm',
    yes: '✅ Yes',
    no: '❌ No',
    yes_delete: '✅ Yes, delete',
    delete: '✅ Delete',
    skip: '⏭ Skip',
    skip_arrow: '➡️ Skip',
    continue_funds: '✅ Continue — funds available',
    continue_understood: '✅ Understood, continue',
    change_wallet: '📝 Change wallet address',
    change_wallet_other: '💳 Specify another wallet',

    // Main menu
    create_deal: '📝 Create Deal',
    my_deals: '📋 My Deals',
    templates: '📑 Deal Templates',
    help: 'ℹ️ Help',
    referrals: '🎁 Referrals',
    my_data: '👤 My Data',

    // Help submenu
    how_it_works: 'ℹ️ How It Works',
    rules_fees: '💰 Rules & Fees',
    support: '🆘 Support',

    // Deal actions
    deal_details: '📋 Deal Details',
    open_dispute: '⚠️ Open Dispute',
    open_dispute_cross: '❌ Open Dispute',
    confirm_work: '✅ Confirm Work',
    accept_work: '✅ Accept Work',
    submit_work: '📤 Work Submitted',
    work_done: '✅ Work Completed',
    decline: '❌ Decline',
    decline_deal: '❌ Decline Deal',
    accept_deal: '✅ Accept Deal',
    show_deposit: '💳 Show Deposit Address',
    provide_wallet: '💳 Provide Wallet',
    copy_link: '📋 Copy Link',
    save_template: '💾 Save as Template',

    // Key
    key_saved: '✅ I saved the key',

    // Username
    username_set: '✅ Username set',

    // Create deal
    i_am_buyer: '💵 I am the Buyer',
    i_am_seller: '🛠 I am the Seller',
    enter_username: '👤 Enter @username',
    create_link: '🔗 Create Link',
    create_deal_btn: '✅ Create Deal',

    // Deadlines
    hours_24: '24 hours',
    hours_48: '48 hours',
    days_3: '3 days',
    days_7: '7 days',
    days_14: '14 days',

    // Dispute
    submit_dispute: '✅ Submit Dispute',

    // Email
    change_email: '📧 Change email',
    add_email: '📧 Add email',
    save_email: '💾 Save email',

    // Language
    language: '🌐 Язык / Language',

    // Wallets
    my_wallets: '💳 My Wallets ({count}/5)',
    add_wallet: '➕ Add Wallet',
    enter_new_wallet: '✏️ Enter another address',
    to_wallets: '⬅️ To Wallets',
    to_templates: '⬅️ To Templates',
    edit_name: '✏️ Name',
    edit_address: '📍 Address',
    edit: '✏️ Edit',
    delete_btn: '🗑️ Delete',
    delete_wallet: '🗑️ Delete Wallet',

    // Referral
    my_link: '🔗 My Link',
    my_referrals: '👥 My Referrals',
    accrual_history: '📊 Accrual History',
    withdraw_balance: '💸 Withdraw Balance',
    withdraw_min: '💸 Withdraw (min. $10)',
    referrals_btn: '🎁 Referrals',

    // Rating
    confirm_rating: '✅ Confirm Rating',

    // Templates
    create_template: '➕ Create Template',
    use_template: '🚀 Use',
    amount: '💰 Amount',
    description: '📝 Description',
    deadline_btn: '⏰ Deadline',
    delete_template: '🗑️ Delete',
    yes_delete_template: '✅ Yes, delete',

    // Keep value
    keep_value: '✅ Keep "{value}"',
  },

  // ============================================
  // ROLES
  // ============================================
  role: {
    buyer: 'Buyer',
    seller: 'Seller',
    buyer_icon: '💵 Buyer',
    seller_icon: '🛠 Seller',
    buyer_gen: 'buyer',
    seller_gen: 'seller',
    buyer_dat: 'buyer',
    seller_dat: 'seller',
    buyer_instr: 'buyer',
    seller_instr: 'seller',
  },

  // ============================================
  // DEAL STATUSES
  // ============================================
  status: {
    created: 'Created',
    pending_counterparty: '🔗 Awaiting counterparty',
    waiting_for_seller_wallet: '⏳ Awaiting seller wallet',
    waiting_for_buyer_wallet: '⏳ Awaiting buyer wallet',
    waiting_for_deposit: '💳 Awaiting deposit',
    locked: '🔒 Deposit locked',
    in_progress: '⚡ Work completed',
    completed: '✅ Completed',
    dispute: '⚠️ Dispute',
    resolved: '⚖️ Resolved',
    cancelled: '❌ Cancelled',
    expired: '⌛ Expired',
  },

  // ============================================
  // DEADLINE TEXT
  // ============================================
  deadlineText: {
    hours: ({ n }) => `${n} hours`,
    hours_24: '24 hours',
    hours_48: '48 hours',
    days_3: '3 days',
    days_7: '7 days',
    days_14: '14 days',
    day_1: '1 day',
    days_few: ({ n }) => `${n} days`,
    days_many: ({ n }) => `${n} days`,
  },

  // ============================================
  // COMMISSION
  // ============================================
  commission: {
    buyer_pays: ({ commission, asset }) => `💵 Buyer (deposit ${commission} ${asset})`,
    seller_pays: ({ amount, asset }) => `🛠 Seller (will receive ${amount} ${asset})`,
    split: ({ half, asset }) => `⚖️ 50/50 (${half} ${asset} each)`,
    buyer_note: ({ commission, asset }) => `Buyer will add ${commission} ${asset} to the deposit`,
    seller_note: ({ amount, asset }) => `Seller will receive ${amount} ${asset}`,
    split_note: ({ half, asset }) => `${half} ${asset} from each participant`,
    including: ({ commission, asset }) => `💡 Including fee: ${commission} ${asset}`,
    including_half: ({ half, asset }) => `💡 Including 50% fee: ${half} ${asset}`,
    buyer_text: ({ commission, asset }) => `Buyer (client) pays ${commission} ${asset}`,
    seller_text: ({ commission, asset }) => `Seller (performer) pays ${commission} ${asset}`,
    split_text: ({ half, asset }) => `50/50 — ${half} ${asset} each`,
    type_buyer: 'Buyer',
    type_seller: 'Seller',
    type_split: '50/50',
    pays_buyer: ({ commission, asset }) => `Paid by buyer (${commission} ${asset})`,
    pays_seller: ({ commission, asset }) => `Paid by seller (${commission} ${asset})`,
    pays_split: ({ half, asset }) => `50/50 (${half} ${asset} each)`,
  },

  // ============================================
  // WALLET
  // ============================================
  wallet: {
    default_name: ({ index }) => `Wallet ${index}`,
    purpose_buyer: 'for refund in case of cancellation/dispute',
    purpose_seller: 'for receiving payment',
    purpose_buyer_short: 'for refund',
    purpose_seller_short: 'for receiving payment',
    purpose_buyer_invite: 'funds will be returned in case of cancellation',
    purpose_seller_invite: 'funds will be sent after a successful deal',

    // Validation errors
    invalid_format: '❌ *Invalid wallet address!*\n\nThe address must start with T and contain 34 characters.\n_Example: TQRfXYMDSspGDB7GB8MevZpkYgUXkviCSj_\n\nPlease try again:',
    invalid_format_short: '❌ *Invalid address format*\n\nThe address must start with T and contain 34 characters.\nEnter a TRON wallet address:',
    invalid_address: '❌ *Invalid address*\n\nThe address is not a valid TRON address.\n\nEnter a different address:',
    invalid_address_short: '❌ *Invalid address*\n\nEnter a valid TRON address (starts with T, 34 characters).',
    not_found: '❌ *Wallet not found*\n\nThis address has not been activated on the TRON network.\n\nEnter a different address:',
    not_found_alert: '❌ Wallet not found',
    not_found_detailed: '❌ *Wallet not found*\n\nThis address has not been activated on the TRON network.\nMake sure the wallet has at least one transaction.\n\nEnter a different address:',
    check_error: '❌ *Verification error*\n\nCould not verify wallet balance. Please try later or enter a different address.',
    check_error_short: '⚠️ *Verification error*\n\nCould not verify wallet. Please try again.\nEnter a TRON wallet address:',
    check_error_mydata: '❌ *Verification error*\n\nCould not verify wallet. Please try later.',
    duplicate: '❌ *This address is already saved*\n\nEnter a different address:',
    name_too_long: '❌ *Name too long*\n\nMaximum 30 characters. Try a shorter name:',
    name_too_long_provide: '❌ Name too long (max. 30 characters).\n\nEnter a shorter name:',
    limit_reached: '❌ Wallet limit (5) reached. Delete one to add a new one.',
    limit_reached_long: '❌ *Wallet limit reached*\n\nYou already have 5 saved wallets. Delete one to add a new one.',

    // Verified
    verified: '✅ *Wallet verified!*\n\nAddress: `{address}`',
    verified_short: '✅ *Wallet verified!*\n\nAddress: `{address}`\n\nProceeding to confirmation...',
    verified_save: ({ address }) => `✅ *Wallet verified!*\n\n📍 \`${address}\`\n\nWould you like to save this address for quick selection in future deals?`,
    verified_save_balance: ({ address }) => `✅ *Wallet verified!*\n\n📍 \`${address}\`\n✓ Balance is sufficient for the deal.\n\nWould you like to save this address for quick selection in future deals?`,
    accepted: '✅ *Wallet accepted!*\n\nAddress: `{address}`\n\nPreparing data...',

    // Balance warning
    balance_warning: ({ balance, depositAmount }) => `⚠️ *Warning: balance not detected*\n\nDetected on the specified wallet: *${balance} USDT*\nRequired for the deal: *${depositAmount} USDT* (deposit) + *5 USDT* (buffer)\n\n💡 *If your funds are stored on a crypto exchange* (Binance, Bybit, OKX, etc.) — this is normal! Exchange balance is not visible on the blockchain.\n\nClick "Continue" if you have the funds, or specify a different address.`,

    // Save wallet
    save_name_prompt: ({ address }) => `💳 *Save wallet*\n\n📍 \`${address}\`\n\n✏️ *Enter a name and send it in the chat*\nFor example: "Main", "Binance", "Work"\n\nOr click "Skip" — the wallet will be saved as "Wallet 1"`,

    // Wallet saved
    saved_success: ({ name, address }) => `✅ *Wallet saved!*\n\n*${name}*\n\`${address}\``,
    save_error: '❌ *Error*\n\n{error}',
  },

  // ============================================
  // WELCOME / START
  // ============================================
  welcome: {
    title: ({ commissionFixed, minAmount }) => `👋 *Welcome to KeyShield!*\n\n🛡 *What does this bot do?*\n\nKeyShield is an escrow service for secure cryptocurrency transactions between buyers and sellers.\n\n✅ *Fraud protection*\nFunds are frozen in a multisig wallet until the deal is completed.\n\n✅ *Automatic monitoring*\nThe bot automatically tracks deposits on the TRON blockchain.\n\n✅ *Fair arbitration*\nIn case of a dispute, a neutral arbiter will review evidence from both sides.\n\n✅ *Anonymity*\nNo verification required. Just your Telegram and TRON wallet.\n\n💰 *Fee:* from ${commissionFixed} USDT\n📊 *Minimum:* ${minAmount} USDT\n💵 *Asset:* USDT (TRC-20)\n\nClick the button below to get started!`,

    main_menu: ({ commissionFixed, minAmount }) => `🛡 *KeyShield — Secure Deals*\n\nProtected escrow service for transactions between buyers and sellers.\n\n🔐 *Multisig Wallets*\nFunds are stored in a protected 2-of-3 multisig wallet.\n\n⚡️ *Automatic Monitoring*\nThe system automatically tracks deposits on the TRON blockchain.\n\n⚖️ *Dispute Arbitration*\nIn case of conflict, a neutral arbiter will review the evidence.\n\n💰 *Fee:* from ${commissionFixed} USDT\n📊 *Minimum:* ${minAmount} USDT\n💵 *Asset:* USDT (TRC-20)\n\n🌐 [keyshield.me](https://keyshield.me/)\n\nChoose an action:`,

    main_menu_short: '🏠 *Main Menu*\n\nChoose an action:',

    ban_screen: '🚫 *Account blocked*\n\nYour account has been blocked due to a violation of service rules.\n\nIf you believe this is a mistake, please contact support:\n\n📧 support@keyshield.io\n💬 @keyshield\\_support',

    account_blocked: '🚫 You cannot create deals because your account is blocked.',

    username_required: '⚠️ *Username required*\n\nA public username is required to create deals. Please set one in your Telegram settings.\n\n📱 *How to set a username:*\n1. Open Telegram settings\n2. Tap on your name\n3. Select "Username"\n4. Choose and save a username\n\nOnce set, click the "Username set" button.',

    username_not_found: '❌ *Username not found*\n\nThe system still cannot detect your username.\n\nMake sure you have saved a username in your Telegram settings and try again.',
  },

  // ============================================
  // CREATE DEAL
  // ============================================
  createDeal: {
    // Steps
    step1_role: '📝 *Create Deal*\n\n*Step 1 of 9: Choose your role*\n\nBuyer — makes a deposit and receives the goods/service.\n\nSeller — performs the work and receives payment after confirmation.',

    step2_method: ({ counterpartyLabel }) => `📝 *Create Deal*\n\n*Step 2 of 10: How to find the ${counterpartyLabel}?*\n\n👤 *Enter @username* — if the counterparty is already registered with the bot\n\n🔗 *Create link* — get an invitation link that you can send to anyone. They will follow it and immediately see the deal details.`,

    step3_username: ({ counterpartyLabel }) => `📝 *Create Deal*\n\n*Step 3 of 10: Specify the ${counterpartyLabel}*\n\nEnter the Telegram username in @username format\n\n⚠️ The other participant must have already started the bot!`,

    step3_username_found: ({ counterpartyLabel, username, ratingDisplay }) => `📝 *Create Deal*\n\n✅ *${counterpartyLabel}:* \`@${username}\`\n📊 *Rating:* ${ratingDisplay}\n\n*Step 3 of 9: Product name*\n\nEnter a brief name for the product or service.\n(5 to 200 characters)\n\nExample: "Logo design"`,

    step3_product: '📝 *Create Deal*\n\n*Step 3 of 10: Product name*\n\nEnter a brief name for the product or service.\n(5 to 200 characters)\n\nExample: "Logo design"',

    step4_description: '📝 *Create Deal*\n\n*Step 4 of 9: Description*\n\nDescribe the work conditions in detail:\n• What exactly needs to be done\n• Requirements for the result\n• Delivery format\n\n⚠️ This description will be used by the arbiter in case of disputes!\n\n(20 to 5000 characters)',

    step5_asset: '📝 *Create Deal*\n\n*Step 5 of 9: Choose asset*\n\nSelect the cryptocurrency for the deal:',

    step6_amount: ({ asset }) => `📝 *Create Deal*\n\n*Step 6 of 9: Amount*\n\nEnter the deal amount in ${asset}.\n\n⚠️ Minimum amount: 50 ${asset}\nPlease enter the amount without commas or spaces (e.g.: 150, 299.99, 5000)\n\nService fee:\n• Up to 150 USDT — 6 USDT\n• 150-500 USDT — 3.5%\n• 500-1500 USDT — 3%\n• Over 1500 USDT — 2.5%`,

    step7_commission: ({ amount, asset, commission }) => `📝 *Create Deal*\n\n*Step 7 of 9: Fee*\n\nDeal amount: ${amount} ${asset}\nService fee: ${commission} ${asset}\n\nWho pays the fee?`,

    step8_deadline: '📝 *Create Deal*\n\n*Step 8 of 9: Deadline*\n\nAfter the deadline expires, both parties will be notified.\n12 hours after the deadline — automatic refund to the buyer.',

    step9_wallet: ({ walletPurpose }) => `📝 *Create Deal*\n\n*Step 9 of 9: Your wallet*\n\n💳 Select a wallet ${walletPurpose}:\n\nOr enter a new TRON wallet address.`,

    step9_wallet_input: ({ walletPurpose }) => `📝 *Create Deal*\n\n*Step 9 of 9: Your wallet*\n\nEnter your TRON wallet address (TRC-20) ${walletPurpose}.\n\nExample: TQRfXYMDSspGDB7GB8MevZpkYgUXkviCSj`,

    wallet_reentry: '💳 *Your USDT wallet (TRC-20)*\n\nEnter the wallet address from which you will send funds.\n\nExample: TQRfXYMDSspGDB7GB8MevZpkYgUXkviCSj',

    // Errors
    error_self_deal: '❌ *Error*\n\nYou cannot create a deal with yourself!\n\nEnter a different @username:',
    error_user_not_found: ({ username }) => `❌ *User not found*\n\nUser \`@${username}\` has not started the bot yet.\nAsk them to send /start to the bot.\n\nEnter a different @username:`,
    error_user_blocked: '❌ *User is blocked*\n\nThis user cannot participate in deals.\n\nEnter a different @username:',
    error_counterparty_limit: ({ username, count, max }) => `⚠️ *User has reached deal limit*\n\n\`@${username}\` already has ${count} active deals (maximum ${max}).\n\nEnter a different @username:`,
    error_name_length: ({ length }) => `❌ *Error*\n\nThe name must be between 5 and 200 characters.\nCurrent length: ${length} characters.\n\nEnter a name:`,
    error_desc_length: ({ length }) => `❌ *Error*\n\nThe description must be between 20 and 5000 characters.\nCurrent length: ${length} characters.\n\nEnter a description:`,
    error_amount: '❌ *Error*\n\nInvalid amount. Minimum: 50 USDT.\n\nEnter an amount:',
    error_deals_limit: ({ count, max }) => `⚠️ *Deal limit reached*\n\nYou already have ${count} active deals (maximum ${max}).\n\nComplete one of your current deals before creating a new one.`,
    error_creation: ({ message }) => `❌ *Error creating deal*\n\n${message}`,
    error_creation_retry: ({ message }) => `❌ *Error creating deal*\n\n${message}\n\nPlease try again.`,

    // Pending deals
    pending_buyer_refund: ({ dealId, refundAmount, asset, commission }) => `⚠️ *Cannot create deal*\n\nYou have an unfinished deal \`${dealId}\` awaiting a refund.\n\n💰 *To receive a refund, enter your private key:*\n\n💸 Refund amount: *${refundAmount} ${asset}*\n📊 Service fee: ${commission} ${asset}\n\n⚠️ This is the key that was issued to you when you provided your wallet.\n\n❗️ *Without entering the key, the funds will NOT be refunded!*`,

    pending_seller_payout: ({ dealId, payoutAmount, asset, commission }) => `⚠️ *Cannot create deal*\n\nYou have an unfinished deal \`${dealId}\` awaiting payment.\n\n💰 *To receive payment, enter your private key:*\n\n💸 Amount to receive: *${payoutAmount} ${asset}*\n📊 Service fee: ${commission} ${asset}\n\n⚠️ This is the key that was issued to you when you provided your wallet.\n\n❗️ *Without entering the key, the funds will NOT be transferred!*`,

    pending_other_party: ({ dealId }) => `⚠️ *You have an unfinished deal*\n\nDeal \`${dealId}\` is awaiting action from the other participant.\n\nPlease wait for the current deal to be completed before creating a new one.`,

    // Confirmation
    confirm_title: '📝 *Deal Confirmation*',
    confirm_check: 'Review the details and click "Create Deal".',
    confirm_invite_note: ({ counterpartyLabel }) => `⚠️ After creation, you will receive a link for the ${counterpartyLabel}.\nThe link is valid for *24 hours*.`,
    confirm_invite_counterparty: '🔗 _Will be determined via link_',

    // Deal created
    deal_created: '✅ *Deal created!*',
    waiting_seller_wallet: '⏳ *Status:* Awaiting seller wallet',
    waiting_buyer_wallet: '⏳ *Status:* Awaiting buyer wallet',
    waiting_counterparty: ({ counterpartyLabel }) => `⏳ *Status:* Awaiting ${counterpartyLabel}`,
    seller_notified: 'The seller has been notified and must provide their wallet.\nAfter that, you will receive the deposit address.',
    buyer_notified: 'The buyer has been notified and must provide a wallet and make a deposit.',
    invite_link_label: '🔗 *Invitation link:*',
    invite_send: ({ counterpartyLabel }) => `Send this link to the ${counterpartyLabel}. After following it, they will see the deal details and can accept it.`,
    invite_expires: '⚠️ The link is valid for *24 hours*.',

    // Notification to counterparty
    new_deal_notification: '📬 *New deal!*',
    provide_wallet_prompt: 'To participate, please provide your TRON wallet.',

    // Private key
    private_key_title: '🔐 *IMPORTANT: Your private key!*',
    private_key_save_title: '🔐 *IMPORTANT: Save your private key!*',
    private_key_buyer: 'Your buyer private key:',
    private_key_seller: 'Your seller private key:',
    private_key_role: ({ roleLabel }) => `Your ${roleLabel} private key:`,
    private_key_warning: '⚠️ *SAVE THIS KEY RIGHT NOW!*\n\n• Copy and save it in a safe place\n• This key is shown *ONCE* and is *NOT STORED* on the server',
    private_key_buyer_warning: '• Without this key, you will NOT be able to confirm/cancel the deal!',
    private_key_seller_warning: '• Without this key, you will NOT be able to receive funds for the deal!',
    private_key_general_warning: '• Without this key, you will NOT be able to receive/return funds!',
    private_key_autodelete: '🗑 This message will be deleted in 60 seconds or when you press the button.',
    private_key_save_then_create: 'After saving, press the button below.\nThe deal will only be created after confirmation.',

    // Back navigation hints
    previously_selected: ({ value }) => `✏️ _Previously selected: ${value}_`,
    previously_entered: ({ value }) => `📝 _Previously entered: ${value}_\n\nEnter a new value or press the button below:`,
    previously_entered_username: ({ username }) => `📝 _Previously entered:_ \`@${username}\`\n\nEnter a new username or press the button below:`,
    previously_entered_name: ({ name }) => `📝 _Previously entered: "${name}"_\n\nEnter a new name or press the button below:`,
    previously_entered_desc: ({ desc }) => `📝 _Previously entered: "${desc}"_\n\nEnter a new description or press the button below:`,
    previously_entered_amount: ({ amount, asset }) => `📝 _Previously entered: ${amount} ${asset}_\n\nEnter a new amount or press the button below:`,
    previously_entered_wallet: ({ address }) => `📝 _Previously entered: \`${address}\`_\n\nEnter a new address or press the button below:`,
  },

  // ============================================
  // MY DEALS
  // ============================================
  myDeals: {
    title: '📋 *My Deals*',
    title_count: ({ count }) => `📋 *My Deals* (${count})`,
    empty: '📋 *My Deals*\n\nYou have no deals yet. Remember, the other party must also start the bot.\n\nCreate your first deal to get started!',
    page: ({ current, total }) => `📄 Page ${current} of ${total}`,
    not_found: '❌ *Deal not found*\n\nPlease check the deal ID.',
    access_denied: '❌ *Access denied*\n\nYou are not a participant of this deal.',

    // Deal detail labels
    deal_label: ({ dealId }) => `📋 *Deal ${dealId}*`,
    product_label: '📦 *Product:*',
    description_label: '📝 *Description:*',
    your_role: '👤 *Your role:*',
    counterparty_label: ({ role }) => `🤝 *${role}:*`,
    counterparty_by_link: '🔗 _Awaiting via link_',
    amount_label: '💰 *Amount:*',
    commission_label: '💸 *Fee:*',
    you_pay: '📥 *You pay:*',
    you_receive: '📤 *You receive:*',
    status_label: '📊 *Status:*',
    deadline_label: '⏰ *Deadline:*',
    escrow_address: '🔐 *Escrow address:*',
    deposit_label: '✅ *Deposit:*',
    check_tronscan: 'Check on TronScan',
    transaction_link_label: 'Transaction',
    invite_link: '🔗 *Invitation link:*',
    invite_expires: ({ date }) => `⏰ Valid until: ${date}`,
    invite_send_to: 'Send this link to the counterparty.',
    unknown: 'unknown',

    // Wallet required hints
    seller_wallet_required: '⚠️ *Your wallet is required!*\nClick the button below to provide your TRON wallet address for receiving payment.',
    buyer_wallet_required: '⚠️ *Your wallet is required!*\nClick the button below to provide your TRON wallet address for refund.',

    // Work submitted
    work_submitted_seller: ({ dealId }) => `✅ *Work marked as completed*\n\nDeal: \`${dealId}\`\n\nThe buyer has been notified and can:\n• Accept the work\n• Open a dispute\n\nAwaiting the buyer's decision.`,
    work_submitted_buyer: ({ dealId, productName }) => `📬 *Work completed!*\n\nDeal: \`${dealId}\`\n📦 ${productName}\n\nThe seller has marked the work as completed.\n\nPlease review the result and choose an action:`,

    // Accept work errors
    only_buyer_can_accept: '❌ Only the buyer can accept the work.',
    cannot_accept_status: ({ status }) => `❌ Cannot accept work with status: ${status}`,
    seller_address_missing: '❌ Seller address not found.',

    // Pending validations
    pending_buyer_refund: ({ dealId, productName, refundAmount, asset, commission }) => `⏰ *Deal deadline expired!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nThe work was not completed on time.\n\n💰 *To receive a refund, enter your private key:*\n\n💸 Refund amount: *${refundAmount} ${asset}*\n📊 Service fee: ${commission} ${asset}\n\n⚠️ This is the key that was issued to you when you provided your wallet.\n\n❗️ *Without entering the key, the funds will NOT be refunded!*\n❗️ *If you lost the key, the funds will remain locked forever!*`,
    pending_seller_expired: ({ dealId, productName }) => `⏰ *Deal deadline expired*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nThe work was not completed on time.\nThe deadline and grace period were ignored.\n\n💸 Funds are being returned to the buyer (minus service fee).\n\nThe buyer has been sent a request to enter their private key for the refund.`,
    pending_seller_release: ({ dealId, productName, releaseAmount, asset, commission }) => `✅ *Work accepted automatically!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nThe buyer did not respond within 12 hours after work submission.\nThe work has been accepted automatically!\n\n💰 *To receive funds, enter your private key:*\n\n💸 Amount to receive: *${releaseAmount} ${asset}*\n📊 Service fee: ${commission} ${asset}\n\n⚠️ This is the key that was issued to you when you provided your wallet.\n\n❗️ *Without entering the key, the funds will NOT be transferred!*\n❗️ *If you lost the key, the funds will remain locked forever!*`,
    pending_buyer_autoaccept: ({ dealId, productName }) => `✅ *Work accepted automatically*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nYou did not respond within 12 hours after work submission.\nThe work has been accepted automatically.\n\n💸 Funds are being transferred to the seller (minus service fee).\n\nThe seller has been sent a request to enter their private key to receive funds.`,
    pending_seller_payout: ({ dealId, productName, releaseAmount, asset, commission }) => `🎉 *Buyer accepted the work!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n💰 *To receive funds, enter your private key:*\n\n💸 Amount to receive: *${releaseAmount} ${asset}*\n📊 Service fee: ${commission} ${asset}\n\n⚠️ This is the key that was issued to you when you provided your wallet.\n\n❗️ Without entering the key, the funds will NOT be transferred!`,
    pending_buyer_waiting: ({ dealId, productName }) => `✅ *Work accepted!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n⏳ *Awaiting confirmation from the seller*\n\nThe seller must enter their private key to receive funds.\nYou will be notified when the deal is completed.`,

    // Decline / Cancel
    deal_declined_you: ({ dealId, productName }) => `❌ *Deal declined*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nThe deal was cancelled at your request.`,
    deal_declined_other: ({ dealId, productName, role }) => `❌ *Deal declined*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n${role} declined the deal.`,
    deal_cancelled_you: ({ dealId, productName }) => `❌ *Deal cancelled*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nThe deal has been cancelled.`,
    deal_cancelled_other: ({ dealId, productName }) => `❌ *Deal cancelled*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nThe other participant cancelled the deal.`,
    cannot_decline: '❌ The deal cannot be declined at this stage.',
    cannot_cancel: '❌ The deal cannot be cancelled at this stage.',
    only_buyer_deposit: '❌ Only the buyer can see the deposit address.',
    not_waiting_deposit: '❌ The deal is not awaiting a deposit.',
  },

  // ============================================
  // PROVIDE WALLET
  // ============================================
  provideWallet: {
    select_title: ({ dealId, productName, amount, asset, walletPurpose }) => `💳 *Provide wallet for the deal*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n💰 ${amount} ${asset}\n\nSelect a wallet ${walletPurpose}:`,
    input_title: ({ dealId, productName, amount, asset }) => `💳 *Provide wallet for the deal*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n💰 ${amount} ${asset}\n\nEnter your TRON wallet address (TRC-20):\n\n_The address must start with T and contain 34 characters_\n_Example: TQRfXYMDSspGDB7GB8MevZpkYgUXkviCSj_`,

    seller_wallet_saved: ({ walletAddress, dealId, productName }) => `✅ *Wallet saved!*\n\nAddress: \`${walletAddress}\`\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nAwaiting deposit from the buyer.\nYou will be notified when the funds arrive.`,
    buyer_wallet_set_notify: ({ dealId, productName }) => `✅ *Buyer provided wallet!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nAwaiting deposit from the buyer.\nYou will be notified when the funds arrive.`,

    deposit_warning: ({ dealId, productName, depositAmount, asset, depositNote, commission }) => `⚠️ *WARNING! Read before transferring*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n❗️ *IMPORTANT CONDITIONS:*\n\n1️⃣ *Deposit is irreversible*\nAfter the transfer, the funds will be frozen in a multisig wallet.\n\n2️⃣ *Refund only through arbitration*\nIf the seller does not complete the work, open a dispute.\n\n3️⃣ *Fee is non-refundable*\nThe service fee (${commission} ${asset}) is retained by the service.\n\n4️⃣ *Exact amount*\nTransfer EXACTLY ${depositAmount} ${asset}${depositNote}\n\n5️⃣ *24-hour window*\nIf you do not make the deposit within 24 hours, the deal will be cancelled.\n\n❗️ *Please verify your private key right now and make sure you have saved it!*\n\n✅ *If you understand and agree to the conditions, click the button below.*`,

    deposit_confirmed: ({ dealId, productName, asset, multisigAddress, depositAmount, depositNote }) => `✅ *Wallet confirmed! Now make the deposit.*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n🔐 *Deposit address (${asset}):*\n\`${multisigAddress}\`\n\n💸 *Amount to pay: ${depositAmount} ${asset}*${depositNote}\n\n⚠️ *IMPORTANT:*\n• Transfer EXACTLY ${depositAmount} ${asset}\n• Deadline: 24 hours\n\n⏱ The system will automatically detect the deposit.\n\n[🔍 Check on TronScan](https://tronscan.org/#/address/${multisigAddress})`,

    deposit_ready: ({ dealId, productName, asset, multisigAddress, depositAmount, depositNote }) => `✅ *Ready! Now make the deposit*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n🔐 *Deposit address (${asset}):*\n\`${multisigAddress}\`\n\n💸 *Amount to pay: ${depositAmount} ${asset}*${depositNote}\n\n⏱ The system will automatically detect the deposit within 1-3 minutes.\n\n[🔍 Check on TronScan](https://tronscan.org/#/address/${multisigAddress})`,

    deposit_address: '💳 *Deposit address*',
    check_failed: ({ error }) => `❌ *Wallet verification failed*\n\n${error}\n\nChoose an action:`,
  },

  // ============================================
  // HELP
  // ============================================
  help: {
    menu: 'ℹ️ *Help*\n\nChoose a section:\n\n📖 *How It Works* — how escrow works\n💰 *Rules & Fees* — rates and conditions\n🆘 *Support* — contacts and FAQ',

    how_it_works: ({ autoBanStreak, minAmount }) => `📖 *How does KeyShield work?*\n\n🔐 *How Escrow works:*\n\n1️⃣ *Creating a deal*\nOne of the participants creates a deal, specifying the product/service, amount, and counterparty.\n\n2️⃣ *Confirmation*\nBoth participants confirm the terms and provide their TRON wallets.\n\n3️⃣ *Deposit*\nThe buyer transfers funds to a protected multisig wallet.\n\n4️⃣ *Execution*\nThe seller completes the work within the set deadline.\n\n5️⃣ *Confirmation or dispute*\nThe buyer accepts the work or opens a dispute.\n\n6️⃣ *Payout*\nFunds are transferred to the seller (or refunded to the buyer in case of a dispute).\n\n🔑 *Multisig wallets (2 of 3):*\n• Buyer's key\n• Seller's key\n• Arbiter's key\n\n2 of 3 signatures are needed to transfer funds. No single party can take the funds alone!\n\n⚖️ *Arbitration:*\nIn disputes, a neutral arbiter reviews the evidence from both sides and makes a decision.\n\n⚠️ *Important:*\n• ${autoBanStreak} lost disputes in a row = automatic ban\n• Minimum deal amount: ${minAmount} USDT\n• Supported asset: USDT (TRC-20)`,

    rules_fees: ({ tier1Max, tier1Fixed, tier2Max, tier2Rate, tier3Max, tier3Rate, tier4Rate, autoBanStreak, minAmount }) => `💰 *Rules & Fees*\n\n📊 *Service fee:*\n\n• Up to ${tier1Max} USDT — *${tier1Fixed} USDT* fixed\n• ${tier1Max}-${tier2Max} USDT — *${(tier2Rate * 100).toFixed(1)}%*\n• ${tier2Max}-${tier3Max} USDT — *${(tier3Rate * 100).toFixed(1)}%*\n• Over ${tier3Max} USDT — *${(tier4Rate * 100).toFixed(1)}%*\n\n💡 *Examples:*\n• Deal for 100 USDT → fee ${tier1Fixed} USDT\n• Deal for 300 USDT → fee ${(300 * tier2Rate).toFixed(1)} USDT\n• Deal for 1000 USDT → fee ${(1000 * tier3Rate).toFixed(1)} USDT\n• Deal for 2000 USDT → fee ${(2000 * tier4Rate).toFixed(1)} USDT\n\n💸 *Who pays the fee?*\nWhen creating a deal, you can choose:\n• Buyer (added to the deposit)\n• Seller (deducted from the amount)\n• 50/50 (split equally)\n\n📋 *Terms of use:*\n\n1. Minimum deal amount: *${minAmount} USDT*\n2. Supported asset: *USDT (TRC-20)*\n3. Deposit deadline: *24 hours* after creation\n4. Execution deadline: chosen when creating\n5. Grace period: *12 hours* after the deadline expires\n\n⚠️ *Ban system:*\n${autoBanStreak} lost disputes in a row = automatic account ban.`,

    support: ({ tier1Fixed, minAmount }) => `🆘 *Support*\n\n📧 Email: support@keyshield.io\n💬 Telegram: @keyshield\\_support\n\n❓ *FAQ:*\n\n*Q: How long does deposit processing take?*\nA: The system checks the blockchain every 30 seconds. Typically, a deposit is confirmed within 1-3 minutes.\n\n*Q: Can I cancel a deal?*\nA: Before making a deposit — yes. After — only through arbitration.\n\n*Q: How does arbitration work?*\nA: In a dispute, both parties provide evidence. A neutral arbiter makes a decision based on the facts.\n\n*Q: Is it safe?*\nA: Funds are stored in a multisig wallet (2 of 3 signatures). Neither the bot nor any single party can take the funds alone.\n\n*Q: What is the minimum deal amount?*\nA: ${minAmount} USDT.\n\n*Q: What is the fee?*\nA: Starting from ${tier1Fixed} USDT. See the "Rules & Fees" section for details.`,
  },

  // ============================================
  // DISPUTE
  // ============================================
  dispute: {
    already_exists: '⚠️ *Dispute already open*\n\nThere is already an active dispute for this deal.\nAn arbiter will review it shortly.',

    start: ({ dealId, productName }) => `⚠️ *Opening dispute*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nDescribe the problem:\n• What went wrong?\n• Which conditions were not met?\n• What are your expectations?\nOnly text descriptions are accepted.\nScreenshots and files can be attached in the next step.\n\n📎 After submitting the text, you will be able to attach evidence.\n\n_Minimum 20 characters_`,

    reason_too_short: ({ length }) => `❌ *Description too short*\n\nMinimum 20 characters. Please describe the problem in more detail.\n\nCurrent length: ${length} characters`,

    media_upload: ({ dealId, mediaCount }) => `📎 *Attach evidence*\n\n🆔 Deal: \`${dealId}\`\n\nSend files as proof:\n• Screenshots of conversations\n• Photos/videos of the product\n• Documents\n• Voice messages\nPlease attach files one at a time. If you have multiple files, send them one by one.\n\n_Files added: ${mediaCount}_\n\nClick *"Submit Dispute"* when finished.`,

    media_added: ({ mediaCount }) => `✅ *Files added: ${mediaCount}*`,

    media_without_reason: 'Send a text description of the problem (minimum 20 characters), then attach evidence.',
    media_without_reason_caption: ({ length }) => `Description too short (${length} characters).`,
    media_group_hint: 'Or send a group of photos with a caption — a description of the problem (minimum 20 characters).',
    media_single_hint: 'Or send a photo/document with a caption — a description of the problem (minimum 20 characters).',

    session_not_found: '❌ Dispute session not found. Please start over.',
    reason_missing: '❌ Problem description is missing. Please start over.',

    opened: ({ dealId, productName, mediaCount }) => `✅ *Dispute opened*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n📎 Files attached: ${mediaCount}\n\nThe arbiter has been notified and will review your complaint shortly.\n\nYou will be notified about the decision.`,

    notify_other: ({ dealId, productName, role }) => `⚠️ *Dispute opened*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n${role} has opened a dispute for this deal.\nAn arbiter will review the complaint and make a decision.\n\nYou can provide your evidence by contacting support.`,

    error: ({ message }) => `❌ Error creating dispute: ${message}`,
  },

  // ============================================
  // DEPOSIT MONITOR
  // ============================================
  deposit: {
    insufficient: ({ dealId, received, expected, shortfall, asset, multisigAddress, tolerance }) => `⚠️ *Insufficient deposit!*\n\n🆔 Deal: \`${dealId}\`\n💸 Received: ${received} ${asset}\n💸 Required: ${expected} ${asset}\n\n❌ Shortfall: ${shortfall} ${asset}\n\nPlease transfer an additional ${shortfall} ${asset} to the address:\n\`${multisigAddress}\`\n\n⚠️ A tolerance of up to -${tolerance} ${asset} is allowed.`,

    overpayment: ({ overpayment, asset }) => `\n\n⚠️ *Overpayment: ${overpayment} ${asset}*\nThe difference will go to the service balance.\nContact support for a refund.`,

    buyer_confirmed: ({ dealId, productName, depositAmount, dealAmount, asset, overpaymentNote, txHash }) => `✅ *Deposit confirmed!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n💸 Deposit: ${depositAmount} ${asset}\n💸 Deal amount: ${dealAmount} ${asset}\n\nFunds are frozen in a multisig wallet.\nThe seller can begin work.${overpaymentNote}\n\n[Transaction](https://tronscan.org/#/transaction/${txHash})`,

    seller_funded: ({ dealId, productName, dealAmount, asset, sellerPayout }) => `💰 *Funds received!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n💸 Deposit: ${dealAmount} ${asset}\n💵 You will receive: ${sellerPayout} ${asset}\n\nDeposit confirmed. You can start working!\n\nSend \`${dealId}\` to view deal details.`,

    buyer_confirmed_short: ({ dealId, amount, asset, txHash }) => `✅ *Deposit confirmed!*\n\nDeal ${dealId}\nAmount: ${amount} ${asset}\n\nFunds are frozen in a multisig wallet.\nThe seller can begin work.\n\n[Transaction](https://tronscan.org/#/transaction/${txHash})`,

    seller_funded_short: ({ dealId, productName, amount, asset }) => `💰 *Funds received!*\n\nDeal ${dealId}\n${productName}\n\nDeposit of ${amount} ${asset} confirmed.\nYou can start working!\n\nSend \`${dealId}\` to view deal details.`,
  },

  // ============================================
  // DEADLINE MONITOR
  // ============================================
  deadlineMonitor: {
    buyer_expired: ({ dealId, productName, amount, asset, deadline, hoursRemaining, autoRefundTime }) => `⚠️ *Deal deadline expired!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n💰 Amount: ${amount} ${asset}\n\n⏰ Deadline was: ${deadline}\n\nYou have *${hoursRemaining} hours* to:\n• Confirm work completion\n• Or open a dispute\n\n🔄 *Auto-refund:* ${autoRefundTime}\n\nIf you do not make a decision, the funds will be automatically returned to your wallet minus the service fee.`,

    seller_expired: ({ dealId, productName, amount, asset, deadline, hoursRemaining, autoRefundTime }) => `⚠️ *Deal deadline expired!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n💰 Amount: ${amount} ${asset}\n\n⏰ Deadline was: ${deadline}\n\nYou have *${hoursRemaining} hours* to:\n• Mark work as submitted\n• Or open a dispute\n\n🔄 *Auto-refund to buyer:* ${autoRefundTime}\n\n⚠️ *Warning!* If the buyer does not confirm the work and you do not open a dispute, the funds will be automatically returned to the buyer.\n\nThe service fee is retained regardless.`,

    buyer_address_missing: 'Buyer wallet address not specified',
    seller_address_missing: 'Seller wallet address not specified',

    buyer_auto_refund_key: ({ dealId, productName, refundAmount, asset, commission }) => `⏰ *Deal deadline expired!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nThe work was not completed on time.\n\n💰 *To receive a refund, enter your private key:*\n\n💸 Refund amount: *${refundAmount} ${asset}*\n📊 Service fee: ${commission} ${asset}\n\n⚠️ This is the key that was issued to you when you provided your wallet.\n\n❗️ *Without entering the key, the funds will NOT be refunded!*\n❗️ *If you lost the key, the funds will remain locked forever!*`,

    seller_expired_notify: ({ dealId, productName }) => `⏰ *Deal deadline expired*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nThe work was not completed on time.\nThe buyer has been sent a request for a refund.`,

    seller_auto_release_key: ({ dealId, productName, releaseAmount, asset, commission }) => `✅ *Work accepted automatically!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nThe buyer did not respond within 12 hours after work submission.\nThe work has been accepted automatically!\n\n💰 *To receive funds, enter your private key:*\n\n💸 Amount to receive: *${releaseAmount} ${asset}*\n📊 Service fee: ${commission} ${asset}\n\n⚠️ This is the key that was issued to you when you provided your wallet.\n\n❗️ *Without entering the key, the funds will NOT be transferred!*\n❗️ *If you lost the key, the funds will remain locked forever!*`,

    buyer_auto_release_notify: ({ dealId, productName }) => `⏰ *Work review time expired*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nYou did not respond within 12 hours after work submission.\nThe work has been accepted automatically.\n\nFunds will be transferred to the seller after confirmation.`,

    // Auto-refund complete
    buyer_refund_complete: ({ dealId, productName, refundAmount, asset, commission, txHash }) => `✅ *Auto-refund completed!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n💸 Refunded: *${refundAmount} ${asset}*\n📊 Service fee: ${commission} ${asset}\n\nThe deal deadline expired and funds have been returned to your wallet.\n\n[Transaction](https://tronscan.org/#/transaction/${txHash})`,

    seller_refund_notify: ({ dealId, productName, refundAmount, asset, commission, txHash }) => `⚠️ *Deal completed with auto-refund*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nThe deal deadline expired without confirmation of completion.\nFunds have been returned to the buyer.\n\n💸 Refunded to buyer: ${refundAmount} ${asset}\n📊 Service fee: ${commission} ${asset}\n\n[Transaction](https://tronscan.org/#/transaction/${txHash})`,

    refund_error: ({ dealId, errorMessage }) => `❌ *Auto-refund error*\n\n🆔 Deal: \`${dealId}\`\nError: ${errorMessage}\n\nPlease contact support: @keyshield\\_support`,

    // Auto-release complete
    seller_release_complete: ({ dealId, productName, releaseAmount, asset, commission, txHash }) => `✅ *Deal successfully completed!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n💸 Received: *${releaseAmount} ${asset}*\n📊 Service fee: ${commission} ${asset}\n\nThe buyer did not respond within 12 hours after work submission.\nThe work was accepted automatically and funds have been transferred to your wallet.\n\n[Transaction](https://tronscan.org/#/transaction/${txHash})`,

    buyer_release_notify: ({ dealId, productName, releaseAmount, asset, commission, txHash }) => `✅ *Deal completed*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nThe seller submitted the work, but you did not respond within 12 hours.\nThe work was accepted automatically and funds have been transferred to the seller.\n\n💸 Transferred to seller: ${releaseAmount} ${asset}\n📊 Service fee: ${commission} ${asset}\n\n[Transaction](https://tronscan.org/#/transaction/${txHash})`,

    release_error: ({ dealId, errorMessage }) => `❌ *Auto-transfer to seller error*\n\n🆔 Deal: \`${dealId}\`\nError: ${errorMessage}\n\nPlease contact support: @keyshield\\_support`,
  },

  // ============================================
  // KEY VALIDATION / PAYOUT
  // ============================================
  payout: {
    processing: '⏳ *Loading...*\n\nPayout in progress, please wait.',

    wrong_key: ({ attempts }) => `❌ *Invalid key!*\n\nAttempt ${attempts} of 3\n\nEnter your private key again:`,
    wrong_key_many: ({ attempts }) => `❌ *Invalid key!*\n\nAttempt ${attempts}\n\n⚠️ If you lost your key, contact support: @keyshield\\_support\n\nTry again:`,

    seller_success: ({ dealId, productName, releaseAmount, asset, commission, txHash }) => `✅ *Funds received!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n💸 Received: *${releaseAmount} ${asset}*\n📊 Service fee: ${commission} ${asset}\n\n[Transaction](https://tronscan.org/#/transaction/${txHash})`,

    buyer_deal_complete: ({ dealId, productName, amount, asset, commission, txHash }) => `✅ *Deal completed!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n💸 Purchase amount: *${amount} ${asset}*\n📊 Service fee: ${commission} ${asset}\n\nThe seller confirmed receipt of funds.\nThe deal is successfully completed!\n\n[Transaction](https://tronscan.org/#/transaction/${txHash})`,

    seller_error: ({ dealId, errorMessage }) => `❌ *Payout error*\n\n🆔 Deal: \`${dealId}\`\nError: ${errorMessage}\n\nPlease contact support: @keyshield\\_support`,

    buyer_refund_success: ({ dealId, productName, refundAmount, asset, commission, txHash }) => `✅ *Refund completed!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n💸 Refunded: *${refundAmount} ${asset}*\n📊 Service fee: ${commission} ${asset}\n\n[Transaction](https://tronscan.org/#/transaction/${txHash})`,

    seller_refund_notify: ({ dealId, productName, refundAmount, asset, txHash }) => `⚠️ *Deal completed with refund*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\nThe deal deadline expired without confirmation of completion.\nFunds have been returned to the buyer.\n\n💸 Refunded: ${refundAmount} ${asset}\n\n[Transaction](https://tronscan.org/#/transaction/${txHash})`,

    buyer_refund_error: ({ dealId, errorMessage }) => `❌ *Refund error*\n\n🆔 Deal: \`${dealId}\`\nError: ${errorMessage}\n\nPlease contact support: @keyshield\\_support`,

    dispute_winner: ({ dealId, productName, payoutAmount, asset, commission, txHash }) => `✅ *Funds received!*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n💸 Received: *${payoutAmount} ${asset}*\n📊 Service fee: ${commission} ${asset}\n\n[Transaction](https://tronscan.org/#/transaction/${txHash})`,

    dispute_error: ({ dealId, errorMessage }) => `❌ *Payout error*\n\n🆔 Deal: \`${dealId}\`\nError: ${errorMessage}\n\nPlease contact support: @keyshield\\_support`,
  },

  // ============================================
  // NOTIFICATION SERVICE
  // ============================================
  notification: {
    dispute_cancelled: ({ dealId }) => `⚠️ *Dispute cancelled by administrator*\n\nDeal: \`${dealId}\`\n\nThe dispute has been cancelled. You can continue working on the deal or open a new dispute if needed.`,

    dispute_cancelled_agreement: ({ dealId, productName, deadlineLabel, deadlineText }) => `✅ *Dispute cancelled by mutual agreement*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n${deadlineLabel}: *${deadlineText}*\n\nThe deal continues. Fulfill your obligations on time!`,
    new_deadline: 'New deadline',
    deadline_label: 'Deadline',

    dispute_resolved_winner: ({ dealId }) => `✅ *Dispute resolved in your favor*\n\nDeal: \`${dealId}\`\n\nThe administrator resolved the dispute in your favor. Funds will be transferred to your wallet.`,
    dispute_resolved_loser_buyer: ({ dealId }) => `❌ *Dispute resolved in favor of the seller*\n\nDeal: \`${dealId}\`\n\nThe administrator resolved the dispute in favor of the seller. Funds will be transferred to the seller.`,
    dispute_resolved_winner_seller: ({ dealId }) => `✅ *Dispute resolved in your favor*\n\nDeal: \`${dealId}\`\n\nThe administrator resolved the dispute in your favor. Funds will be transferred to your wallet.`,
    dispute_resolved_loser_seller: ({ dealId }) => `❌ *Dispute resolved in favor of the buyer*\n\nDeal: \`${dealId}\`\n\nThe administrator resolved the dispute in favor of the buyer. Funds will be returned to the buyer.`,
  },

  // ============================================
  // INVITE ACCEPT
  // ============================================
  invite: {
    expired: '❌ *Link expired*\n\nThe link has expired. Please ask the creator to send a new one.',
    expired_long: '❌ *Link expired*\n\nThis invitation link was valid for 24 hours and is no longer active.\n\nPlease ask the deal creator to send a new link.',
    invalid: '❌ *Link is invalid*\n\nThis invitation link was not found or has already expired.\n\nPossible reasons:\n• The link was cancelled by the creator\n• More than 24 hours have passed since creation\n• The deal has already been accepted by another participant',
    own_deal: '❌ *This is your deal*\n\nYou cannot accept your own deal.\n\nSend this link to the counterparty.',
    deals_limit: ({ count, max }) => `❌ *Deal limit reached*\n\nYou already have ${count} active deals (maximum ${max}).\n\nComplete one of your current deals before accepting a new one.`,

    select_wallet: '💳 *Select a wallet*\n\nChoose a saved wallet or enter a new address to participate in the deal.',
    enter_wallet: ({ purpose }) => `💳 *Enter wallet address*\n\nEnter your TRON wallet (starts with T).\n\nThis wallet ${purpose}.`,

    declined_user: '❌ *Invitation declined*\n\nYou declined the invitation to the deal.',
    declined_creator: ({ dealId, productName, username }) => `❌ *Invitation declined*\n\n🆔 Deal: \`${dealId}\`\n📦 ${productName}\n\n${username} declined your deal invitation.\n\nYou can create a new deal at any time.`,

    deal_not_found: '❌ *Deal not found*\n\nThe deal was cancelled or already accepted.',

    accepted_buyer: ({ dealId, productName, amount, asset, depositAmount, shortWallet, multisigAddress }) => `✅ *Deal accepted!*\n\n🆔 ID: \`${dealId}\`\n📦 ${productName}\n\n💰 Amount: ${amount} ${asset}\n💸 To pay: ${depositAmount} ${asset}\n💳 Your wallet: \`${shortWallet}\`\n\n📥 *Deposit address:*\n\`${multisigAddress}\`\n\n⚠️ Send *exactly ${depositAmount} USDT* to the specified address.\nAfter the transaction is confirmed, the deal will start automatically.`,

    accepted_seller: ({ dealId, productName, amount, asset, sellerPayout, shortWallet }) => `✅ *Deal accepted!*\n\n🆔 ID: \`${dealId}\`\n📦 ${productName}\n\n💰 Amount: ${amount} ${asset}\n💸 You will receive: ${sellerPayout} ${asset}\n💳 Your wallet: \`${shortWallet}\`\n\n⏳ *Status:* Awaiting deposit from the buyer\n\nThe buyer has received the payment address.`,

    creator_notify_buyer: ({ dealId, productName, counterpartyUsername, multisigAddress, depositAmount, asset }) => `✅ *Counterparty accepted the deal!*\n\n🆔 ID: \`${dealId}\`\n📦 ${productName}\n\n👤 Seller: ${counterpartyUsername}\n\n📥 *Deposit address:*\n\`${multisigAddress}\`\n\n💸 To pay: ${depositAmount} ${asset}\n\n⚠️ Send *exactly ${depositAmount} USDT* to the specified address.`,

    creator_notify_seller: ({ dealId, productName, counterpartyUsername }) => `✅ *Counterparty accepted the deal!*\n\n🆔 ID: \`${dealId}\`\n📦 ${productName}\n\n👤 Buyer: ${counterpartyUsername}\n\n⏳ *Status:* Awaiting deposit\n\nThe buyer has received the payment address. You will be notified when the deposit arrives.`,

    error: ({ message }) => `❌ *Error*\n\n${message}`,

    copy_link_text: ({ inviteLink }) => `🔗 *Link for counterparty:*\n\n\`${inviteLink}\`\n\n_Tap the link to copy_`,

    // Invite acceptance screen
    acceptance: ({ dealId, userRoleLabel, creatorUsername, creatorRoleLabel, creatorRatingDisplay, productName, description, amount, asset, commission, paymentInfo }) => `📨 *Deal invitation*\n\n🆔 ID: \`${dealId}\`\n\n*Your role:* ${userRoleLabel}\n*Counterparty:* ${creatorUsername} (${creatorRoleLabel})\n*Rating:* ${creatorRatingDisplay}\n\n📦 *Product/service:* ${productName}\n${description ? `📝 *Description:* ${description}\n` : ''}💰 *Amount:* ${amount} ${asset}\n📊 *Fee:* ${commission} ${asset}\n${paymentInfo}\n\n⚠️ *Note:* To accept the deal, you will need to provide your TRON wallet.\n\nDo you want to accept this deal?`,
    to_pay: ({ amount, asset }) => `💸 *To pay:* ${amount} ${asset}`,
    you_receive: ({ amount, asset }) => `💸 *You will receive:* ${amount} ${asset}`,
  },

  // ============================================
  // REFERRAL
  // ============================================
  referral: {
    main: ({ balance, totalEarned, withdrawn, totalInvited, activeReferrals, withdrawalStatus }) => `🎁 *Referral Program*\n\nInvite friends and earn *10%* of the service fee from each of their deals!\n\n━━━━━━━━━━━━━━━━━━━━━━\n💰 *Balance:* ${balance} USDT\n📊 *Total earned:* ${totalEarned} USDT\n💸 *Withdrawn:* ${withdrawn} USDT\n━━━━━━━━━━━━━━━━━━━━━━\n👥 *Invited:* ${totalInvited}\n✅ *Active:* ${activeReferrals}\n━━━━━━━━━━━━━━━━━━━━━━${withdrawalStatus}\n\n_Minimum withdrawal amount: 10 USDT_`,

    pending_withdrawal: ({ withdrawalId, status }) => `\n⏳ *Request ${withdrawalId}:* ${status}`,
    status_pending: 'pending processing',
    status_processing: 'in progress',

    link: ({ referralLink, referralCode }) => `🔗 *Your referral link*\n\nShare the link with friends:\n\n\`${referralLink}\`\n\nOr enter code: \`${referralCode}\`\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n*How it works:*\n1️⃣ Your friend follows your link\n2️⃣ Registers with the bot\n3️⃣ Makes a deal\n4️⃣ You earn *10%* of the service fee!\n\n_Bonus is credited after the deal is successfully completed._`,

    my_referrals_title: '👥 *My Referrals*\n\n',
    no_referrals: '_You have no invited users yet._\n\nShare your referral link to start earning!',
    total_referrals: ({ count }) => `Total: ${count}\n\n`,
    referral_stats: ({ date, deals, earned }) => `   📅 ${date} • 📊 ${deals} deals • 💰 ${earned}$\n\n`,

    history_title: '📊 *Accrual History*\n\n',
    no_history: '_No accruals yet._\n\nAccruals will appear after your referrals complete deals.',
    total_operations: ({ count }) => `Total operations: ${count}\n\n`,

    withdraw_not_enough: ({ balance, needed }) => `💸 *Withdraw Funds*\n\nMinimum withdrawal amount: *10 USDT*\n\nYour balance: *${balance} USDT*\nRemaining to earn: *${needed} USDT*\n\n_Keep inviting friends to reach the minimum amount faster!_`,

    withdraw_pending_exists: ({ withdrawalId, status }) => `⚠️ *You already have an active request*\n\nRequest: \`${withdrawalId}\`\nStatus: ${status}\n\nPlease wait for the current request to be completed.`,

    withdraw_select_wallet: ({ balance }) => `💸 *Withdraw referral balance*\n\n💰 Amount to withdraw: *${balance} USDT*\n\n`,
    withdraw_select_saved: 'Select a wallet from saved ones or enter a new TRC-20 address:',
    withdraw_enter_address: 'Enter a TRC-20 wallet address to receive the payout:',

    withdraw_confirm: ({ amount, walletAddress }) => `📤 *Withdrawal Confirmation*\n\n💰 Amount: *${amount} USDT*\n📍 Wallet: \`${walletAddress}\`\n\n⚠️ Payouts are processed manually within 24-48 hours.\n\nConfirm withdrawal request?`,

    withdraw_success: ({ withdrawalId, amount, walletAddress }) => `✅ *Withdrawal request created!*\n\n📋 Request number: \`${withdrawalId}\`\n💰 Amount: *${amount} USDT*\n📍 Wallet: \`${walletAddress}\`\n\n⏳ The request will be processed within 24-48 hours.\n\nYou will be notified upon completion.`,

    invalid_address: '❌ *Invalid address*\n\nEnter a valid TRC-20 wallet address (starts with T):',
    deal_label: 'Deal',
  },

  // ============================================
  // EMAIL RECEIPTS
  // ============================================
  receipt: {
    ask_saved: ({ email }) => `📧 *Send receipt via email?*\n\nSend the receipt to the saved email?\n📮 \`${email}\``,
    ask_new: '📧 *Send receipt via email?*\n\nWould you like to receive a transaction receipt to your email?',
    enter_email: '📧 *Enter your email*\n\nSend the email address where you would like to receive the receipt:',
    invalid_email: '❌ *Invalid email format*\n\nPlease enter a valid email address:',
    sending: ({ email }) => `📧 *Sending receipt...*\n\nSending receipt to: ${email}`,
    sent: ({ email }) => `✅ *Receipt sent!*\n\n📧 Email: ${email}`,
    send_error: '⚠️ *Failed to send receipt*\n\nAn error occurred while sending.',
    email_saved: ({ email }) => `✅ *Email saved!*\n\n📧 ${email}\n\nReceipts will now be automatically offered to this email.`,
  },

  // ============================================
  // RATING
  // ============================================
  rating: {
    ask: ({ roleLabel, dealId, counterpartyRole, counterpartyUsername }) => `⭐ *Rate the ${roleLabel}*\n\n🆔 Deal: \`${dealId}\`\n👤 ${counterpartyRole}: \`@${counterpartyUsername}\`\n\nHow was the deal? Rate the counterparty:\n\n_Choose from 1 to 5 stars_`,
    updated: ({ roleLabel, dealId, counterpartyRole, counterpartyUsername, stars, emptyStars }) => `⭐ *Rate the ${roleLabel}*\n\n🆔 Deal: \`${dealId}\`\n👤 ${counterpartyRole}: \`@${counterpartyUsername}\`\n\nHow was the deal? Rate the counterparty:\n\nYour rating: ${stars}${emptyStars}`,
    star_count: ({ rating }) => {
      if (rating === 1) return '1 star';
      return `${rating} stars`;
    },
    saved: '✅ Rating saved',
    thank_you: ({ stars, username, finalMessage }) => `✅ *Thank you for your rating!*\n\nYou gave ${stars} to \`@${username}\`\n\n${finalMessage}`,
    rating_display: ({ average, count, word }) => `⭐ ${average} (${count} ${word})`,
  },

  // ============================================
  // TEMPLATES
  // ============================================
  templates: {
    title: '📑 *My Templates*',
    title_count: ({ count }) => `📑 *My Templates* (${count}/5)`,
    empty: '📑 *My Templates*\n\n_You have no saved templates yet._\n\nTemplates let you create deals in 2 clicks!\n\n💡 *How to create a template:*\n• Click "Create Template" below\n• Or save a successful deal as a template',
    select_hint: '_Select a template to use:_',
    not_found: '❌ Template not found',
    limit_reached: '❌ Template limit (5) reached',
    save_error: '❌ Save error',
    usage_count: ({ count }) => `📊 *Used:* ${count} times`,

    detail: ({ name, roleIcon, roleText, productName, description, amount, asset, commissionText, deadlineText, usageCount }) => `📑 *${name}*\n\n${roleIcon} *Role:* ${roleText}\n📦 *Product/service:* ${productName}\n\n📝 *Description:*\n${description}\n\n💰 *Amount:* ${amount} ${asset}\n💸 *Fee:* ${commissionText}\n⏰ *Deadline:* ${deadlineText}\n\n📊 *Used:* ${usageCount} times`,

    created: ({ name, productName, amount, asset }) => `✅ *Template created!*\n\n📑 *${name}*\n📦 ${productName}\n💰 ${amount} ${asset}\n\nNow you can create deals in 2 clicks!`,

    // Create steps
    step1: '📑 *Create Template*\n\n*Step 1 of 7: Name*\n\nEnter a short name for the template:\n_(e.g.: "Logo design", "Consultation")_',
    step2: '📑 *Create Template*\n\n*Step 2 of 7: Your role*\n\nChoose your role in deals using this template:',
    step3: '📑 *Create Template*\n\n*Step 3 of 7: Product/service name*\n\nEnter the name of the product or service:\n_(5 to 200 characters)_',
    step4: '📑 *Create Template*\n\n*Step 4 of 7: Description*\n\nEnter a description of the work:\n_(20 to 5000 characters)_',
    step5: '📑 *Create Template*\n\n*Step 5 of 7: Amount*\n\nEnter the deal amount in USDT:\n_(minimum 50 USDT)_',
    step6: ({ amount, commission }) => `📑 *Create Template*\n\n*Step 6 of 7: Fee*\n\n💰 Amount: ${amount} USDT\n💸 Fee: ${commission} USDT\n\nWho pays the fee?`,
    step7: '📑 *Create Template*\n\n*Step 7 of 7: Deadline*\n\nChoose a standard execution deadline:',

    save_from_deal: ({ dealId, productName, amount, asset }) => `💾 *Save Template*\n\nDeal: \`${dealId}\`\n📦 ${productName}\n💰 ${amount} ${asset}\n\n*Enter a name for the template:*\n_(e.g.: "Logo design")_`,

    // Validation
    name_error: '❌ The name must be between 2 and 50 characters.\n\nEnter the template name:',
    product_name_error: '❌ The name must be between 5 and 200 characters.\n\nEnter the product/service name:',
    description_error: '❌ The description must be between 20 and 5000 characters.\n\nEnter the description:',
    amount_error: '❌ Invalid amount. Minimum: 50 USDT.\n\nEnter the amount:',

    // Use template
    use_title: '🚀 *Quick Deal from Template*',
    use_how_find: '*How to find the counterparty?*',
    use_enter_username: ({ templateName, counterpartyLabel }) => `🚀 *Quick Deal from Template*\n\n📑 ${templateName}\n\nEnter @username of the ${counterpartyLabel}:`,
    use_select_wallet: ({ templateName, walletPurpose }) => `🚀 *Quick Deal from Template*\n\n📑 ${templateName}\n\n💳 *Select a wallet ${walletPurpose}:*\n\nOr enter a new TRON wallet address.`,
    use_enter_wallet: ({ templateName, walletPurpose }) => `🚀 *Quick Deal from Template*\n\n📑 ${templateName}\n\n💳 *Enter TRON wallet address ${walletPurpose}:*\n\n_(address starts with T, 34 characters)_`,
    use_counterparty_found_wallet: ({ username, rating, walletPurpose }) => `✅ *Counterparty:* \`@${username}\`\n📊 *Rating:* ${rating}\n\n💳 *Select a wallet ${walletPurpose}:*\n\nOr enter a new TRON wallet address.`,
    use_counterparty_found_input: ({ username, rating, walletPurpose }) => `✅ *Counterparty:* \`@${username}\`\n📊 *Rating:* ${rating}\n\n💳 *Enter TRON wallet address ${walletPurpose}:*\n\n_(address starts with T, 34 characters)_`,

    // Use template errors
    use_self_deal: '❌ *You cannot create a deal with yourself!*\n\nEnter a different @username:',
    use_user_not_found: ({ username }) => `❌ *User \`@${username}\` not found*\n\nMake sure they have already started the bot.\nEnter a different @username:`,
    use_user_blocked: '❌ *User is blocked*\n\nEnter a different @username:',
    use_counterparty_limit: ({ username, count, max }) => `⚠️ *\`@${username}\` has reached deal limit*\n\nThey already have ${count} active deals (maximum ${max}).\n\nEnter a different @username:`,
    use_deals_limit: ({ count, max }) => `⚠️ *Deal limit reached*\n\nYou already have ${count} active deals (maximum ${max}).\n\nComplete one of your current deals before creating a new one.`,
    use_username_required: '⚠️ *Username required*\n\nTo create deals, set a public username in your Telegram settings.',
    use_error: ({ message }) => `❌ *Error creating deal*\n\n${message || 'Please try later.'}`,

    // Use template deal created
    use_deal_created: ({ dealId, roleIcon, roleLabel, productName, amount, asset, commission, inviteLink }) => `✅ *Deal created!*\n\n🆔 ID: \`${dealId}\`\n${roleIcon} You: ${roleLabel}\n📦 ${productName}\n💰 ${amount} ${asset}\n💸 Fee: ${commission} ${asset}\n\n🔗 *Link for the counterparty:*\n\`${inviteLink}\`\n\n⏳ The link is valid for 24 hours.\nSend it to the counterparty to participate in the deal.`,

    // Edit template
    edit_name_prompt: ({ name }) => `✏️ *Edit name*\n\n📑 Template: *${name}*\n\nEnter a new name:\n_(2 to 50 characters)_`,
    edit_amount_prompt: ({ name, amount, asset }) => `💰 *Edit amount*\n\n📑 Template: *${name}*\nCurrent amount: *${amount} ${asset}*\n\nEnter a new amount:\n_(minimum 50 USDT)_`,
    edit_description_prompt: ({ name }) => `📝 *Edit description*\n\n📑 Template: *${name}*\n\nEnter a new description:\n_(20 to 5000 characters)_`,
    edit_deadline_prompt: ({ name, currentDeadline }) => `⏰ *Edit deadline*\n\n📑 Template: *${name}*\nCurrent deadline: *${currentDeadline}*\n\nChoose a new execution deadline:`,
    edit_name_error: '❌ The name must be between 2 and 50 characters.',
    edit_amount_error: '❌ Minimum amount: 50 USDT.',
    edit_description_error: '❌ The description must be between 20 and 5000 characters.',
    edit_error_retry: 'Please try again:',
    field_changed: ({ fieldLabel }) => `✅ *${fieldLabel} changed!*`,
    deadline_changed: '✅ *Deadline changed!*',
    field_label_name: 'Name',
    field_label_amount: 'Amount',
    field_label_description: 'Description',
    field_label_deadline: 'Deadline',

    // Delete template
    confirm_delete: ({ name, productName, amount, asset, usageCount }) => `🗑️ *Delete template?*\n\n📑 *${name}*\n📦 ${productName}\n💰 ${amount} ${asset}\n📊 Used: ${usageCount} times\n\n_This action cannot be undone._`,
    deleted: ({ name }) => `✅ *Template "${name}" deleted*`,

    // Formatting helpers
    deadline_format: ({ hours }) => {
      if (!hours || isNaN(hours)) return 'Not set';
      if (hours === 24) return '24 hours';
      if (hours === 48) return '48 hours';
      if (hours < 24) return `${hours} hours`;
      const days = Math.floor(hours / 24);
      if (days === 1) return '1 day';
      return `${days} days`;
    },
    commission_format: ({ type, commission, asset }) => {
      if (commission == null || isNaN(commission)) return 'Not set';
      if (type === 'buyer') return `Buyer pays (${commission} ${asset || 'USDT'})`;
      if (type === 'seller') return `Seller pays (${commission} ${asset || 'USDT'})`;
      return `50/50 (${(commission / 2).toFixed(2)} ${asset || 'USDT'} each)`;
    },

    // List item
    list_item: ({ index, roleIcon, name, productName, amount, asset, roleText }) => `${index}. ${roleIcon} *${name}*\n   ${productName}\n   ${amount} ${asset} • ${roleText}`,
  },

  // ============================================
  // MY DATA
  // ============================================
  myData: {
    title: ({ ratingDisplay, emailDisplay, walletsCount, walletsDisplay }) => `👤 *My Data*\n\n⭐ *Your rating:*\n${ratingDisplay}\n\n📧 *Email for receipts:*\n${emailDisplay}\n\n💳 *Saved wallets (${walletsCount}/5):*\n${walletsDisplay}\n\n_Select a section to edit:_`,
    no_wallets: '_No saved wallets_',

    // Email
    add_email: '📧 *Enter email*\n\nSend your email address to receive receipts:',
    delete_email_confirm: '🗑 *Delete email?*\n\nAre you sure you want to delete the saved email?\n\nAfter deletion, you will have to enter your email manually for each deal.',
    email_deleted: '✅ *Email deleted*\n\nThe saved email has been deleted.',
    invalid_email: '❌ *Invalid email format*\n\nPlease enter a valid email address:',
    email_saved: ({ email }) => `✅ *Email saved!*\n\n📧 ${email}\n\nReceipts will now be automatically offered to this email.`,

    // Wallets
    wallets_title: '💳 *My Wallets*',
    wallets_empty: '💳 *My Wallets*\n\n_You have no saved wallets._\n\nAdd a wallet to quickly select it when creating or accepting deals.',
    wallets_list: ({ count, walletsText }) => `💳 *My Wallets (${count}/5)*\n\n${walletsText}\n\n_Click on a wallet to view or 🗑️ to delete._`,
    wallet_details: ({ name, address, createdAt }) => `💳 *${name}*\n\n📍 *Address:*\n\`${address}\`\n\n📅 *Added:* ${createdAt}\n\n[🔍 View on TronScan](https://tronscan.org/#/address/${address})`,
    wallet_unknown_date: 'Unknown',

    delete_wallet_confirm: ({ name, address }) => `🗑️ *Delete wallet?*\n\n*${name}*\n\`${address}\`\n\nAre you sure you want to delete this wallet?`,
    wallet_deleted: '✅ *Wallet deleted*',

    add_wallet: '💳 *Add wallet*\n\nEnter your TRON wallet address (TRC-20):\n\n_The address must start with T and contain 34 characters_\n_Example: TQRfXYMDSspGDB7GB8MevZpkYgUXkviCSj_',

    edit_name: ({ address, currentName }) => `✏️ *Edit name*\n\n💳 \`${address}\`\nCurrent name: *${currentName}*\n\nEnter a new name and send it in the chat:`,
    edit_address: ({ name, address }) => `📍 *Edit address*\n\n💳 *${name}*\nCurrent address:\n\`${address}\`\n\nEnter a new TRON wallet address (TRC-20):`,
    name_changed: ({ name, address }) => `✅ *Name changed!*\n\n💳 *${name}*\n\`${address}\``,
    address_changed: ({ name, address }) => `✅ *Address changed!*\n\n💳 *${name}*\n\`${address}\``,
    wallet_not_found: '❌ *Wallet not found*',

    // Language
    language_select: '🌐 *Choose language*\n\nCurrent language: *{currentLang}*\n\nSelect your preferred interface language:',
    language_changed: '✅ *Language changed!*\n\nBot interface switched to English.',
  },

  // ============================================
  // ABANDONED DEAL MONITOR
  // ============================================
  abandoned: {
    title: '⏰ *Having trouble?*',
    stopped_at: ({ step }) => `You stopped at step: *${step}*`,
    help_text: 'If you have questions:\n• Contact support: @keyshield\\_support\n• Instructions on the website: [keyshield.me/blog/keyshield-instruction-usdt-escrow](https://keyshield.me/blog/keyshield-instruction-usdt-escrow)',
    continue_or_menu: 'Continue creating the deal or return to the main menu?',
    btn_continue: '▶️ Continue',
    btn_main_menu: '🏠 Main menu',
    steps: {
      role_selection: 'role selection',
      counterparty_username: 'entering counterparty',
      product_name: 'product name',
      description: 'description',
      asset_selection: 'asset selection',
      amount: 'entering amount',
      commission_selection: 'commission selection',
      deadline_selection: 'deadline selection',
      creator_wallet: 'entering wallet',
      wallet_balance_warning: 'balance warning',
      wallet_name_input: 'wallet name',
      save_wallet_prompt: 'saving wallet',
      confirmation: 'confirmation',
    },
  },

  // ============================================
  // DEAL SERVICE
  // ============================================
  dealService: {
    buyer_limit: ({ count, max }) => `You already have ${count} active deals (maximum ${max}). Complete one of them before creating a new one.`,
    seller_limit: ({ count, max }) => `The counterparty already has ${count} active deals (maximum ${max}). They must complete one of them.`,
    creator_limit: ({ count, max }) => `You already have ${count} active deals (maximum ${max}). Complete one of them before creating a new one.`,
    invite_limit: ({ count, max }) => `You already have ${count} active deals (maximum ${max}). Complete one of them.`,
  },

  // ============================================
  // PDF / EMAIL RECEIPT CONTENT
  // ============================================
  pdf: {
    // Title page
    subtitle: 'Secure Crypto Escrow on TRON',
    statement: 'STATEMENT',
    doc_type: 'Document type:',
    deal_statement: 'Deal Statement',
    deal_label: 'Deal:',
    prepared_for: 'Prepared for:',
    date_generated: 'Generated on:',
    timezone: '(MSK)',
    footer_auto: 'This document was generated automatically by KeyShield.',
    na: 'N/A',
    // Sections
    section_basic: 'Basic Information',
    section_participants: 'Participants',
    section_financial: 'Financials',
    section_wallets: 'Wallets',
    section_blockchain: 'Blockchain',
    section_timeline: 'Timeline',
    // Fields
    field_deal_id: 'Deal ID:',
    field_description: 'Description:',
    field_role: 'Your role:',
    field_initiator: 'Initiator:',
    field_amount: 'Deal amount:',
    field_commission: 'Commission:',
    field_comm_payer: 'Commission paid by:',
    field_deposit_amount: 'Deposit amount:',
    field_seller_payout: 'Seller payout:',
    field_multisig: 'Multisig:',
    field_buyer_wallet: 'Buyer:',
    field_seller_wallet: 'Seller:',
    field_deposit_tx: 'Deposit TX:',
    field_payout_tx: 'Payout TX:',
    field_created: 'Created:',
    field_completed: 'Completed:',
    // Roles / commission
    role_buyer: 'Buyer',
    role_seller: 'Seller',
    comm_split: '50/50 Split',
    // Statuses
    status_completed: 'Successfully Completed',
    status_resolved: 'Resolved by Arbitrator',
    status_expired: 'Expired (Auto-refund)',
    status_cancelled: 'Cancelled',
    status_refunded: 'Refunded',
    // Email subject
    subject_refund: ({ dealId }) => `KeyShield - Refund Receipt for Deal ${dealId}`,
    subject_purchase: ({ dealId }) => `KeyShield - Purchase Receipt for Deal ${dealId}`,
    subject_deal: ({ dealId }) => `KeyShield - Receipt for Deal ${dealId}`,
    // Email HTML
    email_subtitle: 'Secure Crypto Transactions',
    email_type_refund: 'REFUND RECEIPT',
    email_type_purchase: 'PURCHASE RECEIPT',
    email_type_payout: 'PAYOUT RECEIPT',
    email_status_refund: 'Refund Completed',
    email_status_purchase: 'Purchase Completed',
    email_status_payout: 'Payout Received',
    email_amount_refund: 'Refund Amount',
    email_amount_purchase: 'Purchase Amount',
    email_amount_payout: 'Payout Amount',
    email_section_deal: 'DEAL INFORMATION',
    email_section_tx: 'TRANSACTION',
    email_field_deal_id: 'Deal ID',
    email_field_product: 'Product/Service',
    email_field_amount: 'Deal Amount',
    email_field_commission: 'Service Fee',
    email_field_recipient: 'Recipient Address',
    email_field_date: 'Date',
    email_tronscan_link: 'Verify Transaction on TronScan',
    email_pdf_notice: 'PDF statement is attached to this email',
    email_footer_auto: 'This document was generated automatically by KeyShield',
    email_footer_support: 'Support:',
    email_rights: 'All rights reserved.',
    // Plain text fallback
    text_title_refund: 'Refund Receipt',
    text_title_purchase: 'Purchase Receipt',
    text_title_deal: 'Deal Receipt',
    text_status_refund: 'Refund Completed',
    text_status_purchase: 'Purchase Completed',
    text_status_deal: 'Deal Completed',
    text_amount_refund: 'Refund Amount',
    text_amount_purchase: 'Purchase Amount',
    text_amount_payout: 'Payout Amount',
    text_details: 'Details:',
    text_field_deal_id: 'Deal ID',
    text_field_product: 'Product/Service',
    text_field_commission: 'Service Fee',
    text_field_recipient: 'Recipient Address',
    text_field_date: 'Date',
    text_footer: 'KeyShield - Secure Crypto Transactions',
  },

  // ============================================
  // PLURALIZATION HELPERS
  // ============================================
  plural: {
    reviews: ({ count }) => {
      if (count === 1) return 'review';
      return 'reviews';
    },
    deals: ({ count }) => {
      if (count === 1) return 'deal';
      return 'deals';
    },
  },
};
