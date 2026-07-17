const User = require('../models/User');
const Payout = require('../models/Payout');

/**
 * Get user by ID. Creates the user with 0 balance if not found.
 */
const getOrCreateUser = async (userId) => {
  let user = await User.findById(userId);
  if (!user) {
    user = await User.create({ _id: userId, withdrawableBalance: 0 });
  }
  return user;
};

/**
 * Check if user is eligible to withdraw
 */
const checkWithdrawalEligibility = async (userId, amount) => {
  const user = await getOrCreateUser(userId);

  if (user.withdrawableBalance < amount) {
    throw new Error('Insufficient withdrawable balance');
  }

  // Check for any withdrawal in the last 24 hours that is pending or completed
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentWithdrawal = await Payout.findOne({
    userId,
    type: 'withdrawal',
    status: { $in: ['pending', 'completed'] },
    createdAt: { $gte: oneDayAgo }
  });

  if (recentWithdrawal) {
    throw new Error('Withdrawal restriction: Only one withdrawal is allowed every 24 hours');
  }

  return user;
};

module.exports = {
  getOrCreateUser,
  checkWithdrawalEligibility
};
