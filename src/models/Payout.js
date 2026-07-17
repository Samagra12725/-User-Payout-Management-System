const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  userId: { type: String, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true },
  type: {
    type: String,
    enum: ['advance', 'withdrawal'],
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled', 'rejected'],
    default: 'pending',
    index: true
  },
  saleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale',
    default: null,
    index: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Payout', payoutSchema);
