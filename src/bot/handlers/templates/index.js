/**
 * Templates Handlers - Entry Point
 *
 * Re-exports all template-related handlers.
 */

// Session management
const {
  hasTemplateSession,
  getTemplateSession,
  setTemplateSession,
  clearTemplateSession,
  SESSION_TYPE
} = require('./session');

// List & View
const {
  showTemplatesList,
  showTemplateDetails,
  formatDeadline,
  formatCommission
} = require('./list');

// Create
const {
  startCreateTemplate,
  saveFromDeal,
  handleCreateInput,
  handleRoleSelection,
  handleCommissionSelection,
  handleDeadlineSelection,
  handleCreateBack,
  saveTemplate
} = require('./create');

// Use
const {
  startUseTemplate,
  handleCounterpartyInput,
  handleWalletSelection,
  handleWalletInput,
  createDealFromTemplate
} = require('./use');

// Edit
const {
  startEditField,
  handleEditInput,
  handleEditDeadline
} = require('./edit');

// Delete
const {
  showDeleteConfirmation,
  confirmDelete
} = require('./delete');

module.exports = {
  // Session
  hasTemplateSession,
  getTemplateSession,
  setTemplateSession,
  clearTemplateSession,
  SESSION_TYPE,

  // List & View
  showTemplatesList,
  showTemplateDetails,
  formatDeadline,
  formatCommission,

  // Create
  startCreateTemplate,
  saveFromDeal,
  handleCreateInput,
  handleRoleSelection,
  handleCommissionSelection,
  handleDeadlineSelection,
  handleCreateBack,
  saveTemplate,

  // Use
  startUseTemplate,
  handleCounterpartyInput,
  handleWalletSelection,
  handleWalletInput,
  createDealFromTemplate,

  // Edit
  startEditField,
  handleEditInput,
  handleEditDeadline,

  // Delete
  showDeleteConfirmation,
  confirmDelete
};
