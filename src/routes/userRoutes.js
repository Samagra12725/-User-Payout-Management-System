const express = require('express');
const router = express.Router();
const userService = require('../services/userService');
const payoutService = require('../services/payoutService');

/**
 * GET /api/users/:userId/balance
 * Returns the user's withdrawable balance and last withdrawal date
 */
router.get('/:userId/balance', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await userService.getOrCreateUser(userId);
    res.json({
      userId: user._id,
      withdrawableBalance: user.withdrawableBalance,
      lastWithdrawalAt: user.lastWithdrawalAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/users/:userId/withdraw
 * Initiates a withdrawal request for a user
 */
router.post('/:userId/withdraw', async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Invalid withdrawal amount' });
    }

    const payout = await payoutService.initiateWithdrawal(userId, Number(amount));
    res.status(201).json({
      message: 'Withdrawal initiated successfully',
      payout
    });
  } catch (error) {
    if (
      error.message.includes('Insufficient') ||
      error.message.includes('restriction')
    ) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
