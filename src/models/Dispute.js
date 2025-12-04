const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  userId: {
    type: Number,
    required: true
  },
  text: {
    type: String,
    required: true,
    maxlength: 5000
  },
  media: [{
    type: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const disputeSchema = new mongoose.Schema({
  dealId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Deal',
    required: true,
    unique: true,
    index: true
  },
  openedBy: {
    type: Number,
    required: true,
    index: true
  },
  reasonText: {
    type: String,
    required: true,
    maxlength: 5000
  },
  media: [{
    type: String
  }],
  comments: [commentSchema],
  status: {
    type: String,
    enum: ['open', 'in_review', 'resolved'],
    default: 'open',
    index: true
  },
  decision: {
    type: String,
    enum: ['refund_buyer', 'release_seller', null],
    default: null
  },
  arbiterId: {
    type: Number,
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
disputeSchema.index({ dealId: 1 });
disputeSchema.index({ status: 1, createdAt: -1 });

// Method to add comment (max 100 comments per dispute)
disputeSchema.methods.addComment = async function(userId, text, media = []) {
  const MAX_COMMENTS = 100;

  if (this.comments.length >= MAX_COMMENTS) {
    throw new Error(`Достигнут лимит комментариев (${MAX_COMMENTS}). Для продолжения свяжитесь с арбитром.`);
  }

  this.comments.push({
    userId,
    text,
    media
  });
  await this.save();
};

// Method to resolve dispute
disputeSchema.methods.resolve = async function(decision, arbiterId) {
  this.status = 'resolved';
  this.decision = decision;
  this.arbiterId = arbiterId;
  this.resolvedAt = new Date();
  await this.save();
};

module.exports = mongoose.model('Dispute', disputeSchema);
