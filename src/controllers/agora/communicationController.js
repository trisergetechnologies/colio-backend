// controllers/communicationController.js
import CommunicationSession from '../../models/CommunicationSession.js';
import User from '../../models/User.js';
import Settings from '../../models/Setting.js';
import { buildRtcTokenWithAccount, buildChatTokenForAccount } from '../../services/agoraTokenService.js';
import { sendPushToDevice } from '../../services/pushService.js'; // optional
import mongoose from 'mongoose';

/**
 * Start session (chat / voice / video)
 * POST /api/communication/session/start
 * Body: { type, consultantId }
 */
export const startSession = async (req, res) => {
  try {
    const customerId = req.user.userId;
    const { type, consultantId } = req.body;

    if (!['chat', 'voice', 'video'].includes(type)) {
      return res.status(400).json({ error: 'Invalid session type' });
    }

    const consultant = await User.findById(consultantId);
    if (!consultant) return res.status(404).json({ error: 'Consultant not found' });

    // availability check (simple)
    if (consultant.consultantProfile?.availabilityStatus !== 'onWork') {
      return res.status(409).json({ error: 'Consultant not available' });
    }

    // check customer balance for paid types (MVP simple check)
    if (type === 'voice' || type === 'video') {
      const settings = await Settings.getSettings(process.env.NODE_ENV || 'development');
      const minBalance = settings.financial?.minimumWalletBalance || 0;
      const customer = await User.findById(customerId).select('wallet');
      const totalBalance = (customer?.wallet?.main || 0) + (customer?.wallet?.bonus || 0);
      if (totalBalance < minBalance) {
        return res.status(402).json({ error: 'Insufficient balance' });
      }
    }

    const session = new CommunicationSession({
      type,
      customer: customerId,
      consultant: consultantId,
      ratePerMinute: consultant.consultantProfile?.ratePerMinute || 0,
      status: type === 'chat' ? 'active' : 'initiated'
    });

    // Agora data
    session.agora.customerAccount = customerId.toString();
    session.agora.consultantAccount = consultantId.toString();

    if (type === 'voice' || type === 'video') {
      const channelName = `sess_${type}_${customerId}_${consultantId}_${Date.now()}`;
      session.agora.channelName = channelName;

      // generate rtc token for caller
      try {
        session.agora.rtcTokenCustomer = buildRtcTokenWithAccount(channelName, session.agora.customerAccount);
      } catch (err) {
        console.warn('RTC token generation issue', err);
      }
    } else {
      // chat conversation ID could be deterministic
      session.agora.chatConversationId = `conv_${customerId}_${consultantId}`;
    }

    await session.save();

    // always generate chat tokens (helpful for signaling / invites)
    const chatTokenCustomer = buildChatTokenForAccount(session.agora.customerAccount);
    const chatTokenConsultant = buildChatTokenForAccount(session.agora.consultantAccount);

    // optionally send push/invite to consultant
    try {
      if (consultant.fcmToken) {
        await sendPushToDevice(consultant.fcmToken, 'Incoming session', `${req.user.name} started a ${type}`, {
          sessionId: session._id.toString(),
          type
        });
      }
    } catch (err) {
      // ignore push failures for now
    }

    res.status(201).json({
      ok: true,
      sessionId: session._id,
      type: session.type,
      status: session.status,
      agora: {
        appId: process.env.AGORA_APP_ID,
        channelName: session.agora.channelName,
        rtcTokenCustomer: session.agora.rtcTokenCustomer,
        customerAccount: session.agora.customerAccount,
        consultantAccount: session.agora.consultantAccount,
        chatTokens: {
          customer: chatTokenCustomer,
          consultant: chatTokenConsultant
        }
      },
      session
    });
  } catch (err) {
    console.error('startSession err', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Get RTC token for a session (called by callee on accept)
 * POST /api/communication/session/token/rtc
 * Body: { sessionId }
 */
export const getRtcToken = async (req, res) => {
  try {
    const userId = req.user.userId.toString();
    const { sessionId } = req.body;

    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const session = await CommunicationSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (!session.agora?.channelName) return res.status(400).json({ error: 'Not an RTC session' });

    const token = buildRtcTokenWithAccount(session.agora.channelName, userId);

    // store token for user role
    if (session.consultant.toString() === userId) {
      session.agora.consultantAccount = userId;
      session.agora.rtcTokenConsultant = token;
    } else if (session.customer.toString() === userId) {
      session.agora.customerAccount = userId;
      session.agora.rtcTokenCustomer = token;
    }

    // mark active and startedAt (if not already)
    session.status = 'active';
    session.startedAt = session.startedAt || new Date();

    await session.save();

    res.json({
      ok: true,
      rtcToken: token,
      channelName: session.agora.channelName,
      account: userId
    });
  } catch (err) {
    console.error('getRtcToken err', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * End session (customer or consultant)
 * POST /api/communication/session/end
 * Body: { sessionId, autoEnded = false }
 */
export const endSession = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId, autoEnded = false } = req.body;

    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const session = await CommunicationSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.status === 'ended') {
      return res.json({ ok: true, message: 'Already ended', session });
    }

    // finalize
    session.status = 'ended';
    session.endedAt = new Date();
    session.endedBy = userId;
    session.autoEnded = !!autoEnded;

    if (session.startedAt) {
      const totalSec = Math.max(0, Math.floor((session.endedAt - new Date(session.startedAt)) / 1000));
      session.totalDurationSeconds = totalSec;
      // billing policy: ceil to minutes for MVP
      const minutes = Math.max(1, Math.ceil(totalSec / 60));
      session.billedAmount = minutes * (session.ratePerMinute || 0);

      // TODO: wallet deductions and transactions (atomic)
      // Example (very naive) - replace with transactions
      // const customer = await User.findById(session.customer);
      // customer.wallet.main = Math.max(0, customer.wallet.main - session.billedAmount);
      // await customer.save();
    }

    await session.save();

    // optionally notify participants via Chat or push

    res.json({ ok: true, message: 'Session ended', session });
  } catch (err) {
    console.error('endSession err', err);
    res.status(500).json({ error: 'Server error' });
  }
};
