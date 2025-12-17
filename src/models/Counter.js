const mongoose = require('mongoose');

/**
 * Counter model for atomic ID generation
 * Used to generate unique Deal IDs without race conditions
 */
const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  value: {
    type: Number,
    default: 0
  }
});

/**
 * Atomically increment and return next value
 * @param {string} counterId - Counter identifier (e.g., 'deal_id')
 * @returns {Promise<number>} Next value
 */
counterSchema.statics.getNextValue = async function(counterId) {
  const counter = await this.findByIdAndUpdate(
    counterId,
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return counter.value;
};

module.exports = mongoose.model('Counter', counterSchema);
