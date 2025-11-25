// controllers/agora/communicationController.js
import CommunicationSession from '../../models/CommunicationSession.js';
import User from '../../models/User.js';
import { buildRtcTokenWithAccount } from '../../services/agoraTokenService.js';
import { sendPushToDevice } from '../../services/pushService.js';

// controllers/agora/communicationController.js
export const startSession = async (req, res) => {
  try {
    const customerId = req.user.userId;
    const { consultantId, type } = req.body;

    if (!consultantId || !type) {
      return res.status(400).json({ error: 'consultantId and type required' });
    }

    // ✅ Get both user details
    const customer = await User.findById(customerId);
    const consultant = await User.findById(consultantId);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (!consultant) {
      return res.status(404).json({ error: 'Consultant not found' });
    }

    // Check consultant availability
    if (consultant.consultantProfile?.availabilityStatus !== 'onWork') {
      return res.status(400).json({ error: 'Consultant is not available' });
    }

    // Generate channel name
    const channelName = `call-${Date.now()}-${customerId}`;

    // Generate RTC tokens
    const customerAccount = customerId.toString();
    const consultantAccount = consultantId.toString();
    
    const rtcTokenCustomer = buildRtcTokenWithAccount(channelName, customerAccount);
    const rtcTokenConsultant = buildRtcTokenWithAccount(channelName, consultantAccount);

    // Create session
    const session = await CommunicationSession.create({
      customer: customerId,
      consultant: consultantId,
      type,
      status: 'ringing',
      agora: {
        channelName,
        customerAccount,
        consultantAccount,
        rtcTokenCustomer,
        rtcTokenConsultant,
      },
      ratePerMinute: consultant.consultantProfile?.ratePerMinute || 4,
    });

    // 🔔 Send push notification to consultant
    if (consultant.fcmToken) {
      console.log('Sending push to consultant:', consultant.fcmToken);
      
      await sendPushToDevice(
        consultant.fcmToken,
        `Incoming ${type} call`,
        `${customer.name} is calling you`,
        {
          type: 'incoming_call',
          sessionId: session._id.toString(),
          callType: type,
          customerName: customer.name,
          customerAvatar: customer.avatar || '',
          channelName,
        }
      );
      
      console.log('Push notification sent successfully');
    } else {
      console.warn('Consultant has no FCM token registered');
    }

    // Return to customer
    res.json({
      ok: true,
      session: {
        id: session._id,
        channelName,
        rtcToken: rtcTokenCustomer,
        type,
      },
    });
  } catch (err) {
    console.error('startSession error:', err);
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

    // Determine if user is customer or consultant
    const isCustomer = session.customer.toString() === userId;
    const rtcToken = isCustomer 
      ? session.agora.rtcTokenCustomer 
      : session.agora.rtcTokenConsultant;

    // Update session status to active
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
    const { sessionId } = req.body;
    const userId = req.user.userId;

    const session = await CommunicationSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    session.status = 'ended';
    session.endedAt = new Date();
    session.endedBy = userId;

    if (session.startedAt) {
      const durationMs = session.endedAt - session.startedAt;
      session.totalDurationSeconds = Math.floor(durationMs / 1000);
      
      // Calculate billing
      const minutes = session.totalDurationSeconds / 60;
      session.billedAmount = Math.ceil(minutes * session.ratePerMinute);
    }

    await session.save();

    res.json({ ok: true, session });
  } catch (err) {
    console.error('endSession error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};