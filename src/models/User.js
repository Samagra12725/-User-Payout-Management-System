const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // userId (e.g. 'john_doe')
  withdrawableBalance: { type: Number, default: 0 },
  lastWithdrawalAt: { type: Date, default: null }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual getter to return _id as userId
userSchema.virtual('userId').get(function() {
  return this._id;
});

module.exports = mongoose.model('User', userSchema);
