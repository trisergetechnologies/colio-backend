// controllers/agora/communicationController.js
import CommunicationSession from '../../models/CommunicationSession.js';
import User from '../../models/User.js';
import { buildRtcTokenWithUid } from '../../services/agoraTokenService.js';
import { sendPushToDevice } from '../../services/pushService.js';
import CallLog from '../../models/CallLog.js';

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

    let ratePerMinute = consultant.consultantProfile?.ratePerMinute || 15; // voice default

    if (type === 'video') {
      ratePerMinute = consultant.consultantProfile?.ratePerMinuteVideo || 25;
    }

    if (type === 'chat') {
      ratePerMinute = consultant.consultantProfile?.ratePerMinuteChat || 10;
    }
    
    const MIN_MINUTES_TO_START = 2; // require at least 2 minutes balance

    const customerTotalBalance =
      (customer.wallet?.main || 0) + (customer.wallet?.bonus || 0);

    const minRequiredBalance = ratePerMinute * MIN_MINUTES_TO_START;

    if (customerTotalBalance < minRequiredBalance) {
      return res.status(400).json({
        error: 'Insufficient balance to start call',
        required: minRequiredBalance,
        available: customerTotalBalance
      });
    }

    const maxPossibleMinutes =
      ratePerMinute > 0 ? Math.floor(customerTotalBalance / ratePerMinute) : 0;
    const estimatedMaxDurationSeconds = maxPossibleMinutes * 60;

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
      ratePerMinute
    });

    // NEW: create basic CallLog entry (helps with history + duration)
    await CallLog.create({
      caller: customerId,
      receiver: consultantId,
      sessionId: session._id,
      callType: type,
      channelName,
      status: 'ringing',
      initiatedAt: new Date()
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
          estimatedMaxDurationSeconds
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
    const { sessionId } = req.body;
    const userId = req.user.userId;

    const session = await CommunicationSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // NEW: guard against double-ending / double-billing
    if (session.status === 'ended' && session.isBilled) {
      return res.json({ ok: true, session });
    }

    session.status = 'ended';
    session.endedAt = new Date();
    session.endedBy = userId;

     if (session.startedAt && !session.isBilled) {
      const endedAt = session.endedAt || new Date();
      const durationMs = endedAt - session.startedAt;
      const totalDurationSeconds = Math.floor(durationMs / 1000);

      // Only bill if positive duration
      if (totalDurationSeconds > 0) {
        // 1-minute rounding (ceil)
        const minutes = Math.max(1, Math.ceil(totalDurationSeconds / 60));

        // Reload customer & consultant for wallet changes
        const [customer, consultant] = await Promise.all([
          User.findById(session.customer),
          User.findById(session.consultant),
        ]);

        if (!customer || !consultant) {
          console.warn('⚠️ Customer or consultant not found during billing');
        } else {
          const ratePerMinute =
            session.ratePerMinute ||
            consultant.consultantProfile?.ratePerMinute ||
            0;

          const intendedAmount = minutes * ratePerMinute; // expected charge

          // NEW: basic wallet-based billing, bonus first, then main
          let remainingToBill = intendedAmount;

          const customerMain = customer.wallet?.main || 0;
          const customerBonus = customer.wallet?.bonus || 0;

          let bonusToDeduct = Math.min(customerBonus, remainingToBill);
          remainingToBill -= bonusToDeduct;

          let mainToDeduct = Math.min(customerMain, remainingToBill);
          remainingToBill -= mainToDeduct;

          const totalDebited = bonusToDeduct + mainToDeduct;

          // Deduct from customer
          customer.wallet.bonus = customerBonus - bonusToDeduct;
          customer.wallet.main = customerMain - mainToDeduct;

          if (consultant.consultantProfile?.wallet) {

            const consultantShare = Math.round(totalDebited * 0.40); // 40%
            const companyShare = totalDebited - consultantShare;       // 60%

            // Credit the consultant their share
            consultant.consultantProfile.wallet.pending += consultantShare;
            consultant.consultantProfile.wallet.totalEarned += consultantShare;

            // OPTIONAL: If you ever want to store company's earnings:
            // session.companyCommission = companyShare;
            // (No schema change required if you skip this)
          }

          // Update session billing fields
          session.totalDurationSeconds = totalDurationSeconds;
          session.billedAmount = totalDebited;
          session.ratePerMinute = ratePerMinute;
          session.isBilled = true;

          // Persist wallet + session changes
          await Promise.all([
            customer.save(),
            consultant.save()
          ]);
        }
      }
    }

    await session.save();

    const callLog = await CallLog.findOne({ sessionId: session._id });
    if (callLog) {
      callLog.endedAt = session.endedAt;
      callLog.status = 'ended';
      callLog.endReason = 'completed'; // you can adjust based on more context

      // Use existing instance method to compute duration
      callLog.calculateDuration();
      await callLog.save();
    }

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