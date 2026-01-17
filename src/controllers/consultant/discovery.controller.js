// 25. GET  /api/customer/consultants      # getAvailableConsultants()
// 26. GET  /api/customer/consultant/:id   # getConsultantDetails()
// 27. GET  /api/customer/consultants/search # searchConsultants()
// 28. POST /api/customer/favorites        # addToFavorites()
// 29. DELETE /api/customer/favorites/:id  # removeFromFavorites()
// 30. GET  /api/customer/favorites        # getFavoriteConsultants()


import Session from '../../models/Session.js';
import User from '../../models/User.js';
import settingsService from '../../services/settingsService.js';
import { isBlockedEitherWay } from '../../utils/block.helper.js';

/**
 * Get available consultants
 * @route GET /api/customer/consultants
 * @desc Get list of available consultants with filtering
 * @access Private (Customer only)
 */
export const getAvailableConsultants = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      skills,
      minRating = 0,
      maxRate,
      language = 'english',
      sortBy = 'rating' // 'rating', 'sessions', 'rate_low', 'rate_high'
    } = req.query;

    const customer = await User.findById(req.user.userId).select(
      "blockedUsers",
    );

    // Build query for available consultants
    const query = {
      role: 'consultant',
      isActive: true,
      isVerified: true,
    };
    query._id = {
      $nin: customer.blockedUsers || [],
    };

    // Add filters
    if (skills) {
      const skillsArray = skills.split(',');
      query['consultantProfile.skills'] = { $in: skillsArray };
    }

    if (minRating > 0) {
      query['consultantProfile.ratingAverage'] = { $gte: parseFloat(minRating) };
    }

    if (maxRate) {
      query['consultantProfile.ratePerMinute'] = { $lte: parseFloat(maxRate) };
    }

    if (language) {
      query.languages = language;
    }

    // Build sort criteria
    let sortCriteria = {};
    switch (sortBy) {
      case "sessions":
        sortCriteria = {
          "consultantProfile.totalSessions": -1,
          randomScore: -1,
        };
        break;

      case "rating":
      default:
        sortCriteria = {
          "consultantProfile.ratingAverage": -1,
          randomScore: -1,
        };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    // Get consultants
    const consultants = await User.find(query)
      .select('name avatar consultantProfile languages createdAt')
      .sort(sortCriteria)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const totalConsultants = await User.countDocuments(query);

    // Format response
    const responseData = {
      consultants: consultants.map(consultant => ({
        id: consultant._id,
        name: consultant.name,
        avatar: consultant.avatar,
        bio: consultant.consultantProfile.bio,
        skills: consultant.consultantProfile.skills,
        languages: consultant.languages,
        ratePerMinute: consultant.consultantProfile.ratePerMinute,
        ratingAverage: consultant.consultantProfile.ratingAverage,
        ratingCount: consultant.consultantProfile.ratingCount,
        totalSessions: consultant.consultantProfile.totalSessions,
        availabilityStatus: consultant.consultantProfile.availabilityStatus,
        experienceMonths: Math.floor((new Date() - consultant.createdAt) / (1000 * 60 * 60 * 24 * 30))
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalConsultants / limit),
        totalConsultants,
        hasNextPage: page < Math.ceil(totalConsultants / limit),
        hasPrevPage: page > 1
      },
      filters: {
        skills: skills || null,
        minRating: parseFloat(minRating),
        maxRate: maxRate ? parseFloat(maxRate) : null,
        language,
        sortBy
      }
    };

    return res.status(200).json({
      success: true,
      message: 'Available consultants retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Get available consultants error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve consultants',
      data: null
    });
  }
};


export const quickConnect = async (req, res) => {
  try {
    const {
      skills,
      minRating = 0,
      maxRate,
      language = 'english'
    } = req.query;

    const customer = await User.findById(req.user.userId).select('blockedUsers');

    // Base match conditions (same availability logic)
    const matchStage = {
      role: 'consultant',
      isActive: true,
      isVerified: true,
      'consultantProfile.availabilityStatus': 'onWork',
      _id: { $nin: customer.blockedUsers || [] }
    };

    // Optional filters
    if (skills) {
      matchStage['consultantProfile.skills'] = {
        $in: skills.split(',')
      };
    }

    if (minRating > 0) {
      matchStage['consultantProfile.ratingAverage'] = {
        $gte: parseFloat(minRating)
      };
    }

    if (maxRate) {
      matchStage['consultantProfile.ratePerMinute'] = {
        $lte: parseFloat(maxRate)
      };
    }

    if (language) {
      matchStage.languages = language;
    }

    // Aggregation pipeline for RANDOM 5 consultants
    const consultants = await User.aggregate([
      { $match: matchStage },

      // Random selection
      { $sample: { size: 5 } },

      // Pick only required fields
      {
        $project: {
          name: 1,
          avatar: 1,
          languages: 1,
          createdAt: 1,
          consultantProfile: {
            bio: 1,
            skills: 1,
            ratePerMinute: 1,
            ratingAverage: 1,
            ratingCount: 1,
            totalSessions: 1,
            availabilityStatus: 1
          }
        }
      }
    ]);

    // Format response
    const formattedConsultants = consultants.map(c => ({
      id: c._id,
      name: c.name,
      avatar: c.avatar,
      bio: c.consultantProfile?.bio,
      skills: c.consultantProfile?.skills || [],
      languages: c.languages,
      ratePerMinute: c.consultantProfile?.ratePerMinute,
      ratingAverage: c.consultantProfile?.ratingAverage,
      ratingCount: c.consultantProfile?.ratingCount,
      totalSessions: c.consultantProfile?.totalSessions,
      availabilityStatus: c.consultantProfile?.availabilityStatus,
      experienceMonths: Math.floor(
        (new Date() - new Date(c.createdAt)) / (1000 * 60 * 60 * 24 * 30)
      )
    }));

    return res.status(200).json({
      success: true,
      message: 'Quick connect consultants fetched successfully',
      data: {
        consultants: formattedConsultants,
        count: formattedConsultants.length
      }
    });

  } catch (error) {
    console.error('Quick connect error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch quick connect consultants',
      data: null
    });
  }
};


/**
 * Get consultant details
 * @route GET /api/customer/consultant/:id
 * @desc Get detailed information about a specific consultant
 * @access Private (Customer only)
 */
export const getConsultantDetails = async (req, res) => {
  try {
    const { id: consultantId } = req.params;
    const customerId = req.user.userId;
    
    // Find consultant
    const consultant = await User.findOne({
      _id: consultantId,
      role: 'consultant',
      isActive: true
    }).select('name avatar consultantProfile languages createdAt');
    
    if (!consultant) {
      return res.status(200).json({
        success: false,
        message: 'Consultant not found',
        data: null
      });
    }

    const customerToCheck = await User.findById(customerId).select("blockedUsers");

    if (isBlockedEitherWay(customerToCheck, consultant)) {
      return res.status(200).json({
        success: false,
        message: "Consultant not available",
        data: null,
      });
    }

    // Get session history between this customer and consultant
    const sessionHistory = await Session.find({
      customer: customerId,
      consultant: consultantId,
      status: 'completed'
    }).select('durationMinutes totalCost endedAt customerRating').sort({ endedAt: -1 }).limit(5);

    // Get recent reviews from other customers (last 10)
    const recentReviews = await Session.find({
      consultant: consultantId,
      status: 'completed',
      'customerRating.review': { $exists: true, $ne: '' }
    })
    .populate('customer', 'name')
    .select('customerRating endedAt')
    .sort({ 'customerRating.ratedAt': -1 })
    .limit(10);

    // Check if customer has this consultant in favorites
    const customer = await User.findById(customerId).select('favoriteConsultants');
    const isFavorite = customer?.favoriteConsultants?.includes(consultantId);

    // Calculate availability statistics
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const availabilityStats = await Session.aggregate([
      {
        $match: {
          consultant: consultant._id,
          status: 'completed',
          endedAt: { $gte: last30Days }
        }
      },
      {
        $group: {
          _id: null,
          totalSessions: { $sum: 1 },
          totalMinutes: { $sum: '$durationMinutes' },
          averageRating: { $avg: '$customerRating.score' }
        }
      }
    ]);

    // Prepare detailed response
    const responseData = {
      id: consultant._id,
      name: consultant.name,
      avatar: consultant.avatar,
      bio: consultant.consultantProfile.bio,
      skills: consultant.consultantProfile.skills,
      languages: consultant.languages,
      ratePerMinute: consultant.consultantProfile.ratePerMinute,
      availabilityStatus: consultant.consultantProfile.availabilityStatus,
      
      statistics: {
        ratingAverage: consultant.consultantProfile.ratingAverage,
        ratingCount: consultant.consultantProfile.ratingCount,
        totalSessions: consultant.consultantProfile.totalSessions,
        experienceMonths: Math.floor((new Date() - consultant.createdAt) / (1000 * 60 * 60 * 24 * 30))
      },

      availability: {
        status: consultant.consultantProfile.availabilityStatus,
        last30DayStats: availabilityStats.length > 0 ? {
          sessionsCompleted: availabilityStats[0].totalSessions,
          totalMinutes: availabilityStats[0].totalMinutes,
          averageRating: availabilityStats[0].averageRating
        } : {
          sessionsCompleted: 0,
          totalMinutes: 0,
          averageRating: 0
        }
      },

      customerRelation: {
        isFavorite,
        previousSessions: sessionHistory.length,
        sessionHistory: sessionHistory.map(session => ({
          sessionId: session._id,
          duration: session.durationMinutes,
          cost: session.totalCost,
          date: session.endedAt,
          yourRating: session.customerRating
        }))
      },

      recentReviews: recentReviews.map(session => ({
        customerName: session.customer.name,
        rating: session.customerRating.score,
        review: session.customerRating.review,
        date: session.customerRating.ratedAt || session.endedAt
      }))
    };

    return res.status(200).json({
      success: true,
      message: 'Consultant details retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Get consultant details error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve consultant details',
      data: null
    });
  }
};

/**
 * Search consultants
 * @route GET /api/customer/consultants/search
 * @desc Search consultants by name, skills, or bio
 * @access Private (Customer only)
 */
export const searchConsultants = async (req, res) => {
  try {
    const {
      q, // search query
      page = 1,
      limit = 20,
      skills,
      minRating = 0,
      maxRate,
      language = 'english'
    } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(200).json({
        success: false,
        message: 'Search query must be at least 2 characters long',
        data: null
      });
    }

    // Build search query
    const searchRegex = new RegExp(q.trim(), 'i');
    
    const query = {
      role: 'consultant',
      isActive: true,
      isVerified: true,
      $or: [
        { name: searchRegex },
        { 'consultantProfile.bio': searchRegex },
        { 'consultantProfile.skills': { $in: [searchRegex] } }
      ]
    };

    // Add additional filters
    if (skills) {
      const skillsArray = skills.split(',');
      query['consultantProfile.skills'] = { $in: skillsArray };
    }

    if (minRating > 0) {
      query['consultantProfile.ratingAverage'] = { $gte: parseFloat(minRating) };
    }

    if (maxRate) {
      query['consultantProfile.ratePerMinute'] = { $lte: parseFloat(maxRate) };
    }

    if (language) {
      query.languages = language;
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    const customer = await User.findById(req.user.userId).select(
      "blockedUsers",
    );

    query._id = {
      $nin: customer.blockedUsers || [],
    };

    // Search consultants
    const consultants = await User.find(query)
      .select('name avatar consultantProfile languages')
      .sort({ 
        'consultantProfile.ratingAverage': -1,
        'consultantProfile.availabilityStatus': 1 // onWork first
      })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count
    const totalResults = await User.countDocuments(query);

    // Format response
    const responseData = {
      searchQuery: q,
      results: consultants.map(consultant => ({
        id: consultant._id,
        name: consultant.name,
        avatar: consultant.avatar,
        bio: consultant.consultantProfile.bio,
        skills: consultant.consultantProfile.skills,
        languages: consultant.languages,
        ratePerMinute: consultant.consultantProfile.ratePerMinute,
        ratingAverage: consultant.consultantProfile.ratingAverage,
        ratingCount: consultant.consultantProfile.ratingCount,
        totalSessions: consultant.consultantProfile.totalSessions,
        availabilityStatus: consultant.consultantProfile.availabilityStatus,
        isAvailable: consultant.consultantProfile.availabilityStatus === 'onWork'
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalResults / limit),
        totalResults,
        hasNextPage: page < Math.ceil(totalResults / limit),
        hasPrevPage: page > 1
      }
    };

    return res.status(200).json({
      success: true,
      message: `Found ${totalResults} consultants matching "${q}"`,
      data: responseData
    });

  } catch (error) {
    console.error('Search consultants error:', error);
    return res.status(500).json({
      success: false,
      message: 'Search failed. Please try again.',
      data: null
    });
  }
};

/**
 * Add consultant to favorites
 * @route POST /api/customer/favorites
 * @desc Add a consultant to customer's favorites list
 * @access Private (Customer only)
 */
export const addToFavorites = async (req, res) => {
  try {
    const { consultantId } = req.body;
    const customerId = req.user.userId;

    if (!consultantId) {
      return res.status(200).json({
        success: false,
        message: 'Consultant ID is required',
        data: null
      });
    }

    // Verify consultant exists and is active
    const consultant = await User.findOne({
      _id: consultantId,
      role: 'consultant',
      isActive: true
    }).select('name avatar');

    if (!consultant) {
      return res.status(200).json({
        success: false,
        message: 'Consultant not found or inactive',
        data: null
      });
    }

    // Get customer and check favorites limit
    const customer = await User.findById(customerId);
    const maxFavorites = await settingsService.getSetting('business.maxFavoriteConsultants');

    if (customer?.favoriteConsultants?.includes(consultantId)) {
      return res.status(200).json({
        success: false,
        message: 'Consultant is already in your favorites',
        data: null
      });
    }

    if (customer?.favoriteConsultants?.length >= maxFavorites) {
      return res.status(200).json({
        success: false,
        message: `You can only have up to ${maxFavorites} favorite consultants`,
        data: null
      });
    }

    // Add to favorites
    customer?.favoriteConsultants?.push(consultantId);
    await customer.save();

    return res.status(200).json({
      success: true,
      message: `${consultant.name} added to your favorites`,
      data: {
        consultantId: consultant._id,
        consultantName: consultant.name,
        totalFavorites: customer?.favoriteConsultants?.length
      }
    });

  } catch (error) {
    console.error('Add to favorites error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add consultant to favorites',
      data: null
    });
  }
};

/**
 * Remove consultant from favorites
 * @route DELETE /api/customer/favorites/:id
 * @desc Remove a consultant from customer's favorites list
 * @access Private (Customer only)
 */
export const removeFromFavorites = async (req, res) => {
  try {
    const { id: consultantId } = req.params;
    const customerId = req.user.userId;

    // Get customer
    const customer = await User.findById(customerId);

    if (!customer?.favoriteConsultants?.includes(consultantId)) {
      return res.status(200).json({
        success: false,
        message: 'Consultant is not in your favorites',
        data: null
      });
    }

    // Remove from favorites
    customer.favoriteConsultants = customer?.favoriteConsultants?.filter(
      id => id.toString() !== consultantId
    );
    await customer.save();

    // Get consultant name for response
    const consultant = await User.findById(consultantId).select('name');

    return res.status(200).json({
      success: true,
      message: `${consultant?.name || 'Consultant'} removed from your favorites`,
      data: {
        consultantId,
        totalFavorites: customer?.favoriteConsultants?.length
      }
    });

  } catch (error) {
    console.error('Remove from favorites error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove consultant from favorites',
      data: null
    });
  }
};

/**
 * Get favorite consultants
 * @route GET /api/customer/favorites
 * @desc Get customer's favorite consultants list
 * @access Private (Customer only)
 */
export const getFavoriteConsultants = async (req, res) => {
  try {
    const customerId = req.user.userId;

    // Get customer with populated favorites
    const customer = await User.findById(customerId)
      .populate({
        path: 'favoriteConsultants',
        select: 'name avatar consultantProfile languages',
        match: { isActive: true }
      });

    if (!customer) {
      return res.status(200).json({
        success: false,
        message: 'Customer not found',
        data: null
      });
    }

    // Format favorites list
    const favorites = customer?.favoriteConsultants?.map(consultant => ({
      id: consultant._id,
      name: consultant.name,
      avatar: consultant.avatar,
      bio: consultant.consultantProfile.bio,
      skills: consultant.consultantProfile.skills,
      languages: consultant.languages,
      ratePerMinute: consultant.consultantProfile.ratePerMinute,
      ratingAverage: consultant.consultantProfile.ratingAverage,
      ratingCount: consultant.consultantProfile.ratingCount,
      totalSessions: consultant.consultantProfile.totalSessions,
      availabilityStatus: consultant.consultantProfile.availabilityStatus,
      isAvailable: consultant.consultantProfile.availabilityStatus === 'onWork'
    }));

    const responseData = {
      favorites,
      totalFavorites: favorites.length,
      maxFavorites: await settingsService.getSetting('business.maxFavoriteConsultants')
    };

    return res.status(200).json({
      success: true,
      message: 'Favorite consultants retrieved successfully',
      data: responseData
    });

  } catch (error) {
    console.error('Get favorite consultants error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve favorite consultants',
      data: null
    });
  }
};