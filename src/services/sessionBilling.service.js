import mongoose from 'mongoose';
import User from '../models/User.js';
import CommunicationSession from '../models/CommunicationSession.js';
import SystemWallet from '../models/SystemWallet.js';
import SystemWalletLog from '../models/SystemWalletLog.js';


export async function billOneMinute(sessionId) {
  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();
  console.log("billing service started");
  try {
    const session = await CommunicationSession
      .findById(sessionId)
      .session(mongoSession);

    if (!session || session.status !== 'active') {
      await mongoSession.abortTransaction();
      return;
    }

    const customer = await User.findById(session.customer).session(mongoSession);
    const consultant = await User.findById(session.consultant).session(mongoSession);

    const rate = session.ratePerMinute;

    const totalBalance =
      (customer.wallet.main || 0) + (customer.wallet.bonus || 0);

    if (totalBalance < rate) {
      session.status = 'ended';
      session.autoEnded = true;
      session.endedAt = new Date();
      await session.save({ session: mongoSession });
      await mongoSession.commitTransaction();
      return;
    }

    /* ============================
       BONUS CAP CALCULATION
    ============================ */
    const maxBonusAllowed =
      Math.floor((session.billedAmount + rate) * 0.10);

    const remainingBonusAllowed =
      Math.max(0, maxBonusAllowed - session.bonusUsed);

    const bonusAvailable = customer.wallet.bonus || 0;

    const bonusToUse =
      Math.min(remainingBonusAllowed, bonusAvailable, rate);

    const mainToUse = rate - bonusToUse;

    console.log("customer.wallet.main", customer.wallet.main);
    console.log("mainToUse", mainToUse);

    if (customer.wallet.main < mainToUse) {
      session.status = 'ended';
      session.autoEnded = true;
      session.endedAt = new Date();
      await session.save({ session: mongoSession });
      await mongoSession.commitTransaction();
      return;
    }

    /* ============================
       WALLET DEDUCTION
    ============================ */
    customer.wallet.bonus -= bonusToUse;
    customer.wallet.main -= mainToUse;
    session.bonusUsed += bonusToUse;

    /* ============================
       REVENUE SPLIT
    ============================ */
    const consultantShare = Math.round(rate * 0.40);
    const systemShare = rate - consultantShare;

    consultant.consultantProfile.wallet.pending += consultantShare;
    consultant.consultantProfile.wallet.totalEarned += consultantShare;

    const systemWallet = await SystemWallet.findOne().session(mongoSession);
    systemWallet.balance += systemShare;

    await SystemWalletLog.create([{
      sessionId: session._id,
      amount: systemShare,
      source: 'call_billing'
    }], { session: mongoSession });

    /* ============================
       SESSION UPDATE
    ============================ */
    session.billedMinutes += 1;
    session.billedAmount += rate;
    session.consultantEarning += consultantShare;
    session.systemEarning += systemShare;
    session.lastBilledAt = new Date();

    await Promise.all([
      customer.save({ session: mongoSession }),
      consultant.save({ session: mongoSession }),
      session.save({ session: mongoSession }),
      systemWallet.save({ session: mongoSession })
    ]);

    await mongoSession.commitTransaction();

  } catch (err) {
    await mongoSession.abortTransaction();
    console.error('Billing error:', err);
  } finally {
    mongoSession.endSession();
  }
}


export async function billRemainingMinutes(sessionId, minutes) {
  for (let i = 0; i < minutes; i++) {
    await billOneMinute(sessionId);
  }
}