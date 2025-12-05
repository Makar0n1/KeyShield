const mongoose = require('mongoose');

const exportLogSchema = new mongoose.Schema({
  // Export type
  exportType: {
    type: String,
    enum: ['single_deal', 'all_user_deals'],
    required: true
  },

  // Target user info
  targetUserId: {
    type: Number,
    required: true,
    index: true
  },
  targetUsername: {
    type: String,
    default: null
  },

  // Deal info (for single deal exports)
  dealId: {
    type: String,
    default: null
  },
  dealsCount: {
    type: Number,
    default: 1
  },

  // File info
  fileName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    default: 0
  },

  // Admin who created the export
  exportedBy: {
    type: String,
    default: 'admin'
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Expiration date (1 year from creation)
  expiresAt: {
    type: Date,
    default: () => {
      const oneYear = new Date();
      oneYear.setFullYear(oneYear.getFullYear() + 1);
      return oneYear;
    },
    index: true
  }
});

// TTL index for automatic cleanup after 1 year
exportLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Static method to cleanup expired files
exportLogSchema.statics.cleanupExpiredExports = async function() {
  const fs = require('fs').promises;
  const path = require('path');

  const expiredExports = await this.find({
    expiresAt: { $lt: new Date() }
  });

  let deletedCount = 0;
  for (const exportLog of expiredExports) {
    try {
      // Delete the file
      await fs.unlink(exportLog.filePath);
      deletedCount++;
    } catch (err) {
      // File might already be deleted
      console.log(`Could not delete file ${exportLog.filePath}: ${err.message}`);
    }
  }

  // MongoDB TTL will automatically delete the documents
  console.log(`Cleaned up ${deletedCount} expired export files`);
  return deletedCount;
};

module.exports = mongoose.model('ExportLog', exportLogSchema);
