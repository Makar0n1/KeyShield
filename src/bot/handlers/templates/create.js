/**
 * Template Create Handlers
 */

const DealTemplate = require('../../../models/DealTemplate');
const Deal = require('../../../models/Deal');
const messageManager = require('../../utils/messageManager');
const {
  templateRoleKeyboard,
  templateCommissionKeyboard,
  templateDeadlineKeyboard,
  templateInputKeyboard
} = require('../../keyboards/templates');
const { getTemplateSession, setTemplateSession, clearTemplateSession } = require('./session');
const { showTemplatesList, showTemplateDetails } = require('./list');
const { t } = require('../../../locales');

/**
 * Start creating template manually
 */
async function startCreateTemplate(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  // Check limit
  const canCreate = await DealTemplate.canCreateTemplate(telegramId);
  if (!canCreate) {
    await ctx.answerCbQuery(t(lang, 'templates.limit_reached'), { show_alert: true });
    return showTemplatesList(ctx);
  }

  // Initialize session
  await setTemplateSession(telegramId, {
    action: 'create',
    step: 'name',
    data: {}
  });

  const text = t(lang, 'templates.step1');
  const keyboard = templateInputKeyboard(lang);
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
}

/**
 * Save from completed deal
 */
async function saveFromDeal(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  // Get dealId from callback
  const dealId = ctx.callbackQuery.data.split(':')[2];

  // Check limit
  const canCreate = await DealTemplate.canCreateTemplate(telegramId);
  if (!canCreate) {
    await ctx.answerCbQuery(t(lang, 'templates.limit_reached'), { show_alert: true });
    return;
  }

  const deal = await Deal.findOne({ dealId });
  if (!deal) {
    await ctx.answerCbQuery(t(lang, 'common.deal_not_found'), { show_alert: true });
    return;
  }

  // Determine user's role in the deal
  const creatorRole = deal.buyerId === telegramId ? 'buyer' : 'seller';

  // Calculate deadline hours from deal
  const deadlineHours = Math.round((deal.deadline - deal.createdAt) / (1000 * 60 * 60));

  // Pre-fill session with deal data
  await setTemplateSession(telegramId, {
    action: 'create_from_deal',
    step: 'name',
    data: {
      creatorRole,
      productName: deal.productName,
      description: deal.description,
      asset: deal.asset,
      amount: deal.amount,
      commissionType: deal.commissionType,
      deadlineHours: deadlineHours || 72
    },
    dealId
  });

  const text = t(lang, 'templates.save_from_deal', {
    dealId,
    productName: deal.productName,
    amount: deal.amount,
    asset: deal.asset
  });

  const keyboard = templateInputKeyboard(lang);
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
}

/**
 * Handle text input during template creation
 */
async function handleCreateInput(ctx) {
  const telegramId = ctx.from.id;
  const text = ctx.message.text.trim();

  await messageManager.deleteUserMessage(ctx);

  const session = await getTemplateSession(telegramId);
  if (!session || !session.action?.startsWith('create')) return false;

  switch (session.step) {
    case 'name':
      return handleNameInput(ctx, session, text);
    case 'product_name':
      return handleProductNameInput(ctx, session, text);
    case 'description':
      return handleDescriptionInput(ctx, session, text);
    case 'amount':
      return handleAmountInput(ctx, session, text);
    default:
      return false;
  }
}

/**
 * Handle name input
 */
async function handleNameInput(ctx, session, text) {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  if (text.length < 2 || text.length > 50) {
    const errorText = t(lang, 'templates.name_error');
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateInputKeyboard(lang));
    return true;
  }

  session.data.name = text;

  // If creating from deal, we have all data - just save
  if (session.action === 'create_from_deal') {
    return await saveTemplate(ctx, session);
  }

  // Otherwise continue to role selection
  session.step = 'role';
  await setTemplateSession(telegramId, session);

  const screenText = t(lang, 'templates.step2');
  await messageManager.sendNewMessage(ctx, telegramId, screenText, templateRoleKeyboard(lang));
  return true;
}

/**
 * Handle role selection
 */
async function handleRoleSelection(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  const session = await getTemplateSession(telegramId);
  if (!session || session.action !== 'create') return;

  const role = ctx.callbackQuery.data.split(':')[1];
  session.data.creatorRole = role;
  session.step = 'product_name';
  await setTemplateSession(telegramId, session);

  const text = t(lang, 'templates.step3');
  await messageManager.sendNewMessage(ctx, telegramId, text, templateInputKeyboard(lang));
}

/**
 * Handle product name input
 */
async function handleProductNameInput(ctx, session, text) {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  if (text.length < 5 || text.length > 200) {
    const errorText = t(lang, 'templates.product_name_error');
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateInputKeyboard(lang));
    return true;
  }

  session.data.productName = text;
  session.step = 'description';
  await setTemplateSession(telegramId, session);

  const screenText = t(lang, 'templates.step4');
  await messageManager.sendNewMessage(ctx, telegramId, screenText, templateInputKeyboard(lang));
  return true;
}

/**
 * Handle description input
 */
async function handleDescriptionInput(ctx, session, text) {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  if (text.length < 20 || text.length > 5000) {
    const errorText = t(lang, 'templates.description_error');
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateInputKeyboard(lang));
    return true;
  }

  session.data.description = text;
  session.data.asset = 'USDT';
  session.step = 'amount';
  await setTemplateSession(telegramId, session);

  const screenText = t(lang, 'templates.step5');
  await messageManager.sendNewMessage(ctx, telegramId, screenText, templateInputKeyboard(lang));
  return true;
}

/**
 * Handle amount input
 */
async function handleAmountInput(ctx, session, text) {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';
  const amount = parseFloat(text.replace(',', '.'));

  if (isNaN(amount) || amount < 50) {
    const errorText = t(lang, 'templates.amount_error');
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateInputKeyboard(lang));
    return true;
  }

  session.data.amount = amount;
  session.step = 'commission';
  await setTemplateSession(telegramId, session);

  const commission = Deal.calculateCommission(amount);

  const screenText = t(lang, 'templates.step6', { amount, commission });

  const keyboard = templateCommissionKeyboard(amount, commission, 'USDT', lang);
  await messageManager.sendNewMessage(ctx, telegramId, screenText, keyboard);
  return true;
}

/**
 * Handle commission selection
 */
async function handleCommissionSelection(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  const session = await getTemplateSession(telegramId);
  if (!session || session.action !== 'create') return;

  const commissionType = ctx.callbackQuery.data.split(':')[1];
  session.data.commissionType = commissionType;
  session.step = 'deadline';
  await setTemplateSession(telegramId, session);

  const text = t(lang, 'templates.step7');
  await messageManager.sendNewMessage(ctx, telegramId, text, templateDeadlineKeyboard(lang));
}

/**
 * Handle deadline selection
 */
async function handleDeadlineSelection(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;

  const session = await getTemplateSession(telegramId);
  if (!session || session.action !== 'create') return;

  const hours = parseInt(ctx.callbackQuery.data.split(':')[1]);
  session.data.deadlineHours = hours;

  return await saveTemplate(ctx, session);
}

/**
 * Save template to database
 */
async function saveTemplate(ctx, session) {
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  try {
    const template = new DealTemplate({
      telegramId,
      name: session.data.name,
      creatorRole: session.data.creatorRole,
      productName: session.data.productName,
      description: session.data.description,
      asset: session.data.asset || 'USDT',
      amount: session.data.amount,
      commissionType: session.data.commissionType,
      deadlineHours: session.data.deadlineHours
    });

    await template.save();
    await clearTemplateSession(telegramId);

    const text = t(lang, 'templates.created', {
      name: template.name,
      productName: template.productName,
      amount: template.amount,
      asset: template.asset
    });

    await messageManager.sendNewMessage(ctx, telegramId, text, { inline_keyboard: [] });

    // Return to template details after 2 seconds
    setTimeout(async () => {
      try {
        await showTemplateDetails(ctx, template._id.toString());
      } catch (e) {
        console.error('Error showing template details after create:', e);
      }
    }, 2000);

    return true;
  } catch (error) {
    console.error('Error saving template:', error);
    await clearTemplateSession(telegramId);
    await ctx.answerCbQuery(t(lang, 'templates.save_error'), { show_alert: true });
    return showTemplatesList(ctx);
  }
}

/**
 * Handle back button during creation
 */
async function handleCreateBack(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const lang = ctx.state?.lang || 'ru';

  const session = await getTemplateSession(telegramId);
  if (!session) {
    return showTemplatesList(ctx);
  }

  const stepOrder = ['name', 'role', 'product_name', 'description', 'amount', 'commission', 'deadline'];
  const currentIndex = stepOrder.indexOf(session.step);

  if (currentIndex <= 0) {
    await clearTemplateSession(telegramId);
    return showTemplatesList(ctx);
  }

  session.step = stepOrder[currentIndex - 1];
  await setTemplateSession(telegramId, session);

  // Re-show previous step
  await showCreateStep(ctx, session, lang);
}

/**
 * Show create step based on session
 */
async function showCreateStep(ctx, session, lang = 'ru') {
  const telegramId = ctx.from.id;

  switch (session.step) {
    case 'name':
      await messageManager.sendNewMessage(ctx, telegramId, t(lang, 'templates.step1'), templateInputKeyboard(lang));
      break;

    case 'role':
      await messageManager.sendNewMessage(ctx, telegramId, t(lang, 'templates.step2'), templateRoleKeyboard(lang));
      break;

    case 'product_name':
      await messageManager.sendNewMessage(ctx, telegramId, t(lang, 'templates.step3'), templateInputKeyboard(lang));
      break;

    case 'description':
      await messageManager.sendNewMessage(ctx, telegramId, t(lang, 'templates.step4'), templateInputKeyboard(lang));
      break;

    case 'amount':
      await messageManager.sendNewMessage(ctx, telegramId, t(lang, 'templates.step5'), templateInputKeyboard(lang));
      break;

    case 'commission':
      const commission = Deal.calculateCommission(session.data.amount);
      const commText = t(lang, 'templates.step6', { amount: session.data.amount, commission });
      const commKeyboard = templateCommissionKeyboard(session.data.amount, commission, 'USDT', lang);
      await messageManager.sendNewMessage(ctx, telegramId, commText, commKeyboard);
      break;
  }
}

module.exports = {
  startCreateTemplate,
  saveFromDeal,
  handleCreateInput,
  handleRoleSelection,
  handleCommissionSelection,
  handleDeadlineSelection,
  handleCreateBack,
  saveTemplate
};
