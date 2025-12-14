// 21. PUT  /api/consultant/availability   # updateAvailability()
// 22. GET  /api/consultant/status         # getAvailabilityStatus()

import CommunicationSession from '../../models/CommunicationSession.js';
import User from '../../models/User.js';

/**
 * Update consultant availability status
 * @route PUT /api/consultant/availability
 * @desc Toggle consultant availability (onWork/offWork/busy)
 * @access Private (Consultant only)
 */
export const updateAvailability = async (req, res) => {
  try {
    const { availabilityStatus } = req.body;
    const consultantId = req.user.userId;

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

    // Prevent going offline if active sessions exist
    if (availabilityStatus === 'offWork') {
      const ongoingSessions = await CommunicationSession.countDocuments({
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

    // Update availability
    consultant.consultantProfile.availabilityStatus = availabilityStatus;
    await consultant.save();

    const responseData = {
      consultantId: consultant._id,
      availabilityStatus,
      updatedAt: new Date().toISOString()
    };

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
    const consultantId = req.user.userId;

    const consultant = await User.findById(consultantId);

    if (!consultant || consultant.role !== 'consultant') {
      return res.status(200).json({
        success: false,
        message: 'Consultant not found',
        data: null
      });
    }

    // Session counts
    const ongoingSessions = await CommunicationSession.countDocuments({
      consultant: consultantId,
      status: 'ongoing'
    });

    const pendingSessions = await CommunicationSession.countDocuments({
      consultant: consultantId,
      status: 'pending'
    });

    // Today range
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayCompleted = await CommunicationSession.countDocuments({
      consultant: consultantId,
      status: 'completed',
      endedAt: { $gte: todayStart }
    });

    const todayEarningsAgg = await CommunicationSession.aggregate([
      {
        $match: {
          consultant: consultantId,
          status: 'completed',
          endedAt: { $gte: todayStart }
        }
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$consultantEarning' }
        }
      }
    ]);

    const responseData = {
      consultantId: consultant._id,
      availabilityStatus: consultant.consultantProfile.availabilityStatus,
      isVerified: consultant.isVerified,
      isActive: consultant.isActive,
      sessionStats: {
        ongoing: ongoingSessions,
        pending: pendingSessions,
        todayCompleted,
        todayEarnings: todayEarningsAgg.length
          ? todayEarningsAgg[0].totalEarnings
          : 0
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
