import mongoose from 'mongoose';
import User from '../models/User.js';
import CommunicationSession from '../models/CommunicationSession.js';
import SystemWallet from '../models/SystemWallet.js';
import SystemWalletLog from '../models/SystemWalletLog.js';
import CallLog from '../models/CallLog.js';

export async function billOneMinute(sessionId) {
  const mongoSession = await mongoose.startSession();
  mongoSession.startTransaction();
  console.log("💰 billing service started for session:", sessionId);

  try {
    const session = await CommunicationSession
      .findById(sessionId)
      .session(mongoSession);

    if (!session || session.status !== 'active') {
      console.log("⏭️ Session not active, skipping");
      await mongoSession.abortTransaction();
      return { billed: false, reason: 'not_active' };
    }

    const customer = await User.findById(session.customer).session(mongoSession);
    const consultant = await User.findById(session.consultant).session(mongoSession);

    const rate = session.ratePerMinute;

    /* ============================
       BONUS CAP CALCULATION
    ============================ */
    const maxBonusAllowed = Math.floor((session.billedAmount + rate) * 0.10);
    const remainingBonusAllowed = Math.max(0, maxBonusAllowed - session.bonusUsed);
    const bonusAvailable = customer.wallet.bonus || 0;
    const bonusToUse = Math.min(remainingBonusAllowed, bonusAvailable, rate);
    const mainToUse = rate - bonusToUse;

    const totalAvailable = (customer.wallet.main || 0) + (customer.wallet.bonus || 0);

    console.log("📊 Balance check:", {
      walletMain: customer.wallet.main,
      walletBonus: customer.wallet.bonus,
      totalAvailable,
      rate,
      bonusToUse,
      mainToUse
    });

    /* ============================
       INSUFFICIENT BALANCE - END CALL
    ============================ */
    if (customer.wallet.main < mainToUse || totalAvailable < rate) {
      console.log("💸 Insufficient balance - ending call");
      
      const totalSeconds = Math.floor((new Date() - session.startedAt) / 1000);
      
      session.status = 'ended';
      session.autoEnded = true;
      session.endedAt = new Date();
      session.totalDurationSeconds = totalSeconds;

      consultant.consultantProfile.availabilityStatus = 'onWork';

      await Promise.all([
        session.save({ session: mongoSession }),
        consultant.save({ session: mongoSession })
      ]);

      await mongoSession.commitTransaction();

      // Update CallLog (outside transaction)
      await CallLog.findOneAndUpdate(
        { sessionId: session._id },
        { status: 'ended', endReason: 'insufficient_balance', endedAt: session.endedAt }
      );
      await createAutoEndCallLogMessage(session, 'insufficient_balance');

      console.log("✅ Call auto-ended due to insufficient balance");
      return { billed: false, reason: 'insufficient_balance', ended: true };
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

    // ✅ Check remaining balance AFTER deduction
    const remainingMain = customer.wallet.main;
    const remainingBonus = customer.wallet.bonus;
    const remainingTotal = remainingMain + remainingBonus;

    console.log("✅ Billed minute #" + session.billedMinutes, {
      remainingMain,
      remainingBonus,
      remainingTotal
    });

    /* ============================
       ✅ PRE-EMPTIVE CHECK: Can afford next minute?
       If not, end call NOW within same transaction
    ============================ */
    if (remainingTotal < rate) {
      console.log("⚠️ Cannot afford next minute - ending call immediately");
      
      const totalSeconds = Math.floor((new Date() - session.startedAt) / 1000);
      
      session.status = 'ended';
      session.autoEnded = true;
      session.endedAt = new Date();
      session.totalDurationSeconds = totalSeconds;

      consultant.consultantProfile.availabilityStatus = 'onWork';

      await Promise.all([
        customer.save({ session: mongoSession }),
        consultant.save({ session: mongoSession }),
        session.save({ session: mongoSession }),
        systemWallet.save({ session: mongoSession })
      ]);

      await mongoSession.commitTransaction();

      // Update CallLog
      await CallLog.findOneAndUpdate(
        { sessionId: session._id },
        { status: 'ended', endReason: 'insufficient_balance', endedAt: session.endedAt }
      );
      await createAutoEndCallLogMessage(session, 'insufficient_balance');

      console.log("✅ Call ended immediately (no balance for next minute)");
      return { billed: true, billedMinutes: session.billedMinutes, ended: true };
    }

    /* ============================
       SAVE ALL (Normal case - has balance for next minute)
    ============================ */
    await Promise.all([
      customer.save({ session: mongoSession }),
      consultant.save({ session: mongoSession }),
      session.save({ session: mongoSession }),
      systemWallet.save({ session: mongoSession })
    ]);

    await mongoSession.commitTransaction();
    return { billed: true, billedMinutes: session.billedMinutes };

  } catch (err) {
    await mongoSession.abortTransaction();
    console.error('❌ Billing error:', err);
    return { billed: false, reason: 'error', error: err.message };
  } finally {
    mongoSession.endSession();
  }
}

async function createAutoEndCallLogMessage(session, endReason) {
  try {
    const Conversation = (await import('../models/Conversation.js')).default;
    const Message = (await import('../models/Message.js')).default;
    const { CALL_LOG_STATUS, generateCallLogContent } = await import('../utils/chatConstants.js');

    const conversation = await Conversation.findOrCreateConversation(
      session.customer,
      session.consultant
    );

    const duration = session.totalDurationSeconds || 0;
    const content = generateCallLogContent(session.type, CALL_LOG_STATUS.COMPLETED, duration);

    await Message.create({
      conversationId: conversation._id,
      sender: session.customer,
      receiver: session.consultant,
      content,
      messageType: 'call_log',
      callLogData: {
        sessionId: session._id,
        callType: session.type,
        duration,
        status: CALL_LOG_STATUS.COMPLETED,
        autoEnded: true
      }
    });

    conversation.updateLastMessage(content, session.customer, 'call_log');
    await conversation.save();

    console.log('📝 Auto-end call log message created:', content);
  } catch (err) {
    console.error('❌ createAutoEndCallLogMessage error:', err);
  }
}

export async function billRemainingMinutes(sessionId, minutes) {
  for (let i = 0; i < minutes; i++) {
    const result = await billOneMinute(sessionId);
    if (result.ended) break;
  }
}