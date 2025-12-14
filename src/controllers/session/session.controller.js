// 31. POST /api/customer/session/start    # startSession()
// 16. GET  /api/user/sessions             # getUserSessions()
// 17. GET  /api/user/session/:id          # getSessionDetails()
// 18. POST /api/user/session/:id/end      # endSession()


import User from '../../models/User.js';
import CommunicationSession from '../../models/CommunicationSession.js';


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