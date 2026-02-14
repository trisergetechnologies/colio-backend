import User from "../../models/User.js";

export const getUsersForAdmin = async (req, res) => {
  try {
    // 🔐 Admin guard
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    const {
      id,                 // single user fetch
      role,               // consultant | customer
      page = 1,
      limit = 20,
      search,
      isActive,
      availabilityStatus,
      from,
      to
    } = req.query;

    // ================= SINGLE USER =================
    if (id) {
      const user = await User.findById(id)
        .select(
          userSelectByRole(null, true)
        )
        .lean();

      if (!user) {
        return res.json({
          success: false,
          message: 'User not found'
        });
      }

      return res.json({
        success: true,
        data: user
      });
    }

    // ================= PAGINATION =================
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, parseInt(limit));

    // ================= FILTER =================
    const filter = {};

    if (role && ['consultant', 'customer'].includes(role)) {
      filter.role = role;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    if (availabilityStatus) {
      filter['consultantProfile.availabilityStatus'] = availabilityStatus;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // ================= QUERY =================
    const [users, total] = await Promise.all([
      User.find(filter)
        .select(userSelectByRole(role))
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),

      User.countDocuments(filter)
    ]);

    return res.json({
      success: true,
      data: {
        total,
        page: pageNum,
        limit: limitNum,
        items: users
      }
    });

  } catch (error) {
    console.error('Admin get users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
};

/* ======================================================
   FIELD SELECTION (SECURITY CRITICAL)
====================================================== */

function userSelectByRole(role, single = false) {
  const base = `
    name email phone role isActive isVerified
    isEmailVerified isPhoneVerified
    avatar gender dateOfBirth languages
    createdAt lastLogin
  `;

  if (role === 'customer') {
    return `
      ${base}
      wallet referralCode totalReferrals
    `;
  }

  if (role === 'consultant') {
    return `
      ${base}
      consultantProfile.bio
      consultantProfile.skills
      consultantProfile.ratingAverage
      consultantProfile.ratingCount
      consultantProfile.totalSessions
      consultantProfile.onboardingScore
      consultantProfile.availabilityStatus
      consultantProfile.ratePerMinute
      consultantProfile.ratePerMinuteVideo
      consultantProfile.ratePerMinuteChat
      consultantProfile.bankDetails
      consultantProfile.wallet
    `;
  }

  // mixed (both) or single user
  return `
    ${base}
    consultantProfile.ratingAverage
    consultantProfile.totalSessions
    consultantProfile.availabilityStatus
    consultantProfile.bankDetails.isVerified
    wallet
  `;
}

