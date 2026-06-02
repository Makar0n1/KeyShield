/**
 * Manager model — a delegated arbiter who can resolve disputes via the
 * separate /manager cabinet. They never see usernames or telegramIds
 * of the parties; everything is shown as "Покупатель" / "Продавец".
 *
 * Created either via:
 *   - scripts/create-manager.js (bootstrap)
 *   - admin UI at /admin/managers
 *
 * Password is hashed with bcrypt and never returned by default queries.
 */

const mongoose = require('mongoose');

const managerSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    minlength: 3,
    maxlength: 32,
    index: true
  },
  passwordHash: {
    type: String,
    required: true,
    select: false
  },
  displayName: {
    type: String,
    default: ''
  },
  active: {
    type: Boolean,
    default: true,
    index: true
  },
  createdBy: {
    // admin username who created this manager — for audit
    type: String,
    default: null
  },
  lastLoginAt: {
    type: Date,
    default: null
  },
  // Audit counter — useful for owner to see who's actively working
  disputesResolved: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Manager', managerSchema);
