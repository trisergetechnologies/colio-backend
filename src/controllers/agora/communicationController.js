// controllers/agora/communicationController.js
import CommunicationSession from '../../models/CommunicationSession.js';
import User from '../../models/User.js';
import { buildRtcTokenWithUid } from '../../services/agoraTokenService.js';
import { sendPushToDevice } from '../../services/pushService.js';

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

    if (consultant.consultantProfile?.availabilityStatus !== 'onWork') {
      return res.status(400).json({ error: 'Consultant is not available' });
    }

    // Generate channel name
    const channelName = `call-${Date.now()}-${customerId}`;

    // ✅ Generate tokens with UID 0 (both customer and consultant will auto-assign UIDs)
    const rtcTokenCustomer = buildRtcTokenWithUid(channelName, 0);
    const rtcTokenConsultant = buildRtcTokenWithUid(channelName, 0);

    console.log('🔑 Generated tokens for channel:', channelName);
    console.log('   Customer token (first 30):', rtcTokenCustomer.substring(0, 30));
    console.log('   Consultant token (first 30):', rtcTokenConsultant.substring(0, 30));

    // Create session
    const session = await CommunicationSession.create({
      customer: customerId,
      consultant: consultantId,
      type,
      status: 'ringing',
      agora: {
        channelName,
        customerAccount: customerId.toString(), // Keep for reference
        consultantAccount: consultantId.toString(), // Keep for reference
        rtcTokenCustomer,
        rtcTokenConsultant,
      },
      ratePerMinute: consultant.consultantProfile?.ratePerMinute || 4,
    });

    // Send push notification to consultant
    if (consultant.fcmToken) {
      console.log('📤 Sending push to consultant');
      
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
      
      console.log('✅ Push notification sent');
    } else {
      console.warn('⚠️ Consultant has no FCM token');
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

    console.log('✅ Call answered:', sessionId);
    console.log('   Channel:', session.agora.channelName);

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