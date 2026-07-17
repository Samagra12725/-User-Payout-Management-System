const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../src/app');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Sale = require('../src/models/Sale');
const Payout = require('../src/models/Payout');

// Set NODE_ENV to test to connect to test DB
process.env.NODE_ENV = 'test';

describe('User Payout Management System Tests', () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear collections before each test
    await User.deleteMany({});
    await Sale.deleteMany({});
    await Payout.deleteMany({});
  });

  describe('Question 1: User Payout & Reconciliation', () => {
    it('should seed data, process advance payouts, reconcile sales, and verify final balances according to PDF example', async () => {
      // 1. Seed the database with the reference data
      const seedResponse = await request(app)
        .post('/api/sales/seed')
        .expect(201);

      expect(seedResponse.body.sales).toHaveLength(3);
      expect(seedResponse.body.sales.every(s => s.status === 'pending' && s.earning === 40)).toBe(true);

      // Verify the user john_doe has 0 balance initially
      const userRes1 = await request(app)
        .get('/api/users/john_doe/balance')
        .expect(200);
      expect(userRes1.body.withdrawableBalance).toBe(0);

      // 2. Trigger the advance payout job
      const advanceJobRes = await request(app)
        .post('/api/sales/advance-job')
        .send({ forceSuccess: true })
        .expect(200);

      expect(advanceJobRes.body.result.successCount).toBe(3);
      expect(advanceJobRes.body.result.payouts).toHaveLength(3);
      
      // Each payout should be 10% of 40 = 4
      advanceJobRes.body.result.payouts.forEach(p => {
        expect(p.amount).toBe(4);
        expect(p.type).toBe('advance');
        expect(p.status).toBe('completed');
      });

      // Verify sales have advance details updated
      const salesAfterAdvance = await Sale.find({ userId: 'john_doe' });
      salesAfterAdvance.forEach(s => {
        expect(s.advanceStatus).toBe('paid');
        expect(s.advancePaid).toBe(4);
      });

      // Advance job runs again, but must not pay twice
      const advanceJobRes2 = await request(app)
        .post('/api/sales/advance-job')
        .send({ forceSuccess: true })
        .expect(200);
      
      expect(advanceJobRes2.body.result.successCount).toBe(0); // 0 processed

      // 3. Reconcile sales as per the PDF case:
      // - Sale 1: Rejected (earning 40, advance paid 4, adjustment = -4)
      // - Sale 2: Approved (earning 40, advance paid 4, adjustment = 36)
      // - Sale 3: Approved (earning 40, advance paid 4, adjustment = 36)
      // Sorting sales so we reconcile them consistently
      const sales = await Sale.find({ userId: 'john_doe' }).sort({ _id: 1 });
      
      // Reconcile Sale 1 (Rejected)
      const recon1 = await request(app)
        .post(`/api/sales/reconcile/${sales[0]._id}`)
        .send({ status: 'rejected' })
        .expect(200);
      expect(recon1.body.adjustment).toBe(-4);
      expect(recon1.body.newBalance).toBe(-4);

      // Reconcile Sale 2 (Approved)
      const recon2 = await request(app)
        .post(`/api/sales/reconcile/${sales[1]._id}`)
        .send({ status: 'approved' })
        .expect(200);
      expect(recon2.body.adjustment).toBe(36);
      expect(recon2.body.newBalance).toBe(32); // -4 + 36 = 32

      // Reconcile Sale 3 (Approved)
      const recon3 = await request(app)
        .post(`/api/sales/reconcile/${sales[2]._id}`)
        .send({ status: 'approved' })
        .expect(200);
      expect(recon3.body.adjustment).toBe(36);
      expect(recon3.body.newBalance).toBe(68); // 32 + 36 = 68

      // Final balance validation for john_doe
      const userResFinal = await request(app)
        .get('/api/users/john_doe/balance')
        .expect(200);
      expect(userResFinal.body.withdrawableBalance).toBe(68); // Matches total final payout: 68
    });
  });

  describe('Withdrawal Restrictions', () => {
    it('should restrict user to only one withdrawal every 24 hours', async () => {
      // Setup user with balance
      await User.create({ _id: 'withdrawal_user', withdrawableBalance: 100 });

      // First withdrawal request
      const withdraw1 = await request(app)
        .post('/api/users/withdrawal_user/withdraw')
        .send({ amount: 30 })
        .expect(201);
      
      expect(withdraw1.body.payout.amount).toBe(30);
      expect(withdraw1.body.payout.status).toBe('pending');

      // Balance check: should be 100 - 30 = 70
      const balanceRes1 = await request(app)
        .get('/api/users/withdrawal_user/balance')
        .expect(200);
      expect(balanceRes1.body.withdrawableBalance).toBe(70);

      // Second withdrawal request within 24 hours (should be blocked)
      const withdraw2 = await request(app)
        .post('/api/users/withdrawal_user/withdraw')
        .send({ amount: 10 })
        .expect(400);

      expect(withdraw2.body.error).toContain('restriction');
    });
  });

  describe('Question 2: Failed Payout Recovery', () => {
    it('should credit back failed withdrawal and allow initiating another withdrawal', async () => {
      // Setup user with balance
      await User.create({ _id: 'recovery_user', withdrawableBalance: 80 });

      // Initiate withdrawal
      const withdraw = await request(app)
        .post('/api/users/recovery_user/withdraw')
        .send({ amount: 50 })
        .expect(201);
      
      const payoutId = withdraw.body.payout._id;

      // Balance check: 80 - 50 = 30
      let balanceRes = await request(app)
        .get('/api/users/recovery_user/balance')
        .expect(200);
      expect(balanceRes.body.withdrawableBalance).toBe(30);

      // Try another withdrawal: should be blocked
      await request(app)
        .post('/api/users/recovery_user/withdraw')
        .send({ amount: 10 })
        .expect(400);

      // Simulate webhook / callback indicating payout failed
      const statusUpdate = await request(app)
        .post(`/api/payouts/${payoutId}/status`)
        .send({ status: 'failed' })
        .expect(200);
      
      expect(statusUpdate.body.payout.status).toBe('failed');

      // Balance check: should be credited back to 80
      balanceRes = await request(app)
        .get('/api/users/recovery_user/balance')
        .expect(200);
      expect(balanceRes.body.withdrawableBalance).toBe(80);

      // Initiating another withdrawal should now be allowed (since the failed payout does not block)
      const newWithdraw = await request(app)
        .post('/api/users/recovery_user/withdraw')
        .send({ amount: 50 })
        .expect(201);
      
      expect(newWithdraw.body.payout.amount).toBe(50);
      expect(newWithdraw.body.payout.status).toBe('pending');

      // Balance check: should be 80 - 50 = 30
      balanceRes = await request(app)
        .get('/api/users/recovery_user/balance')
        .expect(200);
      expect(balanceRes.body.withdrawableBalance).toBe(30);
    });
  });
});
