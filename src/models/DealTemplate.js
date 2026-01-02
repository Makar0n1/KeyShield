/**
 * DealTemplate Model
 *
 * Stores deal templates for quick deal creation.
 * Max 5 templates per user.
 */

const mongoose = require('mongoose');

const MAX_TEMPLATES = 5;

const dealTemplateSchema = new mongoose.Schema({
  // Owner
  telegramId: {
    type: Number,
    required: true,
    index: true
  },

  // Template metadata
  name: {
    type: String,
    required: true,
    maxlength: 50
  },

  // Deal data
  creatorRole: {
    type: String,
    enum: ['buyer', 'seller'],
    required: true
  },
  productName: {
    type: String,
    required: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    maxlength: 5000
  },
  asset: {
    type: String,
    enum: ['USDT', 'TRX'],
    default: 'USDT'
  },
  amount: {
    type: Number,
    required: true,
    min: 50
  },
  commissionType: {
    type: String,
    enum: ['buyer', 'seller', 'split'],
    required: true
  },
  deadlineHours: {
    type: Number,
    required: true
  },

  // Usage stats
  usageCount: {
    type: Number,
    default: 0
  },
  lastUsedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
dealTemplateSchema.index({ telegramId: 1, createdAt: -1 });
dealTemplateSchema.index({ telegramId: 1, lastUsedAt: -1 });

// Static: Check if user can create more templates
dealTemplateSchema.statics.canCreateTemplate = async function(telegramId) {
  const count = await this.countDocuments({ telegramId });
  return count < MAX_TEMPLATES;
};

// Static: Get template count for user
dealTemplateSchema.statics.getTemplateCount = async function(telegramId) {
  return await this.countDocuments({ telegramId });
};

// Static: Get all user templates sorted by usage
dealTemplateSchema.statics.getUserTemplates = async function(telegramId) {
  return await this.find({ telegramId })
    .sort({ lastUsedAt: -1, createdAt: -1 })
    .lean();
};

// Static: Increment usage count
dealTemplateSchema.statics.incrementUsage = async function(templateId) {
  return await this.findByIdAndUpdate(templateId, {
    $inc: { usageCount: 1 },
    $set: { lastUsedAt: new Date() }
  });
};

// Export MAX_TEMPLATES constant
dealTemplateSchema.statics.MAX_TEMPLATES = MAX_TEMPLATES;

const DealTemplate = mongoose.model('DealTemplate', dealTemplateSchema);

module.exports = DealTemplate;
