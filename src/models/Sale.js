const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema({
  userId: { type: String, ref: 'User', required: true, index: true },
  brand: { type: String, required: true },
  earning: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  advancePaid: { type: Number, default: 0 },
  advanceStatus: {
    type: String,
    enum: ['none', 'pending', 'paid', 'failed'],
    default: 'none',
    index: true
  },
  reconciled: { type: Boolean, default: false, index: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('Sale', saleSchema);
