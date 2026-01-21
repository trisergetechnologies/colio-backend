// src/controllers/agora/communicationController.js
import CommunicationSession from '../../models/CommunicationSession.js';
import User from '../../models/User.js';
import { buildRtcTokenWithUid } from '../../services/agoraTokenService.js';
import firebaseService from '../../services/firebaseService.js';
import CallLog from '../../models/CallLog.js';

import Conversation from '../../models/Conversation.js';
import Message from '../../models/Message.js';
import { cleanupSessionEmojis } from '../chat/inCallController.js';
import { CALL_LOG_STATUS, generateCallLogContent } from '../../utils/chatConstants.js';
import { billRemainingMinutes, startBillingTimer, stopBillingTimer } from '../../services/sessionBilling.service.js';
import { isBlockedEitherWay } from "../../utils/block.helper.js";

export const startSession = async (req, res) => {
  try {
    const customerId = req.user.userId;
    const { consultantId, type } = req.body;

    if (!consultantId || !type) {
      return res.status(400).json({ error: 'consultantId and type required' });
    }

    const customer = await User.findById(customerId);
    const consultant = await User.findById(consultantId);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (!consultant) {
      return res.status(404).json({ error: 'Consultant not found' });
    }

    if (isBlockedEitherWay(customer, consultant)) {
      return res.status(400).json({
        error: "Call not allowed",
        errorCode: "USER_BLOCKED",
      });
    }

    // ✅ IMPROVED: Better availability status handling with specific error codes
    const availabilityStatus = consultant.consultantProfile?.availabilityStatus || 'offWork';

    if (availabilityStatus === 'offWork') {
      return res.status(400).json({
        error: 'Consultant is offline',
        errorCode: 'CONSULTANT_OFFLINE',
        availabilityStatus
      });
    }

    if (availabilityStatus === 'busy') {
      return res.status(400).json({
        error: 'Consultant is busy on another call',
        errorCode: 'CONSULTANT_BUSY',
        availabilityStatus
      });
    }

    if (availabilityStatus !== 'onWork') {
      return res.status(400).json({
        error: 'Consultant is not available',
        errorCode: 'CONSULTANT_UNAVAILABLE',
        availabilityStatus
      });
    }

    let ratePerMinute = consultant.consultantProfile?.ratePerMinute || 15;

    if (type === 'video') {
      ratePerMinute = consultant.consultantProfile?.ratePerMinuteVideo || 25;
    }

    if (type === 'chat') {
      ratePerMinute = consultant.consultantProfile?.ratePerMinuteChat || 10;
    }

    const MIN_MINUTES_TO_START = 2;

    const customerTotalBalance =
      (customer.wallet?.main || 0) + (customer.wallet?.bonus || 0);

    const minRequiredBalance = ratePerMinute * MIN_MINUTES_TO_START;

    if (customerTotalBalance < minRequiredBalance) {
      return res.status(400).json({
        error: 'Insufficient balance to start call',
        errorCode: 'INSUFFICIENT_BALANCE',
        required: minRequiredBalance,
        available: customerTotalBalance
      });
    }

    const maxPossibleMinutes =
      ratePerMinute > 0 ? Math.floor(customerTotalBalance / ratePerMinute) : 0;
    const estimatedMaxDurationSeconds = maxPossibleMinutes * 60;

    const channelName = `call-${Date.now()}-${customerId}`;

    const rtcTokenCustomer = buildRtcTokenWithUid(channelName, 0);
    const rtcTokenConsultant = buildRtcTokenWithUid(channelName, 0);

    console.log('🔑 Generated tokens for channel:', channelName);
    console.log('   Customer token (first 30):', rtcTokenCustomer.substring(0, 30));
    console.log('   Consultant token (first 30):', rtcTokenConsultant.substring(0, 30));

    // ✅ Set consultant to BUSY before creating session
    consultant.consultantProfile.availabilityStatus = 'busy';
    await consultant.save();
    console.log('📞 Consultant set to busy:', consultantId);

    const session = await CommunicationSession.create({
      customer: customerId,
      consultant: consultantId,
      type,
      status: 'ringing',
      agora: {
        channelName,
        customerAccount: customerId.toString(),
        consultantAccount: consultantId.toString(),
        rtcTokenCustomer,
        rtcTokenConsultant,
      },
      ratePerMinute
    });

    await CallLog.create({
      caller: customerId,
      receiver: consultantId,
      sessionId: session._id,
      callType: type,
      channelName,
      status: 'ringing',
      initiatedAt: new Date()
    });

    if (consultant.fcmToken) {
      console.log('📤 Sending Firebase notification to consultant');

      const callData = {
        sessionId: session._id.toString(),
        callType: type,
        channelName,
        customerId: customerId.toString(),
        customerName: customer.name || 'Unknown User',
        customerAvatar: customer.avatar || '',
        rtcToken: rtcTokenConsultant,
        ratePerMinute,
        estimatedMaxDurationSeconds
      };

      const notificationResult = await firebaseService.sendCallNotification(
        consultant.fcmToken,
        callData
      );

      if (notificationResult.success) {
        console.log('✅ Push notification sent successfully');
      } else if (notificationResult.invalidToken) {
        console.warn('⚠️ Invalid FCM token, removing from consultant');
        await User.findByIdAndUpdate(consultantId, {
          $unset: { fcmToken: 1 }
        });
      } else {
        console.error('❌ Failed to send notification');
      }
    } else {
      console.warn('⚠️ Consultant has no FCM token');
    }

    res.json({
      ok: true,
      session: {
        id: session._id,
        channelName,
        rtcToken: rtcTokenCustomer,
        type,
        maxPossibleMinutes,
        estimatedMaxDurationSeconds
      },
    });
  } catch (err) {
    console.error('❌ startSession error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getRtcToken = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user.userId.toString();

    const session = await CommunicationSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const isCustomer = session.customer.toString() === userId;
    const rtcToken = isCustomer
      ? session.agora.rtcTokenCustomer
      : session.agora.rtcTokenConsultant;

    if (session.status === 'ringing') {
      session.status = 'active';
      session.startedAt = new Date();
      await session.save();
    }

    res.json({
      ok: true,
      rtcToken,
      channelName: session.agora.channelName,
      sessionId: session._id,
    });
  } catch (err) {
    console.error('getRtcToken error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const endSession = async (req, res) => {
  try {
    const { sessionId, endReason } = req.body;
    const userId = req.user.userId;

    const session = await CommunicationSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    stopBillingTimer(sessionId);

    // Guard against double-ending / double-billing
    if (session.status === 'ended' && session.isBilled) {
      return res.json({ ok: true, session });
    }

    session.status = 'ended';
    session.endedAt = session.endedAt || new Date(); // idempotent-safe
    session.endedBy = userId;

    // ✅ Reset consultant availability to 'onWork'
    await User.findByIdAndUpdate(session.consultant, {
      'consultantProfile.availabilityStatus': 'onWork'
    });
    console.log('📞 Consultant set back to onWork:', session.consultant);

    /* ======================================
      FINAL RECONCILIATION (CORE LOGIC)
      ====================================== */
    if (session.startedAt && !session.isBilled) {
      const totalSeconds = Math.floor(
        (session.endedAt - session.startedAt) / 1000
      );

      const billableMinutes = Math.ceil(totalSeconds / 60);
      const alreadyBilled = session.billedMinutes || 0;

      const remainingMinutes = billableMinutes - alreadyBilled;

      if (remainingMinutes > 0) {
        await billRemainingMinutes(session._id, remainingMinutes);
      }

      session.totalDurationSeconds = totalSeconds;
      session.isBilled = true;
    }

    await session.save();

    // Update CallLog
    const callLog = await CallLog.findOne({ sessionId: session._id });
    if (callLog) {
      callLog.endedAt = session.endedAt;
      callLog.status = 'ended';
      callLog.endReason = endReason || 'completed';
      callLog.calculateDuration();
      await callLog.save();
    }

    // ✅ CREATE CALL LOG MESSAGE IN CHAT
    await createCallLogMessage(session, endReason || 'completed');

    // ✅ Cleanup in-memory emojis for this session
    cleanupSessionEmojis(session._id);

    res.json({ ok: true, session });
  } catch (err) {
    console.error('endSession error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getIncomingCalls = async (req, res) => {
  try {
    const consultantId = req.user.userId;

    console.log('📞 Checking incoming calls for consultant:', consultantId);

    const pendingSessions = await CommunicationSession.find({
      consultant: consultantId,
      status: 'ringing',
      createdAt: { $gte: new Date(Date.now() - 60000) }
    })
      .populate('customer', 'name avatar')
      .sort({ createdAt: -1 })
      .limit(5);

    console.log('📋 Found', pendingSessions.length, 'pending calls');

    const incomingCalls = pendingSessions.map(session => ({
      sessionId: session._id.toString(),
      callType: session.type,
      channelName: session.agora.channelName,
      customerName: session.customer.name,
      customerAvatar: session.customer.avatar || '',
      customerId: session.customer._id.toString(),
      createdAt: session.createdAt,
      ratePerMinute: session.ratePerMinute,
      rtcToken: session.agora.rtcTokenConsultant,
    }));

    res.json({
      success: true,
      data: {
        incomingCalls,
        count: incomingCalls.length,
      }
    });

  } catch (err) {
    console.error('❌ getIncomingCalls error:', err);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

export const answerCall = async (req, res) => {
  try {
    const consultantId = req.user.userId;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId required'
      });
    }

    const session = await CommunicationSession.findOne({
      _id: sessionId,
      consultant: consultantId,
      status: 'ringing'
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Call not found or already answered'
      });
    }

    session.status = 'active';
    session.startedAt = new Date();
    await session.save();
    startBillingTimer(sessionId);

    console.log('✅ Call answered:', sessionId);
    console.log('   Channel:', session.agora.channelName);

    await CallLog.findOneAndUpdate(
      { sessionId: session._id },
      {
        status: 'answered',
        answeredAt: session.startedAt
      }
    );

    res.json({
      success: true,
      data: {
        sessionId: session._id,
        channelName: session.agora.channelName,
        rtcToken: session.agora.rtcTokenConsultant,
      }
    });

  } catch (err) {
    console.error('❌ answerCall error:', err);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// ✅ NEW: Decline incoming call
export const declineCall = async (req, res) => {
  try {
    const consultantId = req.user.userId;
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId required' });
    }

    const session = await CommunicationSession.findOne({
      _id: sessionId,
      consultant: consultantId,
      status: 'ringing'
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Call not found' });
    }

    session.status = 'ended';
    session.endedAt = new Date();
    session.endedBy = consultantId;
    await session.save();

    // Reset consultant availability
    await User.findByIdAndUpdate(consultantId, {
      'consultantProfile.availabilityStatus': 'onWork'
    });
    console.log('📞 Call declined, consultant set to onWork:', consultantId);

    // Update call log
    await CallLog.findOneAndUpdate(
      { sessionId: session._id },
      {
        status: 'declined',
        endReason: 'declined',
        endedAt: new Date()
      }
    );

    // Create call log message in chat
    await createCallLogMessage(session, 'declined');

    // Cleanup emojis
    cleanupSessionEmojis(session._id);

    res.json({ success: true });
  } catch (err) {
    console.error('❌ declineCall error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ✅ NEW: Handle missed call (timeout - no answer)
export const missedCall = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user.userId;

    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'sessionId required' });
    }

    const session = await CommunicationSession.findOne({
      _id: sessionId,
      $or: [{ customer: userId }, { consultant: userId }],
      status: 'ringing'
    });

    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    session.status = 'ended';
    session.endedAt = new Date();
    session.endedBy = userId;
    await session.save();

    // Reset consultant availability
    await User.findByIdAndUpdate(session.consultant, {
      'consultantProfile.availabilityStatus': 'onWork'
    });
    console.log('📞 Call missed, consultant set to onWork:', session.consultant);

    // Update call log
    await CallLog.findOneAndUpdate(
      { sessionId: session._id },
      {
        status: 'missed',
        endReason: 'no_answer',
        endedAt: new Date()
      }
    );

    // Create call log message in chat
    await createCallLogMessage(session, 'no_answer');

    // Cleanup emojis
    cleanupSessionEmojis(session._id);

    res.json({ success: true });
  } catch (err) {
    console.error('❌ missedCall error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ✅ NEW: Helper function to create call log message in conversation
async function createCallLogMessage(session, endReason) {
  try {
    // Find or create conversation between customer and consultant
    const conversation = await Conversation.findOrCreateConversation(
      session.customer,
      session.consultant
    );

    const duration = session.totalDurationSeconds || 0;

    // Determine call status
    let status = CALL_LOG_STATUS.COMPLETED;

    if (endReason === 'no_answer' || endReason === 'missed') {
      status = CALL_LOG_STATUS.MISSED;
    } else if (endReason === 'declined') {
      status = CALL_LOG_STATUS.DECLINED;
    } else if (endReason === 'busy') {
      status = CALL_LOG_STATUS.BUSY;
    } else if (duration === 0 && endReason !== 'completed') {
      status = CALL_LOG_STATUS.MISSED;
    }

    // Generate human-readable content
    const content = generateCallLogContent(session.type, status, duration);

    // Create message
    const message = await Message.create({
      conversationId: conversation._id,
      sender: session.endedBy || session.customer,
      receiver: session.endedBy?.toString() === session.customer.toString()
        ? session.consultant
        : session.customer,
      content,
      messageType: 'call_log',
      callLogData: {
        sessionId: session._id,
        callType: session.type,
        duration,
        status
      }
    });

    // Update conversation last message
    conversation.updateLastMessage(content, message.sender, 'call_log');
    await conversation.save();

    console.log('📝 Call log message created:', content);

    return message;
  } catch (err) {
    console.error('❌ createCallLogMessage error:', err);
    // Don't throw - this is a non-critical operation
  }
}