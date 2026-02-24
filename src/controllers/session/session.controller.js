// 31. POST /api/customer/session/start    # startSession()
// 16. GET  /api/user/sessions             # getUserSessions()
// 17. GET  /api/user/session/:id          # getSessionDetails()
// 18. POST /api/user/session/:id/end      # endSession()

import User from '../../models/User.js';
import CommunicationSession from '../../models/CommunicationSession.js';
import firebaseService from '../../services/firebaseService.js'; // ✅ Imported to send the cancellation push

export const getUserCommunicationSessions = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20, status, type } = req.query;

    // ---------------------------
    // Build query
    // ---------------------------
    const query = {
      $or: [
        { customer: userId },
        { consultant: userId }
      ]
    };

    if (status) {
      query.status = status;
    }

    if (type) {
      query.type = type;
    }

    // ---------------------------
    // Pagination
    // ---------------------------
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(parseInt(limit, 10) || 20, 1);
    const skip = (pageNumber - 1) * limitNumber;

    // ---------------------------
    // Fetch sessions
    // ---------------------------
    const sessions = await CommunicationSession.find(query)
      .populate('customer', 'name avatar')
      .populate('consultant', 'name avatar consultantProfile.ratePerMinute')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNumber);

    // ---------------------------
    // Total count
    // ---------------------------
    const totalSessions = await CommunicationSession.countDocuments(query);

    // ---------------------------
    // Format response
    // ---------------------------
    const responseData = {
      sessions: sessions.map(session => ({
        sessionId: session._id,

        type: session.type,
        status: session.status,

        customer: session.customer,
        consultant: session.consultant,

        // Agora
        channelName: session.agora?.channelName || null,
        chatConversationId: session.agora?.chatConversationId || null,

        // Billing / timing
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

// ✅ NEW: Get single session status by ID
export const getSessionStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { sessionId } = req.params;

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

    res.json({
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
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

// ✅ NEW: End/Cancel Session (Fixes the Race Condition)
export const endSession = async (req, res) => {
  try {
    const userId = req.user.userId;
    // According to your route comments: /api/user/session/:id/end
    const sessionId = req.params.id || req.params.sessionId; 

    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID is required' });
    }

    // Find session and populate users so we can get FCM tokens
    const session = await CommunicationSession.findById(sessionId)
      .populate('consultant', 'fcmToken _id')
      .populate('customer', 'fcmToken _id');

    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    // If it's already ended, just return success
    if (['ended', 'cancelled', 'failed'].includes(session.status)) {
      return res.status(200).json({ success: true, message: 'Session already ended' });
    }

    // ============================================================
    // 1. SAVE TO DATABASE FIRST
    // ============================================================
    const isRinging = session.status === 'initiated' || session.status === 'ringing';
    
    session.status = isRinging ? 'cancelled' : 'ended';
    session.endReason = isRinging ? 'missed' : 'user_ended';
    session.endedAt = new Date();
    session.endedBy = userId;

    await session.save(); // 🛑 WE WAIT FOR THIS TO FINISH

    // ============================================================
    // 2. THEN SEND PUSH NOTIFICATION
    // ============================================================
    // If the customer hangs up while it's ringing, notify the consultant to stop their phone from ringing
    if (isRinging && session.customer._id.toString() === userId.toString()) {
      const consultantFcmToken = session.consultant?.fcmToken;
      if (consultantFcmToken) {
        await firebaseService.sendCallCancelledNotification(consultantFcmToken, sessionId);
      }
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
    console.error('End session error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to end session'
    });
  }
};