import User from '../../models/User.js';
import Session from '../../models/Session.js';

/**
 * GET /api/consultant/performance
 * Consultant performance dashboard
 */
export const getConsultantPerformance = async (req, res) => {
  try {
    const consultantId = req.user.userId;

    // -----------------------------
    // Fetch consultant
    // -----------------------------
    const consultant = await User.findById(consultantId).select(
      'name avatar role consultantProfile'
    );

    if (!consultant || consultant.role !== 'consultant') {
      return res.status(200).json({
        success: false,
        message: 'Consultant not found',
        data: null
      });
    }

    // -----------------------------
    // Date ranges
    // -----------------------------
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // -----------------------------
    // Earnings aggregation (CONSULTANT MONEY)
    // -----------------------------
    const earningsAgg = await Session.aggregate([
      {
        $match: {
          consultant: consultant._id,
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          today: {
            $sum: {
              $cond: [
                { $gte: ['$endedAt', todayStart] },
                '$consultantEarning',
                0
              ]
            }
          },
          week: {
            $sum: {
              $cond: [
                { $gte: ['$endedAt', weekStart] },
                '$consultantEarning',
                0
              ]
            }
          },
          month: {
            $sum: {
              $cond: [
                { $gte: ['$endedAt', monthStart] },
                '$consultantEarning',
                0
              ]
            }
          }
        }
      }
    ]);

    const earnings = earningsAgg[0] || {
      today: 0,
      week: 0,
      month: 0
    };

    // -----------------------------
    // Request trend (last 7 days)
    // -----------------------------
    const trendAgg = await Session.aggregate([
      {
        $match: {
          consultant: consultant._id,
          requestedAt: { $gte: weekStart }
        }
      },
      {
        $group: {
          _id: { $dayOfWeek: '$requestedAt' },
          count: { $sum: 1 }
        }
      }
    ]);

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const requestTrend = days.map((d, index) => {
      const found = trendAgg.find(t => t._id === index + 1);
      return {
        label: d,
        value: found ? found.count : 0
      };
    });

    // -----------------------------
    // RESPONSE
    // -----------------------------
    return res.status(200).json({
      success: true,
      message: 'Consultant performance data fetched successfully',
      data: {
        profile: {
          name: consultant.name,
          avatar: consultant.avatar,
          availabilityStatus: consultant.consultantProfile.availabilityStatus,
          ratingAverage: consultant.consultantProfile.ratingAverage
        },

        earnings: {
          today: earnings.today,
          week: earnings.week,
          month: earnings.month,
          wallet: consultant.consultantProfile.wallet.available
        },

        requestTrend
      }
    });

  } catch (error) {
    console.error('Consultant performance error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch performance data',
      data: null
    });
  }
};
