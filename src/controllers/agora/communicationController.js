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


/**
 * Get pending incoming calls for the logged-in consultant
 * GET /api/communication/incoming-calls
 */
export const getIncomingCalls = async (req, res) => {
  try {
    const consultantId = req.user.userId;
    
    console.log('📞 Checking incoming calls for consultant:', consultantId);

    // Find all ringing sessions for this consultant
    const pendingSessions = await CommunicationSession.find({
      consultant: consultantId,
      status: 'ringing', // Only get calls that haven't been answered/rejected
      createdAt: { $gte: new Date(Date.now() - 60000) } // Only last 60 seconds
    })
    .populate('customer', 'name avatar') // Get customer details
    .sort({ createdAt: -1 }) // Newest first
    .limit(5);

    console.log('📋 Found', pendingSessions.length, 'pending calls');

    // Format response
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

/**
 * Mark call as answered (when consultant accepts)
 * POST /api/communication/call/answer
 * Body: { sessionId }
 */
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

    // Update session status
    session.status = 'active';
    session.startedAt = new Date();
    await session.save();

    console.log('✅ Call answered:', sessionId);

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