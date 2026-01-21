// services/sessionBilling.service.js - FIXED VERSION
import CallLog from '../models/CallLog.js';
import CommunicationSession from '../models/CommunicationSession.js';
import SystemWallet from '../models/SystemWallet.js';
import User from '../models/User.js';
import { kickAllFromChannel } from './agoraChannelService.js';

// ============================================
// TIMER MANAGEMENT (in-memory)
// ============================================
const activeTimers = new Map(); // sessionId -> { timerId, billingInProgress }

export function startBillingTimer(sessionId) {
  const sessionIdStr = sessionId.toString();
  
  if (activeTimers.has(sessionIdStr)) {
    console.log(`⏰ [Billing] Timer already exists for ${sessionIdStr}`);
    return;
  }

  console.log(`⏰ [Billing] Starting timer for ${sessionIdStr}`);
  
  const timerData = {
    timerId: setTimeout(() => executeBilling(sessionIdStr), 60000),
    billingInProgress: false
  };
  
  activeTimers.set(sessionIdStr, timerData);
}

export function stopBillingTimer(sessionId) {
  const sessionIdStr = sessionId.toString();
  const timerData = activeTimers.get(sessionIdStr);
  
  if (timerData) {
    clearTimeout(timerData.timerId);
    activeTimers.delete(sessionIdStr);
    console.log(`⏰ [Billing] Timer stopped for ${sessionIdStr}`);
  }
}

async function executeBilling(sessionIdStr) {
  const timerData = activeTimers.get(sessionIdStr);
  
  if (!timerData || timerData.billingInProgress) {
    console.log(`⏰ [Billing] Skipping ${sessionIdStr} - no timer or already billing`);
    return;
  }

  timerData.billingInProgress = true;

  try {
    const result = await billOneMinute(sessionIdStr);

    if (result.ended) {
      stopBillingTimer(sessionIdStr);
    } else if (result.billed) {
      // Schedule next billing
      timerData.billingInProgress = false;
      timerData.timerId = setTimeout(() => executeBilling(sessionIdStr), 60000);
    } else {
      // Failed for other reason - stop
      stopBillingTimer(sessionIdStr);
    }
  } catch (error) {
    console.error(`❌ [Billing] Error for ${sessionIdStr}:`, error);
    timerData.billingInProgress = false;
    // Retry in 10s on error
    timerData.timerId = setTimeout(() => executeBilling(sessionIdStr), 10000);
  }
}


export async function billOneMinute(sessionId) {
  console.log("💰 billing service started for session:", sessionId);

  try {
        // ✅ ATOMIC CHECK - Only process if status is 'active'
    const session = await CommunicationSession.findOneAndUpdate(
      {
        _id: sessionId,
        status: "active", // Only if still active
      },
      {
        $set: { _billingLock: new Date() }, // Temporary lock field
      },
      { new: true },
    );

    if (!session) {
      console.log("⏭️ Session not active, skipping");
      return { billed: false, reason: "not_active" };
    }

    if (!session || session.status !== 'active') {
      console.log("⏭️ Session not active, skipping");
      return { billed: false, reason: 'not_active' };
    }

    const customer = await User.findById(session.customer);
    const consultant = await User.findById(session.consultant);

    if (!customer || !consultant) {
      console.log("⏭️ Customer or consultant not found");
      return { billed: false, reason: 'user_not_found' };
    }

    const rate = session.ratePerMinute;

    /* ============================
       SIMPLE BALANCE CHECK
       Use main wallet only (bonus field kept for compatibility but not used)
    ============================ */
    const walletMain = customer.wallet.main || 0;
    const walletBonus = customer.wallet.bonus || 0;
    const totalAvailable = walletMain + walletBonus;

    console.log("📊 Balance check:", {
      walletMain,
      walletBonus,
      totalAvailable,
      rate
    });

    /* ============================
       INSUFFICIENT BALANCE - END CALL + KICK FROM AGORA
    ============================ */
    if (totalAvailable < rate) {
      console.log("💸 Insufficient balance - ending call and kicking from Agora");
      
      const totalSeconds = Math.floor((new Date() - session.startedAt) / 1000);
      
      // Update session
      await CommunicationSession.findByIdAndUpdate(sessionId, {
        status: 'ended',
        autoEnded: true,
        endedAt: new Date(),
        totalDurationSeconds: totalSeconds
      });

      // Reset consultant availability
      await User.findByIdAndUpdate(session.consultant, {
        'consultantProfile.availabilityStatus': 'onWork'
      });

      // ✅ KICK USERS FROM AGORA CHANNEL IMMEDIATELY
      if (session.agora?.channelName) {
        console.log("🔌 Kicking users from Agora channel:", session.agora.channelName);
        const kickResult = await kickAllFromChannel(session.agora.channelName);
        if (kickResult.success) {
          console.log("✅ Users kicked from Agora channel successfully");
        } else {
          console.warn("⚠️ Failed to kick from Agora (users will detect via polling):", kickResult.error);
        }
      }

      // Update CallLog
      await CallLog.findOneAndUpdate(
        { sessionId: session._id },
        { status: 'ended', endReason: 'insufficient_balance', endedAt: new Date() }
      );
      
      await createAutoEndCallLogMessage(session, 'insufficient_balance');

      console.log("✅ Call auto-ended due to insufficient balance");
      return { billed: false, reason: 'insufficient_balance', ended: true };
    }

    /* ============================
       WALLET DEDUCTION
       Deduct from main first, then bonus if needed
    ============================ */
    let mainToDeduct = Math.min(walletMain, rate);
    let bonusToDeduct = rate - mainToDeduct;

    // Atomic update with balance check to prevent race conditions
    const customerUpdate = await User.findOneAndUpdate(
      {
        _id: session.customer,
        $expr: {
          $gte: [
            { $add: ['$wallet.main', '$wallet.bonus'] },
            rate
          ]
        }
      },
      {
        $inc: {
          'wallet.main': -mainToDeduct,
          'wallet.bonus': -bonusToDeduct
        }
      },
      { new: true }
    );

    if (!customerUpdate) {
      console.log("💸 Balance changed during billing - ending call");
      
      const totalSeconds = Math.floor((new Date() - session.startedAt) / 1000);
      
      await CommunicationSession.findByIdAndUpdate(sessionId, {
        status: 'ended',
        autoEnded: true,
        endedAt: new Date(),
        totalDurationSeconds: totalSeconds
      });

      await User.findByIdAndUpdate(session.consultant, {
        'consultantProfile.availabilityStatus': 'onWork'
      });

      if (session.agora?.channelName) {
        await kickAllFromChannel(session.agora.channelName);
      }

      await CallLog.findOneAndUpdate(
        { sessionId: session._id },
        { status: 'ended', endReason: 'insufficient_balance', endedAt: new Date() }
      );

      return { billed: false, reason: 'insufficient_balance', ended: true };
    }

    /* ============================
       REVENUE SPLIT (60% consultant, 40% system)
    ============================ */
    const consultantShare = Math.round(rate * 0.60);
    const systemShare = rate - consultantShare;

    // Update consultant wallet
    await User.findByIdAndUpdate(session.consultant, {
      $inc: {
        'consultantProfile.wallet.available': consultantShare,
        'consultantProfile.wallet.totalEarned': consultantShare
      }
    });

    // Update system wallet
    await SystemWallet.findOneAndUpdate(
      {},
      { $inc: { balance: systemShare } },
      { upsert: true }
    );

    /* ============================
       SESSION UPDATE
       Keep bonusUsed field for compatibility (tracks bonus actually used)
    ============================ */
    const updatedSession = await CommunicationSession.findByIdAndUpdate(
      sessionId,
      {
        $inc: {
          billedMinutes: 1,
          billedAmount: rate,
          consultantEarning: consultantShare,
          systemEarning: systemShare,
          bonusUsed: bonusToDeduct  // Track bonus used for compatibility
        },
        lastBilledAt: new Date()
      },
      { new: true }
    );

    // Check remaining balance AFTER deduction
    const remainingMain = customerUpdate.wallet.main;
    const remainingBonus = customerUpdate.wallet.bonus;
    const remainingTotal = remainingMain + remainingBonus;

    console.log("✅ Billed minute #" + updatedSession.billedMinutes, {
      deducted: { main: mainToDeduct, bonus: bonusToDeduct },
      remaining: { main: remainingMain, bonus: remainingBonus, total: remainingTotal }
    });

    /* ============================
       PRE-EMPTIVE CHECK: Can afford next minute?
       If not, end call NOW + KICK
    ============================ */
    if (remainingTotal < rate) {
      console.log("⚠️ Cannot afford next minute - ending call immediately + kicking");
      endSessionDueToBalance(session);
    }

    return { billed: true, billedMinutes: updatedSession.billedMinutes };

  } catch (err) {
    console.error('❌ Billing error:', err);
    return { billed: false, reason: 'error', error: err.message };
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

async function endSessionDueToBalance(session) {
  const sessionId = session._id;
  
  // ✅ Atomic update - prevents duplicate endings
  const updateResult = await CommunicationSession.findOneAndUpdate(
    {
      _id: sessionId,
      status: 'active'  // Only if still active
    },
    {
      $set: {
        status: 'ended',
        autoEnded: true,
        endReason: 'insufficient_balance',  // ← NEW FIELD
        endedAt: new Date(),
        totalDurationSeconds: Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000)
      },
      $unset: { _billingLock: 1 }
    },
    { new: true }
  );

  if (!updateResult) {
    console.log("⏭️ Session already ended by another process");
    return;
  }

  console.log("📞 Session auto-ended:", sessionId.toString());

  // Reset consultant (only if currently busy)
  await User.findOneAndUpdate(
    {
      _id: session.consultant,
      'consultantProfile.availabilityStatus': 'busy'
    },
    { $set: { 'consultantProfile.availabilityStatus': 'onWork' } }
  );
  console.log("📞 Consultant set back to onWork");

  // Kick from Agora
  if (session.agora?.channelName) {
    console.log("🔌 Kicking users from Agora channel:", session.agora.channelName);
    const kickResult = await kickAllFromChannel(session.agora.channelName);
    console.log(kickResult.success ? "✅ Kicked successfully" : "⚠️ Kick failed:", kickResult.error);
  }

  // Update CallLog
  await CallLog.findOneAndUpdate(
    { sessionId },
    { $set: { status: 'ended', endReason: 'insufficient_balance', endedAt: new Date() } }
  );

  // Create call log message (with duplicate check)
  await createAutoEndCallLogMessage(updateResult, 'insufficient_balance');

  // Stop timer
  stopBillingTimer(sessionId);
}