// 21. PUT  /api/consultant/availability   # updateAvailability()
// 22. GET  /api/consultant/status         # getAvailabilityStatus()
// 23. POST /api/consultant/session/:id/accept    # acceptSession()
// 24. POST /api/consultant/session/:id/decline   # declineSession()


import User from '../../models/User.js';
import Session from '../../models/Session.js';
import settingsService from '../../services/settingsService.js';

/**
 * Update consultant availability status
 * @route PUT /api/consultant/availability
 * @desc Toggle consultant availability (onWork/offWork/busy)
 * @access Private (Consultant only)
 */
export const updateAvailability = async (req, res) => {
  try {
    const { availabilityStatus } = req.body;
    const consultantId = req.user.userId; // From auth middleware

    // Input validation
    if (!availabilityStatus) {
      return res.status(200).json({
        success: false,
        message: 'Availability status is required',
        data: null
      });
    }

    if (!['onWork', 'offWork', 'busy'].includes(availabilityStatus)) {
      return res.status(200).json({
        success: false,
        message: 'Invalid availability status. Must be onWork, offWork, or busy',
        data: null
      });
    }

    // Find consultant
    const consultant = await User.findById(consultantId);
    
    if (!consultant || consultant.role !== 'consultant') {
      return res.status(200).json({
        success: false,
        message: 'Consultant not found',
        data: null
      });
    }

    if (!consultant.isActive || !consultant.isVerified) {
      return res.status(200).json({
        success: false,
        message: 'Account must be active and verified to update availability',
        data: null
      });
    }

    // Check if consultant has any ongoing sessions when going offline
    if (availabilityStatus === 'offWork') {
      const ongoingSessions = await Session.countDocuments({
        consultant: consultantId,
        status: 'ongoing'
      });

      if (ongoingSessions > 0) {
        return res.status(200).json({
          success: false,
          message: 'Cannot go offline while having ongoing sessions. Please end all sessions first.',
          data: null
        });
      }
    }

    // Update availability status
    consultant.consultantProfile.availabilityStatus = availabilityStatus;
    await consultant.save();

    // Prepare response data
    const responseData = {
      consultantId: consultant._id,
      availabilityStatus: consultant.consultantProfile.availabilityStatus,
      updatedAt: new Date().toISOString()
    };

    // Add status-specific information
    switch (availabilityStatus) {
      case 'onWork':
        responseData.message = 'You are now available to receive session requests';
        break;
      case 'offWork':
        responseData.message = 'You are now offline and will not receive session requests';
        break;
      case 'busy':
        responseData.message = 'You are now marked as busy and will not receive new session requests';
        break;
    }

    // TODO: Emit Socket.io event to update real-time status for customers
    // io.emit('consultant:availability:updated', {
    //   consultantId,
    //   availabilityStatus
    // });

    return res.status(200).json({
      success: true,
      message: `Availability updated to ${availabilityStatus}`,
      data: responseData
    });

  } catch (error) {
    console.error('Update availability error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update availability status',
      data: null
    });
  }
};

/**
 * Get consultant availability status
 * @route GET /api/consultant/status
 * @desc Get current availability status and session info
 * @access Private (Consultant only)
 */
export const getAvailabilityStatus = async (req, res) => {
  try {
    const consultantId = req.user.userId; // From auth middleware

    // Find consultant with session statistics
    const consultant = await User.findById(consultantId);
    
    if (!consultant || consultant.role !== 'consultant') {
      return res.status(200).json({
        success: false,
        message: 'Consultant not found',
        data: null
      });
    }

    // Get ongoing sessions count
    const ongoingSessions = await Session.countDocuments({
      consultant: consultantId,
      status: 'ongoing'
    });

    // Get pending session requests
    const pendingSessions = await Session.countDocuments({
      consultant: consultantId,
      status: 'pending'
    });

    // Get today's completed sessions
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todaySessions = await Session.countDocuments({
      consultant: consultantId,
      status: 'completed',
      completedAt: { $gte: todayStart }
    });

    // Calculate today's earnings
    const todayEarnings = await Session.aggregate([
      {
        $match: {
          consultant: consultantId,
          status: 'completed',
          completedAt: { $gte: todayStart }
        }
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$consultantEarning' }
        }
      }
    ]);

    // Prepare response data
    const responseData = {
      consultantId: consultant._id,
      availabilityStatus: consultant.consultantProfile.availabilityStatus,
      isVerified: consultant.isVerified,
      isActive: consultant.isActive,
      sessionStats: {
        ongoing: ongoingSessions,
        pending: pendingSessions,
        todayCompleted: todaySessions,
        todayEarnings: todayEarnings.length > 0 ? todayEarnings[0].totalEarnings : 0
      },
      consultantProfile: {
        ratingAverage: consultant.consultantProfile.ratingAverage,
        ratingCount: consultant.consultantProfile.ratingCount,
        totalSessions: consultant.consultantProfile.totalSessions,
        ratePerMinute: consultant.consultantProfile.ratePerMinute,
        wallet: consultant.consultantProfile.wallet
      },
      lastUpdated: new Date().toISOString()
    };

    // Add availability-specific messages
    switch (consultant.consultantProfile.availabilityStatus) {
      case 'onWork':
        responseData.statusMessage = 'You are available to receive session requests';
        break;
      case 'offWork':
        responseData.statusMessage = 'You are offline and not receiving session requests';
        break;
      case 'busy':
        responseData.statusMessage = 'You are busy and not receiving new session requests';
        break;
    }

    return res.status(200).json({
      success: true,
      message: 'Availability status retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Get availability status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve availability status',
      data: null
    });
  }
};

/**
 * Accept session request
 * @route POST /api/consultant/session/:id/accept
 * @desc Accept incoming session request from customer
 * @access Private (Consultant only)
 */
export const acceptSession = async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const consultantId = req.user.userId; // From auth middleware

    // Input validation
    if (!sessionId) {
      return res.status(200).json({
        success: false,
        message: 'Session ID is required',
        data: null
      });
    }

    // Find session
    const session = await Session.findById(sessionId)
      .populate('customer', 'name email wallet')
      .populate('consultant', 'name consultantProfile.availabilityStatus');

    if (!session) {
      return res.status(200).json({
        success: false,
        message: 'Session not found',
        data: null
      });
    }

    // Verify consultant ownership
    if (session.consultant._id.toString() !== consultantId) {
      return res.status(200).json({
        success: false,
        message: 'Unauthorized to accept this session',
        data: null
      });
    }

    // Check session status
    if (session.status !== 'pending') {
      return res.status(200).json({
        success: false,
        message: `Cannot accept session. Current status: ${session.status}`,
        data: null
      });
    }

    // Check consultant availability
    const consultant = await User.findById(consultantId);
    
    if (consultant.consultantProfile.availabilityStatus !== 'onWork') {
      return res.status(200).json({
        success: false,
        message: 'You must be available (onWork) to accept sessions',
        data: null
      });
    }

    // Check if consultant has reached maximum concurrent sessions
    const maxConcurrentSessions = await settingsService.getSetting('session.maxConcurrentSessions') || 3;
    const ongoingSessions = await Session.countDocuments({
      consultant: consultantId,
      status: 'ongoing'
    });

    if (ongoingSessions >= maxConcurrentSessions) {
      return res.status(200).json({
        success: false,
        message: `Cannot accept session. Maximum concurrent sessions (${maxConcurrentSessions}) reached.`,
        data: null
      });
    }

    // Check customer wallet balance
    const minimumBalance = await settingsService.getSetting('financial.minimumWalletBalance');
    const customerTotalBalance = session.customer.wallet.main + session.customer.wallet.bonus;
    
    if (customerTotalBalance < minimumBalance) {
      // Auto-decline session due to insufficient funds
      session.status = 'cancelled';
      session.endReason = 'insufficient_funds';
      session.endedAt = new Date();
      await session.save();

      return res.status(200).json({
        success: false,
        message: 'Cannot accept session. Customer has insufficient wallet balance.',
        data: null
      });
    }

    // Accept the session
    session.status = 'ongoing';
    session.startedAt = new Date();
    session.lastActivity = new Date();
    await session.save();

    // Update consultant status to busy
    consultant.consultantProfile.availabilityStatus = 'busy';
    await consultant.save();

    // Prepare response data
    const responseData = {
      sessionId: session._id,
      conversationId: session.conversationId,
      customer: {
        id: session.customer._id,
        name: session.customer.name
      },
      status: session.status,
      startedAt: session.startedAt,
      ratePerMinute: session.ratePerMinute,
      type: session.type
    };

    // TODO: Emit Socket.io events
    // Notify customer that session was accepted
    // io.to(`user_${session.customer._id}`).emit('session:accepted', {
    //   sessionId: session._id,
    //   consultant: { id: consultantId, name: consultant.name }
    // });

    // TODO: Update consultant availability for other customers
    // io.emit('consultant:availability:updated', {
    //   consultantId,
    //   availabilityStatus: 'busy'
    // });

    return res.status(200).json({
      success: true,
      message: 'Session accepted successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Accept session error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to accept session',
      data: null
    });
  }
};

/**
 * Decline session request
 * @route POST /api/consultant/session/:id/decline
 * @desc Decline incoming session request from customer
 * @access Private (Consultant only)
 */
export const declineSession = async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const { reason } = req.body; // Optional decline reason
    const consultantId = req.user.userId; // From auth middleware

    // Input validation
    if (!sessionId) {
      return res.status(200).json({
        success: false,
        message: 'Session ID is required',
        data: null
      });
    }

    // Find session
    const session = await Session.findById(sessionId)
      .populate('customer', 'name')
      .populate('consultant', 'name');

    if (!session) {
      return res.status(200).json({
        success: false,
        message: 'Session not found',
        data: null
      });
    }

    // Verify consultant ownership
    if (session.consultant._id.toString() !== consultantId) {
      return res.status(200).json({
        success: false,
        message: 'Unauthorized to decline this session',
        data: null
      });
    }

    // Check session status
    if (session.status !== 'pending') {
      return res.status(200).json({
        success: false,
        message: `Cannot decline session. Current status: ${session.status}`,
        data: null
      });
    }

    // Decline the session
    session.status = 'declined';
    session.endedAt = new Date();
    session.endedBy = 'consultant';
    session.endReason = 'declined';
    
    // Add decline reason if provided
    if (reason && reason.trim()) {
      session.declineReason = reason.trim();
    }

    await session.save();

    // Prepare response data
    const responseData = {
      sessionId: session._id,
      status: session.status,
      declinedAt: session.endedAt,
      customer: {
        id: session.customer._id,
        name: session.customer.name
      }
    };

    // TODO: Emit Socket.io event to notify customer
    // io.to(`user_${session.customer._id}`).emit('session:declined', {
    //   sessionId: session._id,
    //   consultant: { id: consultantId, name: session.consultant.name },
    //   reason: reason || 'No reason provided'
    // });

    // TODO: Suggest alternative consultants to customer
    // This could trigger a service to recommend other available consultants

    return res.status(200).json({
      success: true,
      message: 'Session declined successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Decline session error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to decline session',
      data: null
    });
  }
};