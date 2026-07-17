const mongoose = require('mongoose');
const User = require('../models/User');
const Sale = require('../models/Sale');
const Payout = require('../models/Payout');
const userService = require('./userService');

/**
 * Simulates transfer logic
 */
const simulateTransfer = async (payout, forceSuccess = true) => {
  // Simulate network/api delay
  await new Promise((resolve) => setTimeout(resolve, 50));
  return forceSuccess;
};

/**
 * Initiate a user withdrawal
 */
const initiateWithdrawal = async (userId, amount) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Check eligibility (throws error if not eligible)
    await userService.checkWithdrawalEligibility(userId, amount);

    // 2. Deduct amount from user's balance
    const user = await User.findOneAndUpdate(
      { _id: userId, withdrawableBalance: { $gte: amount } },
      { $inc: { withdrawableBalance: -amount } },
      { session, new: true }
    );

    if (!user) {
      throw new Error('Concurrency error: Insufficient balance');
    }

    // 3. Create pending withdrawal payout record
    const payout = new Payout({
      userId,
      amount,
      type: 'withdrawal',
      status: 'pending'
    });
    await payout.save({ session });

    await session.commitTransaction();
    return payout;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Process advance payouts for pending sales
 * Returns summary of processed payouts
 */
const processAdvancePayouts = async (options = {}) => {
  const { forceSuccess = true } = options;
  
  // Find all pending sales eligible for advance payout
  const eligibleSales = await Sale.find({
    status: 'pending',
    advanceStatus: 'none'
  });

  const results = {
    totalEligible: eligibleSales.length,
    successCount: 0,
    failedCount: 0,
    payouts: []
  };

  for (const sale of eligibleSales) {
    // Claim the sale atomically to prevent race conditions
    const claimedSale = await Sale.findOneAndUpdate(
      { _id: sale._id, advanceStatus: 'none' },
      { $set: { advanceStatus: 'pending' } },
      { new: true }
    );

    if (!claimedSale) {
      continue; // Already claimed/processed by another job run
    }

    // Calculate 10% advance payout
    const advanceAmount = Math.round((claimedSale.earning * 0.1) * 100) / 100;

    const payout = new Payout({
      userId: claimedSale.userId,
      amount: advanceAmount,
      type: 'advance',
      status: 'pending',
      saleId: claimedSale._id
    });
    await payout.save();

    // Simulate transfer
    const isTransferred = await simulateTransfer(payout, forceSuccess);

    if (isTransferred) {
      payout.status = 'completed';
      await payout.save();

      claimedSale.advanceStatus = 'paid';
      claimedSale.advancePaid = advanceAmount;
      await claimedSale.save();

      results.successCount++;
    } else {
      payout.status = 'failed';
      await payout.save();

      claimedSale.advanceStatus = 'failed';
      await claimedSale.save();

      results.failedCount++;
    }

    results.payouts.push(payout);
  }

  return results;
};

/**
 * Update payout status (handles failed payout recovery)
 */
const updatePayoutStatus = async (payoutId, newStatus) => {
  const validStatusTransitions = ['completed', 'failed', 'cancelled', 'rejected'];
  if (!validStatusTransitions.includes(newStatus)) {
    throw new Error(`Invalid payout status: ${newStatus}`);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const payout = await Payout.findById(payoutId).session(session);
    if (!payout) {
      throw new Error('Payout not found');
    }

    if (payout.status !== 'pending') {
      throw new Error(`Payout is already in ${payout.status} status and cannot be updated`);
    }

    // Handle failure recovery
    if (['failed', 'cancelled', 'rejected'].includes(newStatus)) {
      if (payout.type === 'withdrawal') {
        // Recovery for withdrawal: credit the money back to the user's withdrawable balance
        await User.findByIdAndUpdate(
          payout.userId,
          { $inc: { withdrawableBalance: payout.amount } },
          { session }
        );
      } else if (payout.type === 'advance') {
        // Recovery for advance payout: reset the corresponding sale's advance status to failed
        // so it can be retried in the next run.
        if (payout.saleId) {
          await Sale.findByIdAndUpdate(
            payout.saleId,
            { $set: { advanceStatus: 'failed', advancePaid: 0 } },
            { session }
          );
        }
      }
    } else if (newStatus === 'completed') {
      if (payout.type === 'advance' && payout.saleId) {
        // Confirm sale's advance details if advance payout succeeds
        await Sale.findByIdAndUpdate(
          payout.saleId,
          { $set: { advanceStatus: 'paid', advancePaid: payout.amount } },
          { session }
        );
      }
    }

    payout.status = newStatus;
    await payout.save({ session });

    await session.commitTransaction();
    return payout;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  initiateWithdrawal,
  processAdvancePayouts,
  updatePayoutStatus
};
