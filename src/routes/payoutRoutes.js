const express = require('express');
const router = express.Router();
const Payout = require('../models/Payout');
const payoutService = require('../services/payoutService');

/**
 * GET /api/payouts
 * Lists all payouts, optionally filtered by userId or type
 */
router.get('/', async (req, res) => {
  try {
    const { userId, type } = req.query;
    const filter = {};
    if (userId) filter.userId = userId;
    if (type) filter.type = type;

    const payouts = await Payout.find(filter).sort({ createdAt: -1 });
    res.json(payouts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/payouts/:payoutId/status
 * Updates the status of a payout (triggers failed payout recovery logic)
 */
router.post('/:payoutId/status', async (req, res) => {
  try {
    const { payoutId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const updatedPayout = await payoutService.updatePayoutStatus(payoutId, status);
    res.json({
      message: `Payout status updated to ${status} successfully`,
      payout: updatedPayout
    });
  } catch (error) {
    if (
      error.message.includes('not found') ||
      error.message.includes('already') ||
      error.message.includes('Invalid')
    ) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
