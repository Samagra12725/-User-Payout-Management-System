const mongoose = require('mongoose');
const Sale = require('../models/Sale');
const User = require('../models/User');
const { getOrCreateUser } = require('./userService');

/**
 * Reconcile a single sale
 */
const reconcileSale = async (saleId, status) => {
  if (!['approved', 'rejected'].includes(status)) {
    throw new Error('Invalid reconciliation status. Must be approved or rejected');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Fetch sale
    const sale = await Sale.findById(saleId).session(session);
    if (!sale) {
      throw new Error('Sale not found');
    }

    if (sale.reconciled) {
      throw new Error('Sale has already been reconciled');
    }

    // Ensure the user exists
    await getOrCreateUser(sale.userId);

    // 2. Calculate adjustment
    let adjustment = 0;
    if (status === 'approved') {
      adjustment = sale.earning - sale.advancePaid;
    } else if (status === 'rejected') {
      adjustment = -sale.advancePaid;
    }

    // Round adjustment to 2 decimal places
    adjustment = Math.round(adjustment * 100) / 100;

    // 3. Update User's withdrawable balance
    const updatedUser = await User.findByIdAndUpdate(
      sale.userId,
      { $inc: { withdrawableBalance: adjustment } },
      { session, new: true }
    );

    // Round user balance to 2 decimal places to prevent floating point inaccuracies
    updatedUser.withdrawableBalance = Math.round(updatedUser.withdrawableBalance * 100) / 100;
    await updatedUser.save({ session });

    // 4. Update Sale status and reconciled flag
    sale.status = status;
    sale.reconciled = true;
    await sale.save({ session });

    await session.commitTransaction();

    return {
      sale,
      adjustment,
      newBalance: updatedUser.withdrawableBalance
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  reconcileSale
};
