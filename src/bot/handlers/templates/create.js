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

/**
 * Start creating template manually
 */
async function startCreateTemplate(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;

  // Check limit
  const canCreate = await DealTemplate.canCreateTemplate(telegramId);
  if (!canCreate) {
    await ctx.answerCbQuery('❌ Достигнут лимит (5) шаблонов', { show_alert: true });
    return showTemplatesList(ctx);
  }

  // Initialize session
  await setTemplateSession(telegramId, {
    action: 'create',
    step: 'name',
    data: {}
  });

  const text = `📑 *Создание шаблона*

*Шаг 1 из 7: Название*

Введите короткое название для шаблона:
_(например: «Дизайн логотипа», «Консультация»)_`;

  const keyboard = templateInputKeyboard();
  await messageManager.sendNewMessage(ctx, telegramId, text, keyboard);
}

/**
 * Save from completed deal
 */
async function saveFromDeal(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;

  // Get dealId from callback
  const dealId = ctx.callbackQuery.data.split(':')[2];

  // Check limit
  const canCreate = await DealTemplate.canCreateTemplate(telegramId);
  if (!canCreate) {
    await ctx.answerCbQuery('❌ Достигнут лимит (5) шаблонов', { show_alert: true });
    return;
  }

  const deal = await Deal.findOne({ dealId });
  if (!deal) {
    await ctx.answerCbQuery('❌ Сделка не найдена', { show_alert: true });
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

  const text = `💾 *Сохранение шаблона*

Сделка: \`${dealId}\`
📦 ${deal.productName}
💰 ${deal.amount} ${deal.asset}

*Введите название для шаблона:*
_(например: «Дизайн логотипа»)_`;

  const keyboard = templateInputKeyboard();
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

  if (text.length < 2 || text.length > 50) {
    const errorText = `❌ Название должно быть от 2 до 50 символов.

Введите название шаблона:`;
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateInputKeyboard());
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

  const screenText = `📑 *Создание шаблона*

*Шаг 2 из 7: Ваша роль*

Выберите вашу роль в сделках по этому шаблону:`;

  await messageManager.sendNewMessage(ctx, telegramId, screenText, templateRoleKeyboard());
  return true;
}

/**
 * Handle role selection
 */
async function handleRoleSelection(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;

  const session = await getTemplateSession(telegramId);
  if (!session || session.action !== 'create') return;

  const role = ctx.callbackQuery.data.split(':')[1];
  session.data.creatorRole = role;
  session.step = 'product_name';
  await setTemplateSession(telegramId, session);

  const text = `📑 *Создание шаблона*

*Шаг 3 из 7: Название товара/услуги*

Введите название товара или услуги:
_(от 5 до 200 символов)_`;

  await messageManager.sendNewMessage(ctx, telegramId, text, templateInputKeyboard());
}

/**
 * Handle product name input
 */
async function handleProductNameInput(ctx, session, text) {
  const telegramId = ctx.from.id;

  if (text.length < 5 || text.length > 200) {
    const errorText = `❌ Название должно быть от 5 до 200 символов.

Введите название товара/услуги:`;
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateInputKeyboard());
    return true;
  }

  session.data.productName = text;
  session.step = 'description';
  await setTemplateSession(telegramId, session);

  const screenText = `📑 *Создание шаблона*

*Шаг 4 из 7: Описание*

Введите описание работы:
_(от 20 до 5000 символов)_`;

  await messageManager.sendNewMessage(ctx, telegramId, screenText, templateInputKeyboard());
  return true;
}

/**
 * Handle description input
 */
async function handleDescriptionInput(ctx, session, text) {
  const telegramId = ctx.from.id;

  if (text.length < 20 || text.length > 5000) {
    const errorText = `❌ Описание должно быть от 20 до 5000 символов.

Введите описание:`;
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateInputKeyboard());
    return true;
  }

  session.data.description = text;
  session.data.asset = 'USDT';
  session.step = 'amount';
  await setTemplateSession(telegramId, session);

  const screenText = `📑 *Создание шаблона*

*Шаг 5 из 7: Сумма*

Введите сумму сделки в USDT:
_(минимум 50 USDT)_`;

  await messageManager.sendNewMessage(ctx, telegramId, screenText, templateInputKeyboard());
  return true;
}

/**
 * Handle amount input
 */
async function handleAmountInput(ctx, session, text) {
  const telegramId = ctx.from.id;
  const amount = parseFloat(text.replace(',', '.'));

  if (isNaN(amount) || amount < 50) {
    const errorText = `❌ Неверная сумма. Минимум: 50 USDT.

Введите сумму:`;
    await messageManager.sendNewMessage(ctx, telegramId, errorText, templateInputKeyboard());
    return true;
  }

  session.data.amount = amount;
  session.step = 'commission';
  await setTemplateSession(telegramId, session);

  const commission = Deal.calculateCommission(amount);

  const screenText = `📑 *Создание шаблона*

*Шаг 6 из 7: Комиссия*

💰 Сумма: ${amount} USDT
💸 Комиссия: ${commission} USDT

Кто оплачивает комиссию?`;

  const keyboard = templateCommissionKeyboard(amount, commission, 'USDT');
  await messageManager.sendNewMessage(ctx, telegramId, screenText, keyboard);
  return true;
}

/**
 * Handle commission selection
 */
async function handleCommissionSelection(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;

  const session = await getTemplateSession(telegramId);
  if (!session || session.action !== 'create') return;

  const commissionType = ctx.callbackQuery.data.split(':')[1];
  session.data.commissionType = commissionType;
  session.step = 'deadline';
  await setTemplateSession(telegramId, session);

  const text = `📑 *Создание шаблона*

*Шаг 7 из 7: Срок выполнения*

Выберите стандартный срок выполнения:`;

  await messageManager.sendNewMessage(ctx, telegramId, text, templateDeadlineKeyboard());
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

    const text = `✅ *Шаблон создан!*

📑 *${template.name}*
📦 ${template.productName}
💰 ${template.amount} ${template.asset}

Теперь вы можете создавать сделки в 2 клика!`;

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
    await ctx.answerCbQuery('❌ Ошибка сохранения', { show_alert: true });
    return showTemplatesList(ctx);
  }
}

/**
 * Handle back button during creation
 */
async function handleCreateBack(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;

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
  await showCreateStep(ctx, session);
}

/**
 * Show create step based on session
 */
async function showCreateStep(ctx, session) {
  const telegramId = ctx.from.id;

  switch (session.step) {
    case 'name':
      const nameText = `📑 *Создание шаблона*

*Шаг 1 из 7: Название*

Введите короткое название для шаблона:`;
      await messageManager.sendNewMessage(ctx, telegramId, nameText, templateInputKeyboard());
      break;

    case 'role':
      const roleText = `📑 *Создание шаблона*

*Шаг 2 из 7: Ваша роль*

Выберите вашу роль в сделках по этому шаблону:`;
      await messageManager.sendNewMessage(ctx, telegramId, roleText, templateRoleKeyboard());
      break;

    case 'product_name':
      const productText = `📑 *Создание шаблона*

*Шаг 3 из 7: Название товара/услуги*

Введите название товара или услуги:`;
      await messageManager.sendNewMessage(ctx, telegramId, productText, templateInputKeyboard());
      break;

    case 'description':
      const descText = `📑 *Создание шаблона*

*Шаг 4 из 7: Описание*

Введите описание работы:`;
      await messageManager.sendNewMessage(ctx, telegramId, descText, templateInputKeyboard());
      break;

    case 'amount':
      const amountText = `📑 *Создание шаблона*

*Шаг 5 из 7: Сумма*

Введите сумму сделки в USDT:`;
      await messageManager.sendNewMessage(ctx, telegramId, amountText, templateInputKeyboard());
      break;

    case 'commission':
      const commission = Deal.calculateCommission(session.data.amount);
      const commText = `📑 *Создание шаблона*

*Шаг 6 из 7: Комиссия*

💰 Сумма: ${session.data.amount} USDT
💸 Комиссия: ${commission} USDT

Кто оплачивает комиссию?`;
      const commKeyboard = templateCommissionKeyboard(session.data.amount, commission, 'USDT');
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
