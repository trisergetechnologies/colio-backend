import User from '../../models/User.js';
import CommunicationSession from '../../models/CommunicationSession.js';
import firebaseService from '../../services/firebaseService.js';

export const getUserCommunicationSessions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20, status, type } = req.query;

    const query = {
      $or: [
        { customer: userId },
        { consultant: userId }
      ]
    };

    if (status) query.status = status;
    if (type) query.type = type;

    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(parseInt(limit, 10) || 20, 1);
    const skip = (pageNumber - 1) * limitNumber;

    const sessions = await CommunicationSession.find(query)
      .populate('customer', 'name avatar')
      .populate('consultant', 'name avatar consultantProfile.ratePerMinute')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    const totalSessions = await CommunicationSession.countDocuments(query);

    const responseData = {
      sessions: sessions.map(session => ({
        sessionId: session._id,
        type: session.type,
        status: session.status,
        customer: session.customer,
        consultant: session.consultant,
        channelName: session.agora?.channelName || null,
        chatConversationId: session.agora?.chatConversationId || null,
        ratePerMinute: session.ratePerMinute,
        totalDurationSeconds: session.totalDurationSeconds,
        billedAmount: session.billedAmount,
        isBilled: session.isBilled,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        endedBy: session.endedBy,
        autoEnded: session.autoEnded,
        networkQuality: session.networkQuality,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      })),
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalSessions / limitNumber),
        totalSessions,
        hasNextPage: pageNumber < Math.ceil(totalSessions / limitNumber),
        hasPrevPage: pageNumber > 1
      }
    };

    return res.status(200).json({
      success: true,
      message: 'Communication sessions retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Get communication sessions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve communication sessions',
      data: null
    });
  }
};

// ✅ Get single session status by ID
export const getSessionStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params; // ✅ Correct — route is /:sessionId/status

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId required'
      });
    }

    const session = await CommunicationSession.findOne({
      _id: sessionId,
      $or: [
        { customer: userId },
        { consultant: userId }
      ]
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    return res.json({
      success: true,
      data: {
        sessionId: session._id,
        status: session.status,
        autoEnded: session.autoEnded || false,
        endReason: session.endReason || null,
        endedAt: session.endedAt,
        endedBy: session.endedBy,
        billedMinutes: session.billedMinutes || 0,
        billedAmount: session.billedAmount || 0
      }
    });

  } catch (err) {
    console.error('getSessionStatus error:', err);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// ✅ End/Cancel Session
export const endSession = async (req, res) => {
  try {
    const userId = req.user.userId;

    // ✅ FIX: Route is /:sessionId/end so ALWAYS use req.params.sessionId
    const sessionId = req.params.sessionId;

    console.log('[endSession] Called by userId:', userId);
    console.log('[endSession] sessionId:', sessionId);

    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID is required' });
    }

    const session = await CommunicationSession.findById(sessionId)
      .populate('consultant', 'fcmToken _id')
      .populate('customer', 'fcmToken _id');

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    // If already ended, return success immediately
    if (['ended', 'cancelled', 'failed'].includes(session.status)) {
      console.log('[endSession] Session already ended, status:', session.status);
      return res.status(200).json({ success: true, message: 'Session already ended' });
    }

    // ============================================================
    // 1. DETERMINE IF CALL IS STILL RINGING
    // ============================================================
    const isRinging = session.status === 'initiated' || session.status === 'ringing';

    console.log('[endSession] isRinging:', isRinging);
    console.log('[endSession] session.customer._id:', session.customer._id.toString());
    console.log('[endSession] userId:', userId.toString());
    console.log('[endSession] isCustomerEnding:', session.customer._id.toString() === userId.toString());

    // ============================================================
    // 2. SAVE TO DATABASE FIRST
    // ============================================================
    session.status = isRinging ? 'cancelled' : 'ended';
    session.endReason = isRinging ? 'missed' : 'user_ended';
    session.endedAt = new Date();
    session.endedBy = userId;

    await session.save();

    console.log('[endSession] ✅ Session saved with status:', session.status);

    // ============================================================
    // 3. SEND FCM TO CONSULTANT IF CUSTOMER CANCELLED DURING RINGING
    // ============================================================
    const isCustomerEnding = session.customer._id.toString() === userId.toString();

    if (isRinging && isCustomerEnding) {
      const consultantFcmToken = session.consultant?.fcmToken;

      console.log('[endSession] consultantFcmToken exists:', !!consultantFcmToken);

      if (consultantFcmToken) {
        await firebaseService.sendCallCancelledNotification(
          consultantFcmToken,
          String(sessionId) // ✅ Always String
        );
        console.log('[endSession] ✅ call_cancelled FCM sent to consultant');
      } else {
        console.warn('[endSession] ⚠️ No FCM token found for consultant — notification NOT sent!');
      }
    } else {
      console.log('[endSession] Skipping FCM — isRinging:', isRinging, 'isCustomerEnding:', isCustomerEnding);
    }

    return res.status(200).json({
      success: true,
      message: 'Session ended successfully',
      data: {
        sessionId: session._id,
        status: session.status
      }
    });

  } catch (error) {
    console.error('[endSession] ❌ Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to end session'
    });
  }
};