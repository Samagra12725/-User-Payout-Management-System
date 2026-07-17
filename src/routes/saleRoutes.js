const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const User = require('../models/User');
const Payout = require('../models/Payout');
const reconciliationService = require('../services/reconciliationService');
const payoutService = require('../services/payoutService');

/**
 * GET /api/sales
 * List all sales
 */
router.get('/', async (req, res) => {
  try {
    const sales = await Sale.find().sort({ createdAt: -1 });
    res.json(sales);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sales
 * Creates a new sale (auto-creates User with 0 balance if not exists)
 */
router.post('/', async (req, res) => {
  try {
    const { userId, brand, earning, status } = req.body;

    if (!userId || !brand || earning === undefined || isNaN(earning) || earning <= 0) {
      return res.status(400).json({ error: 'userId, brand, and a positive earning are required' });
    }

    // Auto-create User if they don't exist
    let user = await User.findById(userId);
    if (!user) {
      await User.create({ _id: userId, withdrawableBalance: 0 });
    }

    const sale = new Sale({
      userId,
      brand,
      earning,
      status: status || 'pending'
    });

    await sale.save();
    res.status(201).json(sale);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sales/reconcile/:saleId
 * Reconciles a sale to approved or rejected status
 */
router.post('/reconcile/:saleId', async (req, res) => {
  try {
    const { saleId } = req.params;
    const { status } = req.body;

    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status is required and must be approved or rejected' });
    }

    const result = await reconciliationService.reconcileSale(saleId, status);
    res.json({
      message: `Sale ${saleId} reconciled to ${status} status successfully`,
      ...result
    });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('already')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sales/advance-job
 * Runs the advance payout job to process 10% payouts for pending sales
 */
router.post('/advance-job', async (req, res) => {
  try {
    const forceSuccess = req.body.forceSuccess !== false; // defaults to true
    const result = await payoutService.processAdvancePayouts({ forceSuccess });
    res.json({
      message: 'Advance payout job execution completed',
      result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sales/seed
 * Helper route to seed database with reference data from SDE Intern Assignment PDF
 */
router.post('/seed', async (req, res) => {
  try {
    // Clean database collections
    await Sale.deleteMany({});
    await Payout.deleteMany({});
    
    // Seed john_doe user
    await User.findByIdAndDelete('john_doe');
    const user = await User.create({ _id: 'john_doe', withdrawableBalance: 0 });

    const sampleSales = [
      { userId: 'john_doe', brand: 'brand_1', status: 'pending', earning: 40 },
      { userId: 'john_doe', brand: 'brand_1', status: 'pending', earning: 40 },
      { userId: 'john_doe', brand: 'brand_1', status: 'pending', earning: 40 }
    ];

    const insertedSales = await Sale.insertMany(sampleSales);

    res.status(201).json({
      message: 'Database seeded successfully with assignment reference data',
      user,
      sales: insertedSales
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
