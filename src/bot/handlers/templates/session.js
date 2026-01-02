/**
 * Template Session Management
 */

const Session = require('../../../models/Session');

const SESSION_TYPE = 'deal_template';
const SESSION_TTL = 1; // 1 hour

async function hasTemplateSession(telegramId) {
  const session = await Session.getSession(telegramId, SESSION_TYPE);
  return !!session;
}

async function getTemplateSession(telegramId) {
  return await Session.getSession(telegramId, SESSION_TYPE);
}

async function setTemplateSession(telegramId, sessionData) {
  await Session.setSession(telegramId, SESSION_TYPE, sessionData, SESSION_TTL);
}

async function clearTemplateSession(telegramId) {
  await Session.deleteSession(telegramId, SESSION_TYPE);
}

module.exports = {
  hasTemplateSession,
  getTemplateSession,
  setTemplateSession,
  clearTemplateSession,
  SESSION_TYPE
};
