const mongoose = require('mongoose');

/**
 * Service Status Model
 * Stores heartbeat and status information for all system services
 * Used by adminAlertService to generate accurate daily reports
 *
 * Two types of records:
 * 1. Services (DepositMonitor, DeadlineMonitor, etc.) - long-running processes with heartbeat
 * 2. Operations (deal_created, payout_completed, etc.) - one-time events tracking
 */
const serviceStatusSchema = new mongoose.Schema({
  serviceName: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  // For services: is the service running
  // For operations: always true (means "this operation type exists")
  isRunning: {
    type: Boolean,
    default: false
  },
  // For services: last heartbeat time
  // For operations: last time this operation succeeded
  lastHeartbeat: {
    type: Date,
    default: null
  },
  lastError: {
    type: String,
    default: null
  },
  lastErrorAt: {
    type: Date,
    default: null
  },
  // Service/operation-specific stats
  stats: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // When service was started (for services only)
  startedAt: {
    type: Date,
    default: null
  },
  // Type: 'service' or 'operation'
  type: {
    type: String,
    enum: ['service', 'operation'],
    default: 'service'
  },
  // For operations: count of successful operations
  successCount: {
    type: Number,
    default: 0
  },
  // For operations: count of failed operations
  failCount: {
    type: Number,
    default: 0
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Static method to update service heartbeat
serviceStatusSchema.statics.heartbeat = async function(serviceName, stats = {}) {
  return this.findOneAndUpdate(
    { serviceName },
    {
      $set: {
        isRunning: true,
        lastHeartbeat: new Date(),
        stats,
        updatedAt: new Date()
      }
    },
    { upsert: true, new: true }
  );
};

// Static method to mark service as started
serviceStatusSchema.statics.markStarted = async function(serviceName) {
  return this.findOneAndUpdate(
    { serviceName },
    {
      $set: {
        isRunning: true,
        startedAt: new Date(),
        lastHeartbeat: new Date(),
        lastError: null,
        lastErrorAt: null,
        updatedAt: new Date()
      }
    },
    { upsert: true, new: true }
  );
};

// Static method to mark service as stopped
serviceStatusSchema.statics.markStopped = async function(serviceName) {
  return this.findOneAndUpdate(
    { serviceName },
    {
      $set: {
        isRunning: false,
        updatedAt: new Date()
      }
    },
    { upsert: true, new: true }
  );
};

// Static method to log service error
serviceStatusSchema.statics.logError = async function(serviceName, error) {
  return this.findOneAndUpdate(
    { serviceName },
    {
      $set: {
        lastError: error.message || String(error),
        lastErrorAt: new Date(),
        updatedAt: new Date()
      }
    },
    { upsert: true, new: true }
  );
};

// ========== OPERATION TRACKING METHODS ==========

/**
 * Track a successful operation
 * @param {string} operationName - e.g., 'deal_created', 'payout_completed', 'deposit_received'
 * @param {Object} details - Additional details about the operation
 */
serviceStatusSchema.statics.trackSuccess = async function(operationName, details = {}) {
  const now = new Date();
  return this.findOneAndUpdate(
    { serviceName: operationName },
    {
      $set: {
        type: 'operation',
        isRunning: true,
        lastHeartbeat: now,
        stats: { ...details, lastSuccessAt: now },
        updatedAt: now
      },
      $inc: { successCount: 1 }
    },
    { upsert: true, new: true }
  );
};

/**
 * Track a failed operation
 * @param {string} operationName - e.g., 'deal_created', 'payout_completed'
 * @param {Error|string} error - The error that occurred
 */
serviceStatusSchema.statics.trackFailure = async function(operationName, error) {
  return this.findOneAndUpdate(
    { serviceName: operationName },
    {
      $set: {
        type: 'operation',
        isRunning: true,
        lastError: error.message || String(error),
        lastErrorAt: new Date(),
        updatedAt: new Date()
      },
      $inc: { failCount: 1 }
    },
    { upsert: true, new: true }
  );
};

/**
 * Get operation statistics for reporting
 */
serviceStatusSchema.statics.getOperationsStatus = async function() {
  const operations = await this.find({ type: 'operation' }).lean();
  const now = new Date();
  const ONE_HOUR = 60 * 60 * 1000;
  const ONE_DAY = 24 * ONE_HOUR;

  return operations.map(op => {
    const lastSuccessAge = op.lastHeartbeat ? now - new Date(op.lastHeartbeat) : Infinity;
    const lastErrorAge = op.lastErrorAt ? now - new Date(op.lastErrorAt) : Infinity;

    return {
      ...op,
      // Recent = within last hour
      hasRecentSuccess: lastSuccessAge < ONE_HOUR,
      // Active today = within last 24 hours
      activeToday: lastSuccessAge < ONE_DAY,
      // Has recent error = error within last hour and after last success
      hasRecentError: lastErrorAge < ONE_HOUR && lastErrorAge < lastSuccessAge,
      lastSuccessAge,
      lastErrorAge
    };
  });
};

// Static method to get all services status
serviceStatusSchema.statics.getAllStatus = async function() {
  const services = await this.find().lean();
  const now = new Date();
  const HEARTBEAT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  return services.map(service => {
    // Check if heartbeat is stale (more than 5 minutes old)
    const isStale = service.lastHeartbeat &&
      (now - new Date(service.lastHeartbeat)) > HEARTBEAT_TIMEOUT;

    return {
      ...service,
      isHealthy: service.isRunning && !isStale,
      isStale
    };
  });
};

// Static method to get single service status
serviceStatusSchema.statics.getStatus = async function(serviceName) {
  const service = await this.findOne({ serviceName }).lean();
  if (!service) return null;

  const now = new Date();
  const HEARTBEAT_TIMEOUT = 5 * 60 * 1000;
  const isStale = service.lastHeartbeat &&
    (now - new Date(service.lastHeartbeat)) > HEARTBEAT_TIMEOUT;

  return {
    ...service,
    isHealthy: service.isRunning && !isStale,
    isStale
  };
};

module.exports = mongoose.model('ServiceStatus', serviceStatusSchema);
